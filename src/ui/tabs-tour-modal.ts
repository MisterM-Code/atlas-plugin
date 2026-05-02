/**
 * Atlas v0.16 — TabsTourModal
 *
 * Opens after onboarding completes. Shows a 17-tab grid overview so the user
 * understands every feature available in the master sidebar — not just Jarvis.
 *
 * Each card has emoji + name + description + click-to-open behavior.
 * "Iniciar tour interativo" launches the first-steps tutorial via TutorialSystem.
 *
 * Persists settings.onboarding.tabsTourSeen to avoid re-showing.
 */

import { App, Modal } from "obsidian";
import type AtlasPlugin from "../../main";
import { applyResponsiveModal } from "./modal-helpers";
import type { TabId } from "../views/master/types";

interface TabDescriptor {
	id: TabId;
	emoji: string;
	name: string;
	description: string;
}

const TABS: TabDescriptor[] = [
	{ id: "jarvis", emoji: "🤖", name: "Jarvis", description: "Assistente de voz com tool calling. Cria pessoas, sistemas e tarefas falando." },
	{ id: "today", emoji: "☀️", name: "Today", description: "Dashboard inicial: agenda, tasks do dia, alertas, achievements." },
	{ id: "chat", emoji: "💬", name: "Chat", description: "Pergunte sobre seu vault. Resposta com citações [Nota: x.md]." },
	{ id: "hub", emoji: "✅", name: "Hub", description: "Action items consolidados de todas as suas notas em um lugar." },
	{ id: "reminders", emoji: "🔔", name: "Reminders", description: "Tasks com data viram reminders com notification 15 min antes." },
	{ id: "suggest", emoji: "🔗", name: "Suggest", description: "Sugestões inteligentes de links enquanto você escreve." },
	{ id: "knowledge", emoji: "🌐", name: "Knowledge", description: "Knowledge Graph navegável: pessoas, projetos, temas, sistemas." },
	{ id: "systems", emoji: "🖥️", name: "Sistemas", description: "CRUD de sistemas que você cuida (PIX, Stripe, etc) com auto-detect." },
	{ id: "products", emoji: "📦", name: "Produtos", description: "Produtos/features de negócio compostos por múltiplos sistemas." },
	{ id: "roles", emoji: "🎓", name: "Cargos", description: "Cargos/funções padronizados (Tech Lead, PM, etc) com responsabilidades." },
	{ id: "reports", emoji: "🎙️", name: "Reports", description: "Timeline + Composer + Templates: weekly, podcast, decision diary." },
	{ id: "analytics", emoji: "📈", name: "Analytics", description: "Heatmap, trends, KG graph 3D, mood timeline com ECharts." },
	{ id: "lab", emoji: "🧪", name: "Lab", description: "Tools IA (Reasoning, Pre-mortem, Context Collapse), Serendipity, Time Capsules." },
	{ id: "automations", emoji: "🤖", name: "Auto", description: "AutoTagger, AutoAliaser, Rules, Atlas Percebeu (padrões detectados)." },
	{ id: "study", emoji: "🃏", name: "Study", description: "Flashcards (FSRS), cursos, papers (Zotero), spaced repetition." },
	{ id: "health", emoji: "🩺", name: "Health", description: "Workspace Health: notas órfãs, stale, KG growth, density score." },
	{ id: "status", emoji: "⚙️", name: "Status", description: "Daemon Ollama, RAM, modelos disponíveis, catálogo de pull." },
];

export class TabsTourModal extends Modal {
	constructor(app: App, private readonly plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("atlas-tabs-tour-modal");
		applyResponsiveModal(contentEl, { preferredWidth: 920, preferredHeight: 720 });

		// Header
		const header = contentEl.createDiv({ cls: "atlas-tabs-tour-header" });
		header.createEl("h2", { text: "🌟 Atlas — descubra suas 17 ferramentas" });
		const sub = header.createEl("p", {
			text: "Cada tab tem um propósito específico. Clique para experimentar — ou inicie o tour interativo guiado.",
		});
		sub.addClass("atlas-tabs-tour-subtitle");

		// Grid de cards
		const grid = contentEl.createDiv({ cls: "atlas-tabs-tour-grid" });
		for (const tab of TABS) {
			const card = grid.createDiv({ cls: "atlas-tabs-tour-card" });
			const iconRow = card.createDiv({ cls: "atlas-tabs-tour-card-icon" });
			iconRow.setText(tab.emoji);
			card.createDiv({ cls: "atlas-tabs-tour-card-title", text: tab.name });
			card.createDiv({ cls: "atlas-tabs-tour-card-desc", text: tab.description });
			card.addEventListener("click", () => {
				void this.plugin.activateMasterTab(tab.id);
				void this.markSeen();
				this.close();
			});
		}

		// Action footer
		const footer = contentEl.createDiv({ cls: "atlas-tabs-tour-footer" });

		const tourBtn = footer.createEl("button", {
			cls: "mod-cta atlas-tabs-tour-btn-primary",
			text: "🎬 Iniciar tour interativo (3 min)",
		});
		tourBtn.addEventListener("click", async () => {
			await this.markSeen();
			this.close();
			// Spawn first-steps tour via tutorial system
			setTimeout(async () => {
				try {
					const { getAllTutorials } = await import("../tutorial/tours");
					const all = getAllTutorials(this.plugin);
					const firstSteps = all.find((t) => t.id === "first-steps");
					if (firstSteps && this.plugin.tutorialSystem) {
						await this.plugin.tutorialSystem.start(firstSteps);
					}
				} catch {
					// tour may not load — silent fallback
				}
			}, 300);
		});

		const skipBtn = footer.createEl("button", { text: "Já conheço, fechar" });
		skipBtn.addClass("atlas-tabs-tour-btn-skip");
		skipBtn.addEventListener("click", () => {
			void this.markSeen();
			this.close();
		});
	}

	private async markSeen(): Promise<void> {
		this.plugin.settings.onboarding.tabsTourSeen = true;
		await this.plugin.saveSettings();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
