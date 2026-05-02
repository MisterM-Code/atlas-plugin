/**
 * Atlas Tool Registry — define 12 tools que LLM (Agent) e Voice commands podem invocar.
 *
 * Cada tool tem:
 *  - name: string usado no Ollama tools API (function calling)
 *  - description: humanLLM-readable
 *  - parameters: JSON Schema
 *  - destructive: bool (true → exige confirmação UI antes)
 *  - handler: async (params, plugin) => ToolResult
 *
 * Mesmo registry usado por:
 *  - Agent.run() — LLM decide quando chamar tool
 *  - Voice commands — regex parser → tool call direto
 *  - JarvisOverlay — voz/texto → tool dispatcher
 */

import type AtlasPlugin from "../../main";
import * as chrono from "chrono-node";
import { Notice, normalizePath } from "obsidian";
import { logger } from "../utils/logger";

export interface ToolResult {
	ok: boolean;
	message: string;
	data?: unknown;
}

export interface ToolDefinition {
	name: string;
	description: string;
	parameters: {
		type: "object";
		properties: Record<
			string,
			{ type: string; description: string; enum?: string[] }
		>;
		required: string[];
	};
	destructive?: boolean;
	handler: (params: Record<string, unknown>, plugin: AtlasPlugin) => Promise<ToolResult>;
}

