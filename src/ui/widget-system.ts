/**
 * Atlas Widget System — drag-drop reorderable widgets em qualquer tab.
 *
 * HTML5 native drag-drop (sem deps). Persist em localStorage por widget-set-id.
 */

const LAYOUT_KEY_PREFIX = "atlas-widget-layout";

export interface WidgetDef {
	id: string;
	icon: string;
	title: string;
	description: string;
	defaultEnabled: boolean;
	render: (container: HTMLElement) => void | Promise<void>;
}

interface WidgetLayout {
	order: string[]; // widget ids in render order
	disabled: string[]; // widget ids disabled
}

export class WidgetSet {
	private layout: WidgetLayout;

	constructor(
		private setId: string,
		private widgets: WidgetDef[],
		private onChange?: () => void
	) {
		this.layout = this.loadLayout();
	}

	private loadLayout(): WidgetLayout {
		try {
			const raw = window.localStorage.getItem(`${LAYOUT_KEY_PREFIX}-${this.setId}`);
			if (raw) return JSON.parse(raw);
		} catch {
			// noop
		}
		// Default: all enabled in order defined
		return {
			order: this.widgets.map((w) => w.id),
			disabled: this.widgets.filter((w) => !w.defaultEnabled).map((w) => w.id),
		};
	}

	private saveLayout(): void {
		try {
			window.localStorage.setItem(
				`${LAYOUT_KEY_PREFIX}-${this.setId}`,
				JSON.stringify(this.layout)
			);
		} catch {
			// noop
		}
		this.onChange?.();
	}

	resetLayout(): void {
		this.layout = {
			order: this.widgets.map((w) => w.id),
			disabled: this.widgets.filter((w) => !w.defaultEnabled).map((w) => w.id),
		};
		this.saveLayout();
	}

	toggleWidget(id: string): void {
		if (this.layout.disabled.includes(id)) {
			this.layout.disabled = this.layout.disabled.filter((d) => d !== id);
		} else {
			this.layout.disabled.push(id);
		}
		this.saveLayout();
	}

	moveWidget(id: string, beforeId: string | null): void {
		const order = [...this.layout.order];
		const idx = order.indexOf(id);
		if (idx >= 0) order.splice(idx, 1);

		if (beforeId === null) {
			order.push(id);
		} else {
			const targetIdx = order.indexOf(beforeId);
			if (targetIdx >= 0) {
				order.splice(targetIdx, 0, id);
			} else {
				order.push(id);
			}
		}
		this.layout.order = order;
		this.saveLayout();
	}

	/**
	 * Render widgets em container — com drag handles e botão de toggle.
	 */
	async render(container: HTMLElement, options?: { showCustomizeBar?: boolean }): Promise<void> {
		container.empty();

		if (options?.showCustomizeBar !== false) {
			this.renderCustomizeBar(container);
		}

		const grid = container.createDiv();
		grid.addClass("atlas-widget-grid");
		grid.style.display = "flex";
		grid.style.flexDirection = "column";
		grid.style.gap = "12px";

		// Order widgets per layout, skip disabled
		const widgetsById = new Map(this.widgets.map((w) => [w.id, w]));
		const orderedIds = [
			...this.layout.order.filter((id) => widgetsById.has(id)),
			...this.widgets.filter((w) => !this.layout.order.includes(w.id)).map((w) => w.id),
		];

		for (const id of orderedIds) {
			const def = widgetsById.get(id);
			if (!def) continue;
			if (this.layout.disabled.includes(id)) continue;
			await this.renderWidget(grid, def);
		}
	}

	private renderCustomizeBar(parent: HTMLElement): void {
		const bar = parent.createDiv();
		bar.style.display = "flex";
		bar.style.justifyContent = "flex-end";
		bar.style.alignItems = "center";
		bar.style.marginBottom = "8px";
		bar.style.gap = "6px";

		const customizeBtn = bar.createEl("button", { text: "🎨 Customizar widgets" });
		customizeBtn.style.fontSize = "11px";
		customizeBtn.style.padding = "4px 8px";
		customizeBtn.addEventListener("click", () => {
			const isOpen = parent.querySelector(".atlas-widget-customize-panel");
			if (isOpen) {
				isOpen.remove();
			} else {
				this.renderCustomizePanel(parent, bar);
			}
		});
	}

