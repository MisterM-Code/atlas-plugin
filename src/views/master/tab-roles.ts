import { Notice, normalizePath, TFile } from "obsidian";
import type AtlasPlugin from "../../../main";
import { SlideOverPanel } from "../../ui/slide-over-panel";
import type { RoleT } from "../../kg/schemas";
import { slugify } from "../../kg/schemas";
import { fieldInput, fieldTextArea, fieldSelect, formButtons } from "../../ui/form-fields";

export async function renderRolesTab(container: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	container.empty();
	container.addClass("atlas-crud-tab");
	let currentSearch = "";

	const header = container.createDiv({ cls: "atlas-crud-header" });
	header.createEl("h3", { cls: "atlas-crud-title", text: "🎓 Cargos" });

	const headerActions = header.createDiv({ cls: "atlas-crud-header-actions" });

	const addBtn = headerActions.createEl("button", { cls: "atlas-crud-add-btn mod-cta", text: "+ Novo cargo" });
	addBtn.addEventListener("click", () => {
		renderRoleEditForm(plugin, null, () => void renderRolesTab(container, plugin));
	});

	const refreshBtn = headerActions.createEl("button", { cls: "atlas-crud-refresh-btn", text: "↻" });
	refreshBtn.addEventListener("click", () => void renderRolesTab(container, plugin));

	const searchEl = container.createEl("input", {
		cls: "atlas-crud-search",
		type: "search",
		attr: { placeholder: "Buscar cargo..." },
	}) as HTMLInputElement;
	searchEl.value = currentSearch;
	searchEl.addEventListener("input", () => {
		currentSearch = searchEl.value;
		renderList();
	});

	const listEl = container.createDiv({ cls: "atlas-crud-list" });

	const renderList = () => {
		listEl.empty();
		const all = plugin.kg.listRoles();
		const filtered = all.filter((r) => {
			if (!currentSearch) return true;
			const q = currentSearch.toLowerCase();
			return (
				r.title.toLowerCase().includes(q) ||
				(r.level ?? "").toLowerCase().includes(q)
			);
		});

		if (filtered.length === 0) {
			const empty = listEl.createDiv({ cls: "atlas-crud-empty" });
			if (all.length === 0) {
				empty.setText("🎓 Cadastre cargos do seu time (Tech Lead, Senior Eng, etc).");
				const btn = empty.createEl("button", {
					cls: "atlas-crud-empty-btn mod-cta",
					text: "+ Cadastrar primeiro cargo",
				});
				btn.addEventListener("click", () => {
					renderRoleEditForm(plugin, null, () => renderList());
				});
			} else {
				empty.setText("Nenhum cargo com esses filtros.");
			}
			return;
		}

		for (const r of filtered) {
			renderRoleCard(listEl, r, plugin, () => renderList());
		}
	};

	renderList();
}

function renderRoleCard(
	parent: HTMLElement,
	role: RoleT,
	plugin: AtlasPlugin,
	onChange: () => void
): void {
	const card = parent.createDiv({ cls: "atlas-role-card" });

	const header = card.createDiv({ cls: "atlas-role-card-header" });
	header.createEl("span", { cls: "atlas-role-card-emoji", text: "🎓" });
	header.createEl("div", { cls: "atlas-role-card-title", text: role.title });

	if (role.level) {
		header.createEl("span", { cls: "atlas-role-card-level-badge", text: role.level });
	}

	if (role.responsibilities.length > 0) {
		const summary =
			role.responsibilities.slice(0, 2).join(" · ") +
			(role.responsibilities.length > 2 ? ` (+${role.responsibilities.length - 2})` : "");
		card.createEl("div", { cls: "atlas-role-card-meta", text: summary });
	}

	if (role.reportsToRoleId) {
		const parent2 = plugin.kg.data.roles.find((r) => r.id === role.reportsToRoleId);
		if (parent2) {
			card.createEl("div", { cls: "atlas-role-card-reports", text: `↑ reporta para ${parent2.title}` });
		}
	}

	const peopleWithRole = plugin.kg.data.people.filter(
		(p) => p.role === role.title || (p as unknown as { roleId?: string }).roleId === role.id
	);
	if (peopleWithRole.length > 0) {
		card.createEl("div", {
			cls: "atlas-role-card-people",
			text: `👥 ${peopleWithRole.length} pessoa(s) com esse cargo`,
		});
	}

	card.addEventListener("click", () => {
		renderRoleDetailPanel(plugin, role, onChange);
	});
}

