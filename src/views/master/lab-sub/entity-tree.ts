import { TFile, Notice } from "obsidian";
import type AtlasPlugin from "../../../../main";
import { TreeView, TreeNode } from "../../../ui/tree-view";

type TreeKind = "people" | "projects" | "themes";

const KIND_META: Record<TreeKind, { title: string; icon: string }> = {
	people: { title: "Pessoas", icon: "👥" },
	projects: { title: "Projetos", icon: "🚀" },
	themes: { title: "Temas", icon: "🏷️" },
};

/**
 * Entity Tree sub-view embedded — versão da EntityTreesModal renderizada inline.
 *
 * Toggle 3 árvores no topo. Cada árvore expansível com sessions/commitments/themes
 * (people), milestones+risks (projects), por sentiment (themes).
 */
export async function renderLabEntityTree(
	container: HTMLElement,
	plugin: AtlasPlugin
): Promise<void> {
	container.empty();

	let currentKind: TreeKind = "people";

	const intro = container.createDiv();
	intro.style.fontSize = "11px";
	intro.style.opacity = "0.7";
	intro.style.marginBottom = "10px";
	intro.setText(
		"Visualização hierárquica do Knowledge Graph. Pessoas → sessões/commitments/temas. Projetos → milestones/risks. Temas por sentiment."
	);

	// Switcher
	const switcher = container.createDiv();
	switcher.style.display = "flex";
	switcher.style.gap = "6px";
	switcher.style.marginBottom = "12px";

	const treeContainer = container.createDiv();
	treeContainer.style.maxHeight = "calc(100vh - 280px)";
	treeContainer.style.overflowY = "auto";
	treeContainer.style.padding = "8px";
	treeContainer.style.border = "1px solid var(--background-modifier-border)";
	treeContainer.style.borderRadius = "6px";

	const renderSwitcher = (): void => {
		switcher.empty();
		for (const kind of ["people", "projects", "themes"] as TreeKind[]) {
			const meta = KIND_META[kind];
			const btn = switcher.createEl("button", { text: `${meta.icon} ${meta.title}` });
			btn.style.fontSize = "11px";
			btn.style.padding = "5px 12px";
			btn.style.cursor = "pointer";
			btn.style.borderRadius = "4px";
			if (kind === currentKind) {
				btn.style.background = "var(--interactive-accent)";
				btn.style.color = "var(--text-on-accent)";
			} else {
				btn.style.background = "var(--background-secondary)";
			}
			btn.addEventListener("click", () => {
				currentKind = kind;
				renderSwitcher();
				void renderTree();
			});
		}
	};

	const renderTree = async (): Promise<void> => {
		treeContainer.empty();
		const tree = new TreeView({ stateId: `lab-entity-${currentKind}` });

		let roots: TreeNode[] = [];
		switch (currentKind) {
			case "people":
				roots = buildPeopleTree(plugin);
				break;
			case "projects":
				roots = buildProjectsTree(plugin);
				break;
			case "themes":
				roots = buildThemesTree(plugin);
				break;
		}

		await tree.render(treeContainer, roots);

		treeContainer.addEventListener("atlas-tree-rerender", () => {
			void renderTree();
		});
	};

	renderSwitcher();
	await renderTree();
}

// ──────────────────────────────────────────────────────────────────
// PEOPLE TREE: agrupado por type

function buildPeopleTree(plugin: AtlasPlugin): TreeNode[] {
	const byType = new Map<string, typeof plugin.kg.data.people>();
	for (const p of plugin.kg.data.people) {
		const t = p.type ?? "other";
		const arr = byType.get(t) ?? [];
		arr.push(p);
		byType.set(t, arr);
	}

	const typeOrder = [
		"direct-report",
		"coachee",
		"peer",
		"manager",
		"skip-level",
		"stakeholder",
		"other",
	];
	const roots: TreeNode[] = [];
	for (const type of typeOrder) {
		const list = byType.get(type);
		if (!list || list.length === 0) continue;
		roots.push({
			id: `type-${type}`,
			icon: iconForPersonType(type),
			label: labelForPersonType(type),
			badge: String(list.length),
			children: list.map((p) => personNode(plugin, p)),
		});
	}
	if (roots.length === 0) {
		roots.push({
			id: "empty",
			icon: "📭",
			label: "Nenhuma pessoa no KG",
			subtitle: "Cadastre via Quick Add (FAB)",
		});
	}
	return roots;
}

