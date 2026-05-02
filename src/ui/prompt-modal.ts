/**
 * Atlas v0.9 — promptText utility.
 * Modal simples: pergunta texto ao user. Retorna string ou null se cancelado.
 */

import { App, Modal } from "obsidian";
import { applyResponsiveModal } from "./modal-helpers";

export function promptText(app: App, label: string, defaultValue = ""): Promise<string | null> {
	return new Promise((resolve) => {
		const modal = new PromptModal(app, label, defaultValue, resolve);
		modal.open();
	});
}

class PromptModal extends Modal {
	private input!: HTMLInputElement;
	private resolved = false;

	constructor(
		app: App,
		private readonly label: string,
		private readonly defaultValue: string,
		private readonly resolve: (v: string | null) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		applyResponsiveModal(contentEl, { preferredWidth: 480 });
		contentEl.empty();

		const lbl = contentEl.createEl("h3", { text: this.label });
		lbl.style.marginTop = "0";

		this.input = contentEl.createEl("input");
		this.input.type = "text";
		this.input.value = this.defaultValue;
		this.input.style.width = "100%";
		this.input.style.padding = "8px 10px";
		this.input.style.fontSize = "14px";
		this.input.style.borderRadius = "6px";
		this.input.style.border = "1px solid var(--background-modifier-border)";

		const btnRow = contentEl.createDiv();
		btnRow.style.display = "flex";
		btnRow.style.gap = "8px";
		btnRow.style.justifyContent = "flex-end";
		btnRow.style.marginTop = "12px";

		const cancel = btnRow.createEl("button", { text: "Cancelar" });
		cancel.addEventListener("click", () => {
			this.commit(null);
		});

		const ok = btnRow.createEl("button", { text: "OK", cls: "mod-cta" });
		ok.addEventListener("click", () => {
			this.commit(this.input.value.trim() || null);
		});

		this.input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				this.commit(this.input.value.trim() || null);
			} else if (e.key === "Escape") {
				e.preventDefault();
				this.commit(null);
			}
		});

		setTimeout(() => this.input.focus(), 50);
	}

	private commit(value: string | null): void {
		if (this.resolved) return;
		this.resolved = true;
		this.resolve(value);
		this.close();
	}

	onClose(): void {
		// safety net se user fechou via X
		if (!this.resolved) {
			this.resolved = true;
			this.resolve(null);
		}
		this.contentEl.empty();
	}
}
