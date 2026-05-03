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
import { Notice, normalizePath, TFile } from "obsidian";
import { logger } from "../utils/logger";
import { targetFolderFor, NoteType } from "../import/heuristic-classifier";
import { resolveDuplicate } from "../import/conflict-resolver";
import { slugify } from "../kg/schemas";

export interface ToolResult {
	ok: boolean;
	message: string;
	data?: unknown;
}

/**
 * Safe stringify of unknown params — guards against [object Object] when
 * params come from Ollama tool-calling (untrusted JSON).
 */
function asStr(v: unknown, fallback = ""): string {
	if (typeof v === "string") return v.trim();
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	return fallback;
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
			const name = asStr(params.name);
			if (!name) return { ok: false, message: "Nome obrigatório." };
			const type = asStr(params.type, "other") as
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
				role: params.role ? asStr(params.role) : undefined,
				team: params.team ? asStr(params.team) : undefined,
				email: params.email ? asStr(params.email) : undefined,
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
			const name = asStr(params.name);
			if (!name) return { ok: false, message: "Nome obrigatório." };
			const sys = plugin.kg.upsertSystem({
				name,
				vendor: params.vendor ? asStr(params.vendor) : undefined,
				type: (params.type ? asStr(params.type) : "other") as never,
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
			const name = asStr(params.name);
			if (!name) return { ok: false, message: "Nome obrigatório." };
			const p = plugin.kg.upsertProduct({
				name,
				category: params.category ? asStr(params.category) : undefined,
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
			const title = asStr(params.title);
			if (!title) return { ok: false, message: "Título obrigatório." };
			const r = plugin.kg.upsertRole({
				title,
				level: params.level ? asStr(params.level) : undefined,
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
			const name = asStr(params.name);
			if (!name) return { ok: false, message: "Nome obrigatório." };
			const c = plugin.kg.upsertCourse({
				name,
				provider: params.provider ? asStr(params.provider) : undefined,
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
			const text = asStr(params.text);
			if (!text) return { ok: false, message: "Texto obrigatório." };
			let dueIso: string | undefined;
			if (params.due) {
				const parsed = chrono.pt.parse(asStr(params.due), new Date(), { forwardDate: true });
				if (parsed.length > 0) dueIso = parsed[0].date().toISOString().substring(0, 16).replace("T", " ");
			}
			const owner = params.owner
				? plugin.kg.findPersonByName(asStr(params.owner))
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

				// v0.50: also upsert action item into KG with resolved personId
				try {
					const aiId = `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
					plugin.kg.upsertActionItem({
						id: aiId,
						description: text,
						ownerId: owner?.id,
						dueDate: dueIso ? new Date(dueIso.replace(" ", "T")).toISOString() : undefined,
						status: "open",
						sourceNotePath: path,
					});
					await plugin.kg.save();
				} catch {
					// KG upsert is best-effort — markdown note is the source of truth
				}

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
			const text = asStr(params.text);
			const dt = asStr(params.datetime);
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
			const personName = asStr(params.person);
			const dt = asStr(params.datetime);
			if (!personName || !dt) return { ok: false, message: "Pessoa e data obrigatórios." };
			const parsed = chrono.pt.parse(dt, new Date(), { forwardDate: true });
			if (parsed.length === 0) return { ok: false, message: `Data inválida: "${dt}"` };
			const date = parsed[0].date();
			const dateStr = date.toISOString().split("T")[0];
			const timeStr = date.toTimeString().substring(0, 5);
			const framework = (params.framework ? asStr(params.framework) : "GROW") as
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
			const to = asStr(params.to);
			const subject = asStr(params.subject);
			const body = asStr(params.body);
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
			const id = asStr(params.profile_id);
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
			apiAny.commands?.executeCommandById?.("atlas:index-vault");
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
			const name = asStr(params.name);
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
	// v0.44 E5: Person aggregation report tool
	{
		name: "report_person_sessions",
		description:
			"Gera relatório completo de TODAS as 1:1s feitas com uma pessoa. Tabela cronológica, decisions, action items, themes recorrentes. Cria nota markdown em 05_Reports/1on1-reports/.",
		parameters: {
			type: "object",
			properties: {
				person_name: {
					type: "string",
					description: "Nome da pessoa (ex: Miguel)",
				},
				since: {
					type: "string",
					description: "Data início ISO YYYY-MM-DD (opcional, default = todas as sessões)",
				},
			},
			required: ["person_name"],
		},
		destructive: false,
		handler: async (params, plugin): Promise<ToolResult> => {
			const personName = asStr(params.person_name);
			if (!personName) return { ok: false, message: "person_name obrigatório." };
			const person = plugin.kg.findPersonByName(personName);
			if (!person) {
				return {
					ok: false,
					message: `Pessoa "${personName}" não encontrada. Cadastre via Quick Add primeiro.`,
				};
			}

			const since = asStr(params.since) || undefined;
			const sinceDate = since && /^\d{4}-\d{2}-\d{2}$/.test(since) ? new Date(since) : undefined;
			const sessions = plugin.kg.listSessionsByPerson(person.id, sinceDate);

			if (sessions.length === 0) {
				return {
					ok: false,
					message: `Nenhuma sessão encontrada com ${personName}${since ? ` desde ${since}` : ""}.`,
				};
			}

			// Build markdown report
			const today = new Date().toISOString().split("T")[0];
			const personSlug = person.id;
			const reportFolder = normalizePath(`05_Reports/1on1-reports`);
			const reportPath = normalizePath(`${reportFolder}/${today}-${personSlug}.md`);

			// Aggregate themes
			const themes = plugin.kg.listTopThemesForPerson(person.id);

			// Read each session note to extract action items + decisions
			const rows: Array<{ date: string; framework: string; topics: string; decisions: string; notePath: string }> = [];
			let allDecisions: string[] = [];
			let openActionItems = 0;
			let doneActionItems = 0;

			for (const s of sessions) {
				const file = plugin.app.vault.getAbstractFileByPath(s.sourceNotePath);
				let topicsStr = (s.topics ?? []).join(", ");
				let decisionsStr = (s.decisions ?? []).join("; ");
				if (file && "stat" in file) {
					try {
						const text = await plugin.app.vault.read(file as never);
						// Extract action items via regex
						const opens = (text.match(/^\s*-\s*\[\s\]/gm) ?? []).length;
						const dones = (text.match(/^\s*-\s*\[x\]/gim) ?? []).length;
						openActionItems += opens;
						doneActionItems += dones;
						// Extract decisions section if present
						const decMatch = text.match(/##\s*✅?\s*Decis[õo]es([\s\S]*?)(##|$)/i);
						if (decMatch) {
							const decs = decMatch[1]
								.split("\n")
								.filter((l) => l.trim().startsWith("-"))
								.map((l) => l.replace(/^[-\s]+/, "").trim())
								.filter(Boolean);
							allDecisions.push(...decs);
							if (!decisionsStr) decisionsStr = decs.slice(0, 2).join("; ");
						}
					} catch (e) {
						logger.warn("report_person_sessions: read failed", { path: s.sourceNotePath, error: String(e) });
					}
				}
				rows.push({
					date: s.date,
					framework: s.framework,
					topics: topicsStr || "—",
					decisions: decisionsStr || "—",
					notePath: s.sourceNotePath,
				});
			}

			const firstDate = sessions[sessions.length - 1].date;
			const lastDate = sessions[0].date;
			const frameworkCounts = new Map<string, number>();
			for (const s of sessions) {
				frameworkCounts.set(s.framework, (frameworkCounts.get(s.framework) ?? 0) + 1);
			}
			const fwSummary = Array.from(frameworkCounts.entries())
				.map(([k, v]) => `${k}: ${v}`)
				.join(" · ");

			// Markdown body
			const tableRows = rows
				.map(
					(r) =>
						`| ${r.date} | ${r.framework} | ${r.topics.substring(0, 60)} | ${r.decisions.substring(0, 80)} | [link](${r.notePath}) |`
				)
				.join("\n");

			const themesBlock =
				themes.length > 0
					? themes
							.map((t) => `- **${t.name}** (${t.frequency}× · ${t.sentiment})`)
							.join("\n")
					: "_(Nenhum tema identificado)_";

			const allDecisionsBlock =
				allDecisions.length > 0
					? Array.from(new Set(allDecisions))
							.slice(0, 30)
							.map((d) => `- ${d}`)
							.join("\n")
					: "_(Nenhuma decisão registrada)_";

			const body = `---
type: report
report_type: 1on1-aggregated
person: "${personName}"
person_id: ${personSlug}
generated_by: atlas
generated_at: ${new Date().toISOString()}
sessions_count: ${sessions.length}
period_start: ${firstDate}
period_end: ${lastDate}
tags: [report, 1on1, ${personSlug}]
---

# 📊 Relatório 1:1 — ${personName}

> Gerado por Atlas · ${new Date().toLocaleDateString("pt-BR")}

## 📈 Sumário

- **Período:** ${firstDate} → ${lastDate}
- **Sessões realizadas:** ${sessions.length}
- **Frameworks usados:** ${fwSummary}
- **Action items:** ${doneActionItems} concluídos · ${openActionItems} abertos
- **Decisões agregadas:** ${allDecisions.length}

## 📅 Cronologia

| Data | Framework | Tópicos | Decisões | Nota |
|---|---|---|---|---|
${tableRows}

## 🎯 Decisions agregadas

${allDecisionsBlock}

## 🏷️ Themes recorrentes

${themesBlock}

## 💡 Próximos passos sugeridos

_(Edite manualmente após revisão. Atlas pode gerar análise via 'gere insights deste relatório' no chat.)_

---

_📎 Backlinks_
- Pessoa: [[${person.notePath ?? `06_People/${personSlug}/_person`}]]
- Sessões: ${sessions.length} arquivos em \`03_Meetings/1on1/${personSlug}/\`
`;

			// Ensure folder
			if (!plugin.app.vault.getAbstractFileByPath(reportFolder)) {
				await plugin.app.vault.createFolder(reportFolder);
			}

			// Create or update report
			const existing = plugin.app.vault.getAbstractFileByPath(reportPath);
			let file: import("obsidian").TFile;
			if (existing && "stat" in existing) {
				await plugin.app.vault.modify(existing as never, body);
				file = existing as never;
			} else {
				file = await plugin.app.vault.create(reportPath, body);
			}

			await plugin.app.workspace.getLeaf().openFile(file);
			await plugin.auditLog({
				action: "tool.report_person_sessions",
				personName,
				sessionsCount: sessions.length,
				path: reportPath,
			});

			return {
				ok: true,
				message: `Relatório criado: ${sessions.length} sessões com ${personName} (${firstDate} → ${lastDate}). Veja [${reportPath}](${reportPath}).`,
				data: { path: reportPath, sessionsCount: sessions.length, personName },
			};
		},
	},
	// v0.47 E4: Vault aggregation tools — para "email sobre sistemas da semana"
	{
		name: "aggregate_systems_by_period",
		description:
			"Agrega menções de sistemas em todas as notas do vault dentro de um período. Retorna mapa { sistema → { mentions: count, notePaths: [...] } }. Útil pra gerar emails/relatórios sobre status de múltiplos sistemas em janela temporal.",
		parameters: {
			type: "object",
			properties: {
				period: {
					type: "string",
					description: "today | week | month | custom",
					enum: ["today", "week", "month", "custom"],
				},
				since: {
					type: "string",
					description: "ISO date (apenas se period=custom)",
				},
				until: {
					type: "string",
					description: "ISO date (apenas se period=custom)",
				},
			},
			required: ["period"],
		},
		destructive: false,
		handler: async (params, plugin): Promise<ToolResult> => {
			const period = asStr(params.period, "week");
			const now = new Date();
			let start: Date;
			let end: Date = now;

			if (period === "today") {
				start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
			} else if (period === "week") {
				start = new Date(now.getTime() - 7 * 86_400_000);
			} else if (period === "month") {
				start = new Date(now.getFullYear(), now.getMonth(), 1);
			} else {
				const sinceStr = asStr(params.since);
				const untilStr = asStr(params.until);
				if (!sinceStr) return { ok: false, message: "period=custom requer since." };
				start = new Date(sinceStr);
				if (untilStr) end = new Date(untilStr);
			}

			const startMs = start.getTime();
			const endMs = end.getTime();

			const notes = plugin.app.vault
				.getMarkdownFiles()
				.filter((f) => f.stat.mtime >= startMs && f.stat.mtime <= endMs);

			const sysMod = await import("../automation/system-detector");
			const detector = new sysMod.SystemDetector(plugin.app, plugin);

			const aggregated = new Map<
				string,
				{ count: number; notePaths: Set<string> }
			>();

			for (const note of notes) {
				let text: string;
				try {
					text = await plugin.app.vault.cachedRead(note);
				} catch {
					continue;
				}
				const mentions = detector.detect(text);
				for (const m of mentions) {
					const cur =
						aggregated.get(m.systemName) ?? { count: 0, notePaths: new Set() };
					cur.count += 1;
					cur.notePaths.add(note.path);
					aggregated.set(m.systemName, cur);
				}
			}

			const results = Array.from(aggregated.entries())
				.map(([name, v]) => ({
					system: name,
					mentions: v.count,
					notes: Array.from(v.notePaths),
				}))
				.sort((a, b) => b.mentions - a.mentions);

			const summary = results
				.map((r) => `- **${r.system}** (${r.mentions} menções em ${r.notes.length} notas)`)
				.join("\n");

			return {
				ok: true,
				message:
					results.length === 0
						? `Nenhum sistema mencionado no período ${period}.`
						: `${results.length} sistemas mencionados (${period}):\n${summary}`,
				data: { period, since: start.toISOString(), until: end.toISOString(), results },
			};
		},
	},
	// v0.70.0 — Generic create_note tool (Bug #4-5-6 fix: criar+categorizar+abrir)
	{
		name: "create_note",
		description:
			"Cria uma nota markdown nova no vault Atlas com categorização automática e abre no editor. " +
			"Use quando user pedir 'crie documento', 'novo daily', 'gere relatório sobre X', 'crie ADR sobre Y', etc. " +
			"Auto-detecta noteType + folder destino (ex: daily → 02_Daily, weekly-status → 04_Reports/weekly).",
		parameters: {
			type: "object",
			properties: {
				title: { type: "string", description: "Título do documento (vira filename slugificado)" },
				noteType: {
					type: "string",
					description: "Tipo do documento (define folder Atlas)",
					enum: ["daily", "1on1", "meeting", "weekly-status", "project", "raid", "incident", "adr", "paper", "course", "knowledge", "inbox"],
				},
				content: {
					type: "string",
					description: "Conteúdo markdown completo (com frontmatter YAML opcional). Se vazio, Atlas gera template básico baseado em noteType.",
				},
			},
			required: ["title"],
		},
		destructive: false,
		handler: async (params, plugin) => {
			const title = asStr(params.title).trim();
			if (!title) return { ok: false, message: "Título obrigatório." };
			const rawType = asStr(params.noteType ?? "inbox").trim() as NoteType;
			const noteType: NoteType = ([
				"daily", "1on1", "meeting", "weekly-status", "project", "raid",
				"incident", "adr", "paper", "course", "knowledge", "inbox",
			] as NoteType[]).includes(rawType) ? rawType : "inbox";
			const userContent = asStr(params.content ?? "").trim();

			// Folder destino (reuso heuristic-classifier)
			const folder = targetFolderFor(noteType);
			const date = new Date().toISOString().slice(0, 10);
			const slug = slugify(title) || "atlas-note";
			const filename = noteType === "daily" ? `${date}.md` : `${date}-${slug}.md`;
			const targetPath = normalizePath(`${folder}/${filename}`);

			// Garantir folder existe
			try {
				const exists = await plugin.app.vault.adapter.exists(folder);
				if (!exists) await plugin.app.vault.adapter.mkdir(folder);
			} catch (e) {
				logger.warn("create_note: mkdir failed", { folder, error: String(e) });
			}

			// Resolve duplicate (suffix incremental)
			const safe = await resolveDuplicate(plugin.app, targetPath);

			// Frontmatter + content
			let body = userContent;
			if (!body) {
				body = `---\ntype: ${noteType}\ntitle: "${title}"\ndate: ${date}\ncreated_by: atlas\n---\n\n# ${title}\n\n_Atlas criou esta nota — adicione conteúdo aqui._\n`;
			} else if (!body.startsWith("---\n")) {
				body = `---\ntype: ${noteType}\ntitle: "${title}"\ndate: ${date}\ncreated_by: atlas\n---\n\n${body}`;
			}

			// Criar arquivo
			try {
				await plugin.app.vault.adapter.write(safe, body);
			} catch (e) {
				return { ok: false, message: `Falha ao criar nota: ${String(e)}` };
			}

			// AUTO-OPEN no editor
			try {
				const file = plugin.app.vault.getAbstractFileByPath(safe);
				if (file instanceof TFile) {
					await plugin.app.workspace.getLeaf().openFile(file);
				}
			} catch (e) {
				logger.warn("create_note: auto-open failed", { path: safe, error: String(e) });
			}

			logger.info("tool: create_note", { path: safe, noteType, title });
			return {
				ok: true,
				message: `✓ Nota "${title}" criada em \`${safe}\` e aberta no editor.`,
				data: { path: safe, noteType, folder },
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
		const { confirmAsync } = await import("../ui/confirm-modal");
		const ok = await confirmAsync(
			plugin.app,
			`${tool.description}\n\nParams:\n${JSON.stringify(params, null, 2)}`,
			{ title: `⚠️ Tool destrutiva: ${name}`, yesLabel: "Confirmar", danger: true }
		);
		if (!ok) {
			return { ok: false, message: "Cancelado pelo usuário." };
		}
	}
	try {
		const result = await tool.handler(params, plugin);
		logger.info("tool: executed", { name, ok: result.ok });
		// v0.57: dispatch event pra badge pulse animation no Master Sidebar
		if (result.ok) {
			const tabMap: Record<string, string> = {
				create_person: "knowledge",
				create_system: "systems",
				create_product: "products",
				create_role: "roles",
				create_course: "study",
				create_action_item: "hub",
				create_reminder: "reminders",
				schedule_meeting: "today",
				compose_email: "today",
				report_person_sessions: "reports",
				create_note: "today",
			};
			const tabId = tabMap[name];
			if (tabId) {
				document.dispatchEvent(new CustomEvent("atlas:entity-created", {
					detail: { tool: name, tabId },
				}));
			}
		}
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