function personNode(
	plugin: AtlasPlugin,
	p: typeof plugin.kg.data.people[number]
): TreeNode {
	const sessions = plugin.kg.listSessionsByPerson(p.id);
	const themes = plugin.kg.listTopThemesForPerson(p.id, 3);

	const children: TreeNode[] = [];

	if (sessions.length > 0) {
		children.push({
			id: `${p.id}-sessions`,
			icon: "🤝",
			label: "Sessões",
			badge: String(sessions.length),
			children: sessions.slice(0, 10).map((s) => ({
				id: `${p.id}-s-${s.id}`,
				icon: "📅",
				label: s.date,
				subtitle: `${s.framework} · ${s.type}`,
				onClick: async () => {
					const f = plugin.app.vault.getAbstractFileByPath(s.sourceNotePath);
					if (f instanceof TFile) {
						await plugin.app.workspace.getLeaf().openFile(f);
					}
				},
			})),
		});
	}

	const openCommitments = plugin.kg.listOpenCommitmentsBetween(p.id, "eu");
	if (openCommitments.length > 0) {
		children.push({
			id: `${p.id}-commitments`,
			icon: "🔁",
			label: "Commitments",
			badge: String(openCommitments.length),
			children: openCommitments.map((c) => ({
				id: `${p.id}-c-${c.id}`,
				icon: c.madeBy === "eu" ? "→" : "←",
				label: c.text.length > 60 ? c.text.substring(0, 60) + "…" : c.text,
				subtitle: c.dueDate ?? "(sem data)",
			})),
		});
	}

	if (themes.length > 0) {
		children.push({
			id: `${p.id}-themes`,
			icon: "🏷️",
			label: "Temas",
			badge: String(themes.length),
			children: themes.map((t) => ({
				id: `${p.id}-t-${t.id}`,
				icon: iconForSentiment(t.sentiment),
				label: t.name,
				subtitle: `${t.frequency}× · ${t.sentiment}`,
			})),
		});
	}

	return {
		id: `person-${p.id}`,
		icon: "👤",
		label: p.name,
		subtitle: [p.role, sessions.length > 0 ? `${sessions.length} sessões` : ""]
			.filter(Boolean)
			.join(" · "),
		children,
		onClick: async () => {
			if (p.notePath) {
				const f = plugin.app.vault.getAbstractFileByPath(p.notePath);
				if (f instanceof TFile) {
					await plugin.app.workspace.getLeaf().openFile(f);
				} else {
					new Notice(`Pessoa "${p.name}" sem nota — comando: Atlas: Resumir pessoa`);
				}
			}
		},
	};
}

// ──────────────────────────────────────────────────────────────────
// PROJECTS TREE

