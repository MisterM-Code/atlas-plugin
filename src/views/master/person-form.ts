import { Notice, normalizePath } from "obsidian";
import type AtlasPlugin from "../../../main";
import { SlideOverPanel } from "../../ui/slide-over-panel";
import type { PersonT } from "../../kg/schemas";
import { slugify } from "../../kg/schemas";
import { fieldInput, fieldTextArea, fieldSelect, formButtons } from "../../ui/form-fields";

/**
 * Form de criar/editar pessoa via slide-over panel.
 */
export function renderPersonEditForm(
	plugin: AtlasPlugin,
	existing: PersonT | null,
	onSave?: () => void
): void {
	const isNew = existing === null;
	const draft: Partial<PersonT> & { aliasesStr?: string; bio?: string } = existing
		? { ...existing, aliasesStr: existing.aliases.join(", ") }
		: { name: "", aliases: [], type: "other", aliasesStr: "" };

	const panel = new SlideOverPanel({
		title: isNew ? "Nova pessoa" : `Editar: ${existing.name}`,
		icon: "👤",
		render: (body) => {
			body.empty();

			fieldInput(body, "Nome *", draft.name ?? "", (v) => (draft.name = v), {
				placeholder: "João Silva",
			});

			fieldInput(
				body,
				"Aliases (separados por vírgula)",
				draft.aliasesStr ?? "",
				(v) => {
					draft.aliasesStr = v;
					draft.aliases = v
						.split(",")
						.map((a) => a.trim())
						.filter(Boolean);
				},
				{ placeholder: "JS, Jão, João S." }
			);

			fieldSelect(
				body,
				"Tipo de relação",
				draft.type ?? "other",
				["direct-report", "peer", "manager", "stakeholder", "coachee", "skip-level", "other"],
				(v) => (draft.type = v as PersonT["type"]),
				["Direto", "Peer", "Manager", "Stakeholder", "Coachee", "Skip-level", "Outro"]
			);

			// Cargo: dropdown com cargos cadastrados + opção custom
			const roles = plugin.kg.listRoles();
			const roleOptions = ["", ...roles.map((r) => r.title), "__custom__"];
			const roleLabels = ["—", ...roles.map((r) => r.title), "Outro (digite)"];

			let selectedRole = draft.role ?? "";
			let useCustom = false;

			fieldSelect(
				body,
				"Cargo",
				roles.find((r) => r.title === selectedRole) ? selectedRole : selectedRole ? "__custom__" : "",
				roleOptions,
				(v) => {
					if (v === "__custom__") {
						useCustom = true;
						draft.role = customRoleInput.value || draft.role;
						customRoleInput.style.display = "block";
					} else {
						useCustom = false;
						draft.role = v || undefined;
						customRoleInput.style.display = "none";
					}
				},
				roleLabels
			);

			const customRoleInput = body.createEl("input", { type: "text" }) as HTMLInputElement;
			customRoleInput.style.width = "100%";
			customRoleInput.style.padding = "6px 8px";
			customRoleInput.style.fontSize = "12px";
			customRoleInput.style.marginTop = "-8px";
			customRoleInput.style.marginBottom = "12px";
			customRoleInput.placeholder = "Cargo customizado";
			customRoleInput.value = draft.role ?? "";
			customRoleInput.style.display = useCustom || (draft.role && !roles.find((r) => r.title === draft.role)) ? "block" : "none";
			customRoleInput.addEventListener("input", () => {
				draft.role = customRoleInput.value;
			});

			fieldInput(body, "Time / Squad", draft.team ?? "", (v) => (draft.team = v), {
				placeholder: "Pagamentos, Plataforma, etc",
			});

			// Manager: dropdown de pessoas existentes
			const others = plugin.kg.listPeople().filter((p) => p.id !== existing?.id);
			fieldSelect(
				body,
				"Manager",
				draft.manager ?? "",
				["", ...others.map((p) => p.name)],
				(v) => (draft.manager = v || undefined),
				["—", ...others.map((p) => p.name)]
			);

			fieldInput(
				body,
				"Data de início",
				draft.startDate ?? "",
				(v) => (draft.startDate = v),
				{ placeholder: "2024-01-15", type: "date" }
			);

			fieldTextArea(
				body,
				"Bio / observações",
				draft.bio ?? "",
				(v) => (draft.bio = v),
				{ placeholder: "Background, contexto, interesses...", minHeight: "80px" }
			);

			formButtons(
				body,
				isNew ? "Criar pessoa" : "Salvar",
				async () => {
					if (!draft.name?.trim()) {
						new Notice("Atlas: nome é obrigatório.");
						return;
					}

					// Use upsertPerson da KGStore (que já existe) — atualiza com campos ricos
					const saved = plugin.kg.upsertPerson({
						name: draft.name.trim(),
						aliases: draft.aliases ?? [],
						role: draft.role,
						type: draft.type ?? "other",
						notePath: existing?.notePath,
					});

					// Manualmente atualizar campos extras (team, manager, startDate)
					const personInGraph = plugin.kg.data.people.find((p) => p.id === saved.id);
					if (personInGraph) {
						if (draft.team) personInGraph.team = draft.team;
						if (draft.manager) personInGraph.manager = draft.manager;
						if (draft.startDate) personInGraph.startDate = draft.startDate;
						personInGraph.updatedAt = new Date().toISOString();
					}

					await plugin.kg.save();

					if (isNew && !saved.notePath) {
						await createPersonNote(plugin, saved, draft.bio);
					}

					new Notice(`Atlas: pessoa "${saved.name}" ${isNew ? "criada" : "salva"}.`);
					panel.close();
					onSave?.();

					// v0.44 E7: Auto-link retroativo — varre vault em background pra
					// vincular notas que mencionam a pessoa (frontmatter participants).
					// Apenas em criação (não em edits) pra evitar trabalho redundante.
					if (isNew) {
						void (async () => {
							try {
								const m = await import("../../automation/person-mention-detector");
								const detector = new m.PersonMentionDetector(plugin.app, plugin);
								const personFull = plugin.kg.data.people.find((p) => p.id === saved.id);
								if (!personFull) return;
								const linked = await detector.scanAndLink(personFull);
								if (linked > 0) {
									new Notice(
										`Atlas: ${linked} nota${linked > 1 ? "s" : ""} vinculada${linked > 1 ? "s" : ""} ao ${saved.name}`,
										6000
									);
								}
							} catch (e) {
								console.warn("Atlas: person auto-link failed", e);
							}
						})();
					}
				},
				() => panel.close()
			);
		},
	});
	void panel.open();
}

