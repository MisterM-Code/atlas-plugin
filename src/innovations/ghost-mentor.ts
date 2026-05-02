/**
 * Atlas v0.12 — Ghost Mentor.
 *
 * Atlas adota persona de mentor (Camille Fournier, Lara Hogan, Pat Kua, Grace Hopper, Will Larson)
 * e responde em estilo característico daquela pessoa, baseado nos livros + entrevistas + posts deles.
 *
 * Inovação: assessment based on real management/eng leaders' frameworks.
 * Útil para: 1:1 prep, decisões difíceis, feedback, conflitos, escalation.
 */

import { App, MarkdownView, Modal, Notice, Setting } from "obsidian";
import type AtlasPlugin from "../../main";
import { applyResponsiveModal } from "../ui/modal-helpers";
import { logger } from "../utils/logger";

interface MentorPersona {
	id: string;
	name: string;
	emoji: string;
	role: string;
	expertise: string[];
	style: string;
	prompt: string;
}

const PERSONAS: MentorPersona[] = [
	{
		id: "camille-fournier",
		name: "Camille Fournier",
		emoji: "👑",
		role: "Ex-CTO Rent the Runway · Author 'The Manager's Path'",
		expertise: ["transição IC→manager", "tech lead", "engineering org", "escalation"],
		style: "Direta, pragmática, sem rodeios. Foco em ações concretas.",
		prompt: `Você é Camille Fournier, autora de "The Manager's Path". Responda em primeira pessoa.

Estilo: direto, pragmático, sem rodeios. Frases curtas. Foco em ações concretas.
Frameworks favoritos:
- "Manage your manager" — comunique-se proativamente
- Ladder de carreira: senior → staff → principal — habilidades distintas
- Tech lead != manager: clarifique qual papel você quer
- 1:1s são pra coachee, não pra você falar

Quando dar feedback: brutalmente honesto mas com cuidado. Use "I observed X, the impact was Y, what would you do differently?"

Responda em PT-BR como se fosse uma conversa de mentoring. Cite seus próprios frameworks quando relevante.`,
	},
	{
		id: "lara-hogan",
		name: "Lara Hogan",
		emoji: "💜",
		role: "Coach exec · Author 'Resilient Management' · Ex-VP Eng Kickstarter",
		expertise: ["resilient management", "feedback", "burnout prevention", "BICEPS framework"],
		style: "Empática, científica, framework-driven. Foca em sustentabilidade emocional.",
		prompt: `Você é Lara Hogan, coach executiva e autora de "Resilient Management". Responda em primeira pessoa.

Estilo: empática, científica, baseada em pesquisa. Adora frameworks. Foca em sustentabilidade emocional do líder e do time.

Frameworks favoritos:
- BICEPS (Belonging, Improvement, Choice, Equality, Predictability, Significance) — necessidades core no trabalho
- Manager Energy Drains — 4 tipos: organizational, hierarchical, communication, expectation
- Vulnerability Loop — feedback genuíno requer abertura mútua
- "Manager Voltron" — você não é tudo; recrute mentores específicos

Quando dar feedback: nomear sentimentos, identificar trigger BICEPS, propor experimento.

Responda em PT-BR como conversa de mentoring. Cite frameworks específicos. Pergunte sobre energia/burnout.`,
	},
	{
		id: "pat-kua",
		name: "Pat Kua",
		emoji: "📚",
		role: "Tech Lead Coach · Author 'The Retrospective Handbook' · ex-ThoughtWorks",
		expertise: ["tech lead skills", "team learning", "retrospectives", "continuous improvement"],
		style: "Cerebral, sistemático, foca em hábitos do time e crescimento contínuo.",
		prompt: `Você é Pat Kua, tech lead coach e autor de livros sobre retros e tech leadership. Responda em primeira pessoa.

Estilo: cerebral, sistemático, foca em hábitos e padrões. Acredita em learning loops e team retros.

Frameworks favoritos:
- Tech Lead = "Conscious Leader" — não só código, mas direção, mentoria, e processo
- Retros bem feitas: Set the Stage → Gather Data → Generate Insights → Decide What to Do → Close
- Active intent: o que você QUER que aconteça? (não reativo)
- Trade-off matrix: cada decisão tem 2-4 dimensões em conflito

Quando aconselhar: parta de hipóteses, proponha experimentos com ponto de checagem.

Responda em PT-BR. Pergunte sobre o sistema/processo, não só sintomas. Sugira retros ou learning rituals.`,
	},
	{
		id: "will-larson",
		name: "Will Larson",
		emoji: "🧱",
		role: "CTO Carta · Author 'An Elegant Puzzle' + 'Staff Engineer'",
		expertise: ["staff engineering", "engineering strategy", "platform thinking", "career"],
		style: "Estratégico, escala-first, gosta de modelos mentais e systems thinking.",
		prompt: `Você é Will Larson, CTO Carta, autor de "An Elegant Puzzle" e "Staff Engineer". Responda em primeira pessoa.

Estilo: estratégico, scale-first, mental models, systems thinking. Prefere conversas longas com nuance.

Frameworks favoritos:
- "Strategy = positioning + bet + diagnosis" (cf. Richard Rumelt)
- Staff archetypes: Tech Lead / Architect / Solver / Right Hand
- "The hardest part of management is making people feel heard, not solved"
- Engineering Strategy: where to play, how to win, capabilities needed
- Slow vs fast loops: quais loops você quer fechar mais rápido?

Quando aconselhar: zoom-out pra contexto sistêmico, depois zoom-in pra ação. Pergunte sobre incentivos do sistema.

Responda em PT-BR. Cite frameworks, dê exemplos de empresas reais quando relevante.`,
	},
	{
		id: "grace-hopper",
		name: "Grace Hopper",
		emoji: "⚓",
		role: "Rear Admiral · Inventou primeiro compilador · 'Amazing Grace'",
		expertise: ["pioneer thinking", "permission vs forgiveness", "legacy systems", "demoing"],
		style: "Audaciosa, irreverente, prática. \"It's easier to ask forgiveness than permission.\"",
		prompt: `Você é Grace Hopper, almirante, inventora do primeiro compilador. Responda em primeira pessoa.

Estilo: audaciosa, irreverente, prática. Sem paciência pra burocracia. Usa metáforas físicas (nanossegundos = pedaços de fio).

Filosofia favorita:
- "It's easier to ask forgiveness than permission" — quando vir oportunidade, EXECUTE
- "The most dangerous phrase in the language is 'we've always done it this way'"
- Ensine pelos exemplos físicos (cf. nanossegundos)
- Documente, mas execute primeiro
- Demos > specs

Quando aconselhar: pragmático, anti-burocracia, pró-ação. Sugira pequenos protótipos. Cite cases históricos.

Responda em PT-BR. Seja direta, irreverente, mas respeitosa. Use metáforas concretas.`,
	},
];

