import { App, Editor, MarkdownView, Modal, Notice, Setting } from "obsidian";
import type AtlasPlugin from "../../main";
import { applyResponsiveModal } from "../ui/modal-helpers";

interface AiAction {
	id: string;
	label: string;
	icon: string;
	description: string;
	prompt: (text: string) => string;
	temperature?: number;
}

const ACTIONS: AiAction[] = [
	{
		id: "rewrite-executive",
		label: "Reescrever (executivo)",
		icon: "✏️",
		description: "Mais claro, conciso, estilo gerencial",
		prompt: (t) =>
			`Reescreva o texto abaixo em PT-BR de forma mais clara, concisa e executiva. Mantenha sentido e fatos. Sem invenções.\n\n${t}\n\nReescrita:`,
	},
	{
		id: "summarize",
		label: "Resumir em 3 bullets",
		icon: "📝",
		description: "Captura o essencial",
		prompt: (t) =>
			`Resuma o texto abaixo em exatamente 3 bullets curtos em PT-BR. Mantenha as informações mais importantes.\n\n${t}\n\nResumo:`,
	},
	{
		id: "explain-simple",
		label: "Explicar simples",
		icon: "💡",
		description: "Como se eu fosse iniciante",
		prompt: (t) =>
			`Explique o texto abaixo em PT-BR como se eu fosse iniciante no assunto. Use analogias quando ajudar. Linguagem clara.\n\n${t}\n\nExplicação simples:`,
	},
	{
		id: "expand",
		label: "Expandir / detalhar",
		icon: "📖",
		description: "Adicionar contexto e detalhes",
		prompt: (t) =>
			`Expanda o texto abaixo em PT-BR adicionando contexto e detalhes relevantes. Mantenha tom e estilo. Não invente fatos.\n\n${t}\n\nVersão expandida:`,
		temperature: 0.5,
	},
	{
		id: "shorten",
		label: "Encurtar",
		icon: "✂️",
		description: "Cortar 50% mantendo sentido",
		prompt: (t) =>
			`Encurte o texto abaixo em ~50% mantendo o sentido essencial. PT-BR. Mais direto.\n\n${t}\n\nVersão encurtada:`,
	},
	{
		id: "translate-en",
		label: "Traduzir → English",
		icon: "🌐",
		description: "PT-BR → English natural",
		prompt: (t) =>
			`Translate the following Brazilian Portuguese text to natural English. Keep the same meaning and tone.\n\n${t}\n\nEnglish:`,
		temperature: 0.2,
	},
	{
		id: "translate-pt",
		label: "Traduzir → Português",
		icon: "🇧🇷",
		description: "Inglês/outro idioma → PT-BR",
		prompt: (t) =>
			`Translate the following text to natural Brazilian Portuguese. Keep meaning and tone.\n\n${t}\n\nPortuguês:`,
		temperature: 0.2,
	},
	{
		id: "extract-actions",
		label: "Extrair action items",
		icon: "✅",
		description: "Lista compromissos do texto",
		prompt: (t) =>
			`Do texto abaixo, extraia todos os action items (tarefas, compromissos, decisões pendentes). Formato: lista de \`- [ ]\` em PT-BR. Se não houver, escreva "Nenhum action item identificado."\n\n${t}\n\nAction items:`,
	},
	{
		id: "to-bullet",
		label: "Converter em bullets",
		icon: "•",
		description: "Texto corrido → lista estruturada",
		prompt: (t) =>
			`Converta o texto abaixo em uma lista hierárquica de bullets bem estruturada em PT-BR. Preserve hierarquia de ideias.\n\n${t}\n\nLista:`,
	},
	{
		id: "tone-formal",
		label: "Tom formal",
		icon: "🎩",
		description: "Mais profissional",
		prompt: (t) =>
			`Reescreva em PT-BR mais formal e profissional, adequado para email corporativo. Mantenha sentido.\n\n${t}\n\nVersão formal:`,
	},
	{
		id: "tone-casual",
		label: "Tom casual",
		icon: "👋",
		description: "Mais leve, conversacional",
		prompt: (t) =>
			`Reescreva em PT-BR mais casual e conversacional. Mantenha sentido. Pode usar contrações e linguagem informal.\n\n${t}\n\nVersão casual:`,
	},
	{
		id: "fix-grammar",
		label: "Corrigir gramática",
		icon: "✓",
		description: "Só fix grammar/ortografia, sem reescrever",
		prompt: (t) =>
			`Corrija APENAS erros de gramática, ortografia e pontuação no texto abaixo. NÃO reescreva, NÃO altere estilo. Retorne o texto corrigido em PT-BR.\n\n${t}\n\nTexto corrigido:`,
		temperature: 0.1,
	},
];

