import { App, Modal, Notice, TFile } from "obsidian";
import type AtlasPlugin from "../../main";
import { TreeView, TreeNode } from "../ui/tree-view";
import { applyResponsiveModal } from "../ui/modal-helpers";

type TreeKind = "people" | "projects" | "themes";

const KIND_META: Record<TreeKind, { title: string; icon: string }> = {
	people: { title: "Árvore de Pessoas", icon: "👥" },
	projects: { title: "Árvore de Projetos", icon: "🚀" },
	themes: { title: "Árvore de Temas", icon: "🏷️" },
};

export class EntityTreesModal extends Modal {
	private currentKind: TreeKind = "people";
	private treeContainer!: HTMLDivElement;

	constructor(app: App, private plugin: AtlasPlugin, initial: TreeKind = "people") {
		super(app);
		this.currentKind = initial;
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		applyResponsiveModal(contentEl, { preferredWidth: 720 });
		(contentEl as HTMLElement).style.maxHeight = "80vh";

		// Header com tabs
		const header = contentEl.createDiv();
		header.style.display = "flex";
		header.style.gap = "8px";
		header.style.marginBottom = "12px";

		const tabs: TreeKind[] = ["people", "projects", "themes"];
		for (const kind of tabs) {
			const meta = KIND_META[kind];
			const btn = header.createEl("button", { text: `${meta.icon} ${meta.title}` });
			btn.style.fontSize = "12px";
			btn.style.padding = "6px 12px";
			btn.style.cursor = "pointer";
			btn.style.borderRadius = "4px";
			if (kind === this.currentKind) {
				btn.style.background = "var(--interactive-accent)";
				btn.style.color = "var(--text-on-accent)";
			} else {
				btn.style.background = "var(--background-secondary)";
			}
			btn.addEventListener("click", () => {
				this.currentKind = kind;
				void this.onOpen();
			});
		}

		this.treeContainer = contentEl.createDiv() as HTMLDivElement;
		this.treeContainer.style.overflow = "auto";
		this.treeContainer.style.maxHeight = "60vh";
		this.treeContainer.style.border = "1px solid var(--background-modifier-border)";
		this.treeContainer.style.borderRadius = "4px";
		this.treeContainer.style.padding = "8px";

		await this.renderTree();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async renderTree(): Promise<void> {
		this.treeContainer.empty();
		const tree = new TreeView({ stateId: `entity-${this.currentKind}` });

		let roots: TreeNode[] = [];
		switch (this.currentKind) {
			case "people":
				roots = this.buildPeopleTree();
				break;
			case "projects":
				roots = this.buildProjectsTree();
				break;
			case "themes":
				roots = this.buildThemesTree();
				break;
		}

		await tree.render(this.treeContainer, roots);

		// Listen rerender event from tree
		this.treeContainer.addEventListener("atlas-tree-rerender", () => {
			void this.renderTree();
		});
	}

	// ──────────────────────────────────────────────────────────────────
	// PEOPLE TREE: agrupado por type (direct-report, peer, manager, etc)

	private buildPeopleTree(): TreeNode[] {
		const byType = new Map<string, typeof this.plugin.kg.data.people>();
		for (const p of this.plugin.kg.data.people) {
			const t = p.type ?? "other";
			const arr = byType.get(t) ?? [];
			arr.push(p);
			byType.set(t, arr);
		}

		const typeOrder = ["direct-report", "coachee", "peer", "manager", "skip-level", "stakeholder", "other"];
		const roots: TreeNode[] = [];
		for (const type of typeOrder) {
			const list = byType.get(type);
			if (!list || list.length === 0) continue;
			roots.push({
				id: `type-${type}`,
				icon: this.iconForPersonType(type),
				label: this.labelForPersonType(type),
				badge: String(list.length),
				children: list.map((p) => this.personNode(p)),
			});
		}
		return roots;
	}

	private personNode(p: typeof this.plugin.kg.data.people[number]): TreeNode {
		const sessions = this.plugin.kg.listSessionsByPerson(p.id);
		const themes = this.plugin.kg.listTopThemesForPerson(p.id, 3);

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
						const f = this.app.vault.getAbstractFileByPath(s.sourceNotePath);
						if (f instanceof TFile) {
							this.close();
							await this.app.workspace.getLeaf().openFile(f);
						}
					},
				})),
			});
		}

		const openCommitments = this.plugin.kg.listOpenCommitmentsBetween(p.id, "eu");
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
					icon: this.iconForSentiment(t.sentiment),
					label: t.name,
					subtitle: `${t.frequency}× · ${t.sentiment}`,
				})),
			});
		}

		return {
			id: `person-${p.id}`,
			icon: "👤",
			label: p.name,
			subtitle: [p.role, sessions.length > 0 ? `${sessions.length} sessões` : ""].filter(Boolean).join(" · "),
			children,
			onClick: async () => {
				if (p.notePath) {
					const f = this.app.vault.getAbstractFileByPath(p.notePath);
					if (f instanceof TFile) {
						this.close();
						await this.app.workspace.getLeaf().openFile(f);
					} else {
						new Notice(`Pessoa "${p.name}" sem nota — comando: Atlas: Resumir pessoa`);
					}
				}
			},
		};
	}

	// ──────────────────────────────────────────────────────────────────
	// PROJECTS TREE: agrupado por status (active, on-hold, etc) > rag

	private buildProjectsTree(): TreeNode[] {
		const projects = this.plugin.kg.data.projects;
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
				icon: this.iconForProjectStatus(status),
				label: status,
				badge: String(list.length),
				children: list.map((p) => ({
					id: `proj-${p.id}`,
					icon: "🚀",
					label: p.name,
					subtitle: `RAG ${p.rag} · ${p.phase ?? "—"}`,
					color: this.colorForRag(p.rag),
					onClick: async () => {
						const f = this.app.vault.getAbstractFileByPath(p.notePath);
						if (f instanceof TFile) {
							this.close();
							await this.app.workspace.getLeaf().openFile(f);
						}
					},
				})),
			});
		}
		return roots;
	}

	// ──────────────────────────────────────────────────────────────────
	// THEMES TREE: agrupado por sentiment > scope

	private buildThemesTree(): TreeNode[] {
		const themes = [...this.plugin.kg.data.themes].sort((a, b) => b.frequency - a.frequency);
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
				icon: this.iconForSentiment(sentiment),
				label: sentiment,
				badge: String(list.length),
				children: list.map((t) => ({
					id: `theme-${t.id}`,
					icon: "🏷️",
					label: t.name,
					subtitle: `${t.frequency}× · ${t.scope} · ${t.personIds.length} pessoa(s)`,
					color: this.colorForSentiment(t.sentiment),
				})),
			});
		}
		return roots;
	}

	// ──────────────────────────────────────────────────────────────────
	// HELPERS

	private iconForPersonType(type: string): string {
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

	private labelForPersonType(type: string): string {
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

	private iconForSentiment(s: string): string {
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

	private colorForSentiment(s: string): string {
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

	private iconForProjectStatus(s: string): string {
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

	private colorForRag(rag: string): string {
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
}
