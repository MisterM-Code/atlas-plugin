import { App, Modal, TFile, Notice, MarkdownView } from "obsidian";
import type AtlasPlugin from "../../main";
import { applyResponsiveModal } from "../ui/modal-helpers";

interface SpotlightItem {
	id: string;
	icon: string;
	title: string;
	subtitle?: string;
	category: "ação" | "nota" | "pessoa" | "projeto" | "tema" | "comando";
	score: number;
	run: () => void | Promise<void>;
}

/**
 * Cmd+K universal launcher — busca + ações tudo num só lugar.
 * Inspirado em Linear / Raycast / Notion.
 */
export class SpotlightModal extends Modal {
	private inputEl!: HTMLInputElement;
	private listEl!: HTMLDivElement;
	private hintEl!: HTMLDivElement;
	private items: SpotlightItem[] = [];
	private filteredItems: SpotlightItem[] = [];
	private selectedIdx = 0;
	private query = "";
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(app: App, private plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		applyResponsiveModal(contentEl, { preferredWidth: 720 });
		(contentEl as HTMLElement).style.padding = "0";

		// Input
		const inputWrap = contentEl.createDiv();
		inputWrap.style.padding = "12px 16px";
		inputWrap.style.borderBottom = "1px solid var(--background-modifier-border)";

		this.inputEl = inputWrap.createEl("input", {
			type: "search",
			attr: { placeholder: "Atlas Spotlight — busque qualquer coisa ou ação…" },
		}) as HTMLInputElement;
		this.inputEl.style.width = "100%";
		this.inputEl.style.fontSize = "16px";
		this.inputEl.style.padding = "8px";
		this.inputEl.style.border = "none";
		this.inputEl.style.outline = "none";
		this.inputEl.style.background = "transparent";
		this.inputEl.focus();

		// Results
		this.listEl = contentEl.createDiv() as HTMLDivElement;
		this.listEl.style.maxHeight = "60vh";
		this.listEl.style.overflowY = "auto";

		this.hintEl = contentEl.createDiv() as HTMLDivElement;
		this.hintEl.style.padding = "8px 16px";
		this.hintEl.style.borderTop = "1px solid var(--background-modifier-border)";
		this.hintEl.style.fontSize = "10px";
		this.hintEl.style.opacity = "0.6";
		this.hintEl.style.display = "flex";
		this.hintEl.style.justifyContent = "space-between";
		this.renderHint();

		this.buildAllItems();
		this.runFilter();

		this.inputEl.addEventListener("input", () => {
			this.query = this.inputEl.value;
			if (this.debounceTimer) clearTimeout(this.debounceTimer);
			this.debounceTimer = setTimeout(() => this.runFilter(), 100);
		});

		this.inputEl.addEventListener("keydown", (ev: KeyboardEvent) => {
			if (ev.key === "ArrowDown") {
				ev.preventDefault();
				this.move(1);
			} else if (ev.key === "ArrowUp") {
				ev.preventDefault();
				this.move(-1);
			} else if (ev.key === "Enter") {
				ev.preventDefault();
				this.selectCurrent();
			} else if (ev.key === "Escape") {
				this.close();
			}
		});
	}

	onClose(): void {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.contentEl.empty();
	}

