import { Notice } from "obsidian";
import type AtlasPlugin from "../../../../main";
import {
	TemplateEditorModal,
	TemplatePickerModal,
} from "../../../templates/visual-editor/editor-ui";
import { AtlasTemplate, buildDefaultContext } from "../../../templates/visual-editor/block-types";
import { renderTemplate } from "../../../templates/visual-editor/block-renderer";

/**
 * Templates sub-view — grid de cards dos templates Atlas.
 * Click "Editar" abre TemplateEditorModal. Click "Usar" cria nota nova.
 * Botão "+ Novo" cria template em branco.
 */
export async function renderReportsTemplates(
	container: HTMLElement,
	plugin: AtlasPlugin
): Promise<void> {
	container.empty();
	container.addClass("atlas-reports-templates", "atlas-section-stagger");

	if (!plugin.templateStore) {
		const err = container.createDiv({ cls: "atlas-tab-empty-state" });
		err.createEl("div", { cls: "atlas-tab-empty-emoji", text: "⚠️" });
		err.createEl("div", { cls: "atlas-tab-empty-title", text: "TemplateStore não inicializado" });
		return;
	}

	// Header com ações (premium)
	const header = container.createDiv({ cls: "atlas-tab-section-header" });

	const titleWrap = header.createDiv();
	titleWrap.createEl("h3", {
		cls: "atlas-tab-section-title",
		text: "📐 Templates",
	});
	const list = plugin.templateStore.list();
	titleWrap.createEl("div", {
		cls: "atlas-tab-section-subtitle",
		text: `${list.length} templates · drag-drop blocks no editor visual`,
	});

	const actions = header.createDiv({ cls: "atlas-reports-templates-actions" });

	const newBtn = actions.createEl("button", { cls: "mod-cta", text: "+ Novo" });
	newBtn.addEventListener("click", () => {
		const newT: AtlasTemplate = {
			id: `custom-${Date.now().toString(36)}`,
			name: "Novo template",
			icon: "📝",
			description: "Custom template",
			category: "other",
			variables: [],
			blocks: [],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};
		plugin.templateStore.upsert(newT);
		void plugin.templateStore.save();
		new TemplateEditorModal(plugin.app, plugin, newT).open();
	});

	const pickerBtn = actions.createEl("button", { text: "📐 Picker" });
	pickerBtn.title = "Abrir picker modal completo";
	pickerBtn.addEventListener("click", () => {
		new TemplatePickerModal(plugin.app, plugin).open();
	});

	const resetBtn = actions.createEl("button", { text: "↻ Reset" });
	resetBtn.title = "Resetar para os defaults";
	resetBtn.addEventListener("click", async () => {
		const { confirmAsync } = await import("../../../ui/confirm-modal");
		const ok = await confirmAsync(plugin.app, "Descartar customizações e voltar aos templates defaults?", {
			title: "Resetar templates",
			yesLabel: "Resetar",
			danger: true,
		});
		if (!ok) return;
		plugin.templateStore.resetToDefaults();
		await plugin.templateStore.save();
		new Notice("Atlas: templates resetados.");
		void renderReportsTemplates(container, plugin);
	});

	container.createDiv({ cls: "atlas-tab-section-divider" });

	// Grid
	const grid = container.createDiv({ cls: "atlas-reports-templates-grid" });

	if (list.length === 0) {
		const empty = grid.createDiv({ cls: "atlas-tab-empty-state" });
		empty.style.gridColumn = "1 / -1";
		empty.createEl("div", { cls: "atlas-tab-empty-emoji", text: "📐" });
		empty.createEl("div", { cls: "atlas-tab-empty-title", text: "Nenhum template" });
		empty.createEl("div", {
			cls: "atlas-tab-empty-desc",
			text: "Click '+ Novo' acima para criar seu primeiro template.",
		});
		return;
	}

	// Group by category
	const byCategory = new Map<string, AtlasTemplate[]>();
	for (const t of list) {
		const arr = byCategory.get(t.category) ?? [];
		arr.push(t);
		byCategory.set(t.category, arr);
	}

	const categoryOrder: AtlasTemplate["category"][] = [
		"daily",
		"meeting",
		"coaching",
		"review",
		"report",
		"other",
	];
	const categoryLabel: Record<AtlasTemplate["category"], string> = {
		daily: "📓 Daily",
		meeting: "🤝 Meetings",
		coaching: "🎓 Coaching",
		review: "🔍 Reviews",
		report: "📊 Reports",
		other: "📝 Outros",
	};

	for (const cat of categoryOrder) {
		const items = byCategory.get(cat);
		if (!items || items.length === 0) continue;

		const catHeader = grid.createDiv({ cls: "atlas-reports-templates-cat" });
		catHeader.setText(categoryLabel[cat]);

		for (const t of items) {
			renderTemplateCard(grid, plugin, t, () => void renderReportsTemplates(container, plugin));
		}
	}
}

