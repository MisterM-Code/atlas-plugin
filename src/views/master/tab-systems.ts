import { Notice, normalizePath, TFile } from "obsidian";
import type AtlasPlugin from "../../../main";
import { SlideOverPanel } from "../../ui/slide-over-panel";
import type { SystemT } from "../../kg/schemas";
import { slugify } from "../../kg/schemas";

type SystemFilter = "all" | "healthy" | "degraded" | "down" | "deprecated";

/**
 * Tab Systems — CRUD piloto. Lista + filter + add + edit (slide-over).
 */
export async function renderSystemsTab(container: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	container.empty();
	let currentFilter: SystemFilter = "all";
	let currentSearch = "";

	// Header
	const header = container.createDiv();
	header.style.display = "flex";
	header.style.justifyContent = "space-between";
	header.style.alignItems = "center";
	header.style.marginBottom = "10px";
	header.createEl("h3", { text: "🖥️ Sistemas" }).style.margin = "0";

	const headerActions = header.createDiv();
	headerActions.style.display = "flex";
	headerActions.style.gap = "6px";

	const addBtn = headerActions.createEl("button", { text: "+ Novo sistema" });
	addBtn.addClass("mod-cta");
	addBtn.style.fontSize = "12px";
	addBtn.style.padding = "5px 10px";
	addBtn.addEventListener("click", () => {
		renderSystemEditForm(plugin, null, () => void renderSystemsTab(container, plugin));
	});

	const refreshBtn = headerActions.createEl("button", { text: "↻" });
	refreshBtn.style.fontSize = "12px";
	refreshBtn.style.padding = "5px 10px";
	refreshBtn.addEventListener("click", () => void renderSystemsTab(container, plugin));

	// Filter chips
	const filterBar = container.createDiv();
	filterBar.style.display = "flex";
	filterBar.style.gap = "4px";
	filterBar.style.flexWrap = "wrap";
	filterBar.style.marginBottom = "8px";

	const filters: { id: SystemFilter; label: string; icon: string }[] = [
		{ id: "all", label: "Todos", icon: "📋" },
		{ id: "healthy", label: "Saudável", icon: "🟢" },
		{ id: "degraded", label: "Degradado", icon: "🟡" },
		{ id: "down", label: "Down", icon: "🔴" },
		{ id: "deprecated", label: "Deprecated", icon: "⚫" },
	];

	for (const f of filters) {
		const btn = filterBar.createEl("button", { text: `${f.icon} ${f.label}` });
		btn.style.fontSize = "11px";
		btn.style.padding = "4px 8px";
		btn.style.cursor = "pointer";
		btn.style.borderRadius = "4px";
		btn.style.border = "1px solid var(--background-modifier-border)";
		const isActive = currentFilter === f.id;
		btn.style.background = isActive ? "var(--interactive-accent)" : "var(--background-secondary)";
		btn.style.color = isActive ? "var(--text-on-accent)" : "var(--text-normal)";
		btn.addEventListener("click", () => {
			currentFilter = f.id;
			void renderSystemsTab(container, plugin);
		});
	}

	// Search
	const searchEl = container.createEl("input", {
		type: "search",
		attr: { placeholder: "Buscar por nome, alias ou vendor..." },
	}) as HTMLInputElement;
	searchEl.style.width = "100%";
	searchEl.style.padding = "6px 8px";
	searchEl.style.fontSize = "12px";
	searchEl.style.marginBottom = "10px";
	searchEl.value = currentSearch;
	searchEl.addEventListener("input", () => {
		currentSearch = searchEl.value;
		renderList();
	});

	// List
	const listEl = container.createDiv();
	listEl.style.maxHeight = "calc(100vh - 280px)";
	listEl.style.overflowY = "auto";

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
			const empty = listEl.createDiv();
			empty.style.padding = "32px 16px";
			empty.style.textAlign = "center";
			empty.style.opacity = "0.6";
			if (all.length === 0) {
				empty.setText("🚀 Comece cadastrando seus sistemas: PIX, Stripe, app interno...");
				const btn = empty.createEl("button", { text: "+ Cadastrar primeiro sistema" });
				btn.addClass("mod-cta");
				btn.style.marginTop = "12px";
				btn.style.padding = "8px 16px";
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
	const card = parent.createDiv();
	card.style.padding = "10px 12px";
	card.style.marginBottom = "6px";
	card.style.background = "var(--background-secondary)";
	card.style.borderRadius = "6px";
	card.style.cursor = "pointer";
	card.style.borderLeft = `3px solid ${statusColor(system.status)}`;

	const header = card.createDiv();
	header.style.display = "flex";
	header.style.alignItems = "center";
	header.style.gap = "8px";
	header.style.marginBottom = "4px";

	const dot = header.createEl("span", { text: statusEmoji(system.status) });
	dot.style.fontSize = "12px";

	const name = header.createEl("div", { text: system.name });
	name.style.fontWeight = "bold";
	name.style.fontSize = "13px";
	name.style.flexGrow = "1";

	const typeBadge = header.createEl("span", { text: system.type });
	typeBadge.style.fontSize = "10px";
	typeBadge.style.padding = "2px 6px";
	typeBadge.style.borderRadius = "3px";
	typeBadge.style.background = "var(--background-modifier-hover)";
	typeBadge.style.opacity = "0.7";

	if (system.aliases.length > 0) {
		const aliases = card.createEl("div");
		aliases.style.fontSize = "10px";
		aliases.style.opacity = "0.6";
		aliases.style.marginBottom = "2px";
		aliases.setText(`aliases: ${system.aliases.join(", ")}`);
	}

	if (system.vendor || system.sla) {
		const meta = card.createEl("div");
		meta.style.fontSize = "11px";
		meta.style.opacity = "0.7";
		const parts: string[] = [];
		if (system.vendor) parts.push(`🏢 ${system.vendor}`);
		if (system.sla) parts.push(`⚡ SLA ${system.sla}`);
		if (system.ownerPersonId) {
			const owner = plugin.kg.data.people.find((p) => p.id === system.ownerPersonId);
			if (owner) parts.push(`👤 ${owner.name}`);
		}
		meta.setText(parts.join(" · "));
	}

	if (system.description) {
		const desc = card.createEl("div");
		desc.style.fontSize = "11px";
		desc.style.opacity = "0.65";
		desc.style.marginTop = "4px";
		desc.style.fontStyle = "italic";
		desc.setText(
			system.description.length > 100
				? system.description.substring(0, 100) + "…"
				: system.description
		);
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
				onClick: () => {
					if (confirm(`Atlas: deletar sistema "${system.name}"? Não desfaz.`)) {
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
	const statusRow = body.createDiv();
	statusRow.style.padding = "10px";
	statusRow.style.background = `var(--background-secondary)`;
	statusRow.style.borderLeft = `3px solid ${statusColor(system.status)}`;
	statusRow.style.borderRadius = "4px";
	statusRow.style.marginBottom = "12px";
	statusRow.createEl("div", { text: `${statusEmoji(system.status)} Status: ${system.status}` }).style.fontSize = "13px";
	if (system.sla) {
		statusRow.createEl("div", { text: `SLA: ${system.sla}` }).style.fontSize = "11px";
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
		const sec = body.createDiv();
		sec.style.marginBottom = "12px";
		const h = sec.createEl("div", { text: `🔗 Mencionado em ${mentionedIn.length} notas` });
		h.style.fontSize = "11px";
		h.style.fontWeight = "bold";
		h.style.opacity = "0.7";
		h.style.marginBottom = "6px";
		for (const f of mentionedIn.slice(0, 10)) {
			const row = sec.createEl("div");
			row.style.fontSize = "12px";
			row.style.padding = "3px 6px";
			row.style.cursor = "pointer";
			row.style.borderRadius = "3px";
			row.setText(f.path.split("/").pop()?.replace(/\.md$/, "") ?? f.path);
			row.addEventListener("mouseenter", () => {
				row.style.background = "var(--background-modifier-hover)";
			});
			row.addEventListener("mouseleave", () => {
				row.style.background = "transparent";
			});
			row.addEventListener("click", () => void plugin.app.workspace.getLeaf().openFile(f));
		}
	}
}

function section(parent: HTMLElement, label: string, value: string): void {
	const sec = parent.createDiv();
	sec.style.marginBottom = "10px";
	const h = sec.createEl("div", { text: label });
	h.style.fontSize = "10px";
	h.style.fontWeight = "bold";
	h.style.opacity = "0.6";
	h.style.marginBottom = "2px";
	const v = sec.createEl("div", { text: value });
	v.style.fontSize = "12px";
	v.style.lineHeight = "1.4";
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
			const btns = body.createDiv();
			btns.style.display = "flex";
			btns.style.justifyContent = "flex-end";
			btns.style.gap = "8px";
			btns.style.marginTop = "20px";

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
	const wrap = parent.createDiv();
	wrap.style.marginBottom = "12px";
	const lbl = wrap.createEl("label", { text: label });
	lbl.style.fontSize = "11px";
	lbl.style.fontWeight = "bold";
	lbl.style.opacity = "0.7";
	lbl.style.display = "block";
	lbl.style.marginBottom = "4px";

	const inp = wrap.createEl("input", { type: "text" }) as HTMLInputElement;
	inp.value = value;
	if (opts?.placeholder) inp.placeholder = opts.placeholder;
	inp.style.width = "100%";
	inp.style.padding = "6px 8px";
	inp.style.fontSize = "12px";
	inp.addEventListener("input", () => onChange(inp.value));
}

function textArea(
	parent: HTMLElement,
	label: string,
	value: string,
	onChange: (v: string) => void,
	opts?: { placeholder?: string }
): void {
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
	ta.style.minHeight = "60px";
	ta.style.padding = "6px 8px";
	ta.style.fontSize = "12px";
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
