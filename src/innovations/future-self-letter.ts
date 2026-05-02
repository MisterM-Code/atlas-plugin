/**
 * Atlas v0.12 — Future Self Letter.
 *
 * "Escreva uma carta para o seu eu de daqui a 1 ano (ou X meses).
 * Atlas guarda. Em X dias, abre + entrega + você reflete sobre como cresceu."
 *
 * Inovação: combina time-capsule existente com prompt psicológico (Hal Hershfield's
 * future-self research). Comprovadamente aumenta auto-continuidade e tomada de
 * decisões de longo prazo.
 *
 * UX: 2 modos:
 * 1. **Para meu eu de FUTURO** — você escreve hoje, abre em X meses
 * 2. **Do meu eu do PASSADO (imaginário)** — você escreve carta como se fosse o você
 *    de 1 ano atrás dando conselhos pra hoje. Ajuda a ressignificar.
 */

import { App, Modal, Notice } from "obsidian";
import type AtlasPlugin from "../../main";
import { applyResponsiveModal } from "../ui/modal-helpers";

type LetterMode = "to-future" | "from-past";

const PROMPTS_TO_FUTURE = [
	"O que você está tentando aprender agora?",
	"Que decisão difícil está te tirando o sono hoje?",
	"O que você espera que tenha mudado em 1 ano?",
	"Que medo você quer superar?",
	"Que projeto/sonho você quer ver concluído?",
	"O que dirá ao seu eu do futuro sobre como está hoje?",
];

const PROMPTS_FROM_PAST = [
	"Imagine seu eu de 1 ano atrás. O que ele sabia que você esqueceu?",
	"Que conselho ele te daria sobre o que está vivendo agora?",
	"Que medo dele se mostrou sem fundamento?",
	"O que ele se orgulharia em ver você fazendo?",
	"O que ele te alertaria a cuidar?",
];

export class FutureSelfLetterModal extends Modal {
	private mode: LetterMode = "to-future";
	private monthsAhead = 12;
	private letterEl!: HTMLTextAreaElement;

	constructor(app: App, private readonly plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		applyResponsiveModal(contentEl, { preferredWidth: 720, preferredHeight: 700 });
		contentEl.addClass("atlas-fsl-modal");

		contentEl.createEl("h3", { cls: "atlas-fsl-title", text: "🕰️ Future Self Letter" });
		contentEl.createEl("div", {
			cls: "atlas-fsl-subtitle",
			text: "Pesquisa de Hal Hershfield: contato visual com seu eu futuro aumenta auto-continuidade e decisões de longo prazo.",
		});

		// Mode toggle
		const modeRow = contentEl.createDiv({ cls: "atlas-fsl-mode-row" });
		const toFutureBtn = modeRow.createEl("button", {
			cls: "atlas-fsl-mode-btn is-active",
			text: "📮 Para meu eu do FUTURO",
		});
		const fromPastBtn = modeRow.createEl("button", {
			cls: "atlas-fsl-mode-btn",
			text: "📜 Do meu eu do PASSADO",
		});

		const renderForMode = () => {
			toFutureBtn.toggleClass("is-active", this.mode === "to-future");
			fromPastBtn.toggleClass("is-active", this.mode === "from-past");
			this.renderForMode(contentEl);
		};

		toFutureBtn.addEventListener("click", () => {
			this.mode = "to-future";
			renderForMode();
		});
		fromPastBtn.addEventListener("click", () => {
			this.mode = "from-past";
			renderForMode();
		});

		this.renderForMode(contentEl);
	}

	private renderForMode(parent: HTMLElement): void {
		// Clear previous body (anything after mode-row)
		const old = parent.querySelector(".atlas-fsl-body");
		if (old) old.remove();

		const body = parent.createDiv({ cls: "atlas-fsl-body" });

		if (this.mode === "to-future") {
			// Timeframe selector
			const timeRow = body.createDiv({ cls: "atlas-fsl-time-row" });
			timeRow.createEl("label", {
				cls: "atlas-fsl-time-label",
				text: "Atlas entrega esta carta em:",
			});
			const presets = [3, 6, 12, 24];
			for (const m of presets) {
				const btn = timeRow.createEl("button", {
					cls: m === this.monthsAhead ? "atlas-fsl-time-btn is-active" : "atlas-fsl-time-btn",
					text: m === 12 ? "1 ano" : m === 24 ? "2 anos" : `${m} meses`,
				});
				btn.addEventListener("click", () => {
					this.monthsAhead = m;
					this.renderForMode(parent);
				});
			}
		}

		// Prompt suggestions
		const promptsBox = body.createDiv({ cls: "atlas-fsl-prompts" });
		promptsBox.createEl("div", {
			cls: "atlas-fsl-prompts-label",
			text: "💡 Prompts pra te ajudar (click pra inserir):",
		});
		const prompts = this.mode === "to-future" ? PROMPTS_TO_FUTURE : PROMPTS_FROM_PAST;
		for (const p of prompts) {
			const chip = promptsBox.createEl("button", {
				cls: "atlas-fsl-prompt-chip",
				text: p,
			});
			chip.addEventListener("click", () => {
				this.letterEl.value += (this.letterEl.value ? "\n\n" : "") + p + "\n";
				this.letterEl.focus();
			});
		}

		// Letter textarea
		const lblText = this.mode === "to-future"
			? `📝 Carta pro seu eu daqui a ${this.monthsAhead === 12 ? "1 ano" : this.monthsAhead === 24 ? "2 anos" : `${this.monthsAhead} meses`}:`
			: "📝 Carta do seu eu de 1 ano atrás (escrita por você, hoje):";
		body.createEl("label", { cls: "atlas-fsl-letter-label", text: lblText });
		this.letterEl = body.createEl("textarea", {
			cls: "atlas-fsl-letter-textarea",
		}) as HTMLTextAreaElement;
		this.letterEl.placeholder =
			this.mode === "to-future"
				? "Querido(a) eu do futuro,\n\nNeste momento estou..."
				: "Olá, você de hoje. Lembra como era 1 ano atrás?\n\nEu queria te dizer que...";

		// Word count
		const wc = body.createDiv({ cls: "atlas-fsl-wordcount" });
		const updateWc = () => {
			const words = this.letterEl.value.trim().split(/\s+/).filter(Boolean).length;
			wc.setText(`${words} palavras · ideal: 200+ palavras`);
		};
		this.letterEl.addEventListener("input", updateWc);
		updateWc();

		// Action
		const action = body.createDiv({ cls: "atlas-fsl-action" });
		const cancelBtn = action.createEl("button", { text: "Cancelar" });
		cancelBtn.addEventListener("click", () => this.close());

		const saveBtn = action.createEl("button", {
			cls: "atlas-fsl-save-btn mod-cta",
			text: this.mode === "to-future" ? "🕰️ Selar carta" : "💾 Salvar reflexão",
		});
		saveBtn.addEventListener("click", () => void this.save());
	}

