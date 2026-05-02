import { ItemView, WorkspaceLeaf, TFile, Notice, MarkdownView } from "obsidian";
import type AtlasPlugin from "../../main";
import { getMode } from "../coach/scope";

export const ATLAS_TODAY_VIEW = "atlas-today";

interface TodayData {
	greeting: string;
	dateLabel: string;
	mode: string;
	stats: {
		dailyStreak: number;
		flashcardsDue: number;
		kgGrowthLast7d: number;
		notesLast7d: number;
	};
	upcoming: { time: string; title: string; path?: string }[];
	tasksDueToday: { description: string; path: string; line: number }[];
	overdueCount: number;
	openCommitmentsCount: number;
	criticalRisks: { description: string; path: string }[];
	patterns: { theme: string; freq: number; sentiment: string }[];
	inactivePeople: { name: string; weeksAgo: number }[];
	atlasPercebeu: string[];
}

export class AtlasTodayView extends ItemView {
	private container!: HTMLDivElement;
	private refreshInterval: ReturnType<typeof setInterval> | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: AtlasPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return ATLAS_TODAY_VIEW;
	}

	getDisplayText(): string {
		return "Atlas Today";
	}

	getIcon(): string {
		return "sun";
	}

	async onOpen(): Promise<void> {
		const c = this.containerEl.children[1];
		c.empty();
		(c as HTMLElement).style.padding = "16px";
		(c as HTMLElement).style.overflow = "auto";

		this.container = c.createDiv() as HTMLDivElement;
		await this.render();

		// Refresh every 5 min
		this.refreshInterval = setInterval(() => void this.render(), 5 * 60_000);
	}

	async onClose(): Promise<void> {
		if (this.refreshInterval) clearInterval(this.refreshInterval);
	}

	private async render(): Promise<void> {
		this.container.empty();
		const data = await this.collect();
		this.renderHeader(data);
		this.renderStatsBar(data);
		this.renderAgenda(data);
		this.renderTasks(data);
		this.renderAttention(data);
		this.renderAtlasPercebeu(data);
		this.renderQuickActions();
		this.renderFooter();
	}

	private async collect(): Promise<TodayData> {
		const now = new Date();
		const hour = now.getHours();
		const greeting = hour < 5 ? "🌙 Boa madrugada" :
			hour < 12 ? "🌅 Bom dia" :
			hour < 18 ? "☀️ Boa tarde" :
			"🌇 Boa noite";

		const dateLabel = now.toLocaleDateString("pt-BR", {
			weekday: "long",
			day: "2-digit",
			month: "long",
			year: "numeric",
		});

		const today = now.toISOString().split("T")[0];
		const todayMs = now.getTime();
		const sevenDaysAgo = todayMs - 7 * 86_400_000;

		// Upcoming meetings (today)
		const upcoming = await this.getUpcomingMeetings(today);

		// Tasks due today
		const tasksDueToday: { description: string; path: string; line: number }[] = [];
		const overdueCount = await this.scanTasksDue(today, tasksDueToday);

		// Open commitments
		const openCommitmentsCount = this.plugin.kg.data.commitments.filter(
			(c) => c.status === "open"
		).length;

		// Risks
		const criticalRisks = this.plugin.kg.data.risks
			.filter((r) => r.status === "open" && (r.priority === "P1" || r.priority === "P2"))
			.slice(0, 3)
			.map((r) => ({ description: r.description, path: r.sourceNotePath }));

		// Patterns (themes growing)
		const cutoffIso = new Date(sevenDaysAgo).toISOString();
		const patterns = this.plugin.kg.data.themes
			.filter((t) => t.lastSeen >= cutoffIso && t.frequency >= 3)
			.sort((a, b) => b.frequency - a.frequency)
			.slice(0, 3)
			.map((t) => ({ theme: t.name, freq: t.frequency, sentiment: t.sentiment }));

		// Inactive people (direct reports without 1:1 in 5+ weeks)
		const fiveWeeksAgo = todayMs - 5 * 7 * 86_400_000;
		const inactivePeople: { name: string; weeksAgo: number }[] = [];
		for (const p of this.plugin.kg.data.people) {
			if (p.type !== "direct-report") continue;
			const sessions = this.plugin.kg.listSessionsByPerson(p.id);
			if (sessions.length === 0) continue;
			const last = new Date(sessions[0].date).getTime();
			if (last < fiveWeeksAgo) {
				inactivePeople.push({
					name: p.name,
					weeksAgo: Math.round((todayMs - last) / (7 * 86_400_000)),
				});
			}
		}

		// Stats
		const flashcardsDue = this.plugin.flashcards?.dueToday().length ?? 0;
		const dailyStreak = await this.computeStreak();
		const kgGrowthLast7d = this.plugin.kg.data.people.filter(
			(p) => new Date(p.createdAt).getTime() >= sevenDaysAgo
		).length;
		const notesLast7d = this.app.vault
			.getMarkdownFiles()
			.filter((f) => f.stat.mtime >= sevenDaysAgo).length;

		// "Atlas percebeu" — insights compostos
		const atlasPercebeu: string[] = [];
		for (const p of patterns) {
			atlasPercebeu.push(
				`Tema "${p.theme}" mencionado ${p.freq}× nos últimos 7 dias (${p.sentiment})`
			);
		}
		for (const ip of inactivePeople.slice(0, 2)) {
			atlasPercebeu.push(`${ip.name} sem 1:1 há ${ip.weeksAgo} semanas`);
		}
		if (overdueCount > 5) {
			atlasPercebeu.push(`${overdueCount} tasks atrasadas — vale priorizar?`);
		}
		if (dailyStreak >= 7) {
			atlasPercebeu.push(`🔥 ${dailyStreak} dias seguidos de daily log!`);
		}

		return {
			greeting,
			dateLabel,
			mode: getMode(),
			stats: { dailyStreak, flashcardsDue, kgGrowthLast7d, notesLast7d },
			upcoming,
			tasksDueToday,
			overdueCount,
			openCommitmentsCount,
			criticalRisks,
			patterns,
			inactivePeople,
			atlasPercebeu,
		};
	}

	private async getUpcomingMeetings(today: string): Promise<TodayData["upcoming"]> {
		const out: TodayData["upcoming"] = [];
		const folder = this.plugin.settings.folders.meetings;
		const files = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(folder));

		for (const f of files) {
			const cache = this.app.metadataCache.getFileCache(f);
			const fm = cache?.frontmatter ?? {};
			const date = (fm.date as string | undefined) ?? "";
			if (!date.startsWith(today)) continue;

			const time = (fm.time as string | undefined) ?? extractTimeFromDate(date) ?? "—";
			const title =
				(fm.title as string | undefined) ??
				f.basename.replace(/^\d{4}-\d{2}-\d{2}-?/, "").replace(/-/g, " ") ??
				f.basename;

			out.push({ time, title, path: f.path });
		}

		return out.sort((a, b) => a.time.localeCompare(b.time)).slice(0, 6);
	}

	private async scanTasksDue(
		today: string,
		due: { description: string; path: string; line: number }[]
	): Promise<number> {
		let overdueCount = 0;
		const files = this.app.vault.getMarkdownFiles().slice(0, 500); // cap for perf
		const todayMs = new Date(today + "T00:00:00").getTime();

		for (const f of files) {
			let raw: string;
			try {
				raw = await this.app.vault.read(f);
			} catch {
				continue;
			}
			const lines = raw.split("\n");
			for (let i = 0; i < lines.length; i++) {
				const m = lines[i].match(/^\s*-\s*\[\s\]\s+(.+?)\s*\(@(\d{4}-\d{2}-\d{2})/);
				if (!m) continue;
				const desc = m[1].trim();
				const dueDate = m[2];
				const dueMs = new Date(dueDate + "T00:00:00").getTime();
				if (dueDate === today) {
					due.push({ description: desc, path: f.path, line: i });
				} else if (dueMs < todayMs) {
					overdueCount++;
				}
			}
		}
		return overdueCount;
	}

	private async computeStreak(): Promise<number> {
		const dailyFolder = this.plugin.settings.folders.daily;
		let streak = 0;
		const today = new Date();
		for (let i = 0; i < 365; i++) {
			const d = new Date(today.getTime() - i * 86_400_000);
			const yyyy = d.getFullYear();
			const mm = String(d.getMonth() + 1).padStart(2, "0");
			const dd = String(d.getDate()).padStart(2, "0");
			const path = `${dailyFolder}/${yyyy}/${mm}/${yyyy}-${mm}-${dd}.md`;
			const exists = this.app.vault.getAbstractFileByPath(path);
			if (exists instanceof TFile) {
				streak++;
			} else if (i > 0) {
				break;
			}
		}
		return streak;
	}

	// ─── Render helpers ───

	private renderHeader(data: TodayData): void {
		const h = this.container.createDiv();
		h.style.marginBottom = "16px";

		const greeting = h.createEl("h2", {
			text: `${data.greeting}, ${this.plugin.settings.user.displayName || "—"}`,
		});
		greeting.style.margin = "0 0 4px 0";

		const date = h.createEl("div", { text: data.dateLabel });
		date.style.fontSize = "13px";
		date.style.opacity = "0.7";
		date.style.textTransform = "capitalize";

		if (data.mode === "coach") {
			const badge = h.createEl("div", { text: "🔒 COACH MODE" });
			badge.style.display = "inline-block";
			badge.style.marginTop = "6px";
			badge.style.padding = "2px 8px";
			badge.style.background = "var(--color-red)";
			badge.style.color = "white";
			badge.style.borderRadius = "4px";
			badge.style.fontSize = "10px";
			badge.style.fontWeight = "bold";
		}
	}

	private renderStatsBar(data: TodayData): void {
		const bar = this.container.createDiv();
		bar.style.display = "grid";
		bar.style.gridTemplateColumns = "1fr 1fr 1fr 1fr";
		bar.style.gap = "8px";
		bar.style.marginBottom = "16px";

		const stat = (label: string, value: string, color = "var(--text-normal)") => {
			const card = bar.createDiv();
			card.style.padding = "10px";
			card.style.background = "var(--background-secondary)";
			card.style.borderRadius = "6px";
			card.style.textAlign = "center";

			const v = card.createEl("div", { text: value });
			v.style.fontSize = "20px";
			v.style.fontWeight = "bold";
			v.style.color = color;
			const l = card.createEl("div", { text: label });
			l.style.fontSize = "10px";
			l.style.opacity = "0.6";
			l.style.marginTop = "2px";
		};

		stat("Streak diário", `🔥 ${data.stats.dailyStreak}d`);
		stat("Cards a revisar", `🃏 ${data.stats.flashcardsDue}`);
		stat("Pessoas no KG (7d)", `+${data.stats.kgGrowthLast7d}`);
		stat("Notas modificadas (7d)", `${data.stats.notesLast7d}`);
	}

	private renderAgenda(data: TodayData): void {
		const sec = this.section("📅 HOJE", `${data.upcoming.length} reuniões`);
		if (data.upcoming.length === 0) {
			sec.createEl("div", {
				text: "Sem reuniões agendadas. Bom dia pra deep work.",
			}).style.opacity = "0.6";
			return;
		}
		for (const m of data.upcoming) {
			const row = sec.createDiv();
			row.style.display = "flex";
			row.style.alignItems = "center";
			row.style.gap = "12px";
			row.style.padding = "6px 0";
			row.style.borderBottom = "1px solid var(--background-modifier-border)";
			row.style.cursor = m.path ? "pointer" : "default";

			const time = row.createEl("span", { text: m.time });
			time.style.fontWeight = "bold";
			time.style.fontSize = "12px";
			time.style.minWidth = "55px";

			row.createEl("span", { text: m.title });

			if (m.path) {
				row.addEventListener("click", () => this.openNote(m.path!));
			}
		}
	}

	private renderTasks(data: TodayData): void {
		const sec = this.section(
			"✅ TASKS DUE HOJE",
			`${data.tasksDueToday.length} hoje · ${data.overdueCount} atrasadas · ${data.openCommitmentsCount} commitments abertos`
		);

		if (data.tasksDueToday.length === 0 && data.overdueCount === 0) {
			sec.createEl("div", { text: "🎉 Nada vencendo hoje!" }).style.opacity = "0.6";
		}

		for (const t of data.tasksDueToday.slice(0, 5)) {
			const row = sec.createDiv();
			row.style.padding = "4px 0";
			row.style.fontSize = "12px";
			row.style.cursor = "pointer";
			row.setText(`⏰ ${t.description}`);
			row.addEventListener("click", () => this.openNote(t.path, t.line));
		}

		if (data.tasksDueToday.length > 5) {
			const more = sec.createEl("a", {
				text: `... ver todas (${data.tasksDueToday.length})`,
			});
			more.style.fontSize = "11px";
			more.addEventListener("click", () => {
				void this.plugin.activateView("atlas-action-items-hub");
			});
		}
	}

	private renderAttention(data: TodayData): void {
		const items: { text: string; severity: "high" | "medium" | "low" }[] = [];

		for (const r of data.criticalRisks) {
			items.push({
				text: `🚨 Risk crítico: ${r.description}`,
				severity: "high",
			});
		}
		for (const ip of data.inactivePeople.slice(0, 3)) {
			items.push({
				text: `👤 ${ip.name} sem 1:1 há ${ip.weeksAgo} semanas`,
				severity: "medium",
			});
		}

		if (items.length === 0) return;

		const sec = this.section("⚠️ ATENÇÃO", `${items.length} pendências`);
		for (const it of items) {
			const row = sec.createDiv();
			row.style.padding = "6px 8px";
			row.style.marginBottom = "4px";
			row.style.borderLeft = `3px solid ${it.severity === "high" ? "var(--color-red)" : "var(--color-orange)"}`;
			row.style.background = "var(--background-secondary)";
			row.style.fontSize = "12px";
			row.setText(it.text);
		}
	}

	private renderAtlasPercebeu(data: TodayData): void {
		if (data.atlasPercebeu.length === 0) return;
		const sec = this.section("💡 ATLAS PERCEBEU", "");
		for (const p of data.atlasPercebeu) {
			const row = sec.createDiv();
			row.style.padding = "4px 8px";
			row.style.fontSize = "12px";
			row.style.background = "var(--background-secondary-alt)";
			row.style.borderRadius = "4px";
			row.style.marginBottom = "4px";
			row.setText(`• ${p}`);
		}
	}

	private renderQuickActions(): void {
		const sec = this.section("⚡ AÇÕES RÁPIDAS", "");
		const wrap = sec.createDiv();
		wrap.style.display = "grid";
		wrap.style.gridTemplateColumns = "1fr 1fr";
		wrap.style.gap = "6px";

		const action = (icon: string, label: string, cmd: string) => {
			const btn = wrap.createEl("button", { text: `${icon} ${label}` });
			btn.style.padding = "8px";
			btn.style.fontSize = "12px";
			btn.style.cursor = "pointer";
			btn.style.textAlign = "left";
			btn.addEventListener("click", () => {
				const apiAny = this.app as unknown as {
					commands?: { executeCommandById?: (id: string) => void };
				};
				apiAny.commands?.executeCommandById?.(`atlas:${cmd}`);
			});
		};

		action("📓", "Daily log", "atlas-daily-log");
		action("🎯", "Quick capture", "atlas-quick-capture");
		action("💬", "Chat", "atlas-open-chat");
		action("🔎", "Buscar vault", "atlas-search-vault");
		action("🤝", "Preparar 1:1", "atlas-prepare-1on1");
		action("🧠", "Pense comigo", "atlas-reasoning");
		action("🃏", "Revisar cards", "atlas-flashcards-review");
		action("📊", "Weekly report", "atlas-weekly-now");
	}

	private renderFooter(): void {
		const f = this.container.createEl("div", {
			text: "Atualizado a cada 5 min · Click ↻ no painel pra refresh manual",
		});
		f.style.fontSize = "10px";
		f.style.opacity = "0.4";
		f.style.marginTop = "16px";
		f.style.textAlign = "center";
	}

	private section(title: string, subtitle: string): HTMLDivElement {
		const wrap = this.container.createDiv();
		wrap.style.marginBottom = "16px";

		const header = wrap.createDiv();
		header.style.display = "flex";
		header.style.justifyContent = "space-between";
		header.style.alignItems = "center";
		header.style.marginBottom = "6px";
		const t = header.createEl("h4", { text: title });
		t.style.margin = "0";
		t.style.fontSize = "11px";
		t.style.opacity = "0.7";
		t.style.letterSpacing = "0.5px";
		if (subtitle) {
			const s = header.createEl("span", { text: subtitle });
			s.style.fontSize = "10px";
			s.style.opacity = "0.5";
		}

		const body = wrap.createDiv() as HTMLDivElement;
		return body;
	}

	private async openNote(path: string, line?: number): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			new Notice(`Atlas: arquivo não encontrado: ${path}`);
			return;
		}
		const leaf = this.app.workspace.getLeaf();
		await leaf.openFile(file);
		if (typeof line === "number") {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			view?.editor.setCursor({ line, ch: 0 });
		}
	}
}

function extractTimeFromDate(s: string): string | null {
	const m = s.match(/T(\d{2}:\d{2})/);
	return m ? m[1] : null;
}
