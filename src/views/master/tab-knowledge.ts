import { TFile, Notice } from "obsidian";
import type AtlasPlugin from "../../../main";
import { t } from "../../i18n";

type EntityType = "all" | "person" | "project" | "theme";

/**
 * Knowledge tab — entity grid (cards visuais clicáveis).
 * NOVO em v0.4. Substitui a navegação por comandos.
 */
export async function renderKnowledgeTab(container: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	container.empty();
	let currentType: EntityType = "all";
	let searchQuery = "";

	// Header
	const header = container.createDiv();
	header.style.marginBottom = "10px";
	header.createEl("h3", { text: t("knowledge.title") }).style.margin = "0 0 4px 0";

	const stats = header.createEl("div");
	stats.style.fontSize = "11px";
	stats.style.opacity = "0.6";
	const data = plugin.kg.data;
	stats.setText(
		`${data.people.length} pessoas · ${data.projects.length} projetos · ${data.themes.length} temas · ${data.sessions.length} sessões`
	);

	// Filter bar
	const filterBar = container.createDiv();
	filterBar.style.display = "flex";
	filterBar.style.gap = "4px";
	filterBar.style.marginBottom = "10px";
	filterBar.style.flexWrap = "wrap";

	const filters: { id: EntityType; label: string }[] = [
		{ id: "all", label: "Todos" },
		{ id: "person", label: `👤 Pessoas (${data.people.length})` },
		{ id: "project", label: `🚀 Projetos (${data.projects.length})` },
		{ id: "theme", label: `🏷️ Temas (${data.themes.length})` },
	];
	for (const f of filters) {
		const b = filterBar.createEl("button", { text: f.label });
		b.style.fontSize = "11px";
		b.style.padding = "4px 8px";
		b.style.cursor = "pointer";
		b.style.border = "1px solid var(--background-modifier-border)";
		b.style.borderRadius = "4px";
		b.style.background =
			currentType === f.id ? "var(--interactive-accent)" : "var(--background-secondary)";
		b.style.color =
			currentType === f.id ? "var(--text-on-accent)" : "var(--text-normal)";
		b.addEventListener("click", () => {
			currentType = f.id;
			void renderKnowledgeTab(container, plugin);
		});
	}

	// Search
	const searchEl = container.createEl("input", {
		type: "search",
		attr: { placeholder: "Buscar entidade..." },
	}) as HTMLInputElement;
	searchEl.style.width = "100%";
	searchEl.style.padding = "6px";
	searchEl.style.fontSize = "13px";
	searchEl.style.marginBottom = "10px";

	const grid = container.createDiv();
	grid.style.display = "grid";
	grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(180px, 1fr))";
	grid.style.gap = "8px";
	grid.style.maxHeight = "calc(100vh - 280px)";
	grid.style.overflowY = "auto";

	const renderGrid = () => {
		grid.empty();
		const q = searchQuery.toLowerCase();

		if (currentType === "all" || currentType === "person") {
			for (const p of data.people) {
				if (q && !p.name.toLowerCase().includes(q)) continue;
				renderPersonCard(grid, plugin, p);
			}
		}
		if (currentType === "all" || currentType === "project") {
			for (const proj of data.projects) {
				if (q && !proj.name.toLowerCase().includes(q)) continue;
				renderProjectCard(grid, plugin, proj);
			}
		}
		if (currentType === "all" || currentType === "theme") {
			for (const t of [...data.themes].sort((a, b) => b.frequency - a.frequency)) {
				if (q && !t.name.toLowerCase().includes(q)) continue;
				renderThemeCard(grid, plugin, t);
			}
		}

		if (grid.children.length === 0) {
			const empty = grid.createEl("div");
			empty.style.gridColumn = "1 / -1";
			empty.style.padding = "32px 16px";
			empty.style.textAlign = "center";
			empty.style.opacity = "0.6";
			empty.setText(
				q
					? `Nada encontrado para "${q}".`
					: "KG vazio. Indexe o vault primeiro: Cmd+P → 'Atlas: Indexar vault'."
			);
		}
	};

	searchEl.addEventListener("input", () => {
		searchQuery = searchEl.value;
		renderGrid();
	});

	renderGrid();
}

