import { App, Modal, Notice, Setting } from "obsidian";
import type AtlasPlugin from "../../main";
import { applyResponsiveModal } from "../ui/modal-helpers";

const SYSTEM_PROMPT = `Você é o Atlas em "modo raciocínio". O usuário traz um problema (decisão, análise de causa-raiz, planejamento, dilema).

Sua resposta TEM 2 PARTES:

1. **<thinking>** ... **</thinking>** — chain-of-thought visível: examine o problema passo a passo, considere múltiplas perspectivas, identifique premissas, faça contas se relevante, weigh trade-offs. Seja sincero quando algo é incerto.

2. **Resposta final** — depois do </thinking>: conclusão estruturada e acionável em PT-BR, com:
   - 1-2 frases de TLDR
   - Análise principal (3-5 bullets)
   - Recomendação clara
   - Riscos / o que pode dar errado
   - Próximos passos concretos

Princípios:
- Sem invenção de fatos
- Reconhece limitações ("não sei X" é válido)
- Foca no que ajuda o usuário a decidir/agir
- Português Brasil`;

const MODES = [
	{
		id: "decision",
		label: "🎯 Decisão",
		description: "Estou diante de uma decisão e quero pensar em voz alta",
		hint: "Ex: Devo aceitar o cargo? Devo migrar a arquitetura? Devo demitir a Maria?",
	},
	{
		id: "rca",
		label: "🚨 Root Cause",
		description: "Algo deu errado, preciso entender por quê",
		hint: "Ex: Por que o incidente X aconteceu? Por que o time desengajou?",
	},
	{
		id: "planning",
		label: "🗺️ Planejamento",
		description: "Quero quebrar um problema grande em etapas",
		hint: "Ex: Como migro o sistema legado em Q3? Como prepararia esse projeto?",
	},
	{
		id: "premortem",
		label: "🪦 Pre-mortem",
		description: "Imagine o pior caso e identifique riscos",
		hint: "Ex: Imagine que o lançamento vai falhar. Por quê?",
	},
	{
		id: "swot",
		label: "🧭 SWOT analysis",
		description: "Strengths/Weaknesses/Opportunities/Threats",
		hint: "Ex: Avalie a estratégia X em 4 dimensões",
	},
	{
		id: "free",
		label: "💭 Pergunta livre",
		description: "Qualquer outro tipo de raciocínio",
		hint: "Ex: Como devo abordar a 1:1 difícil amanhã?",
	},
];

export class ReasoningModal extends Modal {
	private mode = "decision";
	private question = "";