function renderTemplateCard(
	parent: HTMLElement,
	plugin: AtlasPlugin,
	t: AtlasTemplate,
	onChange: () => void
): void {
	const card = parent.createDiv({ cls: "atlas-tab-card-premium atlas-reports-template-card" });

	const top = card.createDiv({ cls: "atlas-reports-template-top" });
	top.createEl("span", { cls: "atlas-reports-template-icon", text: t.icon });

	const nameWrap = top.createDiv({ cls: "atlas-reports-template-name-wrap" });
	nameWrap.createEl("div", { cls: "atlas-reports-template-name", text: t.name });
	nameWrap.createEl("div", { cls: "atlas-reports-template-meta", text: `${t.blocks.length} blocks` });

	card.createEl("div", { cls: "atlas-reports-template-desc", text: t.description });

	// Actions
	const actionRow = card.createDiv({ cls: "atlas-reports-template-actions" });

	const useBtn = actionRow.createEl("button", { cls: "mod-cta", text: "▶️ Usar" });
	useBtn.addEventListener("click", () => void useTemplate(plugin, t));

	const editBtn = actionRow.createEl("button", { text: "✏️" });
	editBtn.title = "Editar template";
	editBtn.addEventListener("click", () => {
		const modal = new TemplateEditorModal(plugin.app, plugin, t);
		const origClose = modal.onClose.bind(modal);
		modal.onClose = (): void => {
			origClose();
			onChange();
		};
		modal.open();
	});

	if (t.id.startsWith("custom-")) {
		const delBtn = actionRow.createEl("button", { text: "🗑️" });
		delBtn.title = "Deletar template (só customs)";
		delBtn.addEventListener("click", async () => {
			const { confirmAsync } = await import("../../../ui/confirm-modal");
			const ok = await confirmAsync(plugin.app, `Deletar "${t.name}"?`, {
				title: "Confirmar exclusão",
				yesLabel: "Deletar",
				danger: true,
			});
			if (!ok) return;
			plugin.templateStore.delete(t.id);
			await plugin.templateStore.save();
			new Notice(`Atlas: template "${t.name}" deletado.`);
			onChange();
		});
	}
}

async function useTemplate(plugin: AtlasPlugin, t: AtlasTemplate): Promise<void> {
	const ctx = buildDefaultContext();
	for (const v of t.variables) {
		if (v.promptOnUse && v.required) {
			const val = await promptValue(plugin.app, `${v.label}:`);
			if (!val) {
				new Notice("Atlas: cancelado.");
				return;
			}
			ctx[v.key] = val;
		}
	}

	const md = renderTemplate(t, ctx);
	const date = ctx.data ?? new Date().toISOString().split("T")[0];
	const slug = (ctx.pessoa ?? ctx.coachee ?? ctx.titulo ?? t.name)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	const fileName = `${date}-${slug}.md`;

	const folder = (() => {
		switch (t.category) {
			case "daily":
				return `${plugin.settings.folders.daily}/${date.substring(0, 7).replace("-", "/")}`;
			case "meeting":
				return ctx.pessoa
					? `${plugin.settings.folders.meetings}/1on1/${ctx.pessoa}`
					: plugin.settings.folders.meetings;
			case "coaching":
				return `09_Coaching/sessions`;
			case "report":
				return `${plugin.settings.folders.reports}/weekly`;
			default:
				return "01_Inbox";
		}
	})();

	const parts = folder.split("/").filter(Boolean);
	let cur = "";
	for (const p of parts) {
		cur = cur ? `${cur}/${p}` : p;
		if (!plugin.app.vault.getAbstractFileByPath(cur)) {
			try {
				await plugin.app.vault.createFolder(cur);
			} catch {
				// race
			}
		}
	}

	const path = `${folder}/${fileName}`;
	try {
		const f = await plugin.app.vault.create(path, md);
		await plugin.app.workspace.getLeaf().openFile(f);
		new Notice(`Atlas: nota criada com template "${t.name}".`);
	} catch (e) {
		const existing = plugin.app.vault.getAbstractFileByPath(path);
		if (existing && "stat" in existing) {
			await plugin.app.workspace.getLeaf().openFile(existing as never);
		} else {
			new Notice(`Atlas: erro — ${String(e)}`, 8000);
		}
	}
}

async function promptValue(app: AtlasPlugin["app"], label: string): Promise<string | null> {
	const { Modal: M, Setting: S } = await import("obsidian");
	return new Promise((resolve) => {
		class P extends M {
			value = "";
			onOpen(): void {
				const { contentEl } = this;
				contentEl.createEl("h4", { text: label });
				const inp = contentEl.createEl("input", { type: "text" }) as HTMLInputElement;
				inp.style.width = "100%";
				inp.style.padding = "6px";
				inp.focus();
				inp.addEventListener("keydown", (e) => {
					if (e.key === "Enter") {
						resolve(this.value || null);
						this.close();
					}
					if (e.key === "Escape") {
						resolve(null);
						this.close();
					}
				});
				inp.addEventListener("input", () => (this.value = inp.value));
				new S(contentEl)
					.addButton((b) =>
						b.setButtonText("Cancelar").onClick(() => {
							resolve(null);
							this.close();
						})
					)
					.addButton((b) =>
						b
							.setButtonText("OK")
							.setCta()
							.onClick(() => {
								resolve(this.value || null);
								this.close();
							})
					);
			}
			onClose(): void {
				this.contentEl.empty();
			}
		}
		new P(app).open();
	});
}
