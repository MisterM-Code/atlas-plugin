import { App, normalizePath, TFile } from "obsidian";
import { Notifier } from "./notify";
import { Indexer } from "../retrieval/indexer";
import { logger } from "../utils/logger";

export interface ReminderEntry {
	notePath: string;
	taskText: string;
	dueAt: Date;
	hasTime: boolean;
	completed: boolean;
	signature: string; // sha-ish to dedupe
}

interface ReminderState {
	version: 1;
	notified: Record<string, string>; // signature → ISO timestamp of notification
}

const REMINDER_RE = /(?:^|\s)\(@(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}):(\d{2}))?\)/g;

export class ReminderWatcher {
	private state: ReminderState = { version: 1, notified: {} };
	private dirty = false;
	private flushTimer: number | null = null;

	constructor(
		private app: App,
		private notifier: Notifier,
		private statePath: string,
		private excludedFolders: string[] = []
	) {}

	async load(): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(this.statePath);
		if (!(file instanceof TFile)) return;
		try {
			const raw = await this.app.vault.read(file);
			const parsed = JSON.parse(raw);
			if (parsed.version === 1) this.state = parsed;
		} catch (e) {
			logger.warn("reminder-watcher: state load falhou", { error: String(e) });
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
			logger.warn("reminder-watcher: state save falhou", { error: String(e) });
		}
	}

	private touch(): void {
		this.dirty = true;
		if (this.flushTimer !== null) window.clearTimeout(this.flushTimer);
		this.flushTimer = window.setTimeout(() => void this.save(), 1500);
	}

	/**
	 * Scan all notes for tasks with `(@datetime)` reminders.
	 * Returns reminders sorted by due time.
	 */
	async scan(): Promise<ReminderEntry[]> {
		const indexer = new Indexer(this.app, this.excludedFolders);
		const notes = await indexer.indexVault();
		const reminders: ReminderEntry[] = [];

		for (const n of notes) {
			const lines = n.body.split("\n");
			for (const line of lines) {
				if (!/\(@\d{4}-\d{2}-\d{2}/.test(line)) continue;

				// Only task lines `- [ ]` or `- [x]` (open or completed)
				const taskMatch = line.match(/^\s*-\s*\[([ xX])\]\s+(.+)$/);
				if (!taskMatch) continue;

				const completed = taskMatch[1] !== " ";
				const taskText = taskMatch[2].replace(/\(@[^)]+\)/g, "").trim();

				// Find ALL reminder occurrences in line
				REMINDER_RE.lastIndex = 0;
				let m: RegExpExecArray | null;
				while ((m = REMINDER_RE.exec(line)) !== null) {
					const dateStr = m[1];
					const hourStr = m[2];
					const minStr = m[3];
					const hasTime = !!hourStr;
					const dt = new Date(`${dateStr}T${hourStr ?? "09"}:${minStr ?? "00"}:00`);
					if (isNaN(dt.getTime())) continue;
					const sig = `${n.path}::${taskText.substring(0, 80)}::${dt.toISOString()}`;
					reminders.push({
						notePath: n.path,
						taskText,
						dueAt: dt,
						hasTime,
						completed,
						signature: sig,
					});
				}
			}
		}

		reminders.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
		return reminders;
	}

	/**
	 * Check current reminders and dispatch notifications:
	 *  - Imminent (within `windowMin`): notify once
	 *  - Overdue (past due, not notified): notify once
	 */
	async tick(windowMin = 15): Promise<void> {
		const all = await this.scan();
		const now = Date.now();
		const windowMs = windowMin * 60_000;

		for (const r of all) {
			if (r.completed) continue;
			const due = r.dueAt.getTime();
			const diff = due - now;

			let bucket: "imminent" | "overdue" | null = null;
			if (diff > 0 && diff <= windowMs) {
				bucket = "imminent";
			} else if (diff < 0 && diff > -86_400_000) {
				bucket = "overdue";
			}
			if (!bucket) continue;

			const key = `${r.signature}::${bucket}`;
			if (this.state.notified[key]) continue;

			const minutes = Math.round(Math.abs(diff) / 60_000);
			const title =
				bucket === "imminent"
					? `⏰ Atlas — em ${minutes} min`
					: `📋 Atlas — atrasada há ${minutes} min`;
			const message =
				r.taskText.length > 100 ? r.taskText.substring(0, 100) + "…" : r.taskText;

			await this.notifier.notify({
				title,
				message,
				severity: bucket === "imminent" ? "high" : "medium",
				channels: ["inAppNotice", "desktop", "telegram"],
				subtitle: r.notePath.split("/").pop(),
			});

			this.state.notified[key] = new Date().toISOString();
			this.touch();
		}

		// Cleanup: remove notified keys older than 14 days
		const cutoff = now - 14 * 86_400_000;
		for (const k of Object.keys(this.state.notified)) {
			const t = new Date(this.state.notified[k]).getTime();
			if (t < cutoff) {
				delete this.state.notified[k];
				this.touch();
			}
		}
	}

	async listUpcoming(maxDays = 7): Promise<ReminderEntry[]> {
		const all = await this.scan();
		const now = Date.now();
		const cutoff = now + maxDays * 86_400_000;
		return all.filter(
			(r) => !r.completed && r.dueAt.getTime() >= now && r.dueAt.getTime() <= cutoff
		);
	}

	async listOverdue(): Promise<ReminderEntry[]> {
		const all = await this.scan();
		const now = Date.now();
		return all.filter((r) => !r.completed && r.dueAt.getTime() < now);
	}
}

export function reminderStatePath(atlasFolder: string): string {
	return normalizePath(`${atlasFolder}/reminder-state.json`);
}