	constructor(app: App, private plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		applyResponsiveModal(contentEl, { preferredWidth: 720 });
		contentEl.createEl("h3", { text: "🧠 Atlas — Pense comigo" });
		contentEl.createEl("p", {
			text: "Atlas vai mostrar o raciocínio passo a passo + conclusão estruturada. Use para decisões complexas.",
		});

		// Mode picker
		const modeWrap = contentEl.createDiv();
		modeWrap.style.display = "grid";
		modeWrap.style.gridTemplateColumns = "1fr 1fr";
		modeWrap.style.gap = "6px";
		modeWrap.style.marginBottom = "12px";

		for (const m of MODES) {
			const btn = modeWrap.createEl("button");
			btn.style.textAlign = "left";
			btn.style.padding = "8px";
			btn.style.cursor = "pointer";
			btn.style.background = "var(--background-secondary)";
			btn.style.border = "1px solid var(--background-modifier-border)";
			btn.style.borderRadius = "6px";

			const lbl = btn.createEl("div", { text: m.label });
			lbl.style.fontWeight = "bold";
			lbl.style.fontSize = "12px";
			const desc = btn.createEl("div", { text: m.description });
			desc.style.fontSize = "10px";
			desc.style.opacity = "0.6";

			const updateSel = () => {
				btn.style.background =
					this.mode === m.id ? "var(--interactive-accent)" : "var(--background-secondary)";
				btn.style.color = this.mode === m.id ? "var(--text-on-accent)" : "";
			};
			updateSel();

			btn.addEventListener("click", () => {
				this.mode = m.id;
				modeWrap.querySelectorAll("button").forEach((b) => {
					(b as HTMLButtonElement).style.background = "var(--background-secondary)";
					(b as HTMLButtonElement).style.color = "";
				});
				btn.style.background = "var(--interactive-accent)";
				btn.style.color = "var(--text-on-accent)";

				const hintEl = contentEl.querySelector(".atlas-reasoning-hint") as HTMLElement | null;
				if (hintEl) hintEl.setText(m.hint);
			});
		}

		const hint = contentEl.createEl("div", {
			text: MODES[0].hint,
			cls: "atlas-reasoning-hint",
		});
		hint.style.fontSize = "11px";
		hint.style.opacity = "0.6";
		hint.style.marginBottom = "8px";

		const input = contentEl.createEl("textarea") as HTMLTextAreaElement;
		input.placeholder = "Digite sua pergunta/contexto. Quanto mais contexto, melhor o raciocínio.";
		input.style.width = "100%";
		input.style.minHeight = "120px";
		input.style.padding = "10px";
		input.style.fontSize = "13px";
		input.addEventListener("input", () => (this.question = input.value));

		new Setting(contentEl)
			.addButton((b) => b.setButtonText("Cancelar").onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText("🧠 Pensar")
					.setCta()
					.onClick(() => this.run())
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async run(): Promise<void> {
		if (!this.question.trim()) {
			new Notice("Atlas: digite sua pergunta primeiro.");
			return;
		}
		const mode = MODES.find((m) => m.id === this.mode) ?? MODES[0];
		this.close();
		new ReasoningStreamModal(this.app, this.plugin, mode.label, this.question).open();
	}
}

class ReasoningStreamModal extends Modal {
	private thinkingEl!: HTMLPreElement;
	private answerEl!: HTMLDivElement;

	constructor(
		app: App,
		private plugin: AtlasPlugin,
		private modeLabel: string,
		private question: string
	) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		applyResponsiveModal(contentEl, { preferredWidth: 800, preferredHeight: 700 });
		contentEl.createEl("h3", { text: `🧠 ${this.modeLabel}` });

		const q = contentEl.createEl("blockquote");
		q.style.padding = "10px";
		q.style.background = "var(--background-secondary)";
		q.style.borderRadius = "4px";
		q.style.fontSize = "13px";
		q.style.marginBottom = "12px";
		q.setText(this.question);

		// Thinking block (collapsible)
		const thinkingDetails = contentEl.createEl("details");
		thinkingDetails.open = true;
		const thinkingSummary = thinkingDetails.createEl("summary", {
			text: "💭 Raciocínio passo a passo (CoT)",
		});
		thinkingSummary.style.fontWeight = "bold";
		thinkingSummary.style.fontSize = "12px";
		thinkingSummary.style.marginBottom = "6px";

		this.thinkingEl = thinkingDetails.createEl("pre");
		this.thinkingEl.style.whiteSpace = "pre-wrap";
		this.thinkingEl.style.padding = "10px";
		this.thinkingEl.style.background = "var(--background-secondary-alt)";
		this.thinkingEl.style.borderRadius = "4px";
		this.thinkingEl.style.fontSize = "11px";
		this.thinkingEl.style.maxHeight = "300px";
		this.thinkingEl.style.overflow = "auto";
		this.thinkingEl.style.fontStyle = "italic";
		this.thinkingEl.style.opacity = "0.75";
		this.thinkingEl.setText("⏳ Pensando...");

		// Answer block
		const answerHeader = contentEl.createEl("div", { text: "✨ Resposta" });
		answerHeader.style.fontWeight = "bold";
		answerHeader.style.fontSize = "13px";
		answerHeader.style.margin = "12px 0 6px 0";
		this.answerEl = contentEl.createDiv() as HTMLDivElement;
		this.answerEl.style.padding = "12px";
		this.answerEl.style.background = "var(--background-secondary)";
		this.answerEl.style.borderRadius = "6px";
		this.answerEl.style.fontSize = "13px";
		this.answerEl.style.minHeight = "60px";
		this.answerEl.setText("⏳ Aguardando raciocínio...");

		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText("Fechar")
				.setCta()
				.onClick(() => this.close())
		);

		await this.runReasoning();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async runReasoning(): Promise<void> {
		const ok = await this.plugin.ollama.ping();
		if (!ok) {
			this.thinkingEl.setText("❌ Ollama offline.");
			this.answerEl.setText("Inicie o Ollama e tente novamente.");
			return;
		}

		// Use small model for reasoning (phi-4-mini fits in 8GB) — substitui R1 14B que não cabe
		const model = this.plugin.settings.ollama.smallModel || this.plugin.settings.ollama.generationModel;

		const prompt = `${SYSTEM_PROMPT}

Pergunta do usuário (modo: ${this.modeLabel}):
"""
${this.question}
"""

Comece com <thinking>:`;

		try {
			const out = await this.plugin.ollama.generate(prompt, {
				model,
				temperature: 0.5,
				max_tokens: 2500,
			});
			this.parseAndRender(out);
		} catch (e) {
			this.thinkingEl.setText(`Erro: ${String(e)}`);
			this.answerEl.setText("Falha ao gerar raciocínio.");
		}
	}

	private parseAndRender(raw: string): void {
		const thinkMatch = raw.match(/<thinking>([\s\S]*?)<\/thinking>/i);
		if (thinkMatch) {
			this.thinkingEl.setText(thinkMatch[1].trim());
			const answer = raw.replace(/<thinking>[\s\S]*?<\/thinking>/i, "").trim();
			this.renderAnswer(answer);
		} else {
			// No explicit thinking tags — try heuristic split
			const parts = raw.split(/\n\n##|\n\nResposta final|\n\nRecomenda/);
			if (parts.length > 1) {
				this.thinkingEl.setText(parts[0].trim());
				this.renderAnswer(parts.slice(1).join("\n\n").trim());
			} else {
				this.thinkingEl.setText("(modelo não usou tags de raciocínio explícitas)");
				this.renderAnswer(raw);
			}
		}
	}

	private renderAnswer(text: string): void {
		this.answerEl.empty();
		const html = this.escapeHtml(text)
			.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
			.replace(/`([^`]+)`/g, "<code>$1</code>")
			.replace(/^### (.+)$/gm, "<h4>$1</h4>")
			.replace(/^## (.+)$/gm, "<h3>$1</h3>")
			.replace(/^# (.+)$/gm, "<h3>$1</h3>")
			.replace(/^- (.+)$/gm, "• $1")
			.replace(/\n\n+/g, "<br/><br/>")
			.replace(/\n/g, "<br/>");
		this.answerEl.innerHTML = html;
	}

	private escapeHtml(s: string): string {
		return s
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;");
	}
}
