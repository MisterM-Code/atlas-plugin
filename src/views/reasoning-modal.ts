import { App, Modal, Notice, Setting } from "obsidian";
import type AtlasPlugin from "../../main";
import { applyResponsiveModal } from "../ui/modal-helpers";

// v0.18: Standard prompt (Ollama-friendly) — keeps cost/context low
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

// v0.18: PREMIUM prompt — used when cloud detected (Claude Opus / GPT-4o / R1).
// Combines DACI + RAID + first-principles + 2nd-order + assumption stress-test.
const SYSTEM_PROMPT_PREMIUM = `Você é o Atlas em "deep reasoning mode". Use TODA a profundidade do modelo cloud disponível (Claude Opus 4.7 / GPT-4o / DeepSeek R1).

ESTRUTURA OBRIGATÓRIA da resposta:

1. **<thinking>** chain-of-thought longo e honesto **</thinking>** — combine MÚLTIPLOS frameworks:
   - **First principles**: dispense premissas óbvias; o que é verdade fundamental?
   - **DACI**: quem decide / quem aprova / quem contribui / quem é informado
   - **RAID**: Risks / Assumptions / Issues / Dependencies
   - **2nd-order consequences**: o que acontece DEPOIS da decisão? Que comportamentos novos emergem?
   - **Assumption stress-test**: quais 3 premissas, se falsas, derrubam toda recomendação?
   - **Risk-reward matrix** (impacto × probabilidade × reversibilidade)
   - Considere 3+ ângulos opostos. Seja explicitamente cético com sua própria conclusão.

2. **Resposta final** estruturada em PT-BR:
   - **TLDR** (2 frases máx)
   - **Análise multi-framework** (3-5 frameworks com 1-3 bullets cada)
   - **Recomendação clara** com nível de confiança (low/medium/high) e justificativa
   - **Risk register** — top 5 riscos em formato | Risco | Prob | Impacto | Reversível? | Mitigação |
   - **Decision criteria** — se qualquer X mudar, revisitar
   - **Próximos passos** com owners + prazos sugeridos
   - **Assumptions to validate** — o que precisa ser confirmado ANTES de executar

Princípios:
- Use markdown tables livremente (modelos cloud renderizam bem)
- Cite trade-offs explicitamente, não esconda ambiguidade
- Quando 2+ caminhos são razoáveis, mostre matrix comparativa
- Português Brasil, mas use termos técnicos (DACI, RAID) sem traduzir
- NÃO invente dados; se não souber X, seja claro`;

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
		// v0.18: route through LLMService — auto-cloud (Claude Opus / R1) when configured
		const llm = this.plugin.llm;
		const useCloud = llm?.willUseCloud("reasoning") ?? false;

		if (!useCloud) {
			// Local path requires Ollama daemon
			const ok = await this.plugin.ollama.ping();
			if (!ok) {
				this.thinkingEl.setText("❌ Ollama offline.");
				this.answerEl.setText("Inicie o Ollama e tente novamente — ou configure cloud reasoning em Settings → ☁️ Cloud AI Providers.");
				return;
			}
		}

		// Premium prompt when cloud (Claude Opus / R1 can handle 1500+ token system prompts richly)
		const systemPrompt = useCloud ? SYSTEM_PROMPT_PREMIUM : SYSTEM_PROMPT;
		const maxTokens = useCloud ? 4500 : 2500;

		const prompt = `${systemPrompt}

Pergunta do usuário (modo: ${this.modeLabel}):
"""
${this.question}
"""

Comece com <thinking>:`;

		try {
			const out = llm
				? await llm.generate(prompt, {
						feature: "reasoning-modal",
						taskKind: "reasoning",
						temperature: 0.5,
						maxTokens,
				  })
				: await this.plugin.ollama.generate(prompt, {
						model: this.plugin.settings.ollama.smallModel || this.plugin.settings.ollama.generationModel,
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

	// v0.8.4: refactor innerHTML → DOM API (XSS-safe, mesmo com LLM local)
	private renderAnswer(text: string): void {
		this.answerEl.empty();
		const lines = text.split("\n");
		let buffer: HTMLElement | null = null;

		const ensureParagraph = (): HTMLElement => {
			if (!buffer || buffer.tagName !== "P") {
				buffer = this.answerEl.createEl("p");
				buffer.style.margin = "0 0 8px 0";
			}
			return buffer;
		};

		for (const rawLine of lines) {
			const line = rawLine;
			if (line.startsWith("### ")) {
				buffer = this.answerEl.createEl("h4", { text: line.substring(4) });
				continue;
			}
			if (line.startsWith("## ")) {
				buffer = this.answerEl.createEl("h3", { text: line.substring(3) });
				continue;
			}
			if (line.startsWith("# ")) {
				buffer = this.answerEl.createEl("h3", { text: line.substring(2) });
				continue;
			}
			if (line.trim().length === 0) {
				if (buffer) {
					this.answerEl.createEl("br");
					buffer = null;
				}
				continue;
			}
			const para = ensureParagraph();
			if (line.startsWith("- ")) {
				para.appendText("• ");
				this.appendInlineTokens(para, line.substring(2));
			} else {
				if (para.childNodes.length > 0) para.createEl("br");
				this.appendInlineTokens(para, line);
			}
		}
	}

	private appendInlineTokens(container: HTMLElement, line: string): void {
		const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
		let lastIdx = 0;
		let m: RegExpExecArray | null;
		while ((m = re.exec(line)) !== null) {
			if (m.index > lastIdx) container.appendText(line.substring(lastIdx, m.index));
			const tk = m[0];
			if (tk.startsWith("**")) {
				container.createEl("strong", { text: tk.slice(2, -2) });
			} else if (tk.startsWith("`")) {
				container.createEl("code", { text: tk.slice(1, -1) });
			}
			lastIdx = m.index + tk.length;
		}
		if (lastIdx < line.length) container.appendText(line.substring(lastIdx));
	}

	private escapeHtml(s: string): string {
		return s
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;");
	}
}