async function createPersonNote(
	plugin: AtlasPlugin,
	person: PersonT,
	bio?: string
): Promise<void> {
	const folder = `${plugin.settings.folders.people}/${person.id}`;
	if (!plugin.app.vault.getAbstractFileByPath(folder)) {
		await plugin.app.vault.createFolder(folder);
	}
	const path = normalizePath(`${folder}/_person.md`);

	const md = `---
type: person
name: ${JSON.stringify(person.name)}
aliases: ${JSON.stringify(person.aliases)}
relationship: ${person.type}
role: ${person.role ? JSON.stringify(person.role) : "null"}
team: ${person.team ? JSON.stringify(person.team) : "null"}
manager: ${person.manager ? JSON.stringify(person.manager) : "null"}
start_date: ${person.startDate ? JSON.stringify(person.startDate) : "null"}
encrypted: ${person.encrypted}
created_by: atlas
tags: [person]
---

# 👤 ${person.name}

${bio ? `## 👀 Sobre\n${bio}\n` : ""}

## 🎯 Goals atuais
\`\`\`dataview
LIST
FROM "06_People/${person.id}"
WHERE type = "goal" AND status = "active"
\`\`\`

## 🤝 Histórico de 1:1s
\`\`\`dataview
TABLE date AS Data, framework AS Framework
FROM "03_Meetings/1on1"
WHERE person = "${person.name}"
SORT date DESC
\`\`\`

## 🏷️ Temas recorrentes
<!-- atlas-themes-start -->
<!-- atlas-themes-end -->

## 📝 Observações
-
`;
	await plugin.app.vault.create(path, md);
	plugin.kg.upsertPerson({ name: person.name, notePath: path });
	await plugin.kg.save();
}