	private buildAllItems(): void {
		this.items = [];

		// Atlas commands
		const cmds: { id: string; icon: string; title: string; commandId: string }[] = [
			{ id: "cmd-daily", icon: "📓", title: "Daily log (criar/abrir hoje)", commandId: "atlas-daily-log" },
			{ id: "cmd-quick", icon: "🎯", title: "Quick capture", commandId: "atlas-quick-capture" },
			{ id: "cmd-search", icon: "🔎", title: "Buscar no vault (hybrid)", commandId: "atlas-search-vault" },
			{ id: "cmd-chat", icon: "💬", title: "Abrir Atlas Chat", commandId: "atlas-open-chat" },
			{ id: "cmd-today", icon: "☀️", title: "Atlas Today (dashboard)", commandId: "atlas-open-today" },
			{ id: "cmd-hub", icon: "✅", title: "Action Items Hub", commandId: "atlas-open-hub" },
			{ id: "cmd-suggestions", icon: "🔗", title: "Smart Suggestions sidebar", commandId: "atlas-open-suggestions" },
			{ id: "cmd-1on1", icon: "🤝", title: "Preparar próximo 1:1", commandId: "atlas-prepare-1on1" },
			{ id: "cmd-summarize", icon: "📝", title: "Resumir pessoa", commandId: "atlas-summarize-person" },
			{ id: "cmd-weekly", icon: "📊", title: "Gerar weekly report agora", commandId: "atlas-weekly-now" },
			{ id: "cmd-send-weekly", icon: "📧", title: "Enviar weekly report (nota ativa)", commandId: "atlas-send-weekly" },
			{ id: "cmd-reasoning", icon: "🧠", title: "Pense comigo (CoT)", commandId: "atlas-reasoning" },
			{ id: "cmd-inline-ai", icon: "✨", title: "Inline AI (reescrever/resumir/explicar)", commandId: "atlas-inline-ai" },
			{ id: "cmd-smart-paste", icon: "📋", title: "Smart paste", commandId: "atlas-smart-paste" },
			{ id: "cmd-tldr", icon: "📃", title: "Auto-summary TLDR no topo", commandId: "atlas-auto-summary" },
			{ id: "cmd-tag", icon: "🏷️", title: "Auto-tag nota ativa", commandId: "atlas-tag-active-note" },
			{ id: "cmd-aliases", icon: "🪪", title: "Detectar aliases (KG)", commandId: "atlas-find-aliases" },
			{ id: "cmd-index", icon: "🗂️", title: "Indexar vault", commandId: "atlas-index-vault" },
			{ id: "cmd-flashcards", icon: "🃏", title: "Revisar flashcards", commandId: "atlas-flashcards-review" },
			{ id: "cmd-flashcards-gen", icon: "🤖", title: "Gerar flashcards desta nota", commandId: "atlas-flashcards-from-note" },
			{ id: "cmd-feynman", icon: "🎓", title: "Feynman check", commandId: "atlas-socratic" },
			{ id: "cmd-coach-mode", icon: "🔒", title: "Alternar Work ↔ Coach mode", commandId: "atlas-toggle-coach-mode" },
			{ id: "cmd-focus", icon: "🎯", title: "Focus mode 90 min", commandId: "atlas-focus-mode" },
			{ id: "cmd-briefing", icon: "🌅", title: "Briefing matinal agora", commandId: "atlas-morning-briefing-now" },
			{ id: "cmd-evening", icon: "🌇", title: "Evening review agora", commandId: "atlas-evening-review-now" },
			{ id: "cmd-onboarding", icon: "🚀", title: "Reabrir onboarding", commandId: "atlas-onboarding" },
		];

		const apiAny = this.app as unknown as {
			commands?: { executeCommandById?: (id: string) => void };
		};

		for (const c of cmds) {
			this.items.push({
				id: c.id,
				icon: c.icon,
				title: c.title,
				category: "ação",
				score: 0,
				run: () => {
					this.close();
					apiAny.commands?.executeCommandById?.(`atlas:${c.commandId}`);
				},
			});
		}

		// People from KG
		for (const p of this.plugin.kg.listPeople()) {
			this.items.push({
				id: `person-${p.id}`,
				icon: "👤",
				title: p.name,
				subtitle: [p.role, p.type].filter(Boolean).join(" · ") || undefined,
				category: "pessoa",
				score: 0,
				run: async () => {
					this.close();
					if (p.notePath) {
						const f = this.app.vault.getAbstractFileByPath(p.notePath);
						if (f instanceof TFile) {
							await this.app.workspace.getLeaf().openFile(f);
							return;
						}
					}
					new Notice(`Atlas: pessoa "${p.name}" sem nota — execute "Atlas: Resumir pessoa" para gerar.`);
				},
			});
		}

		// Projects
		for (const proj of this.plugin.kg.data.projects) {
			this.items.push({
				id: `project-${proj.id}`,
				icon: "🚀",
				title: proj.name,
				subtitle: `Projeto · RAG ${proj.rag} · ${proj.status}`,
				category: "projeto",
				score: 0,
				run: async () => {
					this.close();
					const f = this.app.vault.getAbstractFileByPath(proj.notePath);
					if (f instanceof TFile) await this.app.workspace.getLeaf().openFile(f);
				},
			});
		}

		// Themes (top 30)
		const topThemes = this.plugin.kg.data.themes
			.sort((a, b) => b.frequency - a.frequency)
			.slice(0, 30);
		for (const t of topThemes) {
			this.items.push({
				id: `theme-${t.id}`,
				icon: "🏷️",
				title: `#theme/${t.name}`,
				subtitle: `${t.frequency}× · ${t.sentiment}`,
				category: "tema",
				score: 0,
				run: () => {
					this.close();
					new Notice(`Atlas: tema "${t.name}" — view em desenvolvimento.`);
				},
			});
		}

		// Recent files (top 30 por mtime)
		const recentFiles = this.app.vault
			.getMarkdownFiles()
			.sort((a, b) => b.stat.mtime - a.stat.mtime)
			.slice(0, 30);
		for (const f of recentFiles) {
			this.items.push({
				id: `file-${f.path}`,
				icon: "📄",
				title: f.basename,
				subtitle: f.path,
				category: "nota",
				score: 0,
				run: async () => {
					this.close();
					await this.app.workspace.getLeaf().openFile(f);
				},
			});
		}
	}

