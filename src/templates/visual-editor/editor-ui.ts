import { App, Modal, Notice, Setting, TFile } from "obsidian";
import type AtlasPlugin from "../../../main";
import { Block, AtlasTemplate, BlockKind, buildDefaultContext } from "./block-types";
import { renderTemplate } from "./block-renderer";
import { applyResponsiveModal } from "../../ui/modal-helpers";

/**
 * Atlas Template Editor Modal — drag-drop blocks + live preview.
 */
export class TemplateEditorModal extends Modal {
	private template: AtlasTemplate;
	private blocksContainer!: HTMLDivElement;
	private previewEl!: HTMLPreElement;

	constructor(app: App, private plugin: AtlasPlugin, template: AtlasTemplate) {
		super(app);
		// Deep clone para edição não-destrutiva
		this.template = JSON.parse(JSON.stringify(template));
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		applyResponsiveModal(contentEl, { preferredWidth: 1100, preferredHeight: 800 });

		// Header
		const header = contentEl.createDiv({ cls: "atlas-tplmod-header" });

		const titleWrap = header.createDiv();
		titleWrap.createEl("h3", {
			cls: "atlas-tplmod-title",
			text: `${this.template.icon} Template: ${this.template.name}`,
		});
		titleWrap.createEl("div", {
			cls: "atlas-tplmod-subtitle",
			text: this.template.description,
		});

		const headerBtns = header.createDiv({ cls: "atlas-tplmod-header-btns" });

		const resetBtn = headerBtns.createEl("button", { cls: "atlas-tplmod-reset-btn", text: "↻ Resetar" });
		resetBtn.title = "Restaurar template original";
		resetBtn.addEventListener("click", async () => {
			const { confirmAsync } = await import("../../ui/confirm-modal");
			const ok = await confirmAsync(
				this.app,
				"Descartar mudanças e voltar ao default?",
				{ title: "Resetar template", yesLabel: "Resetar", danger: true }
			);
			if (ok) {
				const original = this.plugin.templateStore
					.list()
					.find((t) => t.id === this.template.id);
				if (original) {
					this.template = JSON.parse(JSON.stringify(original));
					this.refresh();
				}
			}
		});

		const saveBtn = headerBtns.createEl("button", { cls: "atlas-tplmod-save-btn mod-cta", text: "💾 Salvar" });
		saveBtn.addEventListener("click", () => {
			this.plugin.templateStore.upsert(this.template);
			void this.plugin.templateStore.save();
			new Notice(`Atlas: template "${this.template.name}" salvo.`);
			this.close();
		});

		// Two columns: blocks | preview
		const grid = contentEl.createDiv({ cls: "atlas-tplmod-grid" });

		// Left: blocks
		const left = grid.createDiv({ cls: "atlas-tplmod-left-pane" });
		left.createEl("div", {
			cls: "atlas-tplmod-pane-header",
			text: "BLOCKS (drag pra reordenar)",
		});

		this.blocksContainer = left.createDiv() as HTMLDivElement;

		// Add block bar (bottom of left)
		this.renderAddBlockBar(left);

		// Right: preview
		const right = grid.createDiv({ cls: "atlas-tplmod-right-pane" });
		right.createEl("div", {
			cls: "atlas-tplmod-pane-header",
			text: "PREVIEW (markdown renderizado)",
		});

		this.previewEl = right.createEl("pre", { cls: "atlas-tplmod-preview" });

		this.refresh();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private refresh(): void {
		this.renderBlocks();
		this.renderPreview();
	}

	private renderBlocks(): void {
		this.blocksContainer.empty();

		this.template.blocks.forEach((block, idx) => {
			this.renderBlockRow(block, idx);
		});

		if (this.template.blocks.length === 0) {
			this.blocksContainer.createEl("div", {
				cls: "atlas-tplmod-empty",
				text: "Nenhum bloco. Adicione abaixo ↓",
			});
		}
	}

	private renderBlockRow(block: Block, idx: number): void {
		const row = this.blocksContainer.createDiv({ cls: `atlas-tplmod-block-row block-kind-${block.kind}` });
		// Border-left color is dynamic per block kind
		row.style.setProperty("border-left-color", this.colorForKind(block.kind));
		row.draggable = true;
		row.dataset["idx"] = String(idx);

		row.addEventListener("dragstart", (ev) => {
			ev.dataTransfer?.setData("text/plain", String(idx));
			row.addClass("is-dragging");
		});
		row.addEventListener("dragend", () => {
			row.removeClass("is-dragging");
		});
		row.addEventListener("dragover", (ev) => {
			ev.preventDefault();
			row.addClass("is-drop-target");
		});
		row.addEventListener("dragleave", () => {
			row.removeClass("is-drop-target");
		});
		row.addEventListener("drop", (ev) => {
			ev.preventDefault();
			row.removeClass("is-drop-target");
			const fromIdx = parseInt(ev.dataTransfer?.getData("text/plain") ?? "-1", 10);
			if (fromIdx >= 0 && fromIdx !== idx) {
				const moved = this.template.blocks.splice(fromIdx, 1)[0];
				this.template.blocks.splice(idx, 0, moved);
				this.refresh();
			}
		});

		// Top row: drag handle + kind badge + actions
		const topRow = row.createDiv({ cls: "atlas-tplmod-block-top" });

		topRow.createEl("span", { cls: "atlas-tplmod-block-drag", text: "⋮⋮" });

		const kindBadge = topRow.createEl("span", { cls: "atlas-tplmod-block-kind-badge", text: block.kind });
		kindBadge.style.setProperty("background", this.colorForKind(block.kind));

		topRow.createDiv({
			cls: "atlas-tplmod-block-summary",
			text: this.summarizeBlock(block),
		});

		const removeBtn = topRow.createEl("button", { cls: "atlas-tplmod-block-remove", text: "✕" });
		removeBtn.addEventListener("click", () => {
			this.template.blocks = this.template.blocks.filter((_, i) => i !== idx);
			this.refresh();
		});

		// Editable fields
		this.renderBlockFields(row, block);
	}

	private summarizeBlock(b: Block): string {
		switch (b.kind) {
			case "heading":
				return `H${b.level}: ${b.icon ?? ""} ${b.text.substring(0, 50)}`;
			case "text":
				return b.text.substring(0, 60).replace(/\n/g, "↵");
			case "list":
				return `${b.style} (${b.items.length} itens)`;
			case "frontmatter":
				return `${Object.keys(b.fields).length} fields`;
			case "atlas-brief":
				return "Slot dinâmico Atlas";
			case "tasks-placeholder":
				return `Task: ${b.owner ?? "_"} ${b.dueDateOffset !== undefined ? `+${b.dueDateOffset}d` : ""}`;
			case "tags":
				return b.tags.join(", ") || "(vazio)";
			case "callout":
				return `${b.type}: ${b.title ?? ""}`;
			case "code":
				return `${b.lang ?? "text"} (${b.code.length} chars)`;
			case "separator":
				return "---";
		}
	}

	private renderBlockFields(parent: HTMLElement, block: Block): void {
		switch (block.kind) {
			case "heading":
				this.smallInput(parent, "Texto", block.text, (v) => {
					block.text = v;
					this.refresh();
				});
				this.smallInput(parent, "Icon (emoji)", block.icon ?? "", (v) => {
					block.icon = v || undefined;
					this.refresh();
				}, { width: "60px" });
				this.smallSelect(parent, "Level", String(block.level), ["1", "2", "3", "4"], (v) => {
					(block as { level: 1 | 2 | 3 | 4 }).level = parseInt(v, 10) as 1 | 2 | 3 | 4;
					this.refresh();
				});
				break;

			case "text":
				this.smallTextArea(parent, "Conteúdo", block.text, (v) => {
					block.text = v;
					this.refresh();
				});
				break;

			case "list":
				this.smallSelect(parent, "Estilo", block.style, ["bullet", "numbered", "checkbox"], (v) => {
					(block as { style: "bullet" | "numbered" | "checkbox" }).style = v as "bullet" | "numbered" | "checkbox";
					this.refresh();
				});
				this.smallTextArea(
					parent,
					"Itens (1 por linha)",
					block.items.join("\n"),
					(v) => {
						block.items = v.split("\n");
						this.refresh();
					}
				);
				break;

			case "frontmatter": {
				const fmStr = Object.entries(block.fields)
					.map(([k, v]) => `${k}: ${v}`)
					.join("\n");
				this.smallTextArea(parent, "Fields (key: value)", fmStr, (v) => {
					const fields: Record<string, string> = {};
					for (const line of v.split("\n")) {
						const m = line.match(/^([^:]+):\s*(.*)$/);
						if (m) fields[m[1].trim()] = m[2].trim();
					}
					block.fields = fields;
					this.refresh();
				});
				break;
			}

			case "atlas-brief":
				this.smallInput(parent, "Hint", block.hint ?? "", (v) => {
					block.hint = v || undefined;
					this.refresh();
				});
				break;

			case "tasks-placeholder":
				this.smallInput(parent, "Owner", block.owner ?? "", (v) => {
					block.owner = v || undefined;
					this.refresh();
				});
				this.smallInput(
					parent,
					"Dias offset (due)",
					String(block.dueDateOffset ?? ""),
					(v) => {
						const n = parseInt(v, 10);
						block.dueDateOffset = isNaN(n) ? undefined : n;
						this.refresh();
					},
					{ width: "60px" }
				);
				this.smallInput(parent, "Prefix (#tag)", block.prefix ?? "", (v) => {
					block.prefix = v || undefined;
					this.refresh();
				});
				break;

			case "tags":
				this.smallInput(parent, "Tags (separadas por vírgula)", block.tags.join(", "), (v) => {
					block.tags = v.split(",").map((t) => t.trim()).filter(Boolean);
					this.refresh();
				});
				break;

			case "callout":
				this.smallSelect(
					parent,
					"Tipo",
					block.type,
					["note", "tip", "warning", "info", "danger", "important"],
					(v) => {
						block.type = v as typeof block.type;
						this.refresh();
					}
				);
				this.smallInput(parent, "Título", block.title ?? "", (v) => {
					block.title = v || undefined;
					this.refresh();
				});
				this.smallTextArea(parent, "Texto", block.text, (v) => {
					block.text = v;
					this.refresh();
				});
				break;

			case "code":
				this.smallInput(parent, "Lang", block.lang ?? "", (v) => {
					block.lang = v || undefined;
					this.refresh();
				}, { width: "100px" });
				this.smallTextArea(parent, "Code", block.code, (v) => {
					block.code = v;
					this.refresh();
				});
				break;
		}
	}

	private smallInput(
		parent: HTMLElement,
		label: string,
		value: string,
		onChange: (v: string) => void,
		opts?: { width?: string }
	): void {
		const wrap = parent.createDiv({ cls: "atlas-tplmod-field-row" });
		wrap.createEl("label", { cls: "atlas-tplmod-field-label", text: label });
		const inp = wrap.createEl("input", {
			cls: opts?.width ? "atlas-tplmod-field-input is-fixed-width" : "atlas-tplmod-field-input is-flex",
			type: "text",
		}) as HTMLInputElement;
		inp.value = value;
		if (opts?.width) inp.style.setProperty("width", opts.width);
		inp.addEventListener("input", () => onChange(inp.value));
	}

	private smallTextArea(
		parent: HTMLElement,
		label: string,
		value: string,
		onChange: (v: string) => void
	): void {
		const wrap = parent.createDiv({ cls: "atlas-tplmod-textarea-wrap" });
		wrap.createEl("label", { cls: "atlas-tplmod-textarea-label", text: label });
		const ta = wrap.createEl("textarea", { cls: "atlas-tplmod-textarea" }) as HTMLTextAreaElement;
		ta.value = value;
		ta.addEventListener("input", () => onChange(ta.value));
	}

	private smallSelect(
		parent: HTMLElement,
		label: string,
		value: string,
		options: string[],
		onChange: (v: string) => void
	): void {
		const wrap = parent.createDiv({ cls: "atlas-tplmod-field-row" });
		wrap.createEl("label", { cls: "atlas-tplmod-field-label", text: label });
		const sel = wrap.createEl("select", { cls: "atlas-tplmod-select" }) as HTMLSelectElement;
		for (const opt of options) {
			const o = sel.createEl("option", { text: opt, value: opt });
			if (opt === value) o.selected = true;
		}
		sel.addEventListener("change", () => onChange(sel.value));
	}

	private renderAddBlockBar(parent: HTMLElement): void {
		const bar = parent.createDiv({ cls: "atlas-tplmod-add-bar" });
		bar.createEl("div", { cls: "atlas-tplmod-add-title", text: "+ ADICIONAR BLOCO" });
		const grid = bar.createDiv({ cls: "atlas-tplmod-add-grid" });

		const types: { kind: BlockKind; label: string; icon: string }[] = [
			{ kind: "heading", label: "Heading", icon: "#" },
			{ kind: "text", label: "Texto", icon: "T" },
			{ kind: "list", label: "Lista", icon: "≡" },
			{ kind: "frontmatter", label: "Frontmatter", icon: "{}" },
			{ kind: "atlas-brief", label: "Atlas Brief", icon: "🤖" },
			{ kind: "tasks-placeholder", label: "Task", icon: "✓" },
			{ kind: "tags", label: "Tags", icon: "🏷️" },
			{ kind: "callout", label: "Callout", icon: "💡" },
			{ kind: "code", label: "Code", icon: "</>" },
			{ kind: "separator", label: "Separator", icon: "—" },
		];

		for (const t of types) {
			const btn = grid.createEl("button", {
				cls: "atlas-tplmod-add-btn",
				text: `${t.icon} ${t.label}`,
			});
			btn.addEventListener("click", () => this.addBlock(t.kind));
		}
	}

	private addBlock(kind: BlockKind): void {
		const id = `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
		let block: Block;
		switch (kind) {
			case "heading":
				block = { id, kind, level: 2, icon: "", text: "Título" };
				break;
			case "text":
				block = { id, kind, text: "" };
				break;
			case "list":
				block = { id, kind, style: "bullet", items: [""] };
				break;
			case "frontmatter":
				block = { id, kind, fields: {} };
				break;
			case "atlas-brief":
				block = { id, kind };
				break;
			case "tasks-placeholder":
				block = { id, kind, dueDateOffset: 7 };
				break;
			case "tags":
				block = { id, kind, tags: [] };
				break;
			case "callout":
				block = { id, kind, type: "note", text: "" };
				break;
			case "code":
				block = { id, kind, lang: "", code: "" };
				break;
			case "separator":
				block = { id, kind };
				break;
		}
		this.template.blocks.push(block);
		this.refresh();
	}

	private renderPreview(): void {
		const ctx = buildDefaultContext();
		ctx.pessoa = "{{pessoa}}";
		ctx.coachee = "{{coachee}}";
		ctx.titulo = "{{titulo}}";
		try {
			const md = renderTemplate(this.template, ctx);
			this.previewEl.textContent = md;
		} catch (e) {
			this.previewEl.textContent = `Erro: ${String(e)}`;
		}
	}

	private colorForKind(kind: BlockKind): string {
		const colors: Record<BlockKind, string> = {
			heading: "#1976d2",
			text: "#616161",
			list: "#388e3c",
			frontmatter: "#7b1fa2",
			"atlas-brief": "#f57c00",
			"tasks-placeholder": "#00796b",
			tags: "#5d4037",
			callout: "#c62828",
			code: "#455a64",
			separator: "#9e9e9e",
		};
		return colors[kind] ?? "#9e9e9e";
	}
}

/**
 * Modal pra escolher template a editar.
 */
export class TemplatePickerModal extends Modal {
	constructor(app: App, private plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		applyResponsiveModal(contentEl, { preferredWidth: 640 });

		contentEl.createEl("h3", { text: "📐 Templates Atlas" });
		contentEl.createEl("p", {
			cls: "atlas-tplpicker-subtitle",
			text: "Escolha um template para editar visualmente.",
		});

		const list = contentEl.createDiv({ cls: "atlas-tplpicker-list" });

		const templates = this.plugin.templateStore.list();
		for (const t of templates) {
			const card = list.createDiv({ cls: "atlas-tplpicker-card" });

			card.createEl("span", { cls: "atlas-tplpicker-card-icon", text: t.icon });

			const wrap = card.createDiv({ cls: "atlas-tplpicker-card-text" });
			wrap.createEl("div", { cls: "atlas-tplpicker-card-name", text: t.name });
			wrap.createEl("div", { cls: "atlas-tplpicker-card-desc", text: t.description });
			wrap.createEl("div", {
				cls: "atlas-tplpicker-card-meta",
				text: `${t.blocks.length} blocks · ${t.category}`,
			});

			const editBtn = card.createEl("button", { cls: "atlas-tplpicker-edit-btn mod-cta", text: "✏️ Editar" });
			editBtn.addEventListener("click", () => {
				this.close();
				new TemplateEditorModal(this.app, this.plugin, t).open();
			});

			const useBtn = card.createEl("button", { cls: "atlas-tplpicker-use-btn", text: "▶️ Usar" });
			useBtn.addEventListener("click", () => void this.useTemplate(t));
		}

		const newBtn = contentEl.createEl("button", { cls: "atlas-tplpicker-new-btn", text: "+ Novo template" });
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
			this.plugin.templateStore.upsert(newT);
			void this.plugin.templateStore.save();
			this.close();
			new TemplateEditorModal(this.app, this.plugin, newT).open();
		});

		new Setting(contentEl).addButton((b) =>
			b.setButtonText("Fechar").setCta().onClick(() => this.close())
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async useTemplate(t: AtlasTemplate): Promise<void> {
		// Build context com variáveis se promptOnUse
		const ctx = buildDefaultContext();
		for (const v of t.variables) {
			if (v.promptOnUse && v.required) {
				const val = await promptValue(this.app, `${v.label}:`);
				if (!val) {
					new Notice("Atlas: cancelado.");
					return;
				}
				ctx[v.key] = val;
			}
		}

		const md = renderTemplate(t, ctx);

		// Cria nota
		const date = ctx.data ?? new Date().toISOString().split("T")[0];
		const slug = (ctx.pessoa ?? ctx.coachee ?? ctx.titulo ?? t.name)
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");
		const fileName = `${date}-${slug}.md`;

		// Decide folder by category
		const folder = (() => {
			switch (t.category) {
				case "daily":
					return `${this.plugin.settings.folders.daily}/${date.substring(0, 7).replace("-", "/")}`;
				case "meeting":
					return ctx.pessoa
						? `${this.plugin.settings.folders.meetings}/1on1/${ctx.pessoa}`
						: this.plugin.settings.folders.meetings;
				case "coaching":
					return `09_Coaching/sessions`;
				case "report":
					return `${this.plugin.settings.folders.reports}/weekly`;
				default:
					return "01_Inbox";
			}
		})();

		// Ensure folder exists
		const parts = folder.split("/").filter(Boolean);
		let cur = "";
		for (const p of parts) {
			cur = cur ? `${cur}/${p}` : p;
			if (!this.app.vault.getAbstractFileByPath(cur)) {
				try {
					await this.app.vault.createFolder(cur);
				} catch {
					// race
				}
			}
		}

		const path = `${folder}/${fileName}`;
		try {
			const f = await this.app.vault.create(path, md);
			this.close();
			await this.app.workspace.getLeaf().openFile(f);
			new Notice(`Atlas: nota criada com template "${t.name}".`);
		} catch (e) {
			// Talvez já exista, abre
			const existing = this.app.vault.getAbstractFileByPath(path);
			if (existing instanceof TFile) {
				this.close();
				await this.app.workspace.getLeaf().openFile(existing);
			} else {
				new Notice(`Atlas: erro — ${String(e)}`, 8000);
			}
		}
	}
}

async function promptValue(app: App, label: string): Promise<string | null> {
	return new Promise((resolve) => {
		class P extends Modal {
			value = "";
			onOpen(): void {
				const { contentEl } = this;
				contentEl.createEl("h4", { text: label });
				const inp = contentEl.createEl("input", {
					cls: "atlas-tplmod-prompt-input",
					type: "text",
				}) as HTMLInputElement;
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
				new Setting(contentEl)
					.addButton((b) => b.setButtonText("Cancelar").onClick(() => {
						resolve(null);
						this.close();
					}))
					.addButton((b) =>
						b.setButtonText("OK").setCta().onClick(() => {
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
