import { Notice, normalizePath, TFile } from "obsidian";
import type AtlasPlugin from "../../../main";
import { SlideOverPanel } from "../../ui/slide-over-panel";
import type { SystemT } from "../../kg/schemas";
import { slugify } from "../../kg/schemas";
import { t } from "../../i18n";

type SystemFilter = "all" | "healthy" | "degraded" | "down" | "deprecated";

/**
 * Tab Systems — CRUD piloto. Lista + filter + add + edit (slide-over).
 */
export async function renderSystemsTab(container: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	container.empty();
	container.addClass("atlas-crud-tab");
	let currentFilter: SystemFilter = "all";
	let currentSearch = "";

	// Header
	const header = container.createDiv({ cls: "atlas-crud-header" });
	header.createEl("h3", { cls: "atlas-crud-title", text: t("crud.systems.title") });

	const headerActions = header.createDiv({ cls: "atlas-crud-header-actions" });

	const addBtn = headerActions.createEl("button", { cls: "atlas-crud-add-btn mod-cta", text: "+ Novo sistema" });
	addBtn.addEventListener("click", () => {
		renderSystemEditForm(plugin, null, () => void renderSystemsTab(container, plugin));
	});

	const refreshBtn = headerActions.createEl("button", { cls: "atlas-crud-refresh-btn", text: "↻" });
	refreshBtn.addEventListener("click", () => void renderSystemsTab(container, plugin));

	// Filter chips
	const filterBar = container.createDiv({ cls: "atlas-crud-filter-bar" });

	const filters: { id: SystemFilter; label: string; icon: string }[] = [
		{ id: "all", label: "Todos", icon: "📋" },
		{ id: "healthy", label: "Saudável", icon: "🟢" },
		{ id: "degraded", label: "Degradado", icon: "🟡" },
		{ id: "down", label: "Down", icon: "🔴" },
		{ id: "deprecated", label: "Deprecated", icon: "⚫" },
	];

	for (const f of filters) {
		const isActive = currentFilter === f.id;
		const btn = filterBar.createEl("button", {
			cls: isActive ? "atlas-crud-filter-chip is-active" : "atlas-crud-filter-chip",
			text: `${f.icon} ${f.label}`,
		});
		btn.addEventListener("click", () => {
			currentFilter = f.id;
			void renderSystemsTab(container, plugin);
		});
	}

	// Search
	const searchEl = container.createEl("input", {
		cls: "atlas-crud-search",
		type: "search",
		attr: { placeholder: "Buscar por nome, alias ou vendor..." },
	}) as HTMLInputElement;
	searchEl.value = currentSearch;
	searchEl.addEventListener("input", () => {
		currentSearch = searchEl.value;
		renderList();
	});

	// List
	const listEl = container.createDiv({ cls: "atlas-crud-list" });

	const renderList = () => {
		listEl.empty();
		const all = plugin.kg.listSystems();
		const filtered = all.filter((s) => {
			if (currentFilter !== "all" && s.status !== currentFilter) return false;
			if (currentSearch) {
				const q = currentSearch.toLowerCase();
				const matches =
					s.name.toLowerCase().includes(q) ||
					s.aliases.some((a) => a.toLowerCase().includes(q)) ||
					(s.vendor ?? "").toLowerCase().includes(q);
				if (!matches) return false;
			}
			return true;
		});

		if (filtered.length === 0) {
			const empty = listEl.createDiv({ cls: "atlas-crud-empty" });
			if (all.length === 0) {
				empty.setText("🚀 Comece cadastrando seus sistemas: PIX, Stripe, app interno...");
				const btn = empty.createEl("button", {
					cls: "atlas-crud-empty-btn mod-cta",
					text: "+ Cadastrar primeiro sistema",
				});
				btn.addEventListener("click", () => {
					renderSystemEditForm(plugin, null, () => renderList());
				});
			} else {
				empty.setText("Nenhum sistema com esses filtros.");
			}
			return;
		}

		for (const s of filtered) {
			renderSystemCard(listEl, s, plugin, () => renderList());
		}
	};

	renderList();
}

