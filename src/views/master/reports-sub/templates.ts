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

	if (!plugin.templateStore) {
		const err = container.createDiv();
		err.style.padding = "16px";
		err.style.color = "var(--color-red)";
		err.setText("Atlas: TemplateStore não inicializado.");
		return;
	}

	// Header com ações
	const header = container.createDiv();
	header.style.display = "flex";
	header.style.justifyContent = "space-between";
	header.style.alignItems = "center";
	header.style.marginBottom = "10px";

	const subtitle = header.createDiv();
	subtitle.style.fontSize = "11px";
	subtitle.style.opacity = "0.7";
	const list = plugin.templateStore.list();
	subtitle.setText(`${list.length} templates · drag-drop blocks no editor`);

	const actions = header.createDiv();
	actions.style.display = "flex";
	actions.style.gap = "6px";

	const newBtn = actions.createEl("button", { text: "+ Novo" });
	newBtn.style.fontSize = "11px";
	newBtn.style.padding = "4px 10px";
	newBtn.addClass("mod-cta");
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
	pickerBtn.style.fontSize = "11px";
	pickerBtn.style.padding = "4px 10px";
	pickerBtn.title = "Abrir picker modal completo";
	pickerBtn.addEventListener("click", () => {
		new TemplatePickerModal(plugin.app, plugin).open();
	});

	const resetBtn = actions.createEl("button", { text: "↻ Reset" });
	resetBtn.style.fontSize = "11px";
	resetBtn.style.padding = "4px 10px";
	resetBtn.title = "Resetar para os defaults";
	resetBtn.addEventListener("click", async () => {
		if (!confirm("Atlas: descartar customizações e voltar aos templates defaults?")) return;
		plugin.templateStore.resetToDefaults();
		await plugin.templateStore.save();
		new Notice("Atlas: templates resetados.");
		void renderReportsTemplates(container, plugin);
	});

	// Grid
	const grid = container.createDiv();
	grid.style.display = "grid";
	grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(220px, 1fr))";
	grid.style.gap = "8px";
	grid.style.maxHeight = "calc(100vh - 280px)";
	grid.style.overflowY = "auto";

	if (list.length === 0) {
		const empty = grid.createDiv();
		empty.style.gridColumn = "1 / -1";
		empty.style.padding = "32px 16px";
		empty.style.textAlign = "center";
		empty.style.opacity = "0.6";
		empty.setText("Nenhum template — click '+ Novo' acima.");
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

		const catHeader = grid.createDiv();
		catHeader.style.gridColumn = "1 / -1";
		catHeader.style.fontSize = "10px";
		catHeader.style.fontWeight = "bold";
		catHeader.style.opacity = "0.7";
		catHeader.style.marginTop = "8px";
		catHeader.style.letterSpacing = "0.5px";
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
	const card = parent.createDiv();
	card.style.background = "var(--background-secondary)";
	card.style.borderRadius = "6px";
	card.style.padding = "10px";
	card.style.display = "flex";
	card.style.flexDirection = "column";
	card.style.gap = "6px";
	card.style.border = "1px solid var(--background-modifier-border)";
	card.style.transition = "border-color 120ms";

	card.addEventListener("mouseenter", () => {
		card.style.borderColor = "var(--interactive-accent)";
	});
	card.addEventListener("mouseleave", () => {
		card.style.borderColor = "var(--background-modifier-border)";
	});

	const top = card.createDiv();
	top.style.display = "flex";
	top.style.alignItems = "center";
	top.style.gap = "8px";

	const iconEl = top.createEl("span", { text: t.icon });
	iconEl.style.fontSize = "18px";

	const nameWrap = top.createDiv();
	nameWrap.style.flexGrow = "1";
	const nameEl = nameWrap.createEl("div", { text: t.name });
	nameEl.style.fontSize = "12px";
	nameEl.style.fontWeight = "bold";
	const metaEl = nameWrap.createEl("div", { text: `${t.blocks.length} blocks` });
	metaEl.style.fontSize = "10px";
	metaEl.style.opacity = "0.5";

	const desc = card.createEl("div", { text: t.description });
	desc.style.fontSize = "11px";
	desc.style.opacity = "0.7";
	desc.style.minHeight = "30px";

	// Actions
	const actionRow = card.createDiv();
	actionRow.style.display = "flex";
	actionRow.style.gap = "4px";
	actionRow.style.marginTop = "auto";

	const useBtn = actionRow.createEl("button", { text: "▶️ Usar" });
	useBtn.style.fontSize = "10px";
	useBtn.style.flexGrow = "1";
	useBtn.addClass("mod-cta");
	useBtn.addEventListener("click", () => void useTemplate(plugin, t));

	const editBtn = actionRow.createEl("button", { text: "✏️" });
	editBtn.style.fontSize = "11px";
	editBtn.style.padding = "0 8px";
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
		delBtn.style.fontSize = "11px";
		delBtn.style.padding = "0 6px";
		delBtn.title = "Deletar template (só customs)";
		delBtn.addEventListener("click", async () => {
			if (!confirm(`Atlas: deletar "${t.name}"?`)) return;
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