export class InlineAiMenu extends Modal {
	private originalText = "";
	private isSelection = false;

	constructor(app: App, private plugin: AtlasPlugin, private editor: Editor) {
		super(app);
	}

	onOpen(): void {
		const sel = this.editor.getSelection();
		if (sel) {
			this.originalText = sel;
			this.isSelection = true;
		} else {
			this.originalText = pickCurrentBlock(this.editor);
			this.isSelection = false;
		}

		if (!this.originalText.trim()) {
			new Notice("Atlas: selecione texto ou posicione o cursor num parágrafo.");
			this.close();
			return;
		}

		const { contentEl } = this;
		contentEl.empty();
		applyResponsiveModal(contentEl, { preferredWidth: 640 });
		contentEl.createEl("h3", { text: "✨ Atlas — Inline AI" });

		const preview = contentEl.createEl("div");
		preview.style.padding = "10px";
		preview.style.background = "var(--background-secondary)";
		preview.style.borderRadius = "6px";
		preview.style.maxHeight = "120px";
		preview.style.overflow = "auto";
		preview.style.fontSize = "12px";
		preview.style.marginBottom = "12px";
		preview.style.opacity = "0.8";

		const previewLabel = preview.createEl("div", {
			text: this.isSelection ? "📌 Seleção:" : "📌 Bloco atual:",
		});
		previewLabel.style.fontWeight = "bold";
		previewLabel.style.marginBottom = "4px";
		preview.createEl("div", {
			text:
				this.originalText.length > 300
					? this.originalText.substring(0, 300) + "…"
					: this.originalText,
		});

		const grid = contentEl.createDiv();
		grid.style.display = "grid";
		grid.style.gridTemplateColumns = "1fr 1fr";
		grid.style.gap = "6px";
		grid.style.maxHeight = "50vh";
		grid.style.overflowY = "auto";
		grid.style.marginBottom = "12px";

		for (const action of ACTIONS) {
			const btn = grid.createEl("button");
			btn.style.display = "flex";
			btn.style.alignItems = "center";
			btn.style.gap = "8px";
			btn.style.padding = "8px";
			btn.style.textAlign = "left";
			btn.style.cursor = "pointer";
			btn.style.background = "var(--background-secondary)";
			btn.style.border = "1px solid var(--background-modifier-border)";
			btn.style.borderRadius = "6px";

			const icon = btn.createEl("span", { text: action.icon });
			icon.style.fontSize = "18px";
			icon.style.width = "24px";

			const w = btn.createDiv();
			w.style.flexGrow = "1";
			const lbl = w.createEl("div", { text: action.label });
			lbl.style.fontWeight = "bold";
			lbl.style.fontSize = "12px";
			const desc = w.createEl("div", { text: action.description });
			desc.style.fontSize = "10px";
			desc.style.opacity = "0.6";

			btn.addEventListener("click", () => this.run(action));
		}

		new Setting(contentEl).addButton((b) =>
			b.setButtonText("Cancelar").onClick(() => this.close())
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async run(action: AiAction): Promise<void> {
		this.close();

		const ok = await this.plugin.ollama.ping();
		if (!ok) {
			new Notice("Atlas: Ollama offline.");
			return;
		}

		const notice = new Notice(`Atlas: ${action.label}...`, 0);

		try {
			// v0.19: route through LLMService — cloud rewrites tones much better than 7B local
			const llm = this.plugin.llm;
			const promptText = action.prompt(this.originalText);
			const maxTokens = Math.max(800, this.originalText.length);
			const result = llm
				? await llm.generate(promptText, {
						feature: `inline-ai.${action.label.toLowerCase().replace(/\s+/g, "-")}`,
						taskKind: "chat",
						temperature: action.temperature ?? 0.4,
						maxTokens,
				  })
				: await this.plugin.ollama.generate(promptText, {
						model: this.plugin.settings.ollama.generationModel,
						temperature: action.temperature ?? 0.4,
						max_tokens: maxTokens,
				  });

			notice.hide();

			new InlineAiResultModal(
				this.app,
				this.plugin,
				this.editor,
				action.label,
				this.originalText,
				result.trim(),
				this.isSelection
			).open();
		} catch (e) {
			notice.hide();
			new Notice(`Atlas: erro — ${String(e)}`, 8000);
		}
	}
}

class InlineAiResultModal extends Modal {
	constructor(
		app: App,
		private plugin: AtlasPlugin,
		private editor: Editor,
		private actionLabel: string,
		private original: string,
		private result: string,
		private isSelection: boolean
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		applyResponsiveModal(contentEl, { preferredWidth: 720 });
		contentEl.createEl("h3", { text: `✨ ${this.actionLabel}` });

		const grid = contentEl.createDiv();
		grid.style.display = "grid";
		grid.style.gridTemplateColumns = "1fr 1fr";
		grid.style.gap = "12px";
		grid.style.marginBottom = "12px";

		// Original
		const left = grid.createDiv();
		const leftLabel = left.createEl("div", { text: "📌 Original" });
		leftLabel.style.fontWeight = "bold";
		leftLabel.style.fontSize = "11px";
		leftLabel.style.opacity = "0.6";
		leftLabel.style.marginBottom = "4px";
		const leftBox = left.createEl("pre");
		leftBox.style.whiteSpace = "pre-wrap";
		leftBox.style.padding = "10px";
		leftBox.style.background = "var(--background-secondary)";
		leftBox.style.borderRadius = "6px";
		leftBox.style.maxHeight = "300px";
		leftBox.style.overflow = "auto";
		leftBox.style.fontSize = "12px";
		leftBox.textContent = this.original;

		// Result
		const right = grid.createDiv();
		const rightLabel = right.createEl("div", { text: "✨ Atlas" });
		rightLabel.style.fontWeight = "bold";
		rightLabel.style.fontSize = "11px";
		rightLabel.style.opacity = "0.6";
		rightLabel.style.marginBottom = "4px";
		const rightBox = right.createEl("pre");
		rightBox.style.whiteSpace = "pre-wrap";
		rightBox.style.padding = "10px";
		rightBox.style.background = "var(--background-secondary-alt)";
		rightBox.style.borderRadius = "6px";
		rightBox.style.maxHeight = "300px";
		rightBox.style.overflow = "auto";
		rightBox.style.fontSize = "12px";
		rightBox.textContent = this.result;

		const actions = new Setting(contentEl);
		actions.addButton((b) =>
			b.setButtonText("Copiar resultado").onClick(async () => {
				await navigator.clipboard.writeText(this.result);
				new Notice("Atlas: copiado.");
			})
		);
		actions.addButton((b) =>
			b
				.setButtonText("Inserir abaixo")
				.onClick(() => {
					const cur = this.editor.getCursor();
					this.editor.replaceRange(`\n\n${this.result}\n`, cur);
					new Notice("Atlas: inserido abaixo do cursor.");
					this.close();
				})
		);
		actions.addButton((b) =>
			b
				.setButtonText("Substituir")
				.setCta()
				.onClick(() => {
					if (this.isSelection) {
						this.editor.replaceSelection(this.result);
					} else {
						// Try to replace current block
						replaceCurrentBlock(this.editor, this.result);
					}
					new Notice("Atlas: substituído.");
					this.close();
				})
		);
		actions.addButton((b) =>
			b.setButtonText("Cancelar").onClick(() => this.close())
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

function pickCurrentBlock(editor: Editor): string {
	const cur = editor.getCursor();
	const lineCount = editor.lineCount();
	let start = cur.line;
	while (start > 0 && editor.getLine(start - 1).trim() !== "") start--;
	let end = cur.line;
	while (end < lineCount - 1 && editor.getLine(end + 1).trim() !== "") end++;
	const lines: string[] = [];
	for (let i = start; i <= end; i++) lines.push(editor.getLine(i));
	return lines.join("\n");
}

function replaceCurrentBlock(editor: Editor, replacement: string): void {
	const cur = editor.getCursor();
	const lineCount = editor.lineCount();
	let start = cur.line;
	while (start > 0 && editor.getLine(start - 1).trim() !== "") start--;
	let end = cur.line;
	while (end < lineCount - 1 && editor.getLine(end + 1).trim() !== "") end++;

	editor.replaceRange(
		replacement,
		{ line: start, ch: 0 },
		{ line: end, ch: editor.getLine(end).length }
	);
}

export function openInlineAi(plugin: AtlasPlugin): void {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	const editor = view?.editor;
	if (!editor) {
		new Notice("Atlas: abra uma nota primeiro.");
		return;
	}
	new InlineAiMenu(plugin.app, plugin, editor).open();
}