function renderRoleDetailPanel(
	plugin: AtlasPlugin,
	role: RoleT,
	onChange: () => void
): void {
	const panel = new SlideOverPanel({
		title: role.title,
		subtitle: role.level ?? "—",
		icon: "🎓",
		actions: [
			{
				icon: "✏️",
				title: "Editar",
				onClick: () => {
					panel.close();
					renderRoleEditForm(plugin, role, onChange);
				},
			},
			{
				icon: "🗑️",
				title: "Deletar",
				onClick: async () => {
					const { confirmAsync } = await import("../../ui/confirm-modal");
					const ok = await confirmAsync(
						plugin.app,
						`Deletar cargo "${role.title}"?`,
						{ title: "Confirmar exclusão", danger: true, yesLabel: "Deletar" }
					);
					if (ok) {
						plugin.kg.deleteRole(role.id);
						void plugin.kg.save();
						panel.close();
						onChange();
						new Notice(`Atlas: cargo "${role.title}" deletado.`);
					}
				},
			},
		],
		render: (body) => {
			body.empty();
			if (role.responsibilities.length > 0) {
				const sec = body.createDiv({ cls: "atlas-role-detail-section" });
				sec.createEl("div", { cls: "atlas-role-detail-section-label", text: "📋 Responsabilidades" });
				const ul = sec.createEl("ul", { cls: "atlas-role-detail-list" });
				for (const r of role.responsibilities) {
					ul.createEl("li", { text: r });
				}
			}

			if (role.reportsToRoleId) {
				const parent2 = plugin.kg.data.roles.find((r) => r.id === role.reportsToRoleId);
				if (parent2) {
					const sec = body.createDiv({ cls: "atlas-role-detail-section" });
					sec.createEl("div", { cls: "atlas-role-detail-section-label", text: "↑ Reporta para" });
					sec.createEl("div", { cls: "atlas-role-detail-section-value", text: parent2.title });
				}
			}

			const peopleWithRole = plugin.kg.data.people.filter(
				(p) => p.role === role.title || (p as unknown as { roleId?: string }).roleId === role.id
			);
			if (peopleWithRole.length > 0) {
				const sec = body.createDiv({ cls: "atlas-role-detail-section" });
				sec.createEl("div", {
					cls: "atlas-role-detail-section-label",
					text: `👥 Pessoas (${peopleWithRole.length})`,
				});
				for (const p of peopleWithRole) {
					sec.createEl("div", { cls: "atlas-role-detail-person-row", text: p.name });
				}
			}
		},
	});
	void panel.open();
}

export function renderRoleEditForm(
	plugin: AtlasPlugin,
	existing: RoleT | null,
	onSave?: () => void
): void {
	const isNew = existing === null;
	const draft: Partial<RoleT> = existing
		? { ...existing }
		: { title: "", responsibilities: [] };

	const panel = new SlideOverPanel({
		title: isNew ? "Novo cargo" : `Editar: ${existing.title}`,
		icon: "🎓",
		render: (body) => {
			body.empty();

			fieldInput(body, "Título *", draft.title ?? "", (v) => (draft.title = v), {
				placeholder: "Tech Lead, Senior Engineer, Coordenador",
			});
			fieldInput(body, "Level", draft.level ?? "", (v) => (draft.level = v), {
				placeholder: "L4, L5, M2, Senior",
			});

			fieldTextArea(
				body,
				"Responsabilidades (1 por linha)",
				(draft.responsibilities ?? []).join("\n"),
				(v) => {
					draft.responsibilities = v
						.split("\n")
						.map((r) => r.trim())
						.filter(Boolean);
				},
				{
					placeholder:
						"Liderar arquitetura\nMentoria de juniores\nReview de PRs críticos",
					minHeight: "100px",
				}
			);

			const otherRoles = plugin.kg.listRoles().filter((r) => r.id !== existing?.id);
			fieldSelect(
				body,
				"Reporta para (cargo superior)",
				draft.reportsToRoleId ?? "",
				["", ...otherRoles.map((r) => r.id)],
				(v) => (draft.reportsToRoleId = v || undefined),
				["—", ...otherRoles.map((r) => r.title)]
			);

			formButtons(
				body,
				isNew ? "Criar cargo" : "Salvar",
				async () => {
					if (!draft.title?.trim()) {
						new Notice("Atlas: título é obrigatório.");
						return;
					}
					const saved = plugin.kg.upsertRole({
						id: existing?.id ?? slugify(draft.title),
						title: draft.title.trim(),
						level: draft.level || undefined,
						responsibilities: draft.responsibilities ?? [],
						reportsToRoleId: draft.reportsToRoleId,
						notePath: existing?.notePath,
					});
					await plugin.kg.save();

					if (isNew && !saved.notePath) {
						await createRoleNote(plugin, saved);
					}

					new Notice(`Atlas: cargo "${saved.title}" ${isNew ? "criado" : "salvo"}.`);
					panel.close();
					onSave?.();
				},
				() => panel.close()
			);
		},
	});
	void panel.open();
}

async function createRoleNote(plugin: AtlasPlugin, role: RoleT): Promise<void> {
	const folder = `${plugin.settings.folders.knowledge}/roles`;
	if (!plugin.app.vault.getAbstractFileByPath(folder)) {
		await plugin.app.vault.createFolder(folder);
	}
	const path = normalizePath(`${folder}/${role.id}.md`);
	const md = `---
type: role
title: ${JSON.stringify(role.title)}
level: ${role.level ? JSON.stringify(role.level) : "null"}
created_by: atlas
---

# 🎓 ${role.title}${role.level ? ` (${role.level})` : ""}

## 📋 Responsabilidades
${role.responsibilities.map((r) => `- ${r}`).join("\n") || "_A definir._"}

## 👥 Pessoas com esse cargo
\`\`\`dataview
LIST
FROM ""
WHERE role = "${role.title}"
\`\`\`
`;
	await plugin.app.vault.create(path, md);
	plugin.kg.upsertRole({ id: role.id, title: role.title, notePath: path });
	await plugin.kg.save();
}
