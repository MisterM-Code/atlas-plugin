/**
 * Slide-over right panel — non-blocking edição inline.
 *
 * Aparece pela direita, sobreposto ao Obsidian. ESC fecha.
 * Usado para edit/view de qualquer entidade do KG.
 */

export interface SlideOverConfig {
	title: string;
	subtitle?: string;
	icon?: string;
	width?: number; // px, default 380
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
		overlay.style.position = "fixed";
		overlay.style.inset = "0";
		overlay.style.zIndex = "9990";
		overlay.style.background = "rgba(0,0,0,0.15)";
		overlay.style.opacity = "0";
		overlay.style.transition = "opacity 200ms";
		overlay.style.pointerEvents = "auto";
		document.body.appendChild(overlay);
		this.overlayEl = overlay;

		// Panel
		const width = this.cfg.width ?? 380;
		const panel = document.createElement("div");
		panel.addClass("atlas-slideover-panel");
		panel.style.position = "fixed";
		panel.style.top = "0";
		panel.style.right = `-${width}px`;
		panel.style.bottom = "0";
		panel.style.width = `${width}px`;
		panel.style.zIndex = "9991";
		panel.style.background = "var(--background-primary)";
		panel.style.borderLeft = "1px solid var(--background-modifier-border)";
		panel.style.boxShadow = "-8px 0 32px rgba(0,0,0,0.2)";
		panel.style.transition = "right 250ms cubic-bezier(0.4, 0, 0.2, 1)";
		panel.style.display = "flex";
		panel.style.flexDirection = "column";
		panel.style.overflow = "hidden";
		document.body.appendChild(panel);
		this.panelEl = panel;

		// Header
		const header = panel.createDiv();
		header.style.padding = "14px 16px";
		header.style.borderBottom = "1px solid var(--background-modifier-border)";
		header.style.display = "flex";
		header.style.alignItems = "center";
		header.style.gap = "8px";
		header.style.flexShrink = "0";

		const titleWrap = header.createDiv();
		titleWrap.style.flexGrow = "1";
		titleWrap.style.minWidth = "0";

		const titleLine = titleWrap.createDiv();
		titleLine.style.display = "flex";
		titleLine.style.alignItems = "center";
		titleLine.style.gap = "6px";
		if (this.cfg.icon) {
			const icon = titleLine.createEl("span", { text: this.cfg.icon });
			icon.style.fontSize = "16px";
		}
		const titleEl = titleLine.createEl("h3", { text: this.cfg.title });
		titleEl.style.margin = "0";
		titleEl.style.fontSize = "15px";
		titleEl.style.overflow = "hidden";
		titleEl.style.textOverflow = "ellipsis";
		titleEl.style.whiteSpace = "nowrap";

		if (this.cfg.subtitle) {
			const sub = titleWrap.createEl("div", { text: this.cfg.subtitle });
			sub.style.fontSize = "11px";
			sub.style.opacity = "0.6";
			sub.style.marginTop = "2px";
		}

		// Actions
		const actionsEl = header.createDiv();
		actionsEl.style.display = "flex";
		actionsEl.style.gap = "4px";
		for (const a of this.cfg.actions ?? []) {
			const btn = actionsEl.createEl("button", { text: a.icon });
			btn.title = a.title;
			btn.style.padding = "4px 8px";
			btn.style.fontSize = "13px";
			btn.style.cursor = "pointer";
			btn.style.background = "transparent";
			btn.style.border = "none";
			btn.style.borderRadius = "4px";
			btn.addEventListener("mouseenter", () => {
				btn.style.background = "var(--background-modifier-hover)";
			});
			btn.addEventListener("mouseleave", () => {
				btn.style.background = "transparent";
			});
			btn.addEventListener("click", a.onClick);
		}

		const closeBtn = actionsEl.createEl("button", { text: "✕" });
		closeBtn.style.padding = "4px 10px";
		closeBtn.style.fontSize = "13px";
		closeBtn.style.cursor = "pointer";
		closeBtn.style.background = "transparent";
		closeBtn.style.border = "none";
		closeBtn.style.borderRadius = "4px";
		closeBtn.title = "Fechar (Esc)";
		closeBtn.addEventListener("click", () => this.close());

		// Body
		const body = panel.createDiv();
		body.style.flexGrow = "1";
		body.style.overflowY = "auto";
		body.style.padding = "16px";
		this.bodyEl = body as HTMLDivElement;

		// Animation
		requestAnimationFrame(() => {
			panel.style.right = "0";
			overlay.style.opacity = "1";
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
			const err = this.bodyEl.createEl("div", { text: `Erro: ${String(e)}` });
			err.style.color = "var(--color-red)";
		}
	}

	close(): void {
		if (this.escHandler) {
			document.removeEventListener("keydown", this.escHandler);
			this.escHandler = null;
		}
		if (this.panelEl) {
			const width = this.cfg.width ?? 380;
			this.panelEl.style.right = `-${width}px`;
		}
		if (this.overlayEl) {
			this.overlayEl.style.opacity = "0";
		}
		setTimeout(() => {
			this.overlayEl?.remove();
			this.panelEl?.remove();
			this.overlayEl = null;
			this.panelEl = null;
			this.cfg.onClose?.();
		}, 250);
	}

	rerender(): void {
		if (!this.bodyEl) return;
		this.bodyEl.empty();
		try {
			void this.cfg.render(this.bodyEl, this);
		} catch (e) {
			this.bodyEl.createEl("div", { text: `Erro: ${String(e)}` });
		}
	}

	get body(): HTMLDivElement | null {
		return this.bodyEl;
	}
}
