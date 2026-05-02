import { ItemView, WorkspaceLeaf, TFile, Notice, setIcon } from "obsidian";
import type AtlasPlugin from "../../main";
import { getExcludedFolders, getInclusiveFolders } from "../coach/scope";

export const ATLAS_HUB_VIEW = "atlas-action-items-hub";

interface VaultTask {
	notePath: string;
	lineNumber: number;
	rawLine: string;
	description: string;
	completed: boolean;
	dueDate: Date | null;
	hasTime: boolean;
	tags: string[];
	mentionedPeople: string[];
}

type FilterMode = "today" | "overdue" | "week" | "all" | "no-due";

export class ActionItemsHubView extends ItemView {
	private tasks: VaultTask[] = [];
	private currentFilter: FilterMode = "today";
	private listEl!: HTMLDivElement;
	private filterEl!: HTMLDivElement;
	private statsEl!: HTMLDivElement;

	constructor(leaf: WorkspaceLeaf, private plugin: AtlasPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return ATLAS_HUB_VIEW;
	}

	getDisplayText(): string {
		return "Atlas Hub";
	}

	getIcon(): string {
		return "list-checks";
	}

	async onOpen(): Promise<void> {
		const c = this.containerEl.children[1];
		c.empty();
		(c as HTMLElement).style.padding = "12px";
		(c as HTMLElement).style.display = "flex";
		(c as HTMLElement).style.flexDirection = "column";
		(c as HTMLElement).style.height = "100%";

		const header = c.createDiv();
		header.style.display = "flex";
		header.style.justifyContent = "space-between";
		header.style.alignItems = "center";
		header.style.marginBottom = "8px";
		const title = header.createEl("h3", { text: "✅ Action Items Hub" });
		title.style.margin = "0";

		const refreshBtn = header.createEl("button", { text: "↻ Atualizar" });
		refreshBtn.style.fontSize = "11px";
		refreshBtn.style.padding = "4px 10px";
		refreshBtn.addEventListener("click", () => this.refresh());

		this.statsEl = c.createDiv() as HTMLDivElement;
		this.statsEl.style.fontSize = "11px";
		this.statsEl.style.opacity = "0.7";
		this.statsEl.style.marginBottom = "8px";

		this.filterEl = c.createDiv() as HTMLDivElement;
		this.filterEl.style.display = "flex";
		this.filterEl.style.gap = "4px";
		this.filterEl.style.marginBottom = "8px";
		this.filterEl.style.flexWrap = "wrap";
		this.renderFilters();

		this.listEl = c.createDiv() as HTMLDivElement;
		this.listEl.style.flexGrow = "1";
		this.listEl.style.overflowY = "auto";
		this.listEl.style.borderTop = "1px solid var(--background-modifier-border)";
		this.listEl.style.paddingTop = "8px";

		await this.refresh();
	}

	async onClose(): Promise<void> {}

	private renderFilters(): void {
		this.filterEl.empty();
		const filters: { id: FilterMode; label: string; icon: string }[] = [
			{ id: "today", label: "Hoje", icon: "📅" },
			{ id: "overdue", label: "Atrasadas", icon: "⚠️" },
			{ id: "week", label: "Semana", icon: "🗓️" },
			{ id: "all", label: "Todas", icon: "📋" },
			{ id: "no-due", label: "Sem data", icon: "❓" },
		];
		for (const f of filters) {
			const b = this.filterEl.createEl("button", {
				text: `${f.icon} ${f.label}`,
			});
			b.style.fontSize = "11px";
			b.style.padding = "4px 8px";
			b.style.cursor = "pointer";
			b.style.border = "1px solid var(--background-modifier-border)";
			b.style.borderRadius = "4px";
			if (this.currentFilter === f.id) {
				b.style.background = "var(--interactive-accent)";
				b.style.color = "var(--text-on-accent)";
				b.style.borderColor = "var(--interactive-accent)";
			} else {
				b.style.background = "var(--background-secondary)";
			}
			b.addEventListener("click", () => {
				this.currentFilter = f.id;
				this.renderFilters();
				this.renderList();
			});
		}
	}

