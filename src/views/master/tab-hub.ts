import { TFile, Notice, MarkdownView } from "obsidian";
import type AtlasPlugin from "../../../main";
import { getExcludedFolders, getInclusiveFolders } from "../../coach/scope";

interface VaultTask {
	notePath: string;
	lineNumber: number;
	rawLine: string;
	description: string;
	completed: boolean;
	dueDate: Date | null;
	hasTime: boolean;
}

type FilterMode = "today" | "overdue" | "week" | "all" | "no-due";

export async function renderHubTab(container: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	container.empty();

	let currentFilter: FilterMode = "today";
	let tasks: VaultTask[] = [];

	// Header
	const header = container.createDiv();
	header.style.display = "flex";
	header.style.justifyContent = "space-between";
	header.style.alignItems = "center";
	header.style.marginBottom = "8px";
	header.createEl("h3", { text: "✅ Action Items Hub" }).style.margin = "0";
	const refreshBtn = header.createEl("button", { text: "↻" });
	refreshBtn.style.fontSize = "11px";

	const statsEl = container.createDiv();
	statsEl.style.fontSize = "11px";
	statsEl.style.opacity = "0.7";
	statsEl.style.marginBottom = "8px";

	const filterEl = container.createDiv();
	filterEl.style.display = "flex";
	filterEl.style.gap = "4px";
	filterEl.style.flexWrap = "wrap";
	filterEl.style.marginBottom = "8px";

	const listEl = container.createDiv();
	listEl.style.maxHeight = "calc(100vh - 280px)";
	listEl.style.overflowY = "auto";
	listEl.style.borderTop = "1px solid var(--background-modifier-border)";
	listEl.style.paddingTop = "8px";

	const today = (): string => new Date().toISOString().split("T")[0];

	const renderFilters = (): void => {
		filterEl.empty();
		const filters: { id: FilterMode; label: string; icon: string }[] = [
			{ id: "today", label: "Hoje", icon: "📅" },
			{ id: "overdue", label: "Atrasadas", icon: "⚠️" },
			{ id: "week", label: "Semana", icon: "🗓️" },
			{ id: "all", label: "Todas", icon: "📋" },
			{ id: "no-due", label: "Sem data", icon: "❓" },
		];
		for (const f of filters) {
			const b = filterEl.createEl("button", { text: `${f.icon} ${f.label}` });
			b.style.fontSize = "11px";
			b.style.padding = "4px 8px";
			b.style.cursor = "pointer";
			b.style.border = "1px solid var(--background-modifier-border)";
			b.style.borderRadius = "4px";
			if (currentFilter === f.id) {
				b.style.background = "var(--interactive-accent)";
				b.style.color = "var(--text-on-accent)";
			} else {
				b.style.background = "var(--background-secondary)";
			}
			b.addEventListener("click", () => {
				currentFilter = f.id;
				renderFilters();
				renderList();
			});
		}
	};

	const computeStats = (): string => {
		const total = tasks.length;
		const open = tasks.filter((t) => !t.completed);
		const todayStr = today();
		const overdue = open.filter(
			(t) => t.dueDate && t.dueDate.toISOString().split("T")[0] < todayStr
		).length;
		const dueToday = open.filter(
			(t) => t.dueDate && t.dueDate.toISOString().split("T")[0] === todayStr
		).length;
		return `${total} totais · ${open.length} abertas · ${dueToday} hoje · ${overdue} atrasadas`;
	};

	const applyFilter = (): VaultTask[] => {
		const todayStr = today();
		const weekAhead = new Date();
		weekAhead.setDate(weekAhead.getDate() + 7);
		const weekIso = weekAhead.toISOString().split("T")[0];
		return tasks.filter((t) => {
			if (currentFilter === "all") return true;
			if (t.completed) return false;
			const dueIso = t.dueDate?.toISOString().split("T")[0] ?? null;
			switch (currentFilter) {
				case "today":
					return dueIso === todayStr;
				case "overdue":
					return dueIso !== null && dueIso < todayStr;
				case "week":
					return dueIso !== null && dueIso >= todayStr && dueIso <= weekIso;
				case "no-due":
					return !dueIso;
			}
			return true;
		});
	};

	const renderList = (): void => {
		listEl.empty();
		const filtered = applyFilter().sort((a, b) => {
			if (a.completed !== b.completed) return a.completed ? 1 : -1;
			const ad = a.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
			const bd = b.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
			return ad - bd;
		});
		if (filtered.length === 0) {
			const empty = listEl.createEl("div", { text: "🎉 Nada aqui!" });
			empty.style.opacity = "0.6";
			empty.style.padding = "16px";
			empty.style.textAlign = "center";
			return;
		}
		const byNote = new Map<string, VaultTask[]>();
		for (const t of filtered) {
			const arr = byNote.get(t.notePath) ?? [];
			arr.push(t);
			byNote.set(t.notePath, arr);
		}
		for (const [notePath, items] of byNote) {
			const group = listEl.createDiv();
			group.style.marginBottom = "10px";

			const noteHeader = group.createDiv();
			noteHeader.style.fontSize = "10px";
			noteHeader.style.opacity = "0.7";
			noteHeader.style.cursor = "pointer";
			noteHeader.style.padding = "2px 0";
			noteHeader.setText(`📄 ${notePath.split("/").pop()?.replace(/\.md$/, "")} (${items.length})`);
			noteHeader.addEventListener("click", () => {
				const file = plugin.app.vault.getAbstractFileByPath(notePath);
				if (file instanceof TFile) plugin.app.workspace.getLeaf().openFile(file);
			});

			for (const t of items) {
				renderTaskRow(group, t);
			}
		}
	};

	const renderTaskRow = (parent: HTMLElement, t: VaultTask): void => {
		const row = parent.createDiv();
		row.style.display = "flex";
		row.style.alignItems = "flex-start";
		row.style.gap = "6px";
		row.style.padding = "6px";
		row.style.borderRadius = "4px";
		row.style.marginLeft = "8px";
		row.style.background = "var(--background-secondary)";
		row.style.marginBottom = "3px";
		row.style.fontSize = "12px";

		const cb = row.createEl("input", { type: "checkbox" }) as HTMLInputElement;
		cb.checked = t.completed;
		cb.addEventListener("change", () => void toggleComplete(t, cb.checked));

		const body = row.createDiv();
		body.style.flexGrow = "1";
		const desc = body.createEl("div", { text: t.description });
		if (t.completed) {
			desc.style.textDecoration = "line-through";
			desc.style.opacity = "0.5";
		}
		if (t.dueDate) {
			const todayStr = today();
			const dueIso = t.dueDate.toISOString().split("T")[0];
			const dueLabel = body.createEl("div");
			dueLabel.style.fontSize = "10px";
			dueLabel.style.opacity = "0.6";
			dueLabel.setText(`📅 ${formatDue(t.dueDate, t.hasTime)}`);
			if (dueIso < todayStr && !t.completed) {
				dueLabel.style.color = "var(--color-red)";
			} else if (dueIso === todayStr) {
				dueLabel.style.color = "var(--color-orange)";
			}
		}

		const actions = row.createDiv();
		actions.style.display = "flex";
		actions.style.gap = "2px";
		if (!t.completed) {
			const d1 = actions.createEl("button", { text: "→" });
			d1.title = "Adiar 1 dia";
			d1.style.fontSize = "10px";
			d1.style.padding = "1px 4px";
			d1.addEventListener("click", () => void deferTask(t, 1));
		}
	};

	const toggleComplete = async (t: VaultTask, completed: boolean) => {
		const file = plugin.app.vault.getAbstractFileByPath(t.notePath);
		if (!(file instanceof TFile)) return;
		const raw = await plugin.app.vault.read(file);
		const lines = raw.split("\n");
		if (lines[t.lineNumber] !== t.rawLine) {
			new Notice("Atlas: linha mudou, recarregue.");
			return;
		}
		lines[t.lineNumber] = t.rawLine.replace(/\[([ xX-])\]/, completed ? "[x]" : "[ ]");
		await plugin.app.vault.modify(file, lines.join("\n"));
		t.completed = completed;
		t.rawLine = lines[t.lineNumber];
		renderList();
	};

	const deferTask = async (t: VaultTask, days: number) => {
		const file = plugin.app.vault.getAbstractFileByPath(t.notePath);
		if (!(file instanceof TFile)) return;
		const raw = await plugin.app.vault.read(file);
		const lines = raw.split("\n");
		const base = t.dueDate ?? new Date();
		const newDate = new Date(base.getTime() + days * 86_400_000);
		const newDateStr = newDate.toISOString().split("T")[0];
		const newReminder = t.hasTime
			? `(@${newDateStr} ${newDate.toISOString().substring(11, 16)})`
			: `(@${newDateStr})`;
		const newLine = lines[t.lineNumber].replace(/\(@[^)]+\)/, newReminder);
		lines[t.lineNumber] = newLine;
		await plugin.app.vault.modify(file, lines.join("\n"));
		t.dueDate = newDate;
		t.rawLine = newLine;
		new Notice(`Atlas: adiado para ${newDateStr}`);
		renderList();
	};

	const refresh = async () => {
		listEl.empty();
		const loading = listEl.createEl("div", { text: "Escaneando vault..." });
		loading.style.opacity = "0.6";
		tasks = await scanAllTasks(plugin);
		statsEl.setText(computeStats());
		renderList();
	};

	refreshBtn.addEventListener("click", () => void refresh());
	renderFilters();
	await refresh();
}

