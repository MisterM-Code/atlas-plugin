import { Notice, normalizePath, TFile } from "obsidian";
import type AtlasPlugin from "../../../main";
import { SlideOverPanel } from "../../ui/slide-over-panel";
import type { ProductT } from "../../kg/schemas";
import { slugify } from "../../kg/schemas";
import {
	fieldInput,
	fieldTextArea,
	fieldSelect,
	fieldMultiSelect,
	formButtons,
} from "../../ui/form-fields";

type ProductFilter = "all" | "discovery" | "active" | "sunset" | "killed";

export async function renderProductsTab(
	container: HTMLElement,
	plugin: AtlasPlugin
): Promise<void> {
	container.empty();
	let currentFilter: ProductFilter = "all";
	let currentSearch = "";

	const header = container.createDiv();
	header.style.display = "flex";
	header.style.justifyContent = "space-between";
	header.style.alignItems = "center";
	header.style.marginBottom = "10px";
	header.createEl("h3", { text: "📦 Produtos" }).style.margin = "0";

	const headerActions = header.createDiv();
	headerActions.style.display = "flex";
	headerActions.style.gap = "6px";

	const addBtn = headerActions.createEl("button", { text: "+ Novo produto" });
	addBtn.addClass("mod-cta");
	addBtn.style.fontSize = "12px";
	addBtn.style.padding = "5px 10px";
	addBtn.addEventListener("click", () => {
		renderProductEditForm(plugin, null, () => void renderProductsTab(container, plugin));
	});

	const refreshBtn = headerActions.createEl("button", { text: "↻" });
	refreshBtn.style.fontSize = "12px";
	refreshBtn.style.padding = "5px 10px";
	refreshBtn.addEventListener("click", () => void renderProductsTab(container, plugin));

	// Filter chips
	const filterBar = container.createDiv();
	filterBar.style.display = "flex";
	filterBar.style.gap = "4px";
	filterBar.style.flexWrap = "wrap";
	filterBar.style.marginBottom = "8px";

	const filters: { id: ProductFilter; label: string; icon: string }[] = [
		{ id: "all", label: "Todos", icon: "📋" },
		{ id: "discovery", label: "Discovery", icon: "🔍" },
		{ id: "active", label: "Active", icon: "🚀" },
		{ id: "sunset", label: "Sunset", icon: "🌅" },
		{ id: "killed", label: "Killed", icon: "💀" },
	];

	for (const f of filters) {
		const btn = filterBar.createEl("button", { text: `${f.icon} ${f.label}` });
		btn.style.fontSize = "11px";
		btn.style.padding = "4px 8px";
		btn.style.cursor = "pointer";
		btn.style.borderRadius = "4px";
		btn.style.border = "1px solid var(--background-modifier-border)";
		const isActive = currentFilter === f.id;
		btn.style.background = isActive
			? "var(--interactive-accent)"
			: "var(--background-secondary)";
		btn.style.color = isActive ? "var(--text-on-accent)" : "var(--text-normal)";
		btn.addEventListener("click", () => {
			currentFilter = f.id;
			void renderProductsTab(container, plugin);
		});
	}

	const searchEl = container.createEl("input", {
		type: "search",
		attr: { placeholder: "Buscar produto..." },
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

	const listEl = container.createDiv();
	listEl.style.maxHeight = "calc(100vh - 280px)";
	listEl.style.overflowY = "auto";

	const renderList = () => {
		listEl.empty();
		const all = plugin.kg.listProducts();
		const filtered = all.filter((p) => {
			if (currentFilter !== "all" && p.status !== currentFilter) return false;
			if (currentSearch) {
				const q = currentSearch.toLowerCase();
				if (
					!p.name.toLowerCase().includes(q) &&
					!(p.category ?? "").toLowerCase().includes(q)
				) {
					return false;
				}
			}
			return true;
		});

		if (filtered.length === 0) {
			const empty = listEl.createDiv();
			empty.style.padding = "32px 16px";
			empty.style.textAlign = "center";
			empty.style.opacity = "0.6";
			if (all.length === 0) {
				empty.setText(
					"📦 Nenhum produto. Cadastre os produtos do seu portfolio (ex: Pagamentos B2B, Antifraude)."
				);
				const btn = empty.createEl("button", { text: "+ Cadastrar primeiro produto" });
				btn.addClass("mod-cta");
				btn.style.marginTop = "12px";
				btn.style.padding = "8px 16px";
				btn.addEventListener("click", () => {
					renderProductEditForm(plugin, null, () => renderList());
				});
			} else {
				empty.setText("Nenhum produto com esses filtros.");
			}
			return;
		}

		for (const p of filtered) {
			renderProductCard(listEl, p, plugin, () => renderList());
		}
	};

	renderList();
}

function renderProductCard(
	parent: HTMLElement,
	product: ProductT,
	plugin: AtlasPlugin,
	onChange: () => void
): void {
	const card = parent.createDiv();
	card.style.padding = "10px 12px";
	card.style.marginBottom = "6px";
	card.style.background = "var(--background-secondary)";
	card.style.borderRadius = "6px";
	card.style.cursor = "pointer";
	card.style.borderLeft = `3px solid ${productStatusColor(product.status)}`;

	const header = card.createDiv();
	header.style.display = "flex";
	header.style.alignItems = "center";
	header.style.gap = "8px";
	header.style.marginBottom = "4px";

	const icon = header.createEl("span", { text: productStatusEmoji(product.status) });
	icon.style.fontSize = "12px";

	const name = header.createEl("div", { text: product.name });
	name.style.fontWeight = "bold";
	name.style.fontSize = "13px";
	name.style.flexGrow = "1";

	if (product.category) {
		const cat = header.createEl("span", { text: product.category });
		cat.style.fontSize = "10px";
		cat.style.padding = "2px 6px";
		cat.style.borderRadius = "3px";
		cat.style.background = "var(--background-modifier-hover)";
		cat.style.opacity = "0.7";
	}

	const meta = card.createEl("div");
	meta.style.fontSize = "11px";
	meta.style.opacity = "0.7";
	const parts: string[] = [];
	parts.push(`status: ${product.status}`);
	if (product.systemIds.length > 0) {
		const sysNames = product.systemIds
			.map((id) => plugin.kg.data.systems.find((s) => s.id === id)?.name)
			.filter(Boolean);
		if (sysNames.length > 0) parts.push(`🖥️ ${sysNames.join(", ")}`);
	}
	if (product.ownerPersonId) {
		const owner = plugin.kg.data.people.find((p) => p.id === product.ownerPersonId);
		if (owner) parts.push(`👤 ${owner.name}`);
	}
	meta.setText(parts.join(" · "));

	if (product.description) {
		const desc = card.createEl("div");
		desc.style.fontSize = "11px";
		desc.style.opacity = "0.65";
		desc.style.marginTop = "4px";
		desc.style.fontStyle = "italic";
		desc.setText(
			product.description.length > 100
				? product.description.substring(0, 100) + "…"
				: product.description
		);
	}

	card.addEventListener("click", () => {
		renderProductDetailPanel(plugin, product, onChange);
	});
}

function renderProductDetailPanel(
	plugin: AtlasPlugin,
	product: ProductT,
	onChange: () => void
): void {
	const panel = new SlideOverPanel({
		title: product.name,
		subtitle: `${product.category ?? "produto"} · ${product.status}`,
		icon: "📦",
		actions: [
			{
				icon: "✏️",
				title: "Editar",
				onClick: () => {
					panel.close();
					renderProductEditForm(plugin, product, onChange);
				},
			},
			{
				icon: "🗑️",
				title: "Deletar",
				onClick: () => {
					if (confirm(`Atlas: deletar produto "${product.name}"?`)) {
						plugin.kg.deleteProduct(product.id);
						void plugin.kg.save();
						panel.close();
						onChange();
						new Notice(`Atlas: produto "${product.name}" deletado.`);
					}
				},
			},
			{
				icon: "📄",
				title: "Abrir nota",
				onClick: async () => {
					if (product.notePath) {
						const f = plugin.app.vault.getAbstractFileByPath(product.notePath);
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
		render: (body) => {
			body.empty();

			if (product.description) {
				const sec = body.createDiv();
				sec.style.marginBottom = "12px";
				sec.createEl("div", { text: "📝 Descrição" }).style.opacity = "0.6";
				const v = sec.createEl("div", { text: product.description });
				v.style.fontSize = "12px";
				v.style.lineHeight = "1.4";
			}

			if (product.systemIds.length > 0) {
				const sec = body.createDiv();
				sec.style.marginBottom = "12px";
				const h = sec.createEl("div", { text: "🖥️ Sistemas relacionados" });
				h.style.fontSize = "11px";
				h.style.fontWeight = "bold";
				h.style.opacity = "0.6";
				h.style.marginBottom = "4px";

				for (const sysId of product.systemIds) {
					const sys = plugin.kg.data.systems.find((s) => s.id === sysId);
					if (!sys) continue;
					const row = sec.createEl("div");
					row.style.padding = "4px 8px";
					row.style.background = "var(--background-secondary)";
					row.style.borderRadius = "4px";
					row.style.marginBottom = "3px";
					row.style.fontSize = "12px";
					row.setText(`🖥️ ${sys.name} · ${sys.status}`);
				}
			}

			if (product.ownerPersonId) {
				const owner = plugin.kg.data.people.find((p) => p.id === product.ownerPersonId);
				if (owner) {
					const sec = body.createDiv();
					sec.style.marginBottom = "12px";
					sec.createEl("div", { text: "👤 Owner" }).style.opacity = "0.6";
					sec.createEl("div", { text: owner.name }).style.fontSize = "12px";
				}
			}
		},
	});
	void panel.open();
}

export function renderProductEditForm(
	plugin: AtlasPlugin,
	existing: ProductT | null,
	onSave?: () => void
): void {
	const isNew = existing === null;
	const draft: Partial<ProductT> = existing
		? { ...existing }
		: { name: "", systemIds: [], status: "active" };

	const panel = new SlideOverPanel({
		title: isNew ? "Novo produto" : `Editar: ${existing.name}`,
		icon: "📦",
		render: (body) => {
			body.empty();

			fieldInput(body, "Nome *", draft.name ?? "", (v) => (draft.name = v), {
				placeholder: "Pagamentos B2B",
			});
			fieldInput(body, "Categoria", draft.category ?? "", (v) => (draft.category = v), {
				placeholder: "core, periférico, experimento",
			});

			fieldSelect(
				body,
				"Status",
				draft.status ?? "active",
				["discovery", "active", "sunset", "killed"],
				(v) => (draft.status = v as ProductT["status"])
			);

			const owners = plugin.kg.listPeople();
			fieldSelect(
				body,
				"Owner",
				draft.ownerPersonId ?? "",
				["", ...owners.map((p) => p.id)],
				(v) => (draft.ownerPersonId = v || undefined),
				["—", ...owners.map((p) => p.name)]
			);

			fieldMultiSelect(
				body,
				"Sistemas relacionados",
				draft.systemIds ?? [],
				plugin.kg.listSystems().map((s) => ({ id: s.id, label: s.name })),
				(v) => (draft.systemIds = v)
			);

			fieldTextArea(
				body,
				"Descrição",
				draft.description ?? "",
				(v) => (draft.description = v),
				{ placeholder: "O que é, valor entregue, métricas..." }
			);

			formButtons(
				body,
				isNew ? "Criar produto" : "Salvar",
				async () => {
					if (!draft.name?.trim()) {
						new Notice("Atlas: nome é obrigatório.");
						return;
					}
					const saved = plugin.kg.upsertProduct({
						id: existing?.id ?? slugify(draft.name),
						name: draft.name.trim(),
						category: draft.category || undefined,
						ownerPersonId: draft.ownerPersonId,
						systemIds: draft.systemIds ?? [],
						status: draft.status ?? "active",
						description: draft.description || undefined,
						notePath: existing?.notePath,
					});
					await plugin.kg.save();

					if (isNew && !saved.notePath) {
						await createProductNote(plugin, saved);
					}

					new Notice(`Atlas: produto "${saved.name}" ${isNew ? "criado" : "salvo"}.`);
					panel.close();
					onSave?.();
				},
				() => panel.close()
			);
		},
	});

	void panel.open();
}

async function createProductNote(plugin: AtlasPlugin, product: ProductT): Promise<void> {
	const folder = `${plugin.settings.folders.projects}/products`;
	if (!plugin.app.vault.getAbstractFileByPath(folder)) {
		await plugin.app.vault.createFolder(folder);
	}
	const path = normalizePath(`${folder}/${product.id}.md`);
	const md = `---
type: product
name: ${JSON.stringify(product.name)}
category: ${product.category ? JSON.stringify(product.category) : "null"}
status: ${product.status}
systems: ${JSON.stringify(
		product.systemIds
			.map((id) => plugin.kg.data.systems.find((s) => s.id === id)?.name)
			.filter(Boolean)
	)}
created_by: atlas
---

# 📦 ${product.name}

${product.description ?? "_Sem descrição._"}

## 🖥️ Sistemas
${product.systemIds
	.map((id) => {
		const sys = plugin.kg.data.systems.find((s) => s.id === id);
		return sys ? `- [[${sys.notePath?.replace(/\.md$/, "") ?? sys.name}|${sys.name}]]` : "";
	})
	.filter(Boolean)
	.join("\n") || "_Nenhum sistema associado._"}

## 📝 Notas relacionadas
\`\`\`dataview
LIST
FROM ""
WHERE contains(products, "${product.name}")
\`\`\`
`;
	await plugin.app.vault.create(path, md);
	plugin.kg.upsertProduct({ id: product.id, name: product.name, notePath: path });
	await plugin.kg.save();
}

function productStatusColor(status: ProductT["status"]): string {
	switch (status) {
		case "discovery":
			return "var(--color-blue)";
		case "active":
			return "var(--color-green)";
		case "sunset":
			return "var(--color-orange)";
		case "killed":
			return "var(--text-muted)";
	}
}

function productStatusEmoji(status: ProductT["status"]): string {
	switch (status) {
		case "discovery":
			return "🔍";
		case "active":
			return "🚀";
		case "sunset":
			return "🌅";
		case "killed":
			return "💀";
	}
}