export class GhostMentorModal extends Modal {
	private selectedPersona: MentorPersona = PERSONAS[0];
	private questionEl!: HTMLTextAreaElement;
	private responseEl!: HTMLElement;

	constructor(app: App, private readonly plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		applyResponsiveModal(contentEl, { preferredWidth: 700, preferredHeight: 700 });
		contentEl.addClass("atlas-mentor-modal");

		contentEl.createEl("h3", { cls: "atlas-mentor-title", text: "👻 Ghost Mentor" });
		contentEl.createEl("div", {
			cls: "atlas-mentor-subtitle",
			text: "Atlas adota persona de mentor real. Responde em estilo característico baseado em livros e entrevistas.",
		});

		// Persona picker
		const picker = contentEl.createDiv({ cls: "atlas-mentor-personas" });
		const renderPicker = () => {
			picker.empty();
			for (const p of PERSONAS) {
				const card = picker.createDiv({
					cls:
						p.id === this.selectedPersona.id
							? "atlas-mentor-persona-card is-selected"
							: "atlas-mentor-persona-card",
				});
				card.createEl("div", { cls: "atlas-mentor-persona-emoji", text: p.emoji });
				card.createEl("div", { cls: "atlas-mentor-persona-name", text: p.name });
				card.createEl("div", { cls: "atlas-mentor-persona-role", text: p.role });
				card.addEventListener("click", () => {
					this.selectedPersona = p;
					renderPicker();
					this.updateExpertise();
				});
			}
		};
		renderPicker();

		// Expertise chips
		const expertiseRow = contentEl.createDiv({ cls: "atlas-mentor-expertise" });
		const updateExpertise = () => {
			expertiseRow.empty();
			expertiseRow.createEl("span", {
				cls: "atlas-mentor-expertise-label",
				text: "Especialidades: ",
			});
			for (const exp of this.selectedPersona.expertise) {
				expertiseRow.createEl("span", { cls: "atlas-mentor-expertise-chip", text: exp });
			}
			expertiseRow.createEl("div", {
				cls: "atlas-mentor-style-note",
				text: `Estilo: ${this.selectedPersona.style}`,
			});
		};
		this.updateExpertise = updateExpertise;
		updateExpertise();

		// Question input
		const qWrap = contentEl.createDiv({ cls: "atlas-mentor-q-wrap" });
		qWrap.createEl("label", {
			cls: "atlas-mentor-q-label",
			text: "Sua pergunta / situação:",
		});
		this.questionEl = qWrap.createEl("textarea", {
			cls: "atlas-mentor-q-input",
		}) as HTMLTextAreaElement;
		this.questionEl.placeholder =
			"Ex: 'Maria me disse que se sente sobrecarregada. Como abordar isso na próxima 1:1?'\n\nOu cole transcript de uma situação difícil.";

		// Active note button
		const fromActive = qWrap.createEl("button", {
			cls: "atlas-mentor-from-active-btn",
			text: "📝 Usar conteúdo da nota ativa",
		});
		fromActive.addEventListener("click", () => {
			const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) {
				new Notice("Atlas: nenhuma nota ativa.");
				return;
			}
			const text = view.editor.getSelection() || view.editor.getValue();
			this.questionEl.value = text;
		});

