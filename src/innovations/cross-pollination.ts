/**
 * Atlas v0.12 — Cross-Pollination AI.
 *
 * Detecta ideias/conceitos de uma área (ex: papers de biologia, neurociência)
 * que são aplicáveis em outra área (ex: liderança, engenharia).
 *
 * Mecânica: pega 2 themes/áreas distintas do KG, pede ao LLM identificar
 * pontes conceituais ("isomorfismos") + propor aplicação.
 *
 * Usado por pesquisadores, líderes, e estudantes que querem fertilização cruzada
 * de áreas diferentes.
 */

import { App, Modal, Notice } from "obsidian";
import type AtlasPlugin from "../../main";
import { applyResponsiveModal } from "../ui/modal-helpers";
import { logger } from "../utils/logger";

export class CrossPollinationModal extends Modal {
	private fromAreaEl!: HTMLInputElement;
	private toAreaEl!: HTMLInputElement;
	private resultEl!: HTMLElement;

	constructor(app: App, private readonly plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		applyResponsiveModal(contentEl, { preferredWidth: 720 });
		contentEl.addClass("atlas-crosspoll-modal");

		contentEl.createEl("h3", { cls: "atlas-crosspoll-title", text: "🌸 Cross-Pollination AI" });
		contentEl.createEl("div", {
			cls: "atlas-crosspoll-subtitle",
			text: "Atlas encontra pontes conceituais entre 2 áreas distintas e propõe aplicações cruzadas. Útil pra ideias inesperadas.",
		});

		// 2 input fields
		const fromGroup = contentEl.createDiv({ cls: "atlas-crosspoll-field" });
		fromGroup.createEl("label", { cls: "atlas-crosspoll-label", text: "📚 Área DE (origem):" });
		this.fromAreaEl = fromGroup.createEl("input", {
			cls: "atlas-crosspoll-input",
			type: "text",
		}) as HTMLInputElement;
		this.fromAreaEl.placeholder = "Ex: neurociência cognitiva · evolução biológica · jazz improvisation";

		const toGroup = contentEl.createDiv({ cls: "atlas-crosspoll-field" });
		toGroup.createEl("label", { cls: "atlas-crosspoll-label", text: "🎯 Área PARA (destino):" });
		this.toAreaEl = toGroup.createEl("input", {
			cls: "atlas-crosspoll-input",
			type: "text",
		}) as HTMLInputElement;
		this.toAreaEl.placeholder = "Ex: liderança de time · arquitetura de software · design de produto";

		// Suggestions from KG themes
		this.renderKgSuggestions(contentEl);

		// Action
		const action = contentEl.createDiv({ cls: "atlas-crosspoll-action" });
		const askBtn = action.createEl("button", {
			cls: "atlas-crosspoll-ask-btn mod-cta",
			text: "🌸 Encontrar pontes",
		});
		askBtn.addEventListener("click", () => void this.run());

		// Result
		this.resultEl = contentEl.createDiv({ cls: "atlas-crosspoll-result" });
	}

	private renderKgSuggestions(parent: HTMLElement): void {
		const themes = this.plugin.kg.data.themes;
		if (themes.length < 2) return;
		const top = [...themes].sort((a, b) => b.frequency - a.frequency).slice(0, 8);
		const wrap = parent.createDiv({ cls: "atlas-crosspoll-suggestions" });
		wrap.createEl("div", {
			cls: "atlas-crosspoll-suggestions-label",
			text: "Sugestões do seu KG (top temas):",
		});
		const chips = wrap.createDiv({ cls: "atlas-crosspoll-chips" });
		for (const t of top) {
			const chip = chips.createEl("button", {
				cls: "atlas-crosspoll-chip",
				text: `${t.name} (${t.frequency})`,
			});
			chip.addEventListener("click", () => {
				if (!this.fromAreaEl.value) {
					this.fromAreaEl.value = t.name;
				} else if (!this.toAreaEl.value) {
					this.toAreaEl.value = t.name;
				} else {
					// Both filled — replace destination
					this.toAreaEl.value = t.name;
				}
			});
		}
	}

