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

		if (this.opts.title) {
			const t = contentEl.createEl("h3", { text: this.opts.title });
			t.style.marginTop = "0";
		}

		const body = contentEl.createDiv();
		body.setText(this.message);
		body.style.lineHeight = "1.5";
		body.style.marginBottom = "16px";
		body.style.whiteSpace = "pre-wrap";

		const row = contentEl.createDiv();
		row.style.display = "flex";
		row.style.gap = "8px";
		row.style.justifyContent = "flex-end";

		const noBtn = row.createEl("button", { text: this.opts.noLabel ?? "Cancelar" });
		noBtn.addEventListener("click", () => this.commit(false));

		const yesBtn = row.createEl("button", {
			text: this.opts.yesLabel ?? "Confirmar",
			cls: this.opts.danger ? "mod-warning" : "mod-cta",
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