function buildProjectsTree(plugin: AtlasPlugin): TreeNode[] {
	const projects = plugin.kg.data.projects;
	if (projects.length === 0) {
		return [
			{
				id: "empty",
				icon: "📭",
				label: "Nenhum projeto registrado",
				subtitle: "Crie notas com type: project",
			},
		];
	}

	const byStatus = new Map<string, typeof projects>();
	for (const p of projects) {
		const arr = byStatus.get(p.status) ?? [];
		arr.push(p);
		byStatus.set(p.status, arr);
	}

	const order = ["active", "proposed", "on-hold", "completed", "cancelled"];
	const roots: TreeNode[] = [];
	for (const status of order) {
		const list = byStatus.get(status);
		if (!list || list.length === 0) continue;
		roots.push({
			id: `proj-status-${status}`,
			icon: iconForProjectStatus(status),
			label: status,
			badge: String(list.length),
			children: list.map((p) => ({
				id: `proj-${p.id}`,
				icon: "🚀",
				label: p.name,
				subtitle: `RAG ${p.rag} · ${p.phase ?? "—"}`,
				color: colorForRag(p.rag),
				onClick: async () => {
					const f = plugin.app.vault.getAbstractFileByPath(p.notePath);
					if (f instanceof TFile) {
						await plugin.app.workspace.getLeaf().openFile(f);
					}
				},
			})),
		});
	}
	return roots;
}

// ──────────────────────────────────────────────────────────────────
// THEMES TREE

function buildThemesTree(plugin: AtlasPlugin): TreeNode[] {
	const themes = [...plugin.kg.data.themes].sort((a, b) => b.frequency - a.frequency);
	if (themes.length === 0) {
		return [
			{
				id: "empty",
				icon: "📭",
				label: "Nenhum tema detectado",
				subtitle: "Indexe vault com Atlas: Indexar vault",
			},
		];
	}

	const bySentiment = new Map<string, typeof themes>();
	for (const t of themes) {
		const arr = bySentiment.get(t.sentiment) ?? [];
		arr.push(t);
		bySentiment.set(t.sentiment, arr);
	}

	const order = ["blocker", "growth", "strength", "neutral"];
	const roots: TreeNode[] = [];
	for (const sentiment of order) {
		const list = bySentiment.get(sentiment);
		if (!list || list.length === 0) continue;
		roots.push({
			id: `theme-sent-${sentiment}`,
			icon: iconForSentiment(sentiment),
			label: sentiment,
			badge: String(list.length),
			children: list.map((t) => ({
				id: `theme-${t.id}`,
				icon: "🏷️",
				label: t.name,
				subtitle: `${t.frequency}× · ${t.scope} · ${t.personIds.length} pessoa(s)`,
				color: colorForSentiment(t.sentiment),
			})),
		});
	}
	return roots;
}

// ──────────────────────────────────────────────────────────────────
// HELPERS

function iconForPersonType(type: string): string {
	switch (type) {
		case "direct-report":
			return "👤";
		case "coachee":
			return "🎓";
		case "peer":
			return "🤝";
		case "manager":
			return "👔";
		case "skip-level":
			return "🔝";
		case "stakeholder":
			return "🏛️";
		default:
			return "👥";
	}
}

function labelForPersonType(type: string): string {
	switch (type) {
		case "direct-report":
			return "Diretos";
		case "coachee":
			return "Coachees";
		case "peer":
			return "Peers";
		case "manager":
			return "Managers";
		case "skip-level":
			return "Skip-level";
		case "stakeholder":
			return "Stakeholders";
		default:
			return "Outros";
	}
}

function iconForSentiment(s: string): string {
	switch (s) {
		case "blocker":
			return "🚧";
		case "growth":
			return "🌱";
		case "strength":
			return "💪";
		default:
			return "•";
	}
}

function colorForSentiment(s: string): string {
	switch (s) {
		case "blocker":
			return "#c62828";
		case "growth":
			return "#1976d2";
		case "strength":
			return "#2e7d32";
		default:
			return "";
	}
}

function iconForProjectStatus(s: string): string {
	switch (s) {
		case "active":
			return "🟢";
		case "proposed":
			return "💡";
		case "on-hold":
			return "⏸️";
		case "completed":
			return "✅";
		case "cancelled":
			return "❌";
		default:
			return "📁";
	}
}

function colorForRag(rag: string): string {
	switch (rag) {
		case "green":
			return "var(--color-green)";
		case "amber":
			return "var(--color-orange)";
		case "red":
			return "var(--color-red)";
		default:
			return "";
	}
}
