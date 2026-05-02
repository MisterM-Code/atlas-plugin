import { Notice, normalizePath, TFile } from "obsidian";
import type AtlasPlugin from "../../../main";
import { SlideOverPanel } from "../../ui/slide-over-panel";
import type { RoleT } from "../../kg/schemas";
import { slugify } from "../../kg/schemas";
import { fieldInput, fieldTextArea, fieldSelect, formButtons } from "../../ui/form-fields";

export async function renderRolesTab(container: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	container.empty();
	let currentSearch = "";

	const header = container.createDiv();
	header.style.display = "flex";
	header.style.justifyContent = "space-between";
	header.style.alignItems = "center";
	header.style.marginBottom = "10px";
	header.createEl("h3", { text: "🎓 Cargos" }).style.margin = "0";

	const headerActions = header.createDiv();
	headerActions.style.display = "flex";
	headerActions.style.gap = "6px";

	const addBtn = headerActions.createEl("button", { text: "+ Novo cargo" });
	addBtn.addClass("mod-cta");
	addBtn.style.fontSize = "12px";
	addBtn.style.padding = "5px 10px";
	addBtn.addEventListener("click", () => {
		renderRoleEditForm(plugin, null, () => void renderRolesTab(container, plugin));
	});

	const refreshBtn = headerActions.createEl("button", { text: "↻" });
	refreshBtn.style.fontSize = "12px";
	refreshBtn.style.padding = "5px 10px";
	refreshBtn.addEventListener("click", () => void renderRolesTab(container, plugin));

	const searchEl = container.createEl("input", {
		type: "search",
		attr: { placeholder: "Buscar cargo..." },
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
	listEl.style.maxHeight = "calc(100vh - 240px)";
	listEl.style.overflowY = "auto";

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
			const empty = listEl.createDiv();
			empty.style.padding = "32px 16px";
			empty.style.textAlign = "center";
			empty.style.opacity = "0.6";
			if (all.length === 0) {
				empty.setText("🎓 Cadastre cargos do seu time (Tech Lead, Senior Eng, etc).");
				const btn = empty.createEl("button", { text: "+ Cadastrar primeiro cargo" });
				btn.addClass("mod-cta");
				btn.style.marginTop = "12px";
				btn.style.padding = "8px 16px";
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
	const card = parent.createDiv();
	card.style.padding = "10px 12px";
	card.style.marginBottom = "6px";
	card.style.background = "var(--background-secondary)";
	card.style.borderRadius = "6px";
	card.style.cursor = "pointer";

	const header = card.createDiv();
	header.style.display = "flex";
	header.style.alignItems = "center";
	header.style.gap = "8px";
	header.style.marginBottom = "4px";

	header.createEl("span", { text: "🎓" }).style.fontSize = "14px";
	const title = header.createEl("div", { text: role.title });
	title.style.fontWeight = "bold";
	title.style.fontSize = "13px";
	title.style.flexGrow = "1";

	if (role.level) {
		const lvl = header.createEl("span", { text: role.level });
		lvl.style.fontSize = "10px";
		lvl.style.padding = "2px 6px";
		lvl.style.borderRadius = "3px";
		lvl.style.background = "var(--interactive-accent)";
		lvl.style.color = "var(--text-on-accent)";
		lvl.style.fontWeight = "bold";
	}

	if (role.responsibilities.length > 0) {
		const meta = card.createEl("div");
		meta.style.fontSize = "11px";
		meta.style.opacity = "0.7";
		const summary =
			role.responsibilities.slice(0, 2).join(" · ") +
			(role.responsibilities.length > 2 ? ` (+${role.responsibilities.length - 2})` : "");
		meta.setText(summary);
	}

	if (role.reportsToRoleId) {
		const parent2 = plugin.kg.data.roles.find((r) => r.id === role.reportsToRoleId);
		if (parent2) {
			const rep = card.createEl("div");
			rep.style.fontSize = "10px";
			rep.style.opacity = "0.6";
			rep.style.marginTop = "2px";
			rep.setText(`↑ reporta para ${parent2.title}`);
		}
	}

	// Pessoas com esse cargo
	const peopleWithRole = plugin.kg.data.people.filter(
		(p) => p.role === role.title || (p as unknown as { roleId?: string }).roleId === role.id
	);
	if (peopleWithRole.length > 0) {
		const pp = card.createEl("div");
		pp.style.fontSize = "10px";
		pp.style.opacity = "0.6";
		pp.style.marginTop = "2px";
		pp.setText(`👥 ${peopleWithRole.length} pessoa(s) com esse cargo`);
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
				onClick: () => {
					if (confirm(`Atlas: deletar cargo "${role.title}"?`)) {
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
				const sec = body.createDiv();
				sec.style.marginBottom = "12px";
				sec.createEl("div", { text: "📋 Responsabilidades" }).style.opacity = "0.6";
				const ul = sec.createEl("ul");
				ul.style.paddingLeft = "20px";
				ul.style.fontSize = "12px";
				for (const r of role.responsibilities) {
					ul.createEl("li", { text: r });
				}
			}

			if (role.reportsToRoleId) {
				const parent2 = plugin.kg.data.roles.find((r) => r.id === role.reportsToRoleId);
				if (parent2) {
					const sec = body.createDiv();
					sec.style.marginBottom = "12px";
					sec.createEl("div", { text: "↑ Reporta para" }).style.opacity = "0.6";
					sec.createEl("div", { text: parent2.title }).style.fontSize = "12px";
				}
			}

			const peopleWithRole = plugin.kg.data.people.filter(
				(p) => p.role === role.title || (p as unknown as { roleId?: string }).roleId === role.id
			);
			if (peopleWithRole.length > 0) {
				const sec = body.createDiv();
				sec.createEl("div", { text: `👥 Pessoas (${peopleWithRole.length})` }).style.opacity = "0.6";
				for (const p of peopleWithRole) {
					const row = sec.createEl("div");
					row.style.padding = "4px 8px";
					row.style.background = "var(--background-secondary)";
					row.style.borderRadius = "4px";
					row.style.marginBottom = "3px";
					row.style.fontSize = "12px";
					row.setText(p.name);
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