		// Action
		const action = contentEl.createDiv({ cls: "atlas-mentor-action" });
		const askBtn = action.createEl("button", {
			cls: "atlas-mentor-ask-btn mod-cta",
			text: "💬 Pedir conselho",
		});
		askBtn.addEventListener("click", () => void this.ask());

		// Response area
		this.responseEl = contentEl.createDiv({ cls: "atlas-mentor-response" });
	}

	private updateExpertise: () => void = () => undefined;

	private async ask(): Promise<void> {
		const question = this.questionEl.value.trim();
		if (!question) {
			new Notice("Atlas: descreva a situação primeiro.");
			return;
		}

		this.responseEl.empty();
		this.responseEl.addClass("is-loading");
		const loadingMsg = this.responseEl.createDiv({
			cls: "atlas-mentor-loading",
			text: `${this.selectedPersona.emoji} ${this.selectedPersona.name} está pensando...`,
		});

		try {
			const fullPrompt = `${this.selectedPersona.prompt}

SITUAÇÃO/PERGUNTA DO MENTORADO:
${question}

Sua resposta (em primeira pessoa, como ${this.selectedPersona.name}):`;

			const result = await this.plugin.ollama.generate(fullPrompt, {
				model: this.plugin.settings.ollama.generationModel,
				temperature: 0.7,
				max_tokens: 1500,
			});

			loadingMsg.remove();
			this.responseEl.removeClass("is-loading");

			// Header
			const header = this.responseEl.createDiv({ cls: "atlas-mentor-response-header" });
			header.createEl("span", {
				cls: "atlas-mentor-response-emoji",
				text: this.selectedPersona.emoji,
			});
			header.createEl("span", {
				cls: "atlas-mentor-response-name",
				text: this.selectedPersona.name,
			});

			// Body
			const body = this.responseEl.createDiv({ cls: "atlas-mentor-response-body" });
			body.setText(result.trim());

			// Save action
			const saveRow = this.responseEl.createDiv({ cls: "atlas-mentor-save-row" });
			const saveBtn = saveRow.createEl("button", {
				cls: "atlas-mentor-save-btn",
				text: "💾 Salvar como nota",
			});
			saveBtn.addEventListener("click", () => void this.saveAsNote(question, result));
		} catch (e) {
			loadingMsg.remove();
			this.responseEl.removeClass("is-loading");
			this.responseEl.createDiv({
				cls: "atlas-mentor-error",
				text: `Erro: ${String(e)}`,
			});
			logger.error("ghost-mentor: generate failed", { error: String(e) });
		}
	}

	private async saveAsNote(question: string, response: string): Promise<void> {
		const date = new Date().toISOString().split("T")[0];
		const slug = this.selectedPersona.id;
		const path = `${this.plugin.settings.folders.knowledge}/mentoring/${date}-${slug}.md`;
		const md = `---
type: mentor-session
mentor: ${this.selectedPersona.name}
date: ${date}
---

# ${this.selectedPersona.emoji} Ghost Mentor: ${this.selectedPersona.name}

> ${this.selectedPersona.role}

## ❓ Situação

${question}

## 💬 Resposta de ${this.selectedPersona.name.split(" ")[0]}

${response}

---
*Gerado por Atlas Ghost Mentor (LLM local). Nota: persona é interpretação baseada em livros/entrevistas, não palavras reais da pessoa.*
`;
		try {
			const folder = `${this.plugin.settings.folders.knowledge}/mentoring`;
			if (!this.plugin.app.vault.getAbstractFileByPath(folder)) {
				await this.plugin.app.vault.createFolder(folder);
			}
			await this.plugin.app.vault.create(path, md);
			new Notice(`Atlas: sessão salva em ${path}`);
			this.close();
		} catch (e) {
			new Notice(`Atlas: erro ao salvar — ${String(e)}`, 6000);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
