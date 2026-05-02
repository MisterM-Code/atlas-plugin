/**
 * Form field helpers reusables — usados em forms slide-over de entidades.
 */

export function fieldInput(
	parent: HTMLElement,
	label: string,
	value: string,
	onChange: (v: string) => void,
	opts?: { placeholder?: string; required?: boolean; type?: string }
): HTMLInputElement {
	const wrap = parent.createDiv();
	wrap.style.marginBottom = "12px";
	const lbl = wrap.createEl("label", { text: label });
	lbl.style.fontSize = "11px";
	lbl.style.fontWeight = "bold";
	lbl.style.opacity = "0.7";
	lbl.style.display = "block";
	lbl.style.marginBottom = "4px";

	const inp = wrap.createEl("input", { type: opts?.type ?? "text" }) as HTMLInputElement;
	inp.value = value;
	if (opts?.placeholder) inp.placeholder = opts.placeholder;
	inp.style.width = "100%";
	inp.style.padding = "6px 8px";
	inp.style.fontSize = "12px";
	inp.addEventListener("input", () => onChange(inp.value));
	return inp;
}

export function fieldTextArea(
	parent: HTMLElement,
	label: string,
	value: string,
	onChange: (v: string) => void,
	opts?: { placeholder?: string; minHeight?: string }
): HTMLTextAreaElement {
	const wrap = parent.createDiv();
	wrap.style.marginBottom = "12px";
	const lbl = wrap.createEl("label", { text: label });
	lbl.style.fontSize = "11px";
	lbl.style.fontWeight = "bold";
	lbl.style.opacity = "0.7";
	lbl.style.display = "block";
	lbl.style.marginBottom = "4px";

	const ta = wrap.createEl("textarea") as HTMLTextAreaElement;
	ta.value = value;
	if (opts?.placeholder) ta.placeholder = opts.placeholder;
	ta.style.width = "100%";
	ta.style.minHeight = opts?.minHeight ?? "60px";
	ta.style.padding = "6px 8px";
	ta.style.fontSize = "12px";
	ta.addEventListener("input", () => onChange(ta.value));
	return ta;
}

export function fieldSelect(
	parent: HTMLElement,
	label: string,
	value: string,
	options: string[],
	onChange: (v: string) => void,
	displayLabels?: string[]
): HTMLSelectElement {
	const wrap = parent.createDiv();
	wrap.style.marginBottom = "12px";
	const lbl = wrap.createEl("label", { text: label });
	lbl.style.fontSize = "11px";
	lbl.style.fontWeight = "bold";
	lbl.style.opacity = "0.7";
	lbl.style.display = "block";
	lbl.style.marginBottom = "4px";

	const sel = wrap.createEl("select") as HTMLSelectElement;
	sel.style.width = "100%";
	sel.style.padding = "6px 8px";
	sel.style.fontSize = "12px";
	options.forEach((opt, i) => {
		const optEl = sel.createEl("option", {
			text: opt === "" ? "—" : displayLabels?.[i] ?? opt,
			value: opt,
		});
		if (opt === value) optEl.selected = true;
	});
	sel.addEventListener("change", () => onChange(sel.value));
	return sel;
}

export function fieldMultiSelect(
	parent: HTMLElement,
	label: string,
	values: string[],
	options: { id: string; label: string }[],
	onChange: (v: string[]) => void
): void {
	const wrap = parent.createDiv();
	wrap.style.marginBottom = "12px";
	const lbl = wrap.createEl("label", { text: label });
	lbl.style.fontSize = "11px";
	lbl.style.fontWeight = "bold";
	lbl.style.opacity = "0.7";
	lbl.style.display = "block";
	lbl.style.marginBottom = "4px";

	const chipBox = wrap.createDiv();
	chipBox.style.display = "flex";
	chipBox.style.flexWrap = "wrap";
	chipBox.style.gap = "4px";
	chipBox.style.padding = "4px";
	chipBox.style.background = "var(--background-secondary)";
	chipBox.style.borderRadius = "4px";
	chipBox.style.minHeight = "32px";

	const selected = new Set(values);

	const renderChips = () => {
		chipBox.empty();
		for (const opt of options) {
			const chip = chipBox.createEl("span", { text: opt.label });
			chip.style.padding = "3px 8px";
			chip.style.borderRadius = "12px";
			chip.style.fontSize = "11px";
			chip.style.cursor = "pointer";
			chip.style.userSelect = "none";
			if (selected.has(opt.id)) {
				chip.style.background = "var(--interactive-accent)";
				chip.style.color = "var(--text-on-accent)";
			} else {
				chip.style.background = "var(--background-modifier-hover)";
				chip.style.opacity = "0.7";
			}
			chip.addEventListener("click", () => {
				if (selected.has(opt.id)) selected.delete(opt.id);
				else selected.add(opt.id);
				onChange(Array.from(selected));
				renderChips();
			});
		}
	};
	renderChips();
}

export function formButtons(
	parent: HTMLElement,
	primaryLabel: string,
	onSave: () => void | Promise<void>,
	onCancel: () => void
): void {
	const btns = parent.createDiv();
	btns.style.display = "flex";
	btns.style.justifyContent = "flex-end";
	btns.style.gap = "8px";
	btns.style.marginTop = "20px";
	btns.style.paddingTop = "12px";
	btns.style.borderTop = "1px solid var(--background-modifier-border)";

	const cancel = btns.createEl("button", { text: "Cancelar" });
	cancel.addEventListener("click", () => onCancel());

	const save = btns.createEl("button", { text: primaryLabel });
	save.addClass("mod-cta");
	save.addEventListener("click", () => void onSave());
}
