/**
 * Atlas v0.11 — Tone Bifold Editor.
 *
 * Modal split-view: à esquerda texto original, à direita reescrita LLM em outro tom.
 * Ambos editáveis. Aplica de volta na nota ativa quando confirmado.
 *
 * Tons disponíveis: formal/casual/executive/friendly/concise/expansive.
 *
 * Innovation: many editors have "rewrite" but few show original+new side-by-side
 * with both editable, allowing user to merge / blend.
 */

import { App, MarkdownView, Modal, Notice, Setting } from "obsidian";
import type AtlasPlugin from "../../main";
import { applyResponsiveModal } from "../ui/modal-helpers";
import { logger } from "../utils/logger";

type Tone =
	| "formal"
	| "casual"
	| "executive"
	| "friendly"
	| "concise"
	| "expansive"
	| "academic";

const TONES: { id: Tone; label: string; emoji: string; prompt: string }[] = [
	{
		id: "formal",
		label: "Formal",
		emoji: "🎩",
		prompt: "Reescreva em tom formal, profissional, com vocabulário preciso. Mantenha o significado mas eleve o registro.",
	},
	{
		id: "casual",
		label: "Casual",
		emoji: "😎",
		prompt: "Reescreva em tom casual, descontraído, como se conversando com um amigo. Mantenha o significado.",
	},
	{
		id: "executive",
		label: "Executivo",
		emoji: "💼",
		prompt: "Reescreva em formato executive summary: bullets, frases curtas, foco em outcomes. Máximo 30% do tamanho original.",
	},
	{
		id: "friendly",
		label: "Amigável",
		emoji: "🤗",
		prompt: "Reescreva em tom caloroso, empático, próximo. Adicione humanização ao texto sem perder substância.",
	},
	{
		id: "concise",
		label: "Conciso",
		emoji: "✂️",
		prompt: "Reescreva o mesmo conteúdo em metade ou menos do tamanho. Sem perda de informação crítica.",
	},
	{
		id: "expansive",
		label: "Expandido",
		emoji: "🌳",
		prompt: "Expanda o texto adicionando detalhes, exemplos, contexto. Dobre o tamanho mantendo coerência.",
	},
	{
		id: "academic",
		label: "Acadêmico",
		emoji: "📚",
		prompt: "Reescreva em estilo acadêmico: citações implícitas, voz passiva moderada, vocabulário técnico apropriado.",
	},
];

export class ToneBifoldModal extends Modal {
	private leftEl!: HTMLTextAreaElement;
	private rightEl!: HTMLTextAreaElement;
	private toneToolbar!: HTMLElement;
	private currentTone: Tone = "formal";

