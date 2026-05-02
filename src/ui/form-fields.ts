/**
 * Form field helpers reusables — usados em forms slide-over de entidades.
 *
 * v0.31: refatorado de inline styles → utility classes (.atlas-field-*).
 */

export function fieldInput(
	parent: HTMLElement,
	label: string,
	value: string,
	onChange: (v: string) => void,
	opts?: { placeholder?: string; required?: boolean; type?: string }
): HTMLInputElement {
	const wrap = parent.createDiv({ cls: "atlas-field-wrap" });
	wrap.createEl("label", { cls: "atlas-field-label", text: label });

	const inp = wrap.createEl("input", {
		cls: "atlas-field-input",
		type: opts?.type ?? "text",
	});
	inp.value = value;
	if (opts?.placeholder) inp.placeholder = opts.placeholder;
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
	const wrap = parent.createDiv({ cls: "atlas-field-wrap" });
	wrap.createEl("label", { cls: "atlas-field-label", text: label });

	const ta = wrap.createEl("textarea", { cls: "atlas-field-textarea" });
	ta.value = value;
	if (opts?.placeholder) ta.placeholder = opts.placeholder;
	if (opts?.minHeight) ta.style.minHeight = opts.minHeight;
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
	const wrap = parent.createDiv({ cls: "atlas-field-wrap" });
	wrap.createEl("label", { cls: "atlas-field-label", text: label });

	const sel = wrap.createEl("select", { cls: "atlas-field-select" });
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
	const wrap = parent.createDiv({ cls: "atlas-field-wrap" });
	wrap.createEl("label", { cls: "atlas-field-label", text: label });

	const chipBox = wrap.createDiv({ cls: "atlas-field-chipbox" });

	const selected = new Set(values);

	const renderChips = (): void => {
		chipBox.empty();
		for (const opt of options) {
			const isSelected = selected.has(opt.id);
			const chip = chipBox.createEl("span", {
				cls: `atlas-field-chip ${isSelected ? "is-selected" : ""}`.trim(),
				text: opt.label,
			});
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
	const btns = parent.createDiv({ cls: "atlas-form-buttons" });

	const cancel = btns.createEl("button", { cls: "atlas-form-btn-cancel", text: "Cancelar" });
	cancel.addEventListener("click", () => onCancel());

	const save = btns.createEl("button", { cls: "mod-cta atlas-form-btn-save", text: primaryLabel });
	save.addEventListener("click", () => void onSave());
}