	private async save(): Promise<void> {
		const content = this.letterEl.value.trim();
		if (!content) {
			new Notice("Atlas: escreva algo primeiro.");
			return;
		}
		if (content.split(/\s+/).filter(Boolean).length < 30) {
			new Notice("Atlas: carta muito curta. Tente pelo menos 30 palavras.");
			return;
		}

		const today = new Date();
		const dateStr = today.toISOString().split("T")[0];

		if (this.mode === "to-future") {
			// Schedule via TimeCapsule (existing)
			const opens = new Date(today);
			opens.setMonth(opens.getMonth() + this.monthsAhead);
			const opensStr = opens.toISOString().split("T")[0];

			const slug = `future-self-${dateStr}`;
			const path = `${this.plugin.settings.folders.knowledge}/letters/${slug}.md`;
			const md = `---
type: future-self-letter
written_at: ${dateStr}
opens_at: ${opensStr}
months_ahead: ${this.monthsAhead}
sealed: true
---

# 🕰️ Carta selada — abre em ${opensStr}

> Atlas guarda esta carta. Notification dispara automaticamente em ${this.monthsAhead === 12 ? "1 ano" : this.monthsAhead === 24 ? "2 anos" : `${this.monthsAhead} meses`}.

## Carta

${content}

---
*Selada em ${dateStr}. Não abrir antes de ${opensStr}.*
`;
			try {
				const folder = `${this.plugin.settings.folders.knowledge}/letters`;
				if (!this.plugin.app.vault.getAbstractFileByPath(folder)) {
					await this.plugin.app.vault.createFolder(folder);
				}
				await this.plugin.app.vault.create(path, md);

				// Register reminder if scheduler available
				try {
					const reminderPath = `${this.plugin.settings.folders.inbox}/${opensStr}-future-letter-opens.md`;
					const reminderMd = `---
type: capture
captured_at: ${new Date().toISOString()}
captured_via: future-self-letter
---

# 🕰️ Carta selada do passado — abrir hoje

- [ ] Abrir carta selada de ${dateStr}: [[${path}]] (@${opensStr} 09:00) #future-self-letter
`;
					if (!this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.folders.inbox)) {
						await this.plugin.app.vault.createFolder(this.plugin.settings.folders.inbox);
					}
					await this.plugin.app.vault.create(reminderPath, reminderMd);
				} catch {
					// Reminder failed, letter still saved
				}

				new Notice(
					`🕰️ Carta selada. Atlas abre em ${opensStr} (${this.monthsAhead === 12 ? "1 ano" : `${this.monthsAhead} meses`}).`,
					10000
				);
				this.plugin.gainXp("future-self-sealed", 50);
				this.close();
			} catch (e) {
				new Notice(`Atlas: erro ao selar — ${String(e)}`, 8000);
			}
		} else {
			// from-past — just save as reflection
			const slug = `from-past-${dateStr}`;
			const path = `${this.plugin.settings.folders.knowledge}/letters/${slug}.md`;
			const md = `---
type: from-past-reflection
date: ${dateStr}
---

# 📜 Reflexão "do meu eu do passado"

> Escrita por você como se fosse o seu eu de 1 ano atrás dando conselhos.

## Reflexão

${content}

---
*Hal Hershfield's future-self research mostra que perspective-shifting aumenta auto-continuidade.*
`;
			try {
				const folder = `${this.plugin.settings.folders.knowledge}/letters`;
				if (!this.plugin.app.vault.getAbstractFileByPath(folder)) {
					await this.plugin.app.vault.createFolder(folder);
				}
				await this.plugin.app.vault.create(path, md);
				new Notice(`📜 Reflexão salva em ${path}`);
				this.plugin.gainXp("from-past-reflection", 25);
				this.close();
			} catch (e) {
				new Notice(`Atlas: erro ao salvar — ${String(e)}`, 8000);
			}
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
