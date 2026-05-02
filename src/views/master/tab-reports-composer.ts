import { Notice, TFile, Modal, Setting } from "obsidian";
import type AtlasPlugin from "../../../main";
import {
	ReportComposer,
	ReportSpec,
	SavedViewsStore,
	SavedView,
} from "../../tools/report-composer";

/**
 * Tab Reports Composer — UI pra montar relatórios filtrados.
 */
export async function renderReportsComposerTab(
	container: HTMLElement,
	plugin: AtlasPlugin
): Promise<void> {
	container.empty();
	const composer = new ReportComposer(plugin.app, plugin);
	const store = new SavedViewsStore(plugin);

	const today = new Date();
	const weekAgo = new Date(today.getTime() - 7 * 86_400_000);

	const draft: ReportSpec = {
		period: {
			start: weekAgo.toISOString().split("T")[0],
			end: today.toISOString().split("T")[0],
		},
		personIds: [],
		systemIds: [],
		themeIds: [],
		productIds: [],
		tags: [],
		output: "markdown",
		template: "auto",
		useLlm: true,
	};

	// Header
	const header = container.createDiv();
	header.style.marginBottom = "12px";
	header.createEl("h3", { text: "📊 Reports Composer" }).style.margin = "0 0 4px 0";
	const sub = header.createEl("div");
	sub.style.fontSize = "11px";
	sub.style.opacity = "0.6";
	sub.setText("Filtre por período × pessoas × sistemas × temas × produtos. Atlas compila.");

	// Saved views section (top)
	const savedViews = store.list();
	if (savedViews.length > 0) {
		const sv = container.createDiv();
		sv.style.marginBottom = "12px";
		const svHeader = sv.createEl("div", { text: "💾 Saved Views" });
		svHeader.style.fontSize = "11px";
		svHeader.style.fontWeight = "bold";
		svHeader.style.opacity = "0.7";
		svHeader.style.marginBottom = "6px";

		const grid = sv.createDiv();
		grid.style.display = "flex";
		grid.style.flexWrap = "wrap";
		grid.style.gap = "6px";

		for (const v of savedViews) {
			const chip = grid.createEl("button", { text: `📌 ${v.name}` });
			chip.style.fontSize = "11px";
			chip.style.padding = "4px 8px";
			chip.style.cursor = "pointer";
			chip.style.borderRadius = "4px";
			chip.title = v.cron ? `Cron: ${v.cron}` : "Click para executar";
			chip.addEventListener("click", () => void runSavedView(plugin, composer, v));

			// Right-click menu
			chip.addEventListener("contextmenu", (ev) => {
				ev.preventDefault();
				const menu = createInlineMenu(chip, [
					{
						label: "▶️ Executar",
						onClick: () => void runSavedView(plugin, composer, v),
					},
					{
						label: "📅 Configurar schedule",
						onClick: () => editSchedule(plugin, store, v, () => void renderReportsComposerTab(container, plugin)),
					},
					{
						label: "✏️ Carregar no editor",
						onClick: () => {
							Object.assign(draft, v.spec);
							void renderReportsComposerTab(container, plugin);
						},
					},
					{
						label: "🗑️ Deletar",
						onClick: () => {
							if (confirm(`Deletar saved view "${v.name}"?`)) {
								store.delete(v.id);
								void renderReportsComposerTab(container, plugin);
							}
						},
					},
				]);
			});
		}
	}

	// Filter sections
	const filtersBox = container.createDiv();
	filtersBox.style.padding = "12px";
	filtersBox.style.background = "var(--background-secondary)";
	filtersBox.style.borderRadius = "6px";
	filtersBox.style.marginBottom = "12px";

	// Period
	periodInputs(filtersBox, draft);

	// Multi-selects
	multiSelectChips(
		filtersBox,
		"👤 Pessoas",
		plugin.kg.listPeople().map((p) => ({ id: p.id, label: p.name })),
		draft.personIds,
		(v) => (draft.personIds = v)
	);

	multiSelectChips(
		filtersBox,
		"🖥️ Sistemas",
		plugin.kg.listSystems().map((s) => ({ id: s.id, label: s.name })),
		draft.systemIds,
		(v) => (draft.systemIds = v)
	);

	multiSelectChips(
		filtersBox,
		"📦 Produtos",
		plugin.kg.listProducts().map((p) => ({ id: p.id, label: p.name })),
		draft.productIds,
		(v) => (draft.productIds = v)
	);

	// Themes (top 20 mais frequentes)
	const topThemes = [...plugin.kg.data.themes]
		.sort((a, b) => b.frequency - a.frequency)
		.slice(0, 20);
	if (topThemes.length > 0) {
		multiSelectChips(
			filtersBox,
			"🏷️ Temas",
			topThemes.map((t) => ({ id: t.id, label: `${t.name} (${t.frequency})` })),
			draft.themeIds,
			(v) => (draft.themeIds = v)
		);
	}

	// Tags livres
	const tagWrap = filtersBox.createDiv();
	tagWrap.style.marginBottom = "10px";
	const tagLbl = tagWrap.createEl("label", { text: "🔖 Tags livres (separar por vírgula)" });
	tagLbl.style.fontSize = "11px";
	tagLbl.style.fontWeight = "bold";
	tagLbl.style.opacity = "0.7";
	tagLbl.style.display = "block";
	tagLbl.style.marginBottom = "4px";
	const tagInput = tagWrap.createEl("input", { type: "text" }) as HTMLInputElement;
	tagInput.placeholder = "urgent, bloqueio, win";
	tagInput.style.width = "100%";
	tagInput.style.padding = "5px 8px";
	tagInput.style.fontSize = "12px";
	tagInput.value = draft.tags.join(", ");
	tagInput.addEventListener("input", () => {
		draft.tags = tagInput.value
			.split(",")
			.map((t) => t.trim().replace(/^#/, ""))
			.filter(Boolean);
	});

	// LLM toggle
	const llmRow = filtersBox.createDiv();
	llmRow.style.display = "flex";
	llmRow.style.alignItems = "center";
	llmRow.style.gap = "8px";
	llmRow.style.marginTop = "8px";
	const llmCb = llmRow.createEl("input", { type: "checkbox" }) as HTMLInputElement;
	llmCb.checked = draft.useLlm;
	llmCb.addEventListener("change", () => (draft.useLlm = llmCb.checked));
	llmRow.createEl("label", { text: "Usar IA (Map-Reduce) — adiciona síntese automática" }).style.fontSize = "12px";

	// Action buttons
	const actions = container.createDiv();
	actions.style.display = "flex";
	actions.style.gap = "6px";
	actions.style.flexWrap = "wrap";

	const generateBtn = actions.createEl("button", { text: "▶️ Gerar relatório" });
	generateBtn.addClass("mod-cta");
	generateBtn.style.padding = "8px 14px";
	generateBtn.addEventListener("click", () => void generateReport(plugin, composer, draft));

	const saveBtn = actions.createEl("button", { text: "💾 Salvar como view" });
	saveBtn.style.padding = "8px 14px";
	saveBtn.addEventListener("click", () =>
		saveAsView(plugin, store, draft, () => void renderReportsComposerTab(container, plugin))
	);

	const resetBtn = actions.createEl("button", { text: "↺ Limpar filtros" });
	resetBtn.style.padding = "8px 14px";
	resetBtn.addEventListener("click", () => {
		draft.personIds = [];
		draft.systemIds = [];
		draft.productIds = [];
		draft.themeIds = [];
		draft.tags = [];
		void renderReportsComposerTab(container, plugin);
	});
}

// ──────────────────────────────────────────────────────────────────
// Helpers UI

function periodInputs(parent: HTMLElement, draft: ReportSpec): void {
	const wrap = parent.createDiv();
	wrap.style.marginBottom = "10px";
	const lbl = wrap.createEl("label", { text: "📅 Período" });
	lbl.style.fontSize = "11px";
	lbl.style.fontWeight = "bold";
	lbl.style.opacity = "0.7";
	lbl.style.display = "block";
	lbl.style.marginBottom = "4px";

	const row = wrap.createDiv();
	row.style.display = "flex";
	row.style.gap = "8px";
	row.style.alignItems = "center";

	const start = row.createEl("input", { type: "date" }) as HTMLInputElement;
	start.value = draft.period.start;
	start.style.flexGrow = "1";
	start.style.padding = "5px";
	start.style.fontSize = "12px";
	start.addEventListener("input", () => (draft.period.start = start.value));

	const sep = row.createEl("span", { text: "→" });
	sep.style.opacity = "0.5";

	const end = row.createEl("input", { type: "date" }) as HTMLInputElement;
	end.value = draft.period.end;
	end.style.flexGrow = "1";
	end.style.padding = "5px";
	end.style.fontSize = "12px";
	end.addEventListener("input", () => (draft.period.end = end.value));

	// Quick presets
	const presetRow = wrap.createDiv();
	presetRow.style.display = "flex";
	presetRow.style.gap = "4px";
	presetRow.style.marginTop = "4px";

	const preset = (label: string, days: number) => {
		const btn = presetRow.createEl("button", { text: label });
		btn.style.fontSize = "10px";
		btn.style.padding = "2px 6px";
		btn.addEventListener("click", () => {
			const today = new Date();
			const start = new Date(today.getTime() - days * 86_400_000);
			draft.period.start = start.toISOString().split("T")[0];
			draft.period.end = today.toISOString().split("T")[0];
			start.toString(); // appease TS
			(parent.querySelector('input[type="date"]:nth-of-type(1)') as HTMLInputElement)?.setAttribute(
				"value",
				draft.period.start
			);
			// trigger re-render is overkill — just update inputs
			(wrap.querySelectorAll('input[type="date"]') as NodeListOf<HTMLInputElement>).forEach((inp, i) => {
				inp.value = i === 0 ? draft.period.start : draft.period.end;
			});
		});
	};
	preset("7d", 7);
	preset("14d", 14);
	preset("30d", 30);
	preset("90d", 90);
}

function multiSelectChips(
	parent: HTMLElement,
	label: string,
	options: { id: string; label: string }[],
	values: string[],
	onChange: (v: string[]) => void
): void {
	const wrap = parent.createDiv();
	wrap.style.marginBottom = "10px";
	const lbl = wrap.createEl("label", { text: label });
	lbl.style.fontSize = "11px";
	lbl.style.fontWeight = "bold";
	lbl.style.opacity = "0.7";
	lbl.style.display = "block";
	lbl.style.marginBottom = "4px";

	if (options.length === 0) {
		const empty = wrap.createEl("div", { text: "(nenhum cadastrado)" });
		empty.style.fontSize = "11px";
		empty.style.opacity = "0.5";
		return;
	}

	const chipsBox = wrap.createDiv();
	chipsBox.style.display = "flex";
	chipsBox.style.flexWrap = "wrap";
	chipsBox.style.gap = "4px";
	chipsBox.style.maxHeight = "100px";
	chipsBox.style.overflowY = "auto";
	chipsBox.style.padding = "4px";
	chipsBox.style.background = "var(--background-primary)";
	chipsBox.style.borderRadius = "4px";

	const selected = new Set(values);

	for (const opt of options) {
		const chip = chipsBox.createEl("span", { text: opt.label });
		chip.style.padding = "3px 8px";
		chip.style.borderRadius = "12px";
		chip.style.fontSize = "11px";
		chip.style.cursor = "pointer";
		chip.style.userSelect = "none";
		const refresh = () => {
			if (selected.has(opt.id)) {
				chip.style.background = "var(--interactive-accent)";
				chip.style.color = "var(--text-on-accent)";
			} else {
				chip.style.background = "var(--background-modifier-hover)";
				chip.style.color = "var(--text-normal)";
				chip.style.opacity = "0.7";
			}
		};
		refresh();
		chip.addEventListener("click", () => {
			if (selected.has(opt.id)) selected.delete(opt.id);
			else selected.add(opt.id);
			onChange(Array.from(selected));
			refresh();
		});
	}
}

// ──────────────────────────────────────────────────────────────────
// Actions

async function generateReport(
	plugin: AtlasPlugin,
	composer: ReportComposer,
	spec: ReportSpec
): Promise<void> {
	const notice = new Notice("Atlas: gerando relatório...", 0);
	try {
		const r = await composer.compose({ ...spec });
		notice.hide();
		const f = plugin.app.vault.getAbstractFileByPath(r.notePath);
		if (f instanceof TFile) {
			await plugin.app.workspace.getLeaf().openFile(f);
		}
		new Notice(
			`Atlas: relatório pronto · ${r.stats.notesAnalyzed} notas, ${r.stats.sessionsAnalyzed} sessões.`,
			6000
		);
		plugin.gainXp("report-composed", 25);
	} catch (e) {
		notice.hide();
		new Notice(`Atlas: erro — ${String(e)}`, 8000);
	}
}

function saveAsView(
	plugin: AtlasPlugin,
	store: SavedViewsStore,
	spec: ReportSpec,
	onSave: () => void
): void {
	class SaveModal extends Modal {
		name = "";
		onOpen(): void {
			const { contentEl } = this;
			contentEl.empty();
			contentEl.createEl("h3", { text: "💾 Salvar como Saved View" });
			const lbl = contentEl.createEl("label", { text: "Nome da view" });
			lbl.style.fontSize = "12px";
			lbl.style.display = "block";
			lbl.style.marginBottom = "4px";
			const inp = contentEl.createEl("input", { type: "text" }) as HTMLInputElement;
			inp.placeholder = "Weekly Q2";
			inp.style.width = "100%";
			inp.style.padding = "6px 8px";
			inp.focus();
			inp.addEventListener("input", () => (this.name = inp.value));

			new Setting(contentEl)
				.addButton((b) => b.setButtonText("Cancelar").onClick(() => this.close()))
				.addButton((b) =>
					b
						.setButtonText("Salvar")
						.setCta()
						.onClick(() => {
							if (!this.name.trim()) {
								new Notice("Atlas: nome obrigatório.");
								return;
							}
							store.add({ name: this.name.trim(), spec: { ...spec, name: this.name.trim() } });
							new Notice(`Atlas: view "${this.name}" salva.`);
							this.close();
							onSave();
						})
				);
		}
		onClose(): void {
			this.contentEl.empty();
		}
	}
	new SaveModal(plugin.app).open();
}

function editSchedule(
	plugin: AtlasPlugin,
	store: SavedViewsStore,
	view: SavedView,
	onSave: () => void
): void {
	class CronModal extends Modal {
		cron = view.cron ?? "";
		onOpen(): void {
			const { contentEl } = this;
			contentEl.empty();
			contentEl.createEl("h3", { text: `📅 Schedule: ${view.name}` });
			contentEl.createEl("p", {
				text: "Cron expression. Atlas vai gerar automaticamente nesta cadência.",
			}).style.fontSize = "12px";

			const examples = contentEl.createEl("pre");
			examples.style.fontSize = "10px";
			examples.style.background = "var(--background-secondary)";
			examples.style.padding = "8px";
			examples.style.borderRadius = "4px";
			examples.textContent = `Exemplos:
0 16 * * 5    sexta às 16h
0 9 * * 1     segunda às 9h
0 7 * * *     todos os dias 7h
0 18 28-31 * * último dia do mês 18h`;

			const inp = contentEl.createEl("input", { type: "text" }) as HTMLInputElement;
			inp.value = this.cron;
			inp.placeholder = "0 16 * * 5";
			inp.style.width = "100%";
			inp.style.padding = "6px 8px";
			inp.style.fontFamily = "monospace";
			inp.addEventListener("input", () => (this.cron = inp.value));

			new Setting(contentEl)
				.addButton((b) => b.setButtonText("Cancelar").onClick(() => this.close()))
				.addButton((b) =>
					b.setButtonText("Remover schedule").onClick(() => {
						store.update(view.id, { cron: undefined });
						plugin.scheduler.cancel(`saved-view-${view.id}`);
						new Notice(`Atlas: schedule de "${view.name}" removido.`);
						this.close();
						onSave();
					})
				)
				.addButton((b) =>
					b
						.setButtonText("Salvar schedule")
						.setCta()
						.onClick(() => {
							if (!this.cron.trim()) {
								new Notice("Atlas: cron expression obrigatória.");
								return;
							}
							store.update(view.id, { cron: this.cron.trim() });
							scheduleSavedView(plugin, store, view.id);
							new Notice(`Atlas: schedule salvo (${this.cron}).`);
							this.close();
							onSave();
						})
				);
		}
		onClose(): void {
			this.contentEl.empty();
		}
	}
	new CronModal(plugin.app).open();
}

async function runSavedView(
	plugin: AtlasPlugin,
	composer: ReportComposer,
	view: SavedView
): Promise<void> {
	const store = new SavedViewsStore(plugin);
	store.update(view.id, { lastRunAt: new Date().toISOString() });
	await generateReport(plugin, composer, view.spec);
}

export function scheduleSavedView(
	plugin: AtlasPlugin,
	store: SavedViewsStore,
	viewId: string
): void {
	const view = store.get(viewId);
	if (!view || !view.cron) return;
	plugin.scheduler.schedule({
		id: `saved-view-${viewId}`,
		cronExpression: view.cron,
		description: `Saved view: ${view.name}`,
		handler: async () => {
			const composer = new ReportComposer(plugin.app, plugin);
			await runSavedView(plugin, composer, view);
		},
	});
}

export function rescheduleAllSavedViews(plugin: AtlasPlugin): void {
	const store = new SavedViewsStore(plugin);
	for (const v of store.list()) {
		if (v.cron) scheduleSavedView(plugin, store, v.id);
	}
}

// ──────────────────────────────────────────────────────────────────
// Inline menu (quick context menu)

function createInlineMenu(
	anchor: HTMLElement,
	items: { label: string; onClick: () => void }[]
): HTMLElement {
	const existing = document.querySelector(".atlas-inline-menu");
	if (existing) existing.remove();

	const menu = document.createElement("div");
	menu.addClass("atlas-inline-menu");
	menu.style.position = "fixed";
	menu.style.background = "var(--background-primary)";
	menu.style.border = "1px solid var(--background-modifier-border)";
	menu.style.borderRadius = "6px";
	menu.style.boxShadow = "0 4px 16px rgba(0,0,0,0.18)";
	menu.style.padding = "4px";
	menu.style.zIndex = "10000";
	menu.style.minWidth = "180px";

	const rect = anchor.getBoundingClientRect();
	menu.style.top = `${rect.bottom + 4}px`;
	menu.style.left = `${rect.left}px`;

	for (const it of items) {
		const row = menu.createDiv();
		row.style.padding = "6px 10px";
		row.style.fontSize = "12px";
		row.style.cursor = "pointer";
		row.style.borderRadius = "4px";
		row.setText(it.label);
		row.addEventListener("mouseenter", () => {
			row.style.background = "var(--background-modifier-hover)";
		});
		row.addEventListener("mouseleave", () => {
			row.style.background = "transparent";
		});
		row.addEventListener("click", () => {
			it.onClick();
			menu.remove();
		});
	}

	document.body.appendChild(menu);
	const closeOnClick = (ev: MouseEvent) => {
		if (!menu.contains(ev.target as Node)) {
			menu.remove();
			document.removeEventListener("click", closeOnClick);
		}
	};
	setTimeout(() => document.addEventListener("click", closeOnClick), 0);
	return menu;
}