	constructor(
		app: App,
		private readonly plugin: AtlasPlugin,
		private readonly originalText: string,
		private readonly onApply: (newText: string) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		applyResponsiveModal(contentEl, { preferredWidth: 1100, preferredHeight: 700 });
		contentEl.addClass("atlas-tonebifold");

		// Header
		const header = contentEl.createDiv({ cls: "atlas-tonebifold-header" });
		header.createEl("h3", { cls: "atlas-tonebifold-title", text: "✍️ Tone Bifold Editor" });
		header.createEl("div", {
			cls: "atlas-tonebifold-subtitle",
			text: "Compare original (esq.) com reescrita IA (dir.). Ambos editáveis. Confirme pra aplicar.",
		});

		// Tone toolbar
		this.toneToolbar = contentEl.createDiv({ cls: "atlas-tonebifold-toolbar" });
		for (const t of TONES) {
			const btn = this.toneToolbar.createEl("button", {
				cls: "atlas-tonebifold-tone-btn",
				text: `${t.emoji} ${t.label}`,
			});
			btn.addEventListener("click", () => void this.applyTone(t.id, btn));
		}

		// Bifold layout
		const layout = contentEl.createDiv({ cls: "atlas-tonebifold-layout" });

		const leftPane = layout.createDiv({ cls: "atlas-tonebifold-pane" });
		leftPane.createEl("div", { cls: "atlas-tonebifold-pane-label", text: "📝 Original" });
		this.leftEl = leftPane.createEl("textarea", { cls: "atlas-tonebifold-textarea" }) as HTMLTextAreaElement;
		this.leftEl.value = this.originalText;

		const rightPane = layout.createDiv({ cls: "atlas-tonebifold-pane" });
		rightPane.createEl("div", { cls: "atlas-tonebifold-pane-label", text: "✨ Reescrito" });
		this.rightEl = rightPane.createEl("textarea", { cls: "atlas-tonebifold-textarea" }) as HTMLTextAreaElement;
		this.rightEl.placeholder = "Selecione um tom acima para gerar a reescrita...";

		// Word counts
		const counts = contentEl.createDiv({ cls: "atlas-tonebifold-counts" });
		const leftCount = counts.createDiv({ cls: "atlas-tonebifold-count" });
		const rightCount = counts.createDiv({ cls: "atlas-tonebifold-count" });
		const updateCounts = () => {
			const leftWords = this.leftEl.value.trim().split(/\s+/).filter(Boolean).length;
			const rightWords = this.rightEl.value.trim().split(/\s+/).filter(Boolean).length;
			const ratio = leftWords > 0 ? Math.round((rightWords / leftWords) * 100) : 0;
			leftCount.setText(`Original: ${leftWords} palavras`);
			rightCount.setText(rightWords > 0 ? `Reescrito: ${rightWords} (${ratio}% do original)` : "Reescrito: —");
		};
		this.leftEl.addEventListener("input", updateCounts);
		this.rightEl.addEventListener("input", updateCounts);
		updateCounts();

		// Action buttons
		const actions = contentEl.createDiv({ cls: "atlas-tonebifold-actions" });
		const cancelBtn = actions.createEl("button", { text: "Cancelar" });
		cancelBtn.addEventListener("click", () => this.close());

		const swapBtn = actions.createEl("button", { text: "⇄ Trocar lados" });
		swapBtn.addEventListener("click", () => {
			const tmp = this.leftEl.value;
			this.leftEl.value = this.rightEl.value;
			this.rightEl.value = tmp;
			updateCounts();
		});

		const applyOriginalBtn = actions.createEl("button", { text: "Aplicar original" });
		applyOriginalBtn.addEventListener("click", () => {
			this.onApply(this.leftEl.value);
			this.close();
		});

		const applyRewriteBtn = actions.createEl("button", {
			cls: "mod-cta",
			text: "Aplicar reescrita",
		});
		applyRewriteBtn.addEventListener("click", () => {
			if (!this.rightEl.value.trim()) {
				new Notice("Atlas: reescrita vazia. Selecione um tom primeiro.");
				return;
			}
			this.onApply(this.rightEl.value);
			this.close();
		});
	}

	private async applyTone(tone: Tone, button: HTMLElement): Promise<void> {
		const toneCfg = TONES.find((t) => t.id === tone);
		if (!toneCfg) return;
		this.currentTone = tone;

		// Mark active button
		this.toneToolbar.querySelectorAll(".atlas-tonebifold-tone-btn").forEach((el) => {
			el.removeClass("is-active");
		});
		button.addClass("is-active");

		// Show loading state
		this.rightEl.value = "⏳ Reescrevendo...";
		this.rightEl.disabled = true;

		try {
			const text = this.leftEl.value;
			const prompt = `${toneCfg.prompt}

TEXTO ORIGINAL:
${text}

Responda APENAS com a reescrita (sem prefácio, sem explicação, sem marcadores).`;

			// v0.18: route through LLMService (cloud writes more naturally in different tones)
			const llm = this.plugin.llm;
			const maxOut = Math.max(800, text.length * 2);
			const result = llm
				? await llm.generate(prompt, {
						feature: "innovation.tone-bifold",
						taskKind: "chat",
						temperature: 0.6,
						maxTokens: maxOut,
				  })
				: await this.plugin.ollama.generate(prompt, {
						model: this.plugin.settings.ollama.generationModel,
						temperature: 0.6,
						max_tokens: maxOut,
				  });
			this.rightEl.value = result.trim();
			this.rightEl.disabled = false;

			// Trigger word count update
			this.rightEl.dispatchEvent(new Event("input"));
		} catch (e) {
			logger.error("tone-bifold: generate falhou", { error: String(e) });
			this.rightEl.value = `❌ Erro ao reescrever: ${String(e)}`;
			this.rightEl.disabled = false;
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Convenience: open from active note's selection or full content. */
export async function openToneBifoldFromActive(plugin: AtlasPlugin): Promise<void> {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (!view) {
		new Notice("Atlas: nenhuma nota ativa.");
		return;
	}
	const editor = view.editor;
	const sel = editor.getSelection();
	const text = sel.trim() ? sel : editor.getValue();
	if (!text.trim()) {
		new Notice("Atlas: nota vazia.");
		return;
	}

	new ToneBifoldModal(plugin.app, plugin, text, (newText) => {
		if (sel.trim()) {
			editor.replaceSelection(newText);
		} else {
			editor.setValue(newText);
		}
		new Notice("Atlas: texto aplicado.");
	}).open();
}
