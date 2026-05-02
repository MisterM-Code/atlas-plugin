/**
 * Atlas v0.9.3 — confirmAsync utility (replaces window.confirm).
 *
 * Async modal-based yes/no confirmation. Required by Obsidian guideline:
 * "Don't use the global prompt or confirm functions."
 */

import { App, Modal } from "obsidian";
import { applyResponsiveModal } from "./modal-helpers";

export function confirmAsync(
	app: App,
	message: string,
	opts: { title?: string; yesLabel?: string; noLabel?: string; danger?: boolean } = {}
): Promise<boolean> {
	return new Promise((resolve) => {
		new ConfirmModal(app, message, opts, resolve).open();
	});
}

class ConfirmModal extends Modal {
	private resolved = false;

	constructor(
		app: App,
		private readonly message: string,
		private readonly opts: { title?: string; yesLabel?: string; noLabel?: string; danger?: boolean },
		private readonly resolve: (v: boolean) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		applyResponsiveModal(contentEl, { preferredWidth: 480 });
		contentEl.empty();
		contentEl.addClass("atlas-confirm-modal");
		if (this.opts.danger) contentEl.addClass("is-danger");

		// Header with icon
		const header = contentEl.createDiv({ cls: "atlas-confirm-header" });
		header.createEl("span", {
			cls: "atlas-confirm-icon",
			text: this.opts.danger ? "⚠️" : "❓",
		});
		if (this.opts.title) {
			header.createEl("h3", {
				cls: "atlas-confirm-title",
				text: this.opts.title,
			});
		}

		contentEl.createDiv({ cls: "atlas-confirm-message", text: this.message });

		const row = contentEl.createDiv({ cls: "atlas-confirm-buttons" });
		const noBtn = row.createEl("button", {
			cls: "atlas-confirm-btn-no",
			text: this.opts.noLabel ?? "Cancelar",
		});
		noBtn.addEventListener("click", () => this.commit(false));

		const yesBtn = row.createEl("button", {
			text: this.opts.yesLabel ?? "Confirmar",
			cls: `atlas-confirm-btn-yes ${this.opts.danger ? "mod-warning" : "mod-cta"}`,
		});
		yesBtn.addEventListener("click", () => this.commit(true));

		setTimeout(() => yesBtn.focus(), 50);
	}

	private commit(value: boolean): void {
		if (this.resolved) return;
		this.resolved = true;
		this.resolve(value);
		this.close();
	}

	onClose(): void {
		if (!this.resolved) {
			this.resolved = true;
			this.resolve(false);
		}
		this.contentEl.empty();
	}
}
