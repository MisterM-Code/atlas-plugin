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
		contentEl.style.padding = "24px";

		// Progress dots
		this.progressEl = contentEl.createDiv();
		this.progressEl.style.display = "flex";
		this.progressEl.style.gap = "6px";
		this.progressEl.style.justifyContent = "center";
		this.progressEl.style.marginBottom = "16px";
		this.renderProgress();

		// Body
		this.bodyEl = contentEl.createDiv();
		this.bodyEl.style.minHeight = "200px";
		this.renderStep();

		// Footer
		const footer = contentEl.createDiv();
		footer.style.display = "flex";
		footer.style.justifyContent = "space-between";
		footer.style.gap = "8px";
		footer.style.marginTop = "20px";

		const left = footer.createDiv();
		this.prevBtn = left.createEl("button", { text: "← Anterior" });
		this.prevBtn.addEventListener("click", () => this.go(-1));

		const right = footer.createDiv();
		right.style.display = "flex";
		right.style.gap = "8px";

		const skip = right.createEl("button", { text: "Pular" });
		skip.addEventListener("click", () => void this.finish());

		this.nextBtn = right.createEl("button", { text: "Próximo →", cls: "mod-cta" }) as HTMLButtonElement;
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
			const dot = this.progressEl.createDiv();
			dot.style.width = "8px";
			dot.style.height = "8px";
			dot.style.borderRadius = "50%";
			dot.style.transition = "all 220ms ease";
			dot.style.background = i === this.currentStep ? "var(--atlas-accent, #818cf8)" : "var(--background-modifier-border)";
			dot.style.transform = i === this.currentStep ? "scale(1.3)" : "scale(1)";
		}
	}

	private renderStep(): void {
		const step = STEPS[this.currentStep];
		this.bodyEl.empty();
		this.bodyEl.style.opacity = "0";
		this.bodyEl.style.transform = "translateX(12px)";
		this.bodyEl.style.transition = "opacity 220ms ease, transform 220ms ease";

		const emoji = this.bodyEl.createDiv();
		emoji.setText(step.emoji);
		emoji.style.fontSize = "44px";
		emoji.style.textAlign = "center";
		emoji.style.marginBottom = "12px";

		const title = this.bodyEl.createEl("h2");
		title.setText(step.title);
		title.style.margin = "0 0 8px";
		title.style.textAlign = "center";

		const body = this.bodyEl.createDiv();
		body.setText(step.body);
		body.style.fontSize = "14px";
		body.style.lineHeight = "1.6";
		body.style.opacity = "0.85";
		body.style.textAlign = "center";

		if (step.action) {
			const cta = this.bodyEl.createDiv();
			cta.style.marginTop = "16px";
			cta.style.padding = "12px";
			cta.style.background = "var(--background-modifier-hover)";
			cta.style.borderRadius = "8px";
			cta.style.textAlign = "center";
			cta.style.borderLeft = "3px solid var(--atlas-accent, #818cf8)";

			const label = cta.createDiv();
			label.setText("💡 " + step.action.label);
			label.style.fontSize = "13px";
			label.style.fontWeight = "500";

			if (step.action.example) {
				const ex = cta.createEl("code");
				ex.setText(`"${step.action.example}"`);
				ex.style.display = "inline-block";
				ex.style.marginTop = "8px";
				ex.style.fontSize = "12px";
				ex.style.padding = "4px 8px";
				ex.style.background = "var(--background-primary)";
				ex.style.borderRadius = "4px";
			}
		}

		setTimeout(() => {
			this.bodyEl.style.opacity = "1";
			this.bodyEl.style.transform = "translateX(0)";
		}, 10);
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
