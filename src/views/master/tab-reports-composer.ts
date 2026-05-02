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
	const header = container.createDiv({ cls: "atlas-composer-header" });
	header.createEl("h3", { cls: "atlas-composer-title", text: "📊 Reports Composer" });
	header.createEl("div", {
		cls: "atlas-composer-subtitle",
		text: "Filtre por período × pessoas × sistemas × temas × produtos. Atlas compila.",
	});

	// Saved views section (top)
	const savedViews = store.list();
	if (savedViews.length > 0) {
		const sv = container.createDiv({ cls: "atlas-composer-saved-views" });
		sv.createEl("div", { cls: "atlas-composer-saved-header", text: "💾 Saved Views" });

		const grid = sv.createDiv({ cls: "atlas-composer-saved-grid" });

		for (const v of savedViews) {
			const chip = grid.createEl("button", {
				cls: "atlas-composer-saved-chip",
				text: `📌 ${v.name}`,
			});
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
						onClick: async () => {
							const { confirmAsync } = await import("../../ui/confirm-modal");
							const ok = await confirmAsync(plugin.app, `Deletar saved view "${v.name}"?`, {
								title: "Confirmar exclusão",
								danger: true,
								yesLabel: "Deletar",
							});
							if (ok) {
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
	const filtersBox = container.createDiv({ cls: "atlas-composer-filters-box" });

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
	const tagWrap = filtersBox.createDiv({ cls: "atlas-composer-tag-wrap" });
	tagWrap.createEl("label", {
		cls: "atlas-composer-field-label",
		text: "🔖 Tags livres (separar por vírgula)",
	});
	const tagInput = tagWrap.createEl("input", {
		cls: "atlas-composer-tag-input",
		type: "text",
	}) as HTMLInputElement;
	tagInput.placeholder = "urgent, bloqueio, win";
	tagInput.value = draft.tags.join(", ");
	tagInput.addEventListener("input", () => {
		draft.tags = tagInput.value
			.split(",")
			.map((t) => t.trim().replace(/^#/, ""))
			.filter(Boolean);
	});

	// LLM toggle
	const llmRow = filtersBox.createDiv({ cls: "atlas-composer-llm-row" });
	const llmCb = llmRow.createEl("input", {
		cls: "atlas-composer-llm-cb",
		type: "checkbox",
	}) as HTMLInputElement;
	llmCb.checked = draft.useLlm;
	llmCb.addEventListener("change", () => (draft.useLlm = llmCb.checked));
	llmRow.createEl("label", {
		cls: "atlas-composer-llm-label",
		text: "Usar IA (Map-Reduce) — adiciona síntese automática",
	});

	// Action buttons
	const actions = container.createDiv({ cls: "atlas-composer-actions" });

	const generateBtn = actions.createEl("button", {
		cls: "atlas-composer-action-btn mod-cta",
		text: "▶️ Gerar relatório",
	});
	generateBtn.addEventListener("click", () => void generateReport(plugin, composer, draft));

	const saveBtn = actions.createEl("button", {
		cls: "atlas-composer-action-btn",
		text: "💾 Salvar como view",
	});
	saveBtn.addEventListener("click", () =>
		saveAsView(plugin, store, draft, () => void renderReportsComposerTab(container, plugin))
	);

	const resetBtn = actions.createEl("button", {
		cls: "atlas-composer-action-btn",
		text: "↺ Limpar filtros",
	});
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
	const wrap = parent.createDiv({ cls: "atlas-composer-period-wrap" });
	wrap.createEl("label", { cls: "atlas-composer-field-label", text: "📅 Período" });

	const row = wrap.createDiv({ cls: "atlas-composer-period-row" });

	const start = row.createEl("input", {
		cls: "atlas-composer-period-input",
		type: "date",
	}) as HTMLInputElement;
	start.value = draft.period.start;
	start.addEventListener("input", () => (draft.period.start = start.value));

	row.createEl("span", { cls: "atlas-composer-period-sep", text: "→" });

	const end = row.createEl("input", {
		cls: "atlas-composer-period-input",
		type: "date",
	}) as HTMLInputElement;
	end.value = draft.period.end;
	end.addEventListener("input", () => (draft.period.end = end.value));

	// Quick presets
	const presetRow = wrap.createDiv({ cls: "atlas-composer-preset-row" });

	const preset = (label: string, days: number) => {
		const btn = presetRow.createEl("button", { cls: "atlas-composer-preset-btn", text: label });
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
	const wrap = parent.createDiv({ cls: "atlas-composer-multi-wrap" });
	wrap.createEl("label", { cls: "atlas-composer-field-label", text: label });

	if (options.length === 0) {
		wrap.createEl("div", { cls: "atlas-composer-multi-empty", text: "(nenhum cadastrado)" });
		return;
	}

	const chipsBox = wrap.createDiv({ cls: "atlas-composer-chips-box" });

	const selected = new Set(values);

	for (const opt of options) {
		const chip = chipsBox.createEl("span", { cls: "atlas-composer-multi-chip", text: opt.label });
		const refresh = () => {
			if (selected.has(opt.id)) chip.addClass("is-selected");
			else chip.removeClass("is-selected");
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
			contentEl.createEl("label", { cls: "atlas-composer-save-label", text: "Nome da view" });
			const inp = contentEl.createEl("input", {
				cls: "atlas-composer-save-input",
				type: "text",
			}) as HTMLInputElement;
			inp.placeholder = "Weekly Q2";
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
				cls: "atlas-composer-cron-desc",
				text: "Cron expression. Atlas vai gerar automaticamente nesta cadência.",
			});

			const examples = contentEl.createEl("pre", { cls: "atlas-composer-cron-examples" });
			examples.textContent = `Exemplos:
0 16 * * 5    sexta às 16h
0 9 * * 1     segunda às 9h
0 7 * * *     todos os dias 7h
0 18 28-31 * * último dia do mês 18h`;

			const inp = contentEl.createEl("input", {
				cls: "atlas-composer-cron-input",
				type: "text",
			}) as HTMLInputElement;
			inp.value = this.cron;
			inp.placeholder = "0 16 * * 5";
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

	const rect = anchor.getBoundingClientRect();
	// Position is dynamic per anchor — must be inline
	menu.style.setProperty("top", `${rect.bottom + 4}px`);
	menu.style.setProperty("left", `${rect.left}px`);

	for (const it of items) {
		const row = menu.createDiv({ cls: "atlas-inline-menu-row", text: it.label });
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
