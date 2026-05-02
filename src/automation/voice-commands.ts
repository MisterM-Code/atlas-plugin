/**
 * Atlas Voice Commands — parser + dispatcher para "Atlas, ..." comandos.
 *
 * Detecta prefixo "atlas," / "atlas " na transcrição e despacha pra ação.
 *
 * Comandos suportados:
 *  1. "Atlas, capturar [texto]"           → cria task em Inbox
 *  2. "Atlas, abrir chat"                 → ativa Master Sidebar Chat
 *  3. "Atlas, daily" / "abrir daily"      → openOrCreateDailyLog
 *  4. "Atlas, lembrar [texto] [data]"     → cria reminder com chrono-node
 *  5. "Atlas, ler último weekly"          → Piper lê weekly mais recente
 *  6. "Atlas, status"                     → Piper fala briefing curto
 *  7. "Atlas, próximo um a um"            → Piper fala próximo 1:1 brief
 *  8. "Atlas, pesquisar [texto]"          → abre Spotlight com query
 */

import { Notice, normalizePath } from "obsidian";
import * as chrono from "chrono-node";
import type AtlasPlugin from "../../main";
import { logger } from "../utils/logger";
import { executeTool } from "../agent/tool-registry";

export interface VoiceCommandResult {
	matched: boolean;
	command?: string;
	feedback?: string; // texto pra Piper falar de volta (opcional)
	/** v0.9.2: when a partial intent is detected, Jarvis can ask for missing fields. */
	needsFollowUp?: {
		tool: string;
		params: Record<string, unknown>;
		fieldsToAsk: { name: string; question: string }[];
	};
}

const ATLAS_PREFIX = /^\s*(?:ei\s+|olha\s+|hey\s+)?(?:atlas|atalas|atras|atos)[,\s]+/i;

/**
 * Tenta despachar um comando de voz. Retorna { matched: true } se reconheceu.
 */