	private renderCustomizePanel(parent: HTMLElement, after: HTMLElement): void {
		const panel = document.createElement("div");
		panel.addClass("atlas-widget-customize-panel");
		panel.style.padding = "10px";
		panel.style.background = "var(--background-secondary)";
		panel.style.borderRadius = "6px";
		panel.style.marginBottom = "10px";
		after.insertAdjacentElement("afterend", panel);

		const title = panel.createEl("div", { text: "Selecione widgets visíveis:" });
		title.style.fontWeight = "bold";
		title.style.fontSize = "11px";
		title.style.marginBottom = "6px";

		const list = panel.createDiv();
		list.style.display = "grid";
		list.style.gridTemplateColumns = "1fr 1fr";
		list.style.gap = "4px";

		for (const w of this.widgets) {
			const row = list.createDiv();
			row.style.display = "flex";
			row.style.alignItems = "center";
			row.style.gap = "6px";
			row.style.fontSize = "11px";

			const cb = row.createEl("input", { type: "checkbox" }) as HTMLInputElement;
			cb.checked = !this.layout.disabled.includes(w.id);
			cb.addEventListener("change", () => {
				this.toggleWidget(w.id);
			});

			row.createEl("span", { text: `${w.icon} ${w.title}` });
		}

		const reset = panel.createEl("button", { text: "↻ Resetar layout" });
		reset.style.marginTop = "8px";
		reset.style.fontSize = "10px";
		reset.style.padding = "3px 8px";
		reset.addEventListener("click", () => {
			this.resetLayout();
		});
	}

	private async renderWidget(grid: HTMLElement, def: WidgetDef): Promise<void> {
		const card = grid.createDiv();
		card.addClass("atlas-widget");
		card.dataset["widgetId"] = def.id;
		card.style.background = "var(--background-secondary)";
		card.style.borderRadius = "6px";
		card.style.padding = "12px";
		card.style.position = "relative";
		card.draggable = true;

		// Drag handle + actions (visible on hover)
		const handle = card.createDiv();
		handle.style.position = "absolute";
		handle.style.top = "6px";
		handle.style.right = "6px";
		handle.style.display = "flex";
		handle.style.gap = "4px";
		handle.style.opacity = "0";
		handle.style.transition = "opacity 0.15s";
		card.addEventListener("mouseenter", () => {
			handle.style.opacity = "0.7";
		});
		card.addEventListener("mouseleave", () => {
			handle.style.opacity = "0";
		});

		const dragIndicator = handle.createEl("span", { text: "⋮⋮" });
		dragIndicator.style.cursor = "grab";
		dragIndicator.style.fontSize = "12px";
		dragIndicator.style.padding = "2px 6px";
		dragIndicator.title = `Arrastar para reordenar · ${def.title}`;

		const hideBtn = handle.createEl("span", { text: "✕" });
		hideBtn.style.cursor = "pointer";
		hideBtn.style.fontSize = "11px";
		hideBtn.style.padding = "2px 6px";
		hideBtn.title = `Ocultar ${def.title}`;
		hideBtn.addEventListener("click", (ev) => {
			ev.stopPropagation();
			this.toggleWidget(def.id);
		});

		// Drag events
		card.addEventListener("dragstart", (ev) => {
			ev.dataTransfer?.setData("text/plain", def.id);
			ev.dataTransfer!.effectAllowed = "move";
			card.style.opacity = "0.4";
		});
		card.addEventListener("dragend", () => {
			card.style.opacity = "1";
		});
		card.addEventListener("dragover", (ev) => {
			ev.preventDefault();
			card.style.borderTop = "2px solid var(--interactive-accent)";
		});
		card.addEventListener("dragleave", () => {
			card.style.borderTop = "";
		});
		card.addEventListener("drop", (ev) => {
			ev.preventDefault();
			card.style.borderTop = "";
			const draggedId = ev.dataTransfer?.getData("text/plain");
			if (draggedId && draggedId !== def.id) {
				this.moveWidget(draggedId, def.id);
			}
		});

		// Title
		const titleEl = card.createDiv();
		titleEl.style.fontSize = "11px";
		titleEl.style.fontWeight = "bold";
		titleEl.style.opacity = "0.7";
		titleEl.style.marginBottom = "8px";
		titleEl.style.letterSpacing = "0.5px";
		titleEl.setText(`${def.icon} ${def.title.toUpperCase()}`);

		// Body
		const body = card.createDiv();
		try {
			await def.render(body);
		} catch (e) {
			body.createEl("div", { text: `Erro: ${String(e)}` }).style.color = "var(--color-red)";
		}
	}
}