export const TOOLS: ToolDefinition[] = [
	{
		name: "create_person",
		description:
			"Cria ou atualiza uma pessoa no Knowledge Graph. Tipo: direct-report, peer, manager, skip-level, stakeholder, coachee, other.",
		parameters: {
			type: "object",
			properties: {
				name: { type: "string", description: "Nome completo da pessoa" },
				type: {
					type: "string",
					description: "Tipo de relação",
					enum: [
						"direct-report",
						"peer",
						"manager",
						"skip-level",
						"stakeholder",
						"coachee",
						"other",
					],
				},
				role: { type: "string", description: "Cargo / título (opcional)" },
				team: { type: "string", description: "Time / squad (opcional)" },
				email: { type: "string", description: "Email (opcional)" },
			},
			required: ["name", "type"],
		},
		handler: async (params, plugin) => {
			const name = String(params.name ?? "").trim();
			if (!name) return { ok: false, message: "Nome obrigatório." };
			const type = String(params.type ?? "other") as
				| "direct-report"
				| "peer"
				| "manager"
				| "skip-level"
				| "stakeholder"
				| "coachee"
				| "other";
			const person = plugin.kg.upsertPerson({
				name,
				type,
				role: params.role ? String(params.role) : undefined,
				team: params.team ? String(params.team) : undefined,
				email: params.email ? String(params.email) : undefined,
				aliases: [],
			});
			await plugin.kg.save();
			return {
				ok: true,
				message: `Pessoa "${person.name}" cadastrada como ${type}${person.role ? `, cargo ${person.role}` : ""}${person.team ? `, time ${person.team}` : ""}.`,
				data: { id: person.id, name: person.name },
			};
		},
	},
	{
		name: "create_system",
		description:
			"Cria ou atualiza um sistema (PIX, Stripe, app interno) no KG.",
		parameters: {
			type: "object",
			properties: {
				name: { type: "string", description: "Nome do sistema" },
				vendor: { type: "string", description: "Vendor/fornecedor (opcional)" },
				type: {
					type: "string",
					description: "Tipo do sistema",
					enum: ["payment", "core", "internal-tool", "vendor", "platform", "other"],
				},
			},
			required: ["name"],
		},
		handler: async (params, plugin) => {
			const name = String(params.name ?? "").trim();
			if (!name) return { ok: false, message: "Nome obrigatório." };
			const sys = plugin.kg.upsertSystem({
				name,
				vendor: params.vendor ? String(params.vendor) : undefined,
				type: (params.type ? String(params.type) : "other") as never,
				aliases: [],
			});
			await plugin.kg.save();
			return {
				ok: true,
				message: `Sistema "${sys.name}" cadastrado${sys.vendor ? ` (vendor: ${sys.vendor})` : ""}.`,
				data: { id: sys.id, name: sys.name },
			};
		},
	},
	{
		name: "create_product",
		description: "Cria ou atualiza um produto no portfolio.",
		parameters: {
			type: "object",
			properties: {
				name: { type: "string", description: "Nome do produto" },
				category: { type: "string", description: "Categoria (opcional)" },
			},
			required: ["name"],
		},
		handler: async (params, plugin) => {
			const name = String(params.name ?? "").trim();
			if (!name) return { ok: false, message: "Nome obrigatório." };
			const p = plugin.kg.upsertProduct({
				name,
				category: params.category ? String(params.category) : undefined,
				systemIds: [],
			});
			await plugin.kg.save();
			return {
				ok: true,
				message: `Produto "${p.name}" cadastrado${p.category ? ` (${p.category})` : ""}.`,
				data: { id: p.id, name: p.name },
			};
		},
	},
	{
		name: "create_role",
		description: "Cria ou atualiza um cargo padronizado do time.",
		parameters: {
			type: "object",
			properties: {
				title: { type: "string", description: "Título do cargo (ex: Tech Lead)" },
				level: { type: "string", description: "Nível (ex: L5, Sr, Jr)" },
			},
			required: ["title"],
		},
		handler: async (params, plugin) => {
			const title = String(params.title ?? "").trim();
			if (!title) return { ok: false, message: "Título obrigatório." };
			const r = plugin.kg.upsertRole({
				title,
				level: params.level ? String(params.level) : undefined,
				responsibilities: [],
			});
			await plugin.kg.save();
			return {
				ok: true,
				message: `Cargo "${r.title}" cadastrado${r.level ? ` (${r.level})` : ""}.`,
				data: { id: r.id, title: r.title },
			};
		},
	},
	{
		name: "create_course",
		description: "Cria ou atualiza um curso (estudo).",
		parameters: {
			type: "object",
			properties: {
				name: { type: "string", description: "Nome do curso" },
				provider: { type: "string", description: "Provider (Coursera, Domestika, livro, ...)" },
			},
			required: ["name"],
		},
		handler: async (params, plugin) => {
			const name = String(params.name ?? "").trim();
			if (!name) return { ok: false, message: "Nome obrigatório." };
			const c = plugin.kg.upsertCourse({
				name,
				provider: params.provider ? String(params.provider) : undefined,
				status: "active",
			});
			await plugin.kg.save();
			return {
				ok: true,
				message: `Curso "${c.name}" cadastrado${c.provider ? ` (${c.provider})` : ""}.`,
				data: { id: c.id, name: c.name },
			};
		},
	},
	{
		name: "create_action_item",
		description:
			"Cria uma tarefa em Inbox com data opcional. Aceita data natural PT-BR (amanhã 14h, sexta).",
		parameters: {
			type: "object",
			properties: {
				text: { type: "string", description: "Descrição da tarefa" },
				due: { type: "string", description: "Data (linguagem natural PT-BR ou ISO)" },
				owner: { type: "string", description: "Owner (nome de pessoa do KG)" },
			},
			required: ["text"],
		},
		handler: async (params, plugin) => {
			const text = String(params.text ?? "").trim();
			if (!text) return { ok: false, message: "Texto obrigatório." };
			let dueIso: string | undefined;
			if (params.due) {
				const parsed = chrono.pt.parse(String(params.due), new Date(), { forwardDate: true });
				if (parsed.length > 0) dueIso = parsed[0].date().toISOString().substring(0, 16).replace("T", " ");
			}
			const owner = params.owner
				? plugin.kg.findPersonByName(String(params.owner))
				: undefined;
			const dueLine = dueIso ? ` (@${dueIso})` : "";
			const ownerLine = owner ? ` [[${owner.name}]]` : "";
			const md = `---
type: capture
captured_at: ${new Date().toISOString()}
captured_via: tool-call
---

# 🛠️ ${text.substring(0, 80)}

- [ ]${ownerLine ? ownerLine + " — " : " "}${text}${dueLine}
`;
			const date = new Date().toISOString().split("T")[0];
			const slug = text.substring(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
			const path = normalizePath(`${plugin.settings.folders.inbox}/${date}-task-${slug}.md`);
			if (!plugin.app.vault.getAbstractFileByPath(plugin.settings.folders.inbox)) {
				await plugin.app.vault.createFolder(plugin.settings.folders.inbox);
			}
			try {
				await plugin.app.vault.create(path, md);
				return {
					ok: true,
					message: `Tarefa criada${dueIso ? ` para ${dueIso}` : ""}${owner ? ` (owner: ${owner.name})` : ""}.`,
					data: { path },
				};
			} catch (e) {
				return { ok: false, message: `Erro ao criar tarefa: ${String(e)}` };
			}
		},
	},
	{
		name: "create_reminder",
		description: "Cria um reminder com data específica (linguagem natural PT-BR).",
		parameters: {
			type: "object",
			properties: {
				text: { type: "string", description: "Texto do reminder" },
				datetime: { type: "string", description: "Data/hora (PT-BR natural ou ISO)" },
			},
			required: ["text", "datetime"],
		},
		handler: async (params, plugin) => {
			const text = String(params.text ?? "").trim();
			const dt = String(params.datetime ?? "").trim();
			if (!text || !dt) return { ok: false, message: "Texto e data obrigatórios." };
			const parsed = chrono.pt.parse(dt, new Date(), { forwardDate: true });
			if (parsed.length === 0) return { ok: false, message: `Data inválida: "${dt}"` };
			const date = parsed[0].date();
			const dateStr = date.toISOString().substring(0, 16).replace("T", " ");
			const today = new Date().toISOString().split("T")[0];
			const path = normalizePath(`${plugin.settings.folders.inbox}/${today}-reminders.md`);
			const reminderLine = `- [ ] ${text} (@${dateStr}) #voice-reminder`;

			let content = `---\ntype: voice-reminders\ndate: ${today}\n---\n\n# 🔔 Voice reminders ${today}\n\n`;
			const existing = plugin.app.vault.getAbstractFileByPath(path);
			if (existing && "stat" in existing) {
				try {
					content = await plugin.app.vault.read(existing as never);
				} catch {
					// fallback
				}
				await plugin.app.vault.modify(existing as never, content + reminderLine + "\n");
			} else {
				if (!plugin.app.vault.getAbstractFileByPath(plugin.settings.folders.inbox)) {
					await plugin.app.vault.createFolder(plugin.settings.folders.inbox);
				}
				await plugin.app.vault.create(path, content + reminderLine + "\n");
			}
			return {
				ok: true,
				message: `Reminder agendado: "${text}" para ${date.toLocaleString("pt-BR")}`,
				data: { datetime: date.toISOString() },
			};
		},
	},
	{
		name: "schedule_meeting",
		description:
			"Cria nota de reunião/1:1 em 03_Meetings com pessoa + data. Usa template 1on1-grow se framework não especificado.",
		parameters: {
			type: "object",
			properties: {
				person: { type: "string", description: "Nome da pessoa" },
				datetime: { type: "string", description: "Data/hora (PT-BR natural)" },
				framework: {
					type: "string",
					description: "Framework (GROW, CLEAR, ...)",
					enum: ["GROW", "CLEAR", "BICEPS", "OSKAR", "adhoc"],
				},
			},
			required: ["person", "datetime"],
		},
		handler: async (params, plugin) => {
			const personName = String(params.person ?? "").trim();
			const dt = String(params.datetime ?? "").trim();
			if (!personName || !dt) return { ok: false, message: "Pessoa e data obrigatórios." };
			const parsed = chrono.pt.parse(dt, new Date(), { forwardDate: true });
			if (parsed.length === 0) return { ok: false, message: `Data inválida: "${dt}"` };
			const date = parsed[0].date();
			const dateStr = date.toISOString().split("T")[0];
			const timeStr = date.toTimeString().substring(0, 5);
			const framework = (params.framework ? String(params.framework) : "GROW") as
				| "GROW"
				| "CLEAR"
				| "BICEPS"
				| "OSKAR"
				| "adhoc";
			const slug = personName
				.toLowerCase()
				.normalize("NFD")
				.replace(/[̀-ͯ]/g, "")
				.replace(/[^a-z0-9]+/g, "-");
			const folder = `${plugin.settings.folders.meetings}/1on1/${slug}`;
			const path = normalizePath(`${folder}/${dateStr}-${slug}.md`);

			const md = `---
type: 1on1
person: ${JSON.stringify(personName)}
date: ${dateStr}
time: ${timeStr}
framework: ${framework}
---

# 1:1 com [[${personName}]] — ${dateStr} ${timeStr}

## 🎯 Goal


## 🔍 Reality


## 💡 Options


## 🏃 Will


## ✅ Action Items
- [ ] [[${personName}]] — _ (@_)
`;
			try {
				const parts = folder.split("/").filter(Boolean);
				let cur = "";
				for (const p of parts) {
					cur = cur ? `${cur}/${p}` : p;
					if (!plugin.app.vault.getAbstractFileByPath(cur)) {
						await plugin.app.vault.createFolder(cur).catch(() => undefined);
					}
				}
				await plugin.app.vault.create(path, md);
				return {
					ok: true,
					message: `Reunião agendada: ${personName} ${dateStr} ${timeStr} (${framework})`,
					data: { path, datetime: date.toISOString() },
				};
			} catch (e) {
				return { ok: false, message: `Erro: ${String(e)}` };
			}
		},
	},
	{
		name: "compose_email",
		description:
			"Abre modal de compose email pré-preenchido. NÃO envia direto — user revisa e clica enviar.",
		parameters: {
			type: "object",
			properties: {
				to: { type: "string", description: "Email destinatário ou nome de pessoa do KG" },
				subject: { type: "string", description: "Assunto" },
				body: { type: "string", description: "Corpo do email (markdown)" },
			},
			required: ["to", "subject"],
		},
		handler: async (params, plugin) => {
			const to = String(params.to ?? "").trim();
			const subject = String(params.subject ?? "").trim();
			const body = String(params.body ?? "").trim();
			if (!to || !subject) return { ok: false, message: "Destinatário e assunto obrigatórios." };
			// Resolve pessoa do KG → email
			let recipient = to;
			if (!to.includes("@")) {
				const person = plugin.kg.findPersonByName(to);
				if (person?.email) recipient = person.email;
				else
					return {
						ok: false,
						message: `"${to}" não tem email no KG. Adicione email em Settings → People.`,
					};
			}
			// Trigger modal abrir (compose-email cuida de SMTP)
			try {
				const m = await import("../innovations/compose-email");
				new m.ComposeEmailModal(plugin.app, plugin, { to: recipient, subject, body }).open();
			} catch {
				new Notice(`📧 Email rascunhado: ${subject} → ${recipient} (modal compose pendente)`);
			}
			return {
				ok: true,
				message: `Modal compose email aberto pra ${recipient} sobre "${subject}".`,
				data: { to: recipient, subject },
			};
		},
	},
	{
		name: "switch_profile",
		description: "Troca o perfil ativo do Atlas (re-aplica templates/tools/cores).",
		parameters: {
			type: "object",
			properties: {
				profile_id: {
					type: "string",
					description: "ID do perfil",
					enum: [
						"ti-eng",
						"ti-coord",
						"produto",
						"design",
						"marketing",
						"vendas",
						"coach",
						"rh",
						"financeiro",
						"juridico",
						"saude",
						"educacao",
						"pesquisa",
						"estudante",
						"personal",
					],
				},
			},
			required: ["profile_id"],
		},
		handler: async (params, plugin) => {
			const id = String(params.profile_id ?? "").trim();
			if (!id) return { ok: false, message: "profile_id obrigatório." };
			const m = await import("../profiles/registry");
			const p = m.findProfile(id as never);
			if (!p) return { ok: false, message: `Perfil "${id}" não encontrado.` };
			if (!plugin.settings.profile) plugin.settings.profile = { ids: [] };
			plugin.settings.profile.ids = [p.id];
			plugin.settings.profile.colorAccent = p.defaults.colorAccent;
			await plugin.saveSettings();
			return {
				ok: true,
				message: `Perfil ativo: ${p.emoji} ${p.name}. Tools/templates/cores atualizados.`,
				data: { profile_id: p.id },
			};
		},
	},
	{
		name: "index_vault",
		description: "Re-indexa o vault inteiro (extrai KG via Ollama).",
		parameters: { type: "object", properties: {}, required: [] },
		handler: async (_params, plugin) => {
			const apiAny = plugin.app as unknown as {
				commands?: { executeCommandById?: (id: string) => void };
			};
			apiAny.commands?.executeCommandById?.("atlas:atlas-index-vault");
			return { ok: true, message: "Indexação do vault iniciada (background)." };
		},
	},
	{
		name: "forget_person",
		description:
			"DESTRUTIVA: apaga pessoa + sessões + action items + commitments + temas (cascade). LGPD Right-to-be-forgotten.",
		parameters: {
			type: "object",
			properties: {
				name: { type: "string", description: "Nome exato da pessoa" },
			},
			required: ["name"],
		},
		destructive: true,
		handler: async (params, plugin) => {
			const name = String(params.name ?? "").trim();
			if (!name) return { ok: false, message: "Nome obrigatório." };
			const person = plugin.kg.findPersonByName(name);
			if (!person) return { ok: false, message: `"${name}" não encontrado no KG.` };
			const sessionsCount = plugin.kg.data.sessions.filter((s) => s.personId === person.id).length;
			plugin.kg.data.sessions = plugin.kg.data.sessions.filter((s) => s.personId !== person.id);
			const aiCount = plugin.kg.data.actionItems.filter((a) => a.ownerId === person.id).length;
			plugin.kg.data.actionItems = plugin.kg.data.actionItems.filter((a) => a.ownerId !== person.id);
			const cmCount = plugin.kg.data.commitments.filter(
				(c) => c.madeBy === person.id || c.madeTo === person.id
			).length;
			plugin.kg.data.commitments = plugin.kg.data.commitments.filter(
				(c) => c.madeBy !== person.id && c.madeTo !== person.id
			);
			plugin.kg.data.themes = plugin.kg.data.themes
				.map((t) => ({ ...t, personIds: t.personIds.filter((pid) => pid !== person.id) }))
				.filter((t) => t.personIds.length > 0);
			plugin.kg.deletePerson(person.id);
			await plugin.kg.save();
			await plugin.auditLog({
				action: "tool.forget_person",
				personName: name,
				cascade: { sessions: sessionsCount, actionItems: aiCount, commitments: cmCount },
			});
			return {
				ok: true,
				message: `"${name}" e ${sessionsCount} sessões + ${aiCount} actions + ${cmCount} commitments apagados (LGPD RTBF).`,
				data: { name, cascade: { sessionsCount, aiCount, cmCount } },
			};
		},
	},
];

/**
 * Acha tool por name.
 */
export function findTool(name: string): ToolDefinition | undefined {
	return TOOLS.find((t) => t.name === name);
}

/**
 * Executa tool por name + params. Retorna ToolResult.
 * Se destructive → exige confirmação UI (passa skipConfirm=true para forçar).
 */
export async function executeTool(
	name: string,
	params: Record<string, unknown>,
	plugin: AtlasPlugin,
	opts: { skipConfirm?: boolean } = {}
): Promise<ToolResult> {
	const tool = findTool(name);
	if (!tool) {
		return { ok: false, message: `Tool "${name}" não encontrada.` };
	}
	if (tool.destructive && !opts.skipConfirm) {
		const confirm = window.confirm(
			`⚠️ Tool destrutiva: ${name}\n\n${tool.description}\n\nParams:\n${JSON.stringify(params, null, 2)}\n\nConfirmar?`
		);
		if (!confirm) {
			return { ok: false, message: "Cancelado pelo usuário." };
		}
	}
	try {
		const result = await tool.handler(params, plugin);
		logger.info("tool: executed", { name, ok: result.ok });
		return result;
	} catch (e) {
		logger.error("tool: handler falhou", { name, error: String(e) });
		return { ok: false, message: `Erro: ${String(e)}` };
	}
}

/**
 * Retorna definições no formato Ollama tools API.
 */
export function getOllamaToolsSpec(): Array<{
	type: "function";
	function: { name: string; description: string; parameters: ToolDefinition["parameters"] };
}> {
	return TOOLS.map((t) => ({
		type: "function",
		function: {
			name: t.name,
			description: t.description,
			parameters: t.parameters,
		},
	}));
}
