/**
 * Slide-over right panel — non-blocking edição inline.
 *
 * Aparece pela direita, sobreposto ao Obsidian. ESC fecha.
 * Usado para edit/view de qualquer entidade do KG.
 *
 * v0.28: utility classes + cyan accent header + smooth transitions.
 */

export interface SlideOverConfig {
	title: string;
	subtitle?: string;
	icon?: string;
	width?: number; // px, default 420
	render: (body: HTMLElement, panel: SlideOverPanel) => void | Promise<void>;
	onClose?: () => void;
	actions?: { icon: string; title: string; onClick: () => void }[];
}

export class SlideOverPanel {
	private overlayEl: HTMLDivElement | null = null;
	private panelEl: HTMLDivElement | null = null;
	private bodyEl: HTMLDivElement | null = null;
	private escHandler: ((e: KeyboardEvent) => void) | null = null;

	constructor(private cfg: SlideOverConfig) {}

	async open(): Promise<void> {
		// Backdrop sutil (clica fora pra fechar)
		const overlay = document.createElement("div");
		overlay.addClass("atlas-slideover-overlay");
		document.body.appendChild(overlay);
		this.overlayEl = overlay;

		// Panel
		const width = this.cfg.width ?? 420;
		const panel = document.createElement("div");
		panel.addClass("atlas-slideover-panel");
		panel.style.setProperty("--atlas-slideover-width", `${width}px`);
		panel.style.right = `-${width}px`;
		document.body.appendChild(panel);
		this.panelEl = panel;

		// Header
		const header = panel.createDiv({ cls: "atlas-slideover-header" });

		const titleWrap = header.createDiv({ cls: "atlas-slideover-title-wrap" });

		const titleLine = titleWrap.createDiv({ cls: "atlas-slideover-title-line" });
		if (this.cfg.icon) {
			titleLine.createEl("span", {
				cls: "atlas-slideover-icon",
				text: this.cfg.icon,
			});
		}
		titleLine.createEl("h3", {
			cls: "atlas-slideover-title",
			text: this.cfg.title,
		});

		if (this.cfg.subtitle) {
			titleWrap.createEl("div", {
				cls: "atlas-slideover-subtitle",
				text: this.cfg.subtitle,
			});
		}

		// Actions
		const actionsEl = header.createDiv({ cls: "atlas-slideover-actions" });
		for (const a of this.cfg.actions ?? []) {
			const btn = actionsEl.createEl("button", {
				cls: "atlas-slideover-action-btn",
				text: a.icon,
			});
			btn.title = a.title;
			btn.addEventListener("click", a.onClick);
		}

		const closeBtn = actionsEl.createEl("button", {
			cls: "atlas-slideover-action-btn atlas-slideover-close",
			text: "✕",
		});
		closeBtn.title = "Fechar (Esc)";
		closeBtn.addEventListener("click", () => this.close());

		// Body
		const body = panel.createDiv({ cls: "atlas-slideover-body" });
		this.bodyEl = body as HTMLDivElement;

		// Animation
		requestAnimationFrame(() => {
			panel.style.right = "0";
			overlay.classList.add("is-visible");
		});

		// ESC + overlay click
		this.escHandler = (e: KeyboardEvent) => {
			if (e.key === "Escape") this.close();
		};
		document.addEventListener("keydown", this.escHandler);
		overlay.addEventListener("click", () => this.close());

		// Render content
		try {
			await this.cfg.render(this.bodyEl, this);
		} catch (e) {
			this.bodyEl.empty();
			const err = this.bodyEl.createEl("div", {
				cls: "atlas-slideover-error",
				text: `Erro: ${String(e)}`,
			});
			void err;
		}
	}

	close(): void {
		if (this.escHandler) {
			document.removeEventListener("keydown", this.escHandler);
			this.escHandler = null;
		}
		if (this.panelEl) {
			const width = this.cfg.width ?? 420;
			this.panelEl.style.right = `-${width}px`;
		}
		if (this.overlayEl) {
			this.overlayEl.classList.remove("is-visible");
		}
		setTimeout(() => {
			this.overlayEl?.remove();
			this.panelEl?.remove();
			this.overlayEl = null;
			this.panelEl = null;
			this.cfg.onClose?.();
		}, 280);
	}

	rerender(): void {
		if (!this.bodyEl) return;
		this.bodyEl.empty();
		try {
			void this.cfg.render(this.bodyEl, this);
		} catch (e) {
			this.bodyEl.createEl("div", {
				cls: "atlas-slideover-error",
				text: `Erro: ${String(e)}`,
			});
		}
	}

	get body(): HTMLDivElement | null {
		return this.bodyEl;
	}
}
