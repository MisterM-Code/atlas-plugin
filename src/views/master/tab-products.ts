import { Notice, normalizePath, TFile } from "obsidian";
import type AtlasPlugin from "../../../main";
import { SlideOverPanel } from "../../ui/slide-over-panel";
import type { ProductT } from "../../kg/schemas";
import { slugify } from "../../kg/schemas";
import { t } from "../../i18n";
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
	container.addClass("atlas-crud-tab");
	let currentFilter: ProductFilter = "all";
	let currentSearch = "";

	const header = container.createDiv({ cls: "atlas-crud-header" });
	header.createEl("h3", { cls: "atlas-crud-title", text: t("crud.products.title") });

	const headerActions = header.createDiv({ cls: "atlas-crud-header-actions" });
	const addBtn = headerActions.createEl("button", { cls: "atlas-crud-add-btn mod-cta", text: "+ Novo produto" });
	addBtn.addEventListener("click", () => {
		renderProductEditForm(plugin, null, () => void renderProductsTab(container, plugin));
	});

	const refreshBtn = headerActions.createEl("button", { cls: "atlas-crud-refresh-btn", text: "↻" });
	refreshBtn.addEventListener("click", () => void renderProductsTab(container, plugin));

	const filterBar = container.createDiv({ cls: "atlas-crud-filter-bar" });
	const filters: { id: ProductFilter; label: string; icon: string }[] = [
		{ id: "all", label: "Todos", icon: "📋" },
		{ id: "discovery", label: "Discovery", icon: "🔍" },
		{ id: "active", label: "Active", icon: "🚀" },
		{ id: "sunset", label: "Sunset", icon: "🌅" },
		{ id: "killed", label: "Killed", icon: "💀" },
	];

	for (const f of filters) {
		const isActive = currentFilter === f.id;
		const btn = filterBar.createEl("button", {
			cls: isActive ? "atlas-crud-filter-chip is-active" : "atlas-crud-filter-chip",
			text: `${f.icon} ${f.label}`,
		});
		btn.addEventListener("click", () => {
			currentFilter = f.id;
			void renderProductsTab(container, plugin);
		});
	}

	const searchEl = container.createEl("input", {
		cls: "atlas-crud-search",
		type: "search",
		attr: { placeholder: "Buscar produto..." },
	}) as HTMLInputElement;
	searchEl.value = currentSearch;
	searchEl.addEventListener("input", () => {
		currentSearch = searchEl.value;
		renderList();
	});

	const listEl = container.createDiv({ cls: "atlas-crud-list" });

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
			const empty = listEl.createDiv({ cls: "atlas-crud-empty" });
			if (all.length === 0) {
				empty.setText(
					"📦 Nenhum produto. Cadastre os produtos do seu portfolio (ex: Pagamentos B2B, Antifraude)."
				);
				const btn = empty.createEl("button", {
					cls: "atlas-crud-empty-btn mod-cta",
					text: "+ Cadastrar primeiro produto",
				});
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
	const card = parent.createDiv({ cls: `atlas-product-card atlas-status-${product.status}` });

	const header = card.createDiv({ cls: "atlas-product-card-header" });
	header.createEl("span", { cls: "atlas-product-card-icon", text: productStatusEmoji(product.status) });
	header.createEl("div", { cls: "atlas-product-card-name", text: product.name });

	if (product.category) {
		header.createEl("span", { cls: "atlas-product-card-category", text: product.category });
	}

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
	card.createEl("div", { cls: "atlas-product-card-meta", text: parts.join(" · ") });

	if (product.description) {
		card.createEl("div", {
			cls: "atlas-product-card-desc",
			text:
				product.description.length > 100
					? product.description.substring(0, 100) + "…"
					: product.description,
		});
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
				onClick: async () => {
					const { confirmAsync } = await import("../../ui/confirm-modal");
					const ok = await confirmAsync(
						plugin.app,
						`Deletar produto "${product.name}"?`,
						{ title: "Confirmar exclusão", danger: true, yesLabel: "Deletar" }
					);
					if (ok) {
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
				const sec = body.createDiv({ cls: "atlas-product-detail-section" });
				sec.createEl("div", { cls: "atlas-product-detail-section-label", text: "📝 Descrição" });
				sec.createEl("div", { cls: "atlas-product-detail-section-value", text: product.description });
			}

			if (product.systemIds.length > 0) {
				const sec = body.createDiv({ cls: "atlas-product-detail-section" });
				sec.createEl("div", {
					cls: "atlas-product-detail-section-title",
					text: "🖥️ Sistemas relacionados",
				});

				for (const sysId of product.systemIds) {
					const sys = plugin.kg.data.systems.find((s) => s.id === sysId);
					if (!sys) continue;
					sec.createEl("div", {
						cls: "atlas-product-detail-system-row",
						text: `🖥️ ${sys.name} · ${sys.status}`,
					});
				}
			}

			if (product.ownerPersonId) {
				const owner = plugin.kg.data.people.find((p) => p.id === product.ownerPersonId);
				if (owner) {
					const sec = body.createDiv({ cls: "atlas-product-detail-section" });
					sec.createEl("div", { cls: "atlas-product-detail-section-label", text: "👤 Owner" });
					sec.createEl("div", { cls: "atlas-product-detail-section-value", text: owner.name });
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
