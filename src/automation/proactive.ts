import { App, normalizePath, TFile } from "obsidian";
import { Notifier } from "./notify";
import { KGStore } from "../kg/store";
import { Indexer } from "../retrieval/indexer";
import { logger } from "../utils/logger";

interface ProactiveState {
	version: 1;
	notified: Record<string, string>; // event-key → ISO
}

/**
 * Detects:
 *   - Reuniões/1:1s próximas (nas próximas N min) → notification
 *   - Padrões emergindo (theme com freq ≥ threshold) → notification
 *   - Pessoas inativas (sem 1:1 há > N semanas) → daily nudge
 *   - Commitments seriamente atrasados → alert
 */
export class ProactiveDetector {
	private state: ProactiveState = { version: 1, notified: {} };
	private dirty = false;
	private flushTimer: number | null = null;

	constructor(
		private app: App,
		private kg: KGStore,
		private notifier: Notifier,
		private statePath: string,
		private folders: { meetings: string }
	) {}

	async load(): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(this.statePath);
		if (!(file instanceof TFile)) return;
		try {
			const raw = await this.app.vault.read(file);
			const parsed = JSON.parse(raw);
			if (parsed.version === 1) this.state = parsed;
		} catch (e) {
			logger.warn("proactive: state load falhou", { error: String(e) });
		}
	}

	private async save(): Promise<void> {
		try {
			const json = JSON.stringify(this.state, null, 2);
			const file = this.app.vault.getAbstractFileByPath(this.statePath);
			if (file instanceof TFile) {
				await this.app.vault.modify(file, json);
			} else {
				const dir = this.statePath.split("/").slice(0, -1).join("/");
				if (dir && !this.app.vault.getAbstractFileByPath(dir)) {
					await this.app.vault.createFolder(dir);
				}
				await this.app.vault.create(this.statePath, json);
			}
			this.dirty = false;
		} catch (e) {
			logger.warn("proactive: state save falhou", { error: String(e) });
		}
	}

	private touch(): void {
		this.dirty = true;
		if (this.flushTimer !== null) window.clearTimeout(this.flushTimer);
		this.flushTimer = window.setTimeout(() => void this.save(), 1500);
	}

	private hasNotified(key: string): boolean {
		return Boolean(this.state.notified[key]);
	}

	private markNotified(key: string): void {
		this.state.notified[key] = new Date().toISOString();
		this.touch();
	}

	async checkUpcomingMeetings(minutesAhead = 15): Promise<void> {
		const indexer = new Indexer(this.app);
		let notes;
		try {
			notes = await indexer.indexVault([this.folders.meetings]);
		} catch (e) {
			logger.warn("proactive: index meetings falhou", { error: String(e) });
			return;
		}

		const now = Date.now();
		const windowMs = minutesAhead * 60_000;
		const today = new Date(now).toISOString().split("T")[0];

		for (const n of notes) {
			const fmDate = n.frontmatter.date as string | undefined;
			const fmTime = n.frontmatter.time as string | undefined;
			if (!fmDate?.startsWith(today)) continue;

			let meetingTime: Date | null = null;
			if (fmTime && /^\d{1,2}:\d{2}$/.test(fmTime)) {
				meetingTime = new Date(`${today}T${fmTime}:00`);
			} else if (fmDate.includes("T")) {
				meetingTime = new Date(fmDate);
			}
			if (!meetingTime || isNaN(meetingTime.getTime())) continue;

			const diff = meetingTime.getTime() - now;
			if (diff <= 0 || diff > windowMs) continue;

			const key = `meeting::${n.path}::${meetingTime.toISOString()}`;
			if (this.hasNotified(key)) continue;

			const title = n.frontmatter.title as string | undefined;
			const personFm = (n.frontmatter.person ?? n.frontmatter.coachee) as string | undefined;
			const minutes = Math.round(diff / 60_000);

			let extra = "";
			if (personFm) {
				const person = this.kg.findPersonByName(personFm);
				if (person) {
					const commits = this.kg.listOpenCommitmentsBetween(person.id, "eu");
					if (commits.length > 0) {
						extra = ` · ${commits.length} commitments pendentes`;
					}
				}
			}

			await this.notifier.notify({
				title: `🗓️ ${minutes} min — ${title ?? personFm ?? "Reunião"}`,
				message: `Brief disponível${extra}`,
				severity: "high",
				channels: ["inAppNotice", "desktop", "telegram"],
				subtitle: n.path.split("/").pop(),
			});
			this.markNotified(key);
		}
	}

	async checkEmergingPatterns(thresholdFreq = 4, daysWindow = 30): Promise<void> {
		const cutoffIso = new Date(Date.now() - daysWindow * 86_400_000).toISOString();
		const recent = this.kg.data.themes.filter(
			(t) => t.lastSeen >= cutoffIso && t.frequency >= thresholdFreq
		);

		for (const t of recent) {
			const key = `pattern::${t.id}::${t.frequency}`;
			if (this.hasNotified(key)) continue;

			const personLabel =
				t.personIds.length === 1
					? this.kg.data.people.find((p) => p.id === t.personIds[0])?.name ?? ""
					: t.personIds.length > 1
						? `${t.personIds.length} pessoas`
						: "time";

			await this.notifier.notify({
				title: "💡 Atlas detectou um padrão",
				message: `"${t.name}" mencionado ${t.frequency}× em ${daysWindow} dias (${personLabel})`,
				severity: t.sentiment === "blocker" ? "high" : "medium",
				channels: ["inAppNotice", "desktop"],
			});
			this.markNotified(key);
		}
	}

	async checkInactivePeople(weeksThreshold = 5): Promise<void> {
		const cutoff = Date.now() - weeksThreshold * 7 * 86_400_000;
		const directs = this.kg.data.people.filter((p) => p.type === "direct-report");

		for (const person of directs) {
			const sessions = this.kg.listSessionsByPerson(person.id);
			if (sessions.length === 0) continue;

			const last = new Date(sessions[0].date).getTime();
			if (last >= cutoff) continue;

			const week = new Date().toISOString().substring(0, 10).slice(0, 7);
			const key = `inactive::${person.id}::${week}`;
			if (this.hasNotified(key)) continue;

			const weeksAgo = Math.round((Date.now() - last) / (7 * 86_400_000));
			await this.notifier.notify({
				title: "👤 Atlas",
				message: `${person.name} sem 1:1 há ${weeksAgo} semanas. Agendar?`,
				severity: "medium",
				channels: ["inAppNotice", "desktop"],
			});
			this.markNotified(key);
		}
	}

	/**
	 * Retorna eventos proativos disparados recentemente, parseados a partir do state.
	 * Usado pela Auto tab → "Atlas Percebeu" feed.
	 */
	recent(limit = 20): { kind: string; subject: string; at: string; key: string }[] {
		const out = Object.entries(this.state.notified).map(([key, at]) => {
			const parts = key.split("::");
			const kind = parts[0] ?? "evento";
			const subject = parts.slice(1, parts.length - 1).join(" / ") || parts[1] || "—";
			return { kind, subject, at, key };
		});
		out.sort((a, b) => b.at.localeCompare(a.at));
		return out.slice(0, limit);
	}

	async checkOverdueCommitments(daysThreshold = 3): Promise<void> {
		const today = new Date().toISOString().split("T")[0];
		const cutoff = new Date(Date.now() - daysThreshold * 86_400_000).toISOString().split("T")[0];

		for (const c of this.kg.data.commitments) {
			if (c.status !== "open") continue;
			if (!c.dueDate) continue;
			if (c.dueDate >= cutoff) continue;

			const week = today.slice(0, 7);
			const key = `commitment-overdue::${c.id}::${week}`;
			if (this.hasNotified(key)) continue;

			const daysOver = Math.floor(
				(Date.now() - new Date(c.dueDate).getTime()) / 86_400_000
			);

			await this.notifier.notify({
				title: "🔁 Commitment atrasado",
				message: `"${c.text.substring(0, 80)}" venceu há ${daysOver}d. Renegociar/completar?`,
				severity: c.weight === "high" ? "high" : "medium",
				channels: ["inAppNotice", "desktop"],
			});
			this.markNotified(key);
		}
	}
}

export function proactiveStatePath(atlasFolder: string): string {
	return normalizePath(`${atlasFolder}/proactive-state.json`);
}