	private async refresh(): Promise<void> {
		this.listEl.empty();
		const loading = this.listEl.createEl("div", { text: "🔍 Escaneando vault..." });
		loading.style.opacity = "0.6";
		loading.style.padding = "12px";

		this.tasks = await this.scanAllTasks();

		this.statsEl.setText(this.computeStatsText());
		this.renderList();
	}

	private async scanAllTasks(): Promise<VaultTask[]> {
		const out: VaultTask[] = [];
		const excluded = [...getExcludedFolders(), ".atlas", ".obsidian", "99_Archive"];
		const inclusive = getInclusiveFolders();

		const files = this.app.vault.getMarkdownFiles();
		for (const f of files) {
			if (excluded.some((p) => f.path.startsWith(p))) continue;
			if (inclusive && !inclusive.some((p) => f.path.startsWith(p))) continue;

			let raw: string;
			try {
				raw = await this.app.vault.read(f);
			} catch {
				continue;
			}

			const lines = raw.split("\n");
			for (let i = 0; i < lines.length; i++) {
				const m = lines[i].match(/^\s*-\s*\[([ xX-])\]\s+(.+)$/);
				if (!m) continue;
				const completed = m[1] !== " ";
				const text = m[2];

				const due = parseDueFromTask(text);
				const tags = extractTags(text);
				const mentions = extractMentions(text);

				out.push({
					notePath: f.path,
					lineNumber: i,
					rawLine: lines[i],
					description: text.replace(/\(@[^)]+\)/g, "").trim(),
					completed,
					dueDate: due.date,
					hasTime: due.hasTime,
					tags,
					mentionedPeople: mentions,
				});
			}
		}
		return out;
	}

	private computeStatsText(): string {
		const total = this.tasks.length;
		const open = this.tasks.filter((t) => !t.completed);
		const today = todayString();
		const overdue = open.filter(
			(t) => t.dueDate && t.dueDate.toISOString().split("T")[0] < today
		).length;
		const dueToday = open.filter(
			(t) => t.dueDate && t.dueDate.toISOString().split("T")[0] === today
		).length;
		return `${total} totais · ${open.length} abertas · ${dueToday} hoje · ${overdue} atrasadas`;
	}

	private renderList(): void {
		this.listEl.empty();

		const filtered = this.applyFilter(this.tasks).sort(this.sortByDueAsc);
		if (filtered.length === 0) {
			const empty = this.listEl.createEl("div", { text: "🎉 Nada aqui!" });
			empty.style.opacity = "0.6";
			empty.style.padding = "16px";
			empty.style.textAlign = "center";
			return;
		}

		// Group by note
		const byNote = new Map<string, VaultTask[]>();
		for (const t of filtered) {
			const arr = byNote.get(t.notePath) ?? [];
			arr.push(t);
			byNote.set(t.notePath, arr);
		}

		for (const [path, items] of byNote) {
			const group = this.listEl.createDiv();
			group.style.marginBottom = "12px";

			const noteHeader = group.createDiv();
			noteHeader.style.display = "flex";
			noteHeader.style.alignItems = "center";
			noteHeader.style.gap = "6px";
			noteHeader.style.fontSize = "11px";
			noteHeader.style.opacity = "0.7";
			noteHeader.style.cursor = "pointer";
			noteHeader.style.padding = "4px 0";
			const icon = noteHeader.createSpan();
			setIcon(icon, "file-text");
			const fileName = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
			noteHeader.createEl("span", { text: fileName });
			noteHeader.createEl("span", { text: ` (${items.length})` });
			noteHeader.addEventListener("click", () => this.openNote(path));

			for (const t of items) {
				this.renderTaskRow(group, t);
			}
		}
	}

	private renderTaskRow(parent: HTMLDivElement, t: VaultTask): void {
		const row = parent.createDiv();
		row.style.display = "flex";
		row.style.alignItems = "flex-start";
		row.style.gap = "8px";
		row.style.padding = "6px";
		row.style.borderRadius = "4px";
		row.style.marginLeft = "8px";
		row.style.background = "var(--background-secondary)";
		row.style.marginBottom = "4px";

		// Checkbox
		const cb = row.createEl("input", { type: "checkbox" }) as HTMLInputElement;
		cb.checked = t.completed;
		cb.style.marginTop = "2px";
		cb.addEventListener("change", () => void this.toggleComplete(t, cb.checked));

		// Body
		const body = row.createDiv();
		body.style.flexGrow = "1";

		const desc = body.createEl("div", { text: t.description });
		desc.style.fontSize = "13px";
		if (t.completed) {
			desc.style.textDecoration = "line-through";
			desc.style.opacity = "0.5";
		}

		const meta = body.createDiv();
		meta.style.fontSize = "10px";
		meta.style.opacity = "0.6";
		meta.style.marginTop = "2px";
		meta.style.display = "flex";
		meta.style.gap = "8px";
		meta.style.flexWrap = "wrap";

		if (t.dueDate) {
			const dueLabel = meta.createEl("span", { text: `📅 ${formatDue(t.dueDate, t.hasTime)}` });
			const today = todayString();
			const dueIso = t.dueDate.toISOString().split("T")[0];
			if (dueIso < today && !t.completed) {
				dueLabel.style.color = "var(--color-red)";
				dueLabel.style.fontWeight = "bold";
			} else if (dueIso === today) {
				dueLabel.style.color = "var(--color-orange)";
			}
		}
		for (const p of t.mentionedPeople.slice(0, 3)) {
			meta.createEl("span", { text: `👤 ${p}` });
		}
		for (const tg of t.tags.slice(0, 3)) {
			meta.createEl("span", { text: `#${tg}` });
		}

		// Actions
		const actions = row.createDiv();
		actions.style.display = "flex";
		actions.style.gap = "4px";

		if (!t.completed) {
			const deferBtn = actions.createEl("button", { text: "→" });
			deferBtn.title = "Adiar 1 dia";
			deferBtn.style.fontSize = "11px";
			deferBtn.style.padding = "2px 6px";
			deferBtn.addEventListener("click", () => void this.deferTask(t, 1));

			const deferWeek = actions.createEl("button", { text: "→7" });
			deferWeek.title = "Adiar 7 dias";
			deferWeek.style.fontSize = "11px";
			deferWeek.style.padding = "2px 6px";
			deferWeek.addEventListener("click", () => void this.deferTask(t, 7));
		}

		const openBtn = actions.createEl("button", { text: "↗" });
		openBtn.title = "Abrir nota fonte";
		openBtn.style.fontSize = "11px";
		openBtn.style.padding = "2px 6px";
		openBtn.addEventListener("click", () => this.openNote(t.notePath, t.lineNumber));
	}

	private applyFilter(tasks: VaultTask[]): VaultTask[] {
		const today = todayString();
		const weekAhead = new Date();
		weekAhead.setDate(weekAhead.getDate() + 7);
		const weekAheadIso = weekAhead.toISOString().split("T")[0];

		return tasks.filter((t) => {
			if (this.currentFilter === "all") return true;
			if (t.completed) return false;
			const dueIso = t.dueDate?.toISOString().split("T")[0] ?? null;
			switch (this.currentFilter) {
				case "today":
					return dueIso === today;
				case "overdue":
					return dueIso && dueIso < today;
				case "week":
					return dueIso && dueIso >= today && dueIso <= weekAheadIso;
				case "no-due":
					return !dueIso;
			}
			return true;
		});
	}

	private sortByDueAsc(a: VaultTask, b: VaultTask): number {
		if (a.completed !== b.completed) return a.completed ? 1 : -1;
		const ad = a.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
		const bd = b.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
		return ad - bd;
	}

	private async toggleComplete(t: VaultTask, completed: boolean): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(t.notePath);
		if (!(file instanceof TFile)) return;
		const raw = await this.app.vault.read(file);
		const lines = raw.split("\n");
		if (lines[t.lineNumber] !== t.rawLine) {
			new Notice("Atlas: linha mudou desde scan, atualize.");
			return;
		}
		lines[t.lineNumber] = t.rawLine.replace(/\[([ xX-])\]/, completed ? "[x]" : "[ ]");
		await this.app.vault.modify(file, lines.join("\n"));
		t.completed = completed;
		t.rawLine = lines[t.lineNumber];
		this.renderList();
	}

	private async deferTask(t: VaultTask, days: number): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(t.notePath);
		if (!(file instanceof TFile)) return;
		const raw = await this.app.vault.read(file);
		const lines = raw.split("\n");
		if (lines[t.lineNumber] !== t.rawLine) {
			new Notice("Atlas: linha mudou desde scan.");
			return;
		}

		const base = t.dueDate ?? new Date();
		const newDate = new Date(base.getTime() + days * 86_400_000);
		const newDateStr = newDate.toISOString().split("T")[0];
		const timePart = t.hasTime
			? newDate.toISOString().substring(11, 16).replace(":", ":")
			: "";
		const newReminder = timePart
			? `(@${newDateStr} ${timePart})`
			: `(@${newDateStr})`;

		let newLine: string;
		if (/\(@[^)]+\)/.test(t.rawLine)) {
			newLine = t.rawLine.replace(/\(@[^)]+\)/, newReminder);
		} else {
			newLine = t.rawLine.replace(/\[\s\]\s+(.*)/, `[ ] $1 ${newReminder}`);
		}

		lines[t.lineNumber] = newLine;
		await this.app.vault.modify(file, lines.join("\n"));
		t.rawLine = newLine;
		t.dueDate = newDate;
		new Notice(`Atlas: adiado para ${newDateStr}`);
		this.renderList();
	}

	private async openNote(path: string, line?: number): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		const leaf = this.app.workspace.getLeaf();
		await leaf.openFile(file);
		if (typeof line === "number") {
			const view = this.app.workspace.getActiveViewOfType(
				(await import("obsidian")).MarkdownView
			);
			view?.editor.setCursor({ line, ch: 0 });
		}
	}
}