	private async run(): Promise<void> {
		const from = this.fromAreaEl.value.trim();
		const to = this.toAreaEl.value.trim();
		if (!from || !to) {
			new Notice("Atlas: preencha ambas as áreas.");
			return;
		}

		this.resultEl.empty();
		this.resultEl.addClass("is-loading");
		this.resultEl.createDiv({
			cls: "atlas-crosspoll-loading",
			text: "🌸 Atlas procurando pontes conceituais...",
		});

		try {
			const prompt = `Você é um pesquisador interdisciplinar especialista em fertilização cruzada de ideias.

Tarefa: identifique 4-6 PONTES CONCEITUAIS entre "${from}" (área origem) e "${to}" (área destino), e proponha aplicações concretas em "${to}".

Formato de resposta (markdown):

## 🌉 Pontes conceituais identificadas

Para cada ponte, use este formato:

### 1. [Nome do conceito de ${from}]
**O que é em ${from}:** (2-3 frases)
**Aplicação em ${to}:** (3-4 frases concretas, com exemplo se possível)
**Ação experimentável:** (1 ação que o leitor pode testar amanhã)

---

Repita o formato 4-6 vezes para conceitos distintos.

Critérios:
- Conceitos não-óbvios (evite analogias triviais)
- Aplicações concretas, não abstratas
- Ações experimentáveis (não só "pense sobre")
- Diversidade: cubra ângulos diferentes (estrutura, processo, métrica, comportamento, sistemas)

Responda em PT-BR.`;

			// v0.18: route through LLMService (cloud or ollama auto)
			const llm = this.plugin.llm;
			const result = llm
				? await llm.generate(prompt, {
						feature: "innovation.cross-pollination",
						taskKind: "chat",
						temperature: 0.8,
						maxTokens: llm.willUseCloud("chat") ? 4000 : 2000,
				  })
				: await this.plugin.ollama.generate(prompt, {
						model: this.plugin.settings.ollama.generationModel,
						temperature: 0.8,
						max_tokens: 2000,
				  });

			this.resultEl.empty();
			this.resultEl.removeClass("is-loading");

			// Header
			const header = this.resultEl.createDiv({ cls: "atlas-crosspoll-result-header" });
			header.createEl("strong", { text: `🌸 ${from} → ${to}` });

			// Body (uses MarkdownRenderer for proper formatting)
			const body = this.resultEl.createDiv({ cls: "atlas-crosspoll-result-body" });
			try {
				const { MarkdownRenderer, Component } = await import("obsidian");
				const cmp = new Component();
				await MarkdownRenderer.render(this.plugin.app, result, body, "", cmp);
			} catch {
				body.setText(result);
			}

			// Save action
			const saveRow = this.resultEl.createDiv({ cls: "atlas-crosspoll-save-row" });
			const saveBtn = saveRow.createEl("button", {
				cls: "atlas-crosspoll-save-btn",
				text: "💾 Salvar como nota",
			});
			saveBtn.addEventListener("click", () => void this.saveAsNote(from, to, result));
		} catch (e) {
			this.resultEl.empty();
			this.resultEl.removeClass("is-loading");
			this.resultEl.createDiv({
				cls: "atlas-crosspoll-error",
				text: `Erro: ${String(e)}`,
			});
			logger.error("cross-pollination: failed", { error: String(e) });
		}
	}

	private async saveAsNote(from: string, to: string, content: string): Promise<void> {
		const date = new Date().toISOString().split("T")[0];
		const slug = `${from}-x-${to}`
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
			.substring(0, 60);
		const path = `${this.plugin.settings.folders.knowledge}/cross-pollination/${date}-${slug}.md`;
		const md = `---
type: cross-pollination
from: ${JSON.stringify(from)}
to: ${JSON.stringify(to)}
date: ${date}
---

# 🌸 Cross-Pollination: ${from} → ${to}

${content}

---
*Gerado por Atlas Cross-Pollination AI (LLM local).*
`;
		try {
			const folder = `${this.plugin.settings.folders.knowledge}/cross-pollination`;
			if (!this.plugin.app.vault.getAbstractFileByPath(folder)) {
				await this.plugin.app.vault.createFolder(folder);
			}
			await this.plugin.app.vault.create(path, md);
			new Notice(`Atlas: salvo em ${path}`);
			this.close();
		} catch (e) {
			new Notice(`Atlas: erro ao salvar — ${String(e)}`, 6000);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