function renderSystemCard(
	parent: HTMLElement,
	system: SystemT,
	plugin: AtlasPlugin,
	onChange: () => void
): void {
	const statusCls = `atlas-card-system-${system.status}`;
	const card = parent.createDiv({ cls: `atlas-system-card atlas-card-interactive ${statusCls}` });

	const header = card.createDiv({ cls: "atlas-system-card-header" });
	header.createEl("span", { cls: "atlas-system-card-dot", text: statusEmoji(system.status) });
	header.createEl("div", { cls: "atlas-system-card-name", text: system.name });
	header.createEl("span", { cls: "atlas-system-card-type-badge", text: system.type });

	if (system.aliases.length > 0) {
		card.createEl("div", {
			cls: "atlas-system-card-aliases",
			text: `aliases: ${system.aliases.join(", ")}`,
		});
	}

	if (system.vendor || system.sla) {
		const parts: string[] = [];
		if (system.vendor) parts.push(`🏢 ${system.vendor}`);
		if (system.sla) parts.push(`⚡ SLA ${system.sla}`);
		if (system.ownerPersonId) {
			const owner = plugin.kg.data.people.find((p) => p.id === system.ownerPersonId);
			if (owner) parts.push(`👤 ${owner.name}`);
		}
		card.createEl("div", { cls: "atlas-system-card-meta", text: parts.join(" · ") });
	}

	if (system.description) {
		card.createEl("div", {
			cls: "atlas-system-card-desc",
			text:
				system.description.length > 100
					? system.description.substring(0, 100) + "…"
					: system.description,
		});
	}

	card.addEventListener("click", () => {
		renderSystemDetailPanel(plugin, system, onChange);
	});
}

/**
 * Slide-over com detalhe + edit + delete.
 */
function renderSystemDetailPanel(
	plugin: AtlasPlugin,
	system: SystemT,
	onChange: () => void
): void {
	const panel = new SlideOverPanel({
		title: system.name,
		subtitle: `${system.type} · ${system.status}`,
		icon: statusEmoji(system.status),
		actions: [
			{
				icon: "✏️",
				title: "Editar",
				onClick: () => {
					panel.close();
					renderSystemEditForm(plugin, system, onChange);
				},
			},
			{
				icon: "🗑️",
				title: "Deletar",
				onClick: async () => {
					const { confirmAsync } = await import("../../ui/confirm-modal");
					const ok = await confirmAsync(
						plugin.app,
						`Deletar sistema "${system.name}"? Não desfaz.`,
						{ title: "Confirmar exclusão", danger: true, yesLabel: "Deletar" }
					);
					if (ok) {
						plugin.kg.deleteSystem(system.id);
						void plugin.kg.save();
						panel.close();
						onChange();
						new Notice(`Atlas: sistema "${system.name}" deletado.`);
					}
				},
			},
			{
				icon: "📄",
				title: "Abrir nota",
				onClick: async () => {
					if (system.notePath) {
						const f = plugin.app.vault.getAbstractFileByPath(system.notePath);
						if (f instanceof TFile) {
							panel.close();
							await plugin.app.workspace.getLeaf().openFile(f);
						}
					} else {
						new Notice("Atlas: nenhuma nota associada.");
					}
				},
			},
		],
		render: (body) => renderSystemDetailContent(body, plugin, system),
	});
	void panel.open();
}

function renderSystemDetailContent(
	body: HTMLElement,
	plugin: AtlasPlugin,
	system: SystemT
): void {
	// Status row
	const statusRow = body.createDiv({ cls: `atlas-system-detail-status atlas-status-${system.status}` });
	statusRow.createEl("div", {
		cls: "atlas-system-detail-status-text",
		text: `${statusEmoji(system.status)} Status: ${system.status}`,
	});
	if (system.sla) {
		statusRow.createEl("div", { cls: "atlas-system-detail-status-sla", text: `SLA: ${system.sla}` });
	}

	// Vendor
	if (system.vendor) {
		section(body, "🏢 Vendor", system.vendor);
	}

	// Owner
	if (system.ownerPersonId) {
		const owner = plugin.kg.data.people.find((p) => p.id === system.ownerPersonId);
		if (owner) {
			section(body, "👤 Owner", owner.name);
		}
	}

	if (system.description) {
		section(body, "📝 Descrição", system.description);
	}

	if (system.aliases.length > 0) {
		section(body, "🔤 Aliases", system.aliases.join(", "));
	}

	if (system.tags.length > 0) {
		section(body, "🏷️ Tags", system.tags.map((t) => `#${t}`).join(" "));
	}

	// Backlinks (notas que mencionam esse sistema)
	const allFiles = plugin.app.vault.getMarkdownFiles();
	const aliasRegex = new RegExp(
		[system.name, ...system.aliases]
			.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
			.join("|"),
		"i"
	);
	const mentionedIn: TFile[] = [];
	for (const f of allFiles) {
		if (f.path.startsWith(".atlas") || f.path === system.notePath) continue;
		const cache = plugin.app.metadataCache.getFileCache(f);
		const fmSystems = cache?.frontmatter?.systems;
		if (Array.isArray(fmSystems) && fmSystems.includes(system.name)) {
			mentionedIn.push(f);
			continue;
		}
		// Fallback regex scan (limit pra performance)
		if (mentionedIn.length < 30) {
			try {
				const txt = (cache?.frontmatter ? "" : "") + f.basename;
				if (aliasRegex.test(txt)) mentionedIn.push(f);
			} catch {
				// noop
			}
		}
	}

	if (mentionedIn.length > 0) {
		const sec = body.createDiv({ cls: "atlas-system-detail-mentions" });
		sec.createEl("div", {
			cls: "atlas-system-detail-mentions-title",
			text: `🔗 Mencionado em ${mentionedIn.length} notas`,
		});
		for (const f of mentionedIn.slice(0, 10)) {
			const row = sec.createEl("div", {
				cls: "atlas-system-detail-mention-row",
				text: f.path.split("/").pop()?.replace(/\.md$/, "") ?? f.path,
			});
			row.addEventListener("click", () => void plugin.app.workspace.getLeaf().openFile(f));
		}
	}
}