// ─── helpers ───

function todayString(): string {
	return new Date().toISOString().split("T")[0];
}

function parseDueFromTask(text: string): { date: Date | null; hasTime: boolean } {
	const m = text.match(/\(@(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}):(\d{2}))?\)/);
	if (!m) return { date: null, hasTime: false };
	const dateStr = m[1];
	const hh = m[2] ?? "09";
	const mm = m[3] ?? "00";
	const d = new Date(`${dateStr}T${hh}:${mm}:00`);
	if (isNaN(d.getTime())) return { date: null, hasTime: false };
	return { date: d, hasTime: !!m[2] };
}

function extractTags(text: string): string[] {
	const out = new Set<string>();
	const re = /#([a-zA-Z][a-zA-Z0-9_/-]*)/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) out.add(m[1]);
	return Array.from(out);
}

function extractMentions(text: string): string[] {
	const out = new Set<string>();
	const re = /\[\[([^\]|#]+)/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) out.add(m[1].trim());
	return Array.from(out);
}

function formatDue(d: Date, hasTime: boolean): string {
	const iso = d.toISOString().split("T")[0];
	const today = todayString();
	const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split("T")[0];
	let label: string;
	if (iso === today) label = "hoje";
	else if (iso === tomorrow) label = "amanhã";
	else label = iso;

	if (hasTime) {
		const time = d.toTimeString().substring(0, 5);
		return `${label} ${time}`;
	}
	return label;
}
