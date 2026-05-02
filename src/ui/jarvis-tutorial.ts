/**
 * Atlas v0.9.2 Sprint 32.5 — Jarvis interactive tutorial (first time)
 *
 * 5-step coach mark walkthrough overlay shown the first time user opens
 * the Jarvis tab or fullscreen overlay. Persistence: settings.onboarding.jarvisTutorialSeen.
 */

import { App, Modal } from "obsidian";
import type AtlasPlugin from "../../main";
import { applyResponsiveModal } from "./modal-helpers";

interface TutStep {
	emoji: string;
	title: string;
	body: string;
	action?: { label: string; example?: string };
}

const STEPS: TutStep[] = [
	{
		emoji: "🤖",
		title: "Conheça o Atlas Jarvis",
		body:
			"Jarvis é o seu assistente de voz. Ele responde perguntas E executa ações no seu vault — criar pessoas, agendar reuniões, mandar email — tudo por voz ou texto.",
	},
	{
		emoji: "🎙️",
		title: "Como falar com Jarvis",
		body:
			"Segure ESPAÇO ou clique no orb central pra falar. Solte pra processar. Sem whisper.cpp instalado, Atlas usa Web Speech (browser-native) automaticamente.",
		action: { label: "Tente: 'Atlas, status'", example: "Atlas, status" },
	},
	{
		emoji: "✨",
		title: "Jarvis CRIA coisas",
		body:
			"Diga 'Atlas, criar pessoa' e Jarvis pergunta o nome, depois o tipo (direct-report, peer, etc.) e cadastra no Knowledge Graph.",
		action: { label: "Tente: 'Atlas, criar pessoa'", example: "Atlas, criar pessoa" },
	},
	{
		emoji: "📅",
		title: "Jarvis AGENDA coisas",
		body:
			"Diga 'Atlas, agendar reunião com Maria amanhã 14h' e Jarvis cria a nota de 1:1 com framework GROW automaticamente.",
		action: { label: "Tente: 'Atlas, agendar reunião'", example: "Atlas, agendar reunião com Maria" },
	},
	{
		emoji: "⛶",
		title: "Compacto ou tela cheia",
		body:
			"O Jarvis fica na sidebar por padrão. Clique no botão expandir (canto superior direito) ou aperte Cmd+Shift+J para abrir em tela cheia. ESC fecha.",
	},
];

export class JarvisTutorial extends Modal {
	private currentStep = 0;
	private progressEl!: HTMLElement;
	private bodyEl!: HTMLElement;
	private prevBtn!: HTMLButtonElement;
	private nextBtn!: HTMLButtonElement;

	constructor(app: App, private readonly plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		applyResponsiveModal(contentEl, { preferredWidth: 560 });
		contentEl.empty();
		contentEl.addClass("atlas-tutorial-modal");

		this.progressEl = contentEl.createDiv({ cls: "atlas-tutorial-progress" });
		this.renderProgress();

		this.bodyEl = contentEl.createDiv({ cls: "atlas-tutorial-body" });
		this.renderStep();

		const footer = contentEl.createDiv({ cls: "atlas-tutorial-footer" });
		const left = footer.createDiv();
		this.prevBtn = left.createEl("button", { text: "← Anterior" });
		this.prevBtn.addEventListener("click", () => this.go(-1));

		const right = footer.createDiv({ cls: "atlas-tutorial-footer-right" });
		const skip = right.createEl("button", { text: "Pular" });
		skip.addEventListener("click", () => void this.finish());

		this.nextBtn = right.createEl("button", {
			text: "Próximo →",
			cls: "mod-cta",
		}) as HTMLButtonElement;
		this.nextBtn.addEventListener("click", () => {
			if (this.currentStep === STEPS.length - 1) {
				void this.finish();
			} else {
				this.go(1);
			}
		});

		this.updateButtons();
	}

	private renderProgress(): void {
		this.progressEl.empty();
		for (let i = 0; i < STEPS.length; i++) {
			this.progressEl.createDiv({
				cls: i === this.currentStep
					? "atlas-tutorial-progress-dot is-active"
					: "atlas-tutorial-progress-dot",
			});
		}
	}

	private renderStep(): void {
		const step = STEPS[this.currentStep];
		this.bodyEl.empty();
		this.bodyEl.removeClass("is-shown");

		this.bodyEl.createDiv({ cls: "atlas-tutorial-emoji", text: step.emoji });
		this.bodyEl.createEl("h2", { cls: "atlas-tutorial-title", text: step.title });
		this.bodyEl.createDiv({ cls: "atlas-tutorial-text", text: step.body });

		if (step.action) {
			const cta = this.bodyEl.createDiv({ cls: "atlas-tutorial-cta" });
			cta.createDiv({ cls: "atlas-tutorial-cta-label", text: "💡 " + step.action.label });
			if (step.action.example) {
				cta.createEl("code", {
					cls: "atlas-tutorial-cta-example",
					text: `"${step.action.example}"`,
				});
			}
		}

		setTimeout(() => this.bodyEl.addClass("is-shown"), 10);
	}

	private go(delta: number): void {
		const next = this.currentStep + delta;
		if (next < 0 || next >= STEPS.length) return;
		this.currentStep = next;
		this.renderProgress();
		this.renderStep();
		this.updateButtons();
	}

	private updateButtons(): void {
		this.prevBtn.disabled = this.currentStep === 0;
		this.prevBtn.style.opacity = this.currentStep === 0 ? "0.4" : "1";
		this.nextBtn.setText(this.currentStep === STEPS.length - 1 ? "Começar →" : "Próximo →");
	}

	private async finish(): Promise<void> {
		this.plugin.settings.onboarding.jarvisTutorialSeen = true;
		await this.plugin.saveSettings();
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Convenience: launches tutorial only if not seen before. */
export function maybeShowJarvisTutorial(app: App, plugin: AtlasPlugin): void {
	if (plugin.settings.onboarding?.jarvisTutorialSeen) return;
	// Small delay to ensure Jarvis tab rendered first (better UX context)
	setTimeout(() => {
		new JarvisTutorial(app, plugin).open();
	}, 800);
}