async function scanAllTasks(plugin: AtlasPlugin): Promise<VaultTask[]> {
	const out: VaultTask[] = [];
	const excluded = [...getExcludedFolders(), ".atlas", ".obsidian", "99_Archive"];
	const inclusive = getInclusiveFolders();
	const files = plugin.app.vault.getMarkdownFiles();

	for (const f of files) {
		if (excluded.some((p) => f.path.startsWith(p))) continue;
		if (inclusive && !inclusive.some((p) => f.path.startsWith(p))) continue;

		let raw: string;
		try {
			raw = await plugin.app.vault.read(f);
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
			out.push({
				notePath: f.path,
				lineNumber: i,
				rawLine: lines[i],
				description: text.replace(/\(@[^)]+\)/g, "").trim(),
				completed,
				dueDate: due.date,
				hasTime: due.hasTime,
			});
		}
	}
	return out;
}

function parseDueFromTask(text: string): { date: Date | null; hasTime: boolean } {
	const m = text.match(/\(@(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}):(\d{2}))?\)/);
	if (!m) return { date: null, hasTime: false };
	const dateStr = m[1];
	const hh = m[2] ?? "09";
	const mm = m[3] ?? "00";
	const d = new Date(`${dateStr}T${hh}:${mm}:00`);
	return { date: isNaN(d.getTime()) ? null : d, hasTime: !!m[2] };
}

function formatDue(d: Date, hasTime: boolean): string {
	const iso = d.toISOString().split("T")[0];
	const today = new Date().toISOString().split("T")[0];
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