export async function dispatchVoiceCommand(
	plugin: AtlasPlugin,
	transcript: string
): Promise<VoiceCommandResult> {
	const cleaned = transcript.trim();
	if (!ATLAS_PREFIX.test(cleaned)) {
		return { matched: false };
	}

	const command = cleaned.replace(ATLAS_PREFIX, "").trim();
	const lower = command.toLowerCase();
	logger.info("voice: command detected", { command });

	// 1. Capturar [texto]
	if (/^(captur|cri[ae]r?\s+task|registr[ae]r?|anot[ae])/.test(lower)) {
		const taskText = command.replace(/^(captur[ae]?r?|cri[ae]r?\s+task|registr[ae]r?|anot[ae])\s+/i, "").trim();
		if (taskText.length > 0) {
			await captureTask(plugin, taskText);
			return {
				matched: true,
				command: "capturar",
				feedback: `Capturado: ${taskText.substring(0, 60)}`,
			};
		}
	}

	// 2. Abrir chat
	if (/^(abr[ie]r?|começar|inicia[rl]?)\s+(o\s+)?chat/.test(lower)) {
		await plugin.activateMasterTab("chat");
		return { matched: true, command: "abrir-chat", feedback: "Chat aberto." };
	}

	// 3. Daily log
	if (/^(abr[ie]r?\s+)?(o\s+)?daily(\s+log)?$/.test(lower) || /^daily$/.test(lower)) {
		const apiAny = plugin.app as unknown as {
			commands?: { executeCommandById?: (id: string) => void };
		};
		apiAny.commands?.executeCommandById?.("atlas:daily-log");
		return { matched: true, command: "daily", feedback: "Daily log aberto." };
	}

	// 4. Lembrar [texto] [data]
	if (/^(lembr[ae]r?|me\s+lembr|reminder|relembr)/.test(lower)) {
		const textPart = command.replace(/^(lembr[ae]r?|me\s+lembr[ae]r?|reminder|relembr[ae]r?)\s+(de\s+|que\s+)?/i, "").trim();
		const parsed = chrono.pt.parse(textPart, new Date(), { forwardDate: true });
		if (parsed.length === 0) {
			return {
				matched: true,
				command: "lembrar-fail",
				feedback: "Não consegui entender a data. Tente: 'Atlas, lembrar de comprar leite amanhã às 10'.",
			};
		}
		const date = parsed[0].date();
		const dateText = parsed[0].text;
		const reminderText = textPart.replace(dateText, "").trim();
		await createReminder(plugin, reminderText, date);
		return {
			matched: true,
			command: "lembrar",
			feedback: `Reminder criado: ${reminderText} para ${date.toLocaleString("pt-BR")}`,
		};
	}

	// 5. Ler último weekly
	if (/^(ler|leia|le)\s+(o\s+)?(último\s+|ultimo\s+)?weekly/.test(lower)) {
		const reportsFolder = plugin.settings.folders.reports;
		const weekly = plugin.app.vault
			.getMarkdownFiles()
			.filter((f) => f.path.startsWith(`${reportsFolder}/weekly`))
			.sort((a, b) => b.stat.mtime - a.stat.mtime)[0];
		if (!weekly) {
			return { matched: true, command: "ler-weekly", feedback: "Nenhum weekly encontrado ainda." };
		}
		try {
			const content = await plugin.app.vault.read(weekly);
			// Tira frontmatter + headings markdown
			const cleaned2 = content.replace(/^---[\s\S]*?---\n/, "").replace(/^#+\s+/gm, "").substring(0, 2000);
			if (plugin.tts?.configured) {
				await plugin.tts.speakNow(cleaned2);
			}
			return { matched: true, command: "ler-weekly", feedback: "Lendo o weekly mais recente." };
		} catch (e) {
			logger.warn("voice: ler weekly falhou", { error: String(e) });
			return { matched: true, command: "ler-weekly", feedback: "Erro ao ler weekly." };
		}
	}

	// 6. Status
	if (/^status|^briefing|^resumo/.test(lower)) {
		const today = new Date().toISOString().split("T")[0];
		const overdue = plugin.kg.data.actionItems.filter(
			(a) => a.status !== "completed" && a.status !== "cancelled" && a.dueDate && a.dueDate < today
		).length;
		const dueToday = plugin.kg.data.actionItems.filter(
			(a) => a.status !== "completed" && a.dueDate?.startsWith(today)
		).length;
		const flashcardsDue = plugin.flashcards?.dueToday().length ?? 0;
		const briefing = `Hoje: ${dueToday} tarefas pra hoje, ${overdue} atrasadas, ${flashcardsDue} flashcards pra revisar.`;
		if (plugin.tts?.configured) {
			await plugin.tts.speakNow(briefing);
		}
		new Notice(briefing, 8000);
		return { matched: true, command: "status", feedback: briefing };
	}

	// 7. Próximo 1:1
	if (/(pr[óo]ximo|next).+(um\s+a\s+um|1.?on.?1|1[\s:]?1|reuni[ãa]o)/.test(lower)) {
		const apiAny = plugin.app as unknown as {
			commands?: { executeCommandById?: (id: string) => void };
		};
		apiAny.commands?.executeCommandById?.("atlas:prepare-1on1");
		return { matched: true, command: "proximo-1on1", feedback: "Brief de próximo 1:1 sendo preparado." };
	}

	// 8. Pesquisar
	if (/^(pesquis[ae]r?|busc[ae]r?|search|procur[ae]r?)/.test(lower)) {
		const query = command.replace(/^(pesquis[ae]r?|busc[ae]r?|search|procur[ae]r?)\s+/i, "").trim();
		if (query.length > 0) {
			const apiAny = plugin.app as unknown as {
				commands?: { executeCommandById?: (id: string) => void };
			};
			apiAny.commands?.executeCommandById?.("atlas:spotlight");
			return { matched: true, command: "pesquisar", feedback: `Buscando: ${query}` };
		}
	}

	// v0.9.2 Sprint 32.4 — Partial intent detection (Jarvis asks for missing fields)
	const partial = detectPartialIntent(lower, command);
	if (partial) {
		return {
			matched: true,
			command: `partial:${partial.tool}`,
			needsFollowUp: partial,
		};
	}

	// v0.9 Sprint 28.3 — 8 comandos MUTADORES via tool registry

	// 9. Criar pessoa
	const personMatch = lower.match(
		/^cri[ae]r?\s+pessoa\s+(.+?)(?:\s+(?:como|tipo)\s+(direct[\s-]?report|peer|manager|skip[\s-]?level|stakeholder|coachee))?(?:\s+(?:cargo|role)\s+([a-zA-ZÀ-ÿ][\w\sÀ-ÿ]+?))?(?:\s+(?:do\s+)?(?:time|equipe|squad)\s+([a-zA-ZÀ-ÿ][\w\sÀ-ÿ]+?))?$/
	);
	if (personMatch) {
		const name = personMatch[1].trim();
		const type = (personMatch[2] ?? "other").replace(/[\s-]+/g, "-");
		const role = personMatch[3]?.trim();
		const team = personMatch[4]?.trim();
		const r = await executeTool("create_person", { name, type, role, team }, plugin);
		return { matched: true, command: "create-person", feedback: r.message };
	}

	// 10. Criar sistema
	const systemMatch = lower.match(/^cri[ae]r?\s+sistema\s+(.+?)(?:[,\s]+(?:vendor|fornecedor)\s+(.+))?$/);
	if (systemMatch) {
		const name = systemMatch[1].trim();
		const vendor = systemMatch[2]?.trim();
		const r = await executeTool("create_system", { name, vendor }, plugin);
		return { matched: true, command: "create-system", feedback: r.message };
	}

	// 11. Criar produto
	const productMatch = lower.match(/^cri[ae]r?\s+produto\s+(.+)$/);
	if (productMatch) {
		const name = productMatch[1].trim();
		const r = await executeTool("create_product", { name }, plugin);
		return { matched: true, command: "create-product", feedback: r.message };
	}

	// 12. Criar cargo
	const roleMatch = lower.match(/^cri[ae]r?\s+cargo\s+(.+?)(?:\s+(?:level|nivel)\s+(.+))?$/);
	if (roleMatch) {
		const title = roleMatch[1].trim();
		const level = roleMatch[2]?.trim();
		const r = await executeTool("create_role", { title, level }, plugin);
		return { matched: true, command: "create-role", feedback: r.message };
	}

	// 13. Criar curso
	const courseMatch = lower.match(/^cri[ae]r?\s+curso\s+(.+?)(?:\s+(?:n[oa]|em|via|on|do|da)\s+(.+))?$/);
	if (courseMatch) {
		const name = courseMatch[1].trim();
		const provider = courseMatch[2]?.trim();
		const r = await executeTool("create_course", { name, provider }, plugin);
		return { matched: true, command: "create-course", feedback: r.message };
	}

	// 14. Agendar reunião / 1:1
	const meetMatch = lower.match(/^(?:agend[ae]r?|marc[ae]r?)\s+(?:reuni[ãa]o|1[\s:]?1|um\s+a\s+um)\s+com\s+(.+?)\s+(.+)$/);
	if (meetMatch) {
		const person = meetMatch[1].trim();
		const datetime = meetMatch[2].trim();
		const r = await executeTool("schedule_meeting", { person, datetime }, plugin);
		return { matched: true, command: "schedule-meeting", feedback: r.message };
	}

	// 15. Mandar email
	const emailMatch = lower.match(/^(?:mand[ae]r?|envi[ae]r?|escrev[ae]r?)\s+email\s+(?:para|pra|pro|p\/)\s+(.+?)\s+(?:sobre|com\s+assunto)\s+(.+)$/);
	if (emailMatch) {
		const to = emailMatch[1].trim();
		const subject = emailMatch[2].trim();
		const r = await executeTool("compose_email", { to, subject, body: "" }, plugin);
		return { matched: true, command: "compose-email", feedback: r.message };
	}

	// 16. Trocar perfil
	const profileMatch = lower.match(/^(?:trocar?|mudar?)\s+(?:para\s+)?perfil\s+(.+)$/);
	if (profileMatch) {
		const profile_id = profileMatch[1]
			.trim()
			.replace(/[\s_]+/g, "-")
			.replace("ti", "ti-")
			.replace("--", "-");
		const r = await executeTool("switch_profile", { profile_id }, plugin);
		return { matched: true, command: "switch-profile", feedback: r.message };
	}

	// Fallback: comando não reconhecido
	return {
		matched: true,
		command: "unknown",
		feedback: `Não entendi: "${command.substring(0, 60)}". Tente: capturar, daily, status, lembrar, criar pessoa, criar sistema, agendar reunião, mandar email.`,
	};
}

/**
 * v0.9.2 Sprint 32.4 — Detect partial intents and return the conversation
 * Jarvis should start (asking for missing fields).
 */
function detectPartialIntent(
	lower: string,
	command: string
): { tool: string; params: Record<string, unknown>; fieldsToAsk: { name: string; question: string }[] } | null {
	// "criar pessoa" (bare, no name) → ask name + type
	if (/^cri[ae]r?\s+pessoa\s*$/.test(lower) || lower === "nova pessoa") {
		return {
			tool: "create_person",
			params: {},
			fieldsToAsk: [
				{ name: "name", question: "Qual o nome completo da pessoa?" },
				{
					name: "type",
					question:
						"Qual o tipo? Diga: direct-report, peer, manager, skip-level, stakeholder, coachee ou other.",
				},
			],
		};
	}

	// "criar pessoa NAME" (sem tipo) — pega o nome e pergunta tipo
	const personNameOnly = /^cri[ae]r?\s+pessoa\s+(.+)$/.exec(command);
	if (
		personNameOnly &&
		!/(direct[\s-]?report|peer|manager|skip[\s-]?level|stakeholder|coachee)/.test(lower)
	) {
		const name = personNameOnly[1].trim();
		// se já é frase completa cuidadosa com info de cargo/time, deixa dispatcher principal pegar
		if (name.length > 0 && name.length < 80 && !/cargo|time|equipe|squad/.test(name)) {
			return {
				tool: "create_person",
				params: { name },
				fieldsToAsk: [
					{
						name: "type",
						question: `Qual o tipo de relação com ${name}? Direct-report, peer, manager, skip-level, stakeholder, coachee ou other?`,
					},
				],
			};
		}
	}

	// "criar sistema" (bare) — ask name
	if (/^cri[ae]r?\s+sistema\s*$/.test(lower) || lower === "novo sistema") {
		return {
			tool: "create_system",
			params: {},
			fieldsToAsk: [
				{ name: "name", question: "Qual o nome do sistema?" },
				{ name: "vendor", question: "Qual o vendor ou fornecedor? (Diga 'nenhum' se interno.)" },
			],
		};
	}

	// "criar produto" (bare)
	if (/^cri[ae]r?\s+produto\s*$/.test(lower) || lower === "novo produto") {
		return {
			tool: "create_product",
			params: {},
			fieldsToAsk: [{ name: "name", question: "Qual o nome do produto?" }],
		};
	}

	// "criar cargo" (bare)
	if (/^cri[ae]r?\s+cargo\s*$/.test(lower) || lower === "novo cargo") {
		return {
			tool: "create_role",
			params: {},
			fieldsToAsk: [
				{ name: "title", question: "Qual o título do cargo?" },
				{ name: "level", question: "Qual o nível? (ex: L5, Senior, Junior. Diga 'nenhum' pra pular.)" },
			],
		};
	}

	// "criar curso" (bare)
	if (/^cri[ae]r?\s+curso\s*$/.test(lower) || lower === "novo curso") {
		return {
			tool: "create_course",
			params: {},
			fieldsToAsk: [
				{ name: "name", question: "Qual o nome do curso?" },
				{ name: "provider", question: "Qual o provider? (Coursera, Udemy, livro, etc. Diga 'nenhum' pra pular.)" },
			],
		};
	}

	// "agendar reunião com PERSON" sem datetime
	const meetPersonOnly = /^(?:agend[ae]r?|marc[ae]r?)\s+(?:reuni[ãa]o|1[\s:]?1|um\s+a\s+um)\s+com\s+(.+?)$/.exec(command);
	if (meetPersonOnly) {
		const person = meetPersonOnly[1].trim();
		// Deixa dispatcher pegar se person já tem datetime no fim (ex: "amanhã 14h")
		if (!/\d|amanh[aã]|hoje|sexta|segunda|ter[cç]a|quart|quint|s[áa]bado|domingo/i.test(person)) {
			return {
				tool: "schedule_meeting",
				params: { person },
				fieldsToAsk: [
					{ name: "datetime", question: `Quando agendar com ${person}? (ex: amanhã 14h, sexta 10h)` },
				],
			};
		}
	}

	// "criar reminder" / "lembrar" (bare)
	if (/^lembr[ae]r?\s*$/.test(lower) || lower === "novo reminder" || lower === "criar reminder") {
		return {
			tool: "create_reminder",
			params: {},
			fieldsToAsk: [
				{ name: "text", question: "O que você quer ser lembrado?" },
				{ name: "datetime", question: "Quando? (ex: amanhã às 9h, sexta 14h)" },
			],
		};
	}

	// "mandar email" (bare)
	if (/^(?:mand[ae]r?|envi[ae]r?)\s+email\s*$/.test(lower)) {
		return {
			tool: "compose_email",
			params: {},
			fieldsToAsk: [
				{ name: "to", question: "Para quem? (nome de pessoa do KG ou email completo)" },
				{ name: "subject", question: "Qual o assunto?" },
			],
		};
	}

	return null;
}

async function captureTask(plugin: AtlasPlugin, text: string): Promise<void> {
	const inbox = plugin.settings.folders.inbox;
	const date = new Date().toISOString().split("T")[0];
	const slug = text
		.substring(0, 40)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	const path = normalizePath(`${inbox}/${date}-voice-${slug}.md`);

	if (!plugin.app.vault.getAbstractFileByPath(inbox)) {
		try {
			await plugin.app.vault.createFolder(inbox);
		} catch {
			// race
		}
	}

	const md = `---
type: capture
captured_at: ${new Date().toISOString()}
captured_via: voice
---

# 🎙️ ${text.substring(0, 80)}

- [ ] ${text}

`;
	try {
		await plugin.app.vault.create(path, md);
		new Notice(`🎙️ Atlas: capturado "${text.substring(0, 50)}"`);
	} catch (e) {
		logger.warn("voice: capturar falhou", { error: String(e) });
	}
}

async function createReminder(plugin: AtlasPlugin, text: string, date: Date): Promise<void> {
	const dateStr = date.toISOString().substring(0, 16).replace("T", " ");
	const reminderLine = `- [ ] ${text} (@${dateStr}) #voice-reminder`;
	const inbox = plugin.settings.folders.inbox;
	const today = new Date().toISOString().split("T")[0];
	const path = normalizePath(`${inbox}/${today}-voice-reminders.md`);

	let content = `---\ntype: voice-reminders\ndate: ${today}\n---\n\n# 🎙️ Voice reminders ${today}\n\n`;

	const existing = plugin.app.vault.getAbstractFileByPath(path);
	if (existing && "stat" in existing) {
		try {
			content = await plugin.app.vault.read(existing as never);
		} catch {
			// fallback to default
		}
		await plugin.app.vault.modify(existing as never, content + reminderLine + "\n");
	} else {
		if (!plugin.app.vault.getAbstractFileByPath(inbox)) {
			try {
				await plugin.app.vault.createFolder(inbox);
			} catch {
				// race
			}
		}
		await plugin.app.vault.create(path, content + reminderLine + "\n");
	}

	new Notice(`🎙️ Atlas: reminder agendado para ${date.toLocaleString("pt-BR")}`);
}