function renderPersonCard(
	parent: HTMLElement,
	plugin: AtlasPlugin,
	p: import("../../kg/schemas").PersonT
): void {
	const card = parent.createDiv();
	card.style.padding = "10px";
	card.style.background = "var(--background-secondary)";
	card.style.borderRadius = "6px";
	card.style.cursor = "pointer";
	card.style.border = "1px solid var(--background-modifier-border)";

	const head = card.createDiv();
	head.style.display = "flex";
	head.style.alignItems = "center";
	head.style.gap = "6px";
	head.style.marginBottom = "6px";

	const avatar = head.createEl("div", { text: getInitials(p.name) });
	avatar.style.width = "28px";
	avatar.style.height = "28px";
	avatar.style.borderRadius = "50%";
	avatar.style.background = stringToColor(p.name);
	avatar.style.color = "white";
	avatar.style.display = "flex";
	avatar.style.alignItems = "center";
	avatar.style.justifyContent = "center";
	avatar.style.fontWeight = "bold";
	avatar.style.fontSize = "11px";

	const nameEl = head.createEl("div", { text: p.name });
	nameEl.style.fontSize = "12px";
	nameEl.style.fontWeight = "bold";
	nameEl.style.flexGrow = "1";
	nameEl.style.overflow = "hidden";
	nameEl.style.textOverflow = "ellipsis";

	const meta = card.createEl("div");
	meta.style.fontSize = "10px";
	meta.style.opacity = "0.6";
	const parts: string[] = [];
	if (p.role) parts.push(p.role);
	if (p.type && p.type !== "other") parts.push(p.type);
	meta.setText(parts.join(" · ") || "—");

	const sessions = plugin.kg.listSessionsByPerson(p.id);
	const themes = plugin.kg.listTopThemesForPerson(p.id, 2);
	const stats = card.createEl("div");
	stats.style.fontSize = "10px";
	stats.style.opacity = "0.7";
	stats.style.marginTop = "4px";
	stats.setText(`${sessions.length} sessões · ${themes.length} temas`);

	if (themes.length > 0) {
		const chips = card.createDiv();
		chips.style.display = "flex";
		chips.style.flexWrap = "wrap";
		chips.style.gap = "3px";
		chips.style.marginTop = "4px";
		for (const t of themes) {
			const chip = chips.createEl("span", { text: t.name });
			chip.style.padding = "1px 5px";
			chip.style.borderRadius = "3px";
			chip.style.fontSize = "9px";
			chip.style.background = sentimentColor(t.sentiment);
			chip.style.color = "white";
		}
	}

	card.addEventListener("click", async () => {
		if (p.notePath) {
			const f = plugin.app.vault.getAbstractFileByPath(p.notePath);
			if (f instanceof TFile) {
				await plugin.app.workspace.getLeaf().openFile(f);
				return;
			}
		}
		new Notice(`Atlas: pessoa "${p.name}" sem nota. Use 'Atlas: Resumir pessoa' pra gerar.`);
	});

	// Right-click → context menu
	card.addEventListener("contextmenu", (e) => {
		e.preventDefault();
		const apiAny = plugin.app as unknown as {
			commands?: { executeCommandById?: (id: string) => void };
		};
		// Open prepare-1on1 modal pre-filled
		apiAny.commands?.executeCommandById?.("atlas:prepare-1on1");
	});
}

function renderProjectCard(
	parent: HTMLElement,
	plugin: AtlasPlugin,
	proj: import("../../kg/schemas").ProjectT
): void {
	const card = parent.createDiv();
	card.style.padding = "10px";
	card.style.background = "var(--background-secondary)";
	card.style.borderRadius = "6px";
	card.style.cursor = "pointer";
	card.style.borderLeft = `3px solid ${ragColor(proj.rag)}`;

	const name = card.createEl("div", { text: `🚀 ${proj.name}` });
	name.style.fontWeight = "bold";
	name.style.fontSize = "12px";

	const meta = card.createEl("div");
	meta.style.fontSize = "10px";
	meta.style.opacity = "0.7";
	meta.style.marginTop = "4px";
	meta.setText(`RAG: ${proj.rag} · ${proj.status}`);

	if (proj.phase) {
		const phase = card.createEl("div", { text: `Fase: ${proj.phase}` });
		phase.style.fontSize = "10px";
		phase.style.opacity = "0.6";
	}

	card.addEventListener("click", async () => {
		const f = plugin.app.vault.getAbstractFileByPath(proj.notePath);
		if (f instanceof TFile) await plugin.app.workspace.getLeaf().openFile(f);
	});
}

function renderThemeCard(
	parent: HTMLElement,
	plugin: AtlasPlugin,
	t: import("../../kg/schemas").ThemeT
): void {
	const card = parent.createDiv();
	card.style.padding = "10px";
	card.style.background = sentimentColor(t.sentiment);
	card.style.color = "white";
	card.style.borderRadius = "6px";
	card.style.cursor = "pointer";

	const name = card.createEl("div", { text: `🏷️ ${t.name}` });
	name.style.fontWeight = "bold";
	name.style.fontSize = "12px";

	const meta = card.createEl("div");
	meta.style.fontSize = "10px";
	meta.style.opacity = "0.85";
	meta.style.marginTop = "4px";
	meta.setText(`${t.frequency}× · ${t.sentiment} · ${t.scope}`);

	const lastSeen = new Date(t.lastSeen).toISOString().split("T")[0];
	const at = card.createEl("div", { text: `Última: ${lastSeen}` });
	at.style.fontSize = "9px";
	at.style.opacity = "0.7";
	at.style.marginTop = "4px";

	card.addEventListener("click", () => {
		new Notice(`Atlas: tema "${t.name}" — view detalhada em desenvolvimento.`);
	});
}

function getInitials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function stringToColor(s: string): string {
	let hash = 0;
	for (let i = 0; i < s.length; i++) {
		hash = s.charCodeAt(i) + ((hash << 5) - hash);
	}
	return `hsl(${Math.abs(hash) % 360}, 60%, 45%)`;
}

function sentimentColor(sentiment: string): string {
	switch (sentiment) {
		case "blocker":
			return "#c62828";
		case "growth":
			return "#1976d2";
		case "strength":
			return "#2e7d32";
		default:
			return "#616161";
	}
}

function ragColor(rag: string): string {
	switch (rag) {
		case "green":
			return "var(--color-green)";
		case "amber":
			return "var(--color-orange)";
		case "red":
			return "var(--color-red)";
		default:
			return "var(--background-modifier-border)";
	}
}