	private runFilter(): void {
		const q = this.query.trim().toLowerCase();

		if (!q) {
			// No query: show actions first, then recent
			this.filteredItems = this.items
				.map((it) => ({ ...it, score: it.category === "ação" ? 50 : 10 }))
				.sort((a, b) => b.score - a.score)
				.slice(0, 30);
		} else {
			const tokens = q.split(/\s+/).filter(Boolean);
			this.filteredItems = this.items
				.map((it) => {
					const titleLower = it.title.toLowerCase();
					const subLower = (it.subtitle ?? "").toLowerCase();
					let score = 0;
					for (const t of tokens) {
						if (titleLower.startsWith(t)) score += 100;
						else if (titleLower.includes(t)) score += 50;
						if (subLower.includes(t)) score += 20;
					}
					return { ...it, score };
				})
				.filter((it) => it.score > 0)
				.sort((a, b) => b.score - a.score)
				.slice(0, 30);
		}

		this.selectedIdx = 0;
		this.renderResults();
	}

	private renderResults(): void {
		this.listEl.empty();
		if (this.filteredItems.length === 0) {
			const empty = this.listEl.createEl("div", { text: "Nada encontrado." });
			empty.style.padding = "16px";
			empty.style.opacity = "0.5";
			empty.style.textAlign = "center";
			return;
		}

		for (let i = 0; i < this.filteredItems.length; i++) {
			const item = this.filteredItems[i];
			const row = this.listEl.createDiv();
			row.style.display = "flex";
			row.style.alignItems = "center";
			row.style.gap = "12px";
			row.style.padding = "8px 16px";
			row.style.cursor = "pointer";
			if (i === this.selectedIdx) {
				row.style.background = "var(--interactive-accent)";
				row.style.color = "var(--text-on-accent)";
			}

			const icon = row.createEl("span", { text: item.icon });
			icon.style.fontSize = "16px";
			icon.style.minWidth = "20px";

			const wrap = row.createDiv();
			wrap.style.flexGrow = "1";
			const title = wrap.createEl("div", { text: item.title });
			title.style.fontSize = "13px";
			title.style.fontWeight = "500";

			if (item.subtitle) {
				const sub = wrap.createEl("div", { text: item.subtitle });
				sub.style.fontSize = "10px";
				sub.style.opacity = i === this.selectedIdx ? "0.8" : "0.5";
			}

			const cat = row.createEl("span", { text: item.category });
			cat.style.fontSize = "9px";
			cat.style.padding = "2px 6px";
			cat.style.borderRadius = "3px";
			cat.style.background =
				i === this.selectedIdx
					? "rgba(255,255,255,0.2)"
					: "var(--background-modifier-hover)";
			cat.style.opacity = "0.7";

			row.addEventListener("click", () => {
				this.selectedIdx = i;
				void item.run();
			});
			row.addEventListener("mouseenter", () => {
				this.selectedIdx = i;
				this.renderResults();
			});
		}
	}

	private renderHint(): void {
		this.hintEl.empty();
		const left = this.hintEl.createSpan();
		left.setText("↑↓ navegar · Enter executar · Esc fechar");
		const right = this.hintEl.createSpan();
		right.setText("Atlas Spotlight");
	}

	private move(delta: number): void {
		const len = this.filteredItems.length;
		if (len === 0) return;
		this.selectedIdx = (this.selectedIdx + delta + len) % len;
		this.renderResults();
		// Scroll into view
		const rows = this.listEl.children;
		if (rows[this.selectedIdx]) {
			(rows[this.selectedIdx] as HTMLElement).scrollIntoView({
				block: "nearest",
			});
		}
	}

	private async selectCurrent(): Promise<void> {
		const item = this.filteredItems[this.selectedIdx];
		if (!item) return;
		await item.run();
	}
}