function section(parent: HTMLElement, label: string, value: string): void {
	const sec = parent.createDiv({ cls: "atlas-system-detail-section" });
	sec.createEl("div", { cls: "atlas-system-detail-section-label", text: label });
	sec.createEl("div", { cls: "atlas-system-detail-section-value", text: value });
}

/**
 * Form de criação/edição via slide-over.
 * @param existing — se null, cria novo
 */
export function renderSystemEditForm(
	plugin: AtlasPlugin,
	existing: SystemT | null,
	onSave?: () => void
): void {
	const isNew = existing === null;
	const draft: Partial<SystemT> = existing
		? { ...existing }
		: {
				name: "",
				aliases: [],
				type: "other",
				status: "healthy",
				tags: [],
		  };

	const panel = new SlideOverPanel({
		title: isNew ? "Novo sistema" : `Editar: ${existing.name}`,
		icon: "🖥️",
		render: (body) => {
			body.empty();

			// Name
			input(body, "Nome *", draft.name ?? "", (v) => (draft.name = v), {
				placeholder: "PIX",
				required: true,
			});

			// Aliases
			const aliasStr = (draft.aliases ?? []).join(", ");
			input(
				body,
				"Aliases (separados por vírgula)",
				aliasStr,
				(v) => {
					draft.aliases = v
						.split(",")
						.map((a) => a.trim())
						.filter(Boolean);
				},
				{ placeholder: "pix, PIX BR, instant payment" }
			);

			// Type
			selectInput(
				body,
				"Tipo",
				draft.type ?? "other",
				[
					"payment",
					"core",
					"internal-tool",
					"vendor",
					"platform",
					"data",
					"security",
					"other",
				],
				(v) => (draft.type = v as SystemT["type"])
			);

			// Status
			selectInput(
				body,
				"Status",
				draft.status ?? "healthy",
				["healthy", "degraded", "down", "deprecated", "deprecated-soon"],
				(v) => (draft.status = v as SystemT["status"])
			);

			// Vendor
			input(body, "Vendor", draft.vendor ?? "", (v) => (draft.vendor = v), {
				placeholder: "BCB, Stripe Inc., interno",
			});

			// SLA
			input(body, "SLA", draft.sla ?? "", (v) => (draft.sla = v), {
				placeholder: "99.9%",
			});

			// Owner
			const owners = plugin.kg.listPeople();
			selectInput(
				body,
				"Owner",
				draft.ownerPersonId ?? "",
				["", ...owners.map((p) => p.id)],
				(v) => (draft.ownerPersonId = v || undefined),
				owners.map((p) => p.name)
			);

			// Description
			textArea(body, "Descrição", draft.description ?? "", (v) => (draft.description = v), {
				placeholder: "O que é, por que importa, links…",
			});

			// Tags
			const tagStr = (draft.tags ?? []).join(", ");
			input(body, "Tags (separadas por vírgula)", tagStr, (v) => {
				draft.tags = v
					.split(",")
					.map((t) => t.trim().replace(/^#/, ""))
					.filter(Boolean);
			});

			// Buttons
			const btns = body.createDiv({ cls: "atlas-crud-form-actions" });
			const cancel = btns.createEl("button", { text: "Cancelar" });
			cancel.addEventListener("click", () => panel.close());

			const save = btns.createEl("button", { text: isNew ? "Criar sistema" : "Salvar" });
			save.addClass("mod-cta");
			save.addEventListener("click", () => {
				if (!draft.name?.trim()) {
					new Notice("Atlas: nome é obrigatório.");
					return;
				}
				const saved = plugin.kg.upsertSystem({
					id: existing?.id ?? slugify(draft.name),
					name: draft.name.trim(),
					aliases: draft.aliases ?? [],
					type: draft.type ?? "other",
					status: draft.status ?? "healthy",
					vendor: draft.vendor || undefined,
					ownerPersonId: draft.ownerPersonId,
					sla: draft.sla || undefined,
					description: draft.description || undefined,
					tags: draft.tags ?? [],
					notePath: existing?.notePath,
				});
				void plugin.kg.save();

				// Cria nota associada se for novo
				if (isNew && !saved.notePath) {
					void createSystemNote(plugin, saved);
				}

				new Notice(`Atlas: sistema "${saved.name}" ${isNew ? "criado" : "salvo"}.`);
				panel.close();
				onSave?.();
			});
		},
	});

	void panel.open();
}

async function createSystemNote(plugin: AtlasPlugin, system: SystemT): Promise<void> {
	const folder = `${plugin.settings.folders.projects}/systems`;
	if (!plugin.app.vault.getAbstractFileByPath(folder)) {
		await plugin.app.vault.createFolder(folder);
	}
	const path = normalizePath(`${folder}/${system.id}.md`);
	const md = `---
type: system
name: ${JSON.stringify(system.name)}
aliases: ${JSON.stringify(system.aliases)}
system_type: ${system.type}
status: ${system.status}
vendor: ${system.vendor ? JSON.stringify(system.vendor) : "null"}
sla: ${system.sla ? JSON.stringify(system.sla) : "null"}
tags: ${JSON.stringify(system.tags)}
created_by: atlas
---

# 🖥️ ${system.name}

${system.description ?? "_Sem descrição._"}

## 🔗 Notas que mencionam este sistema
\`\`\`dataview
LIST
FROM ""
WHERE contains(systems, "${system.name}")
SORT file.mtime DESC
\`\`\`

## 📝 Eventos / Histórico
-

## 🚨 Incidentes
\`\`\`dataview
LIST
FROM "08_Incidents"
WHERE contains(systems, "${system.name}")
\`\`\`
`;
	await plugin.app.vault.create(path, md);

	// Update KG with notePath
	plugin.kg.upsertSystem({ id: system.id, name: system.name, notePath: path });
	await plugin.kg.save();
}

// ──────────────────────────────────────────────────────────────────
// Form helpers

function input(
	parent: HTMLElement,
	label: string,
	value: string,
	onChange: (v: string) => void,
	opts?: { placeholder?: string; required?: boolean }
): void {
	const wrap = parent.createDiv({ cls: "atlas-form-field" });
	wrap.createEl("label", { cls: "atlas-form-label", text: label });

	const inp = wrap.createEl("input", { cls: "atlas-form-input", type: "text" }) as HTMLInputElement;
	inp.value = value;
	if (opts?.placeholder) inp.placeholder = opts.placeholder;
	inp.addEventListener("input", () => onChange(inp.value));
}

function textArea(
	parent: HTMLElement,
	label: string,
	value: string,
	onChange: (v: string) => void,
	opts?: { placeholder?: string }
): void {
	const wrap = parent.createDiv({ cls: "atlas-form-field" });
	wrap.createEl("label", { cls: "atlas-form-label", text: label });

	const ta = wrap.createEl("textarea", { cls: "atlas-form-textarea" }) as HTMLTextAreaElement;
	ta.value = value;
	if (opts?.placeholder) ta.placeholder = opts.placeholder;
	ta.addEventListener("input", () => onChange(ta.value));
}

function selectInput(
	parent: HTMLElement,
	label: string,
	value: string,
	options: string[],
	onChange: (v: string) => void,
	displayLabels?: string[]
): void {
	const wrap = parent.createDiv({ cls: "atlas-form-field" });
	wrap.createEl("label", { cls: "atlas-form-label", text: label });

	const sel = wrap.createEl("select", { cls: "atlas-form-select" }) as HTMLSelectElement;
	options.forEach((opt, i) => {
		const optEl = sel.createEl("option", {
			text: opt === "" ? "—" : (displayLabels?.[i] ?? opt),
			value: opt,
		});
		if (opt === value) optEl.selected = true;
	});
	sel.addEventListener("change", () => onChange(sel.value));
}

// ──────────────────────────────────────────────────────────────────
// Status helpers

function statusColor(status: SystemT["status"]): string {
	switch (status) {
		case "healthy":
			return "var(--color-green)";
		case "degraded":
			return "var(--color-orange)";
		case "down":
			return "var(--color-red)";
		case "deprecated":
		case "deprecated-soon":
			return "var(--text-muted)";
	}
}

function statusEmoji(status: SystemT["status"]): string {
	switch (status) {
		case "healthy":
			return "🟢";
		case "degraded":
			return "🟡";
		case "down":
			return "🔴";
		case "deprecated":
		case "deprecated-soon":
			return "⚫";
	}
}
