/**
 * Atlas v0.47 E1 — Intent Dispatcher V2.
 *
 * Pipeline estruturado pra detectar intent + resolver entities + executar tool
 * sem chamar LLM quando heurística é suficiente.
 *
 * Token economy: ZERO LLM calls em 80%+ dos casos:
 *  - "PIX com problema" → System lookup → action_item linkado
 *  - "Miguel faltou hoje" → Person lookup → action_item linkado
 *  - "lembrar reunião sexta 14h" → chrono parse → reminder
 *
 * Quando heurística NÃO resolve (ambiguous, low confidence) → DispatchResult
 * com kind="fallback" → caller envia pro LLM normal (Agent.run com tools).
 */

import * as chrono from "chrono-node";
import type AtlasPlugin from "../../main";

export type DispatchResult =
	/** High confidence: executar tool diretamente. ZERO LLM. */
	| {
			kind: "direct";
			intent: string;
			tool: string;
			toolArgs: Record<string, unknown>;
			confidence: number;
			feedback: string; // mensagem human-readable do que será executado
	  }
	/** Slot crítico faltando: agent pergunta antes de executar. */
	| {
			kind: "needs_slot";
			intent: string;
			pendingTool: string;
			partialArgs: Record<string, unknown>;
			missingSlot: string;
			promptText: string;
	  }
	/** Match ambíguo: 2+ entities com mesmo nome. Caller pergunta. */
	| {
			kind: "ambiguous";
			intent: string;
			candidates: { id: string; label: string }[];
			promptText: string;
	  }
	/** Sem match heurístico: caller deve usar LLM. */
	| { kind: "fallback"; reason: string };

interface PatternMatcher {
	id: string;
	regex: RegExp;
	intent: string;
	build: (
		match: RegExpMatchArray,
		plugin: AtlasPlugin,
		query: string
	) => DispatchResult | null;
}

const PATTERNS: PatternMatcher[] = [
	// "PIX com problema", "Stripe falhou", "Asaas tá com erro"
	{
		id: "system_issue",
		regex: /^([\w\s]+?)\s+(?:com|tem|está\s+com|ta\s+com|tá\s+com|teve|deu|caiu|falhou|com\s+erro|com\s+problema)\s*(.*)$/i,
		intent: "system_issue",
		build: (match, plugin, query): DispatchResult | null => {
			const candidate = match[1]?.trim();
			const rest = match[2]?.trim() ?? "";
			if (!candidate || candidate.length < 2) return null;
			const system = plugin.kg.findSystemByName(candidate);
			if (!system) return null;

			// Date inference: "hoje" default
			const dueDate = parseDate(query) ?? new Date().toISOString().split("T")[0];
			const description = `🚨 ${system.name}: ${rest || "problema reportado"}`;

			return {
				kind: "direct",
				intent: "system_issue",
				tool: "create_action_item",
				toolArgs: {
					text: description,
					due: dueDate,
				},
				confidence: 0.92,
				feedback: `Action item criado para Sistema "${system.name}".`,
			};
		},
	},
	// "Miguel faltou", "Maria atrasou", "João não veio hoje"
	{
		id: "person_missed",
		regex: /^([\w\s]+?)\s+(faltou|atrasou|não\s+veio|nao\s+veio|n\s+veio|chegou\s+tarde)\s*(.*)$/i,
		intent: "person_missed",
		build: (match, plugin, query): DispatchResult | null => {
			const candidate = match[1]?.trim();
			const verb = match[2]?.trim() ?? "faltou";
			if (!candidate || candidate.length < 2) return null;
			const person = plugin.kg.findPersonByName(candidate);
			if (!person) return null;

			const dueDate = parseDate(query) ?? new Date().toISOString().split("T")[0];
			const description = `${person.name} ${verb} (${dueDate})`;

			return {
				kind: "direct",
				intent: "person_missed",
				tool: "create_action_item",
				toolArgs: {
					text: description,
					owner: person.name,
					due: dueDate,
				},
				confidence: 0.90,
				feedback: `Action item criado vinculado a ${person.name}.`,
			};
		},
	},
	// "lembrar de X sexta 14h", "lembrete: pagar boleto amanhã"
	{
		id: "reminder",
		regex: /^(?:lembrar(?:\s+de)?|lembrete:?)\s+(.+)$/i,
		intent: "reminder",
		build: (match, plugin, query): DispatchResult | null => {
			const text = match[1]?.trim();
			if (!text) return null;
			const dateRes = chrono.pt.parse(query, new Date(), { forwardDate: true });
			if (dateRes.length === 0) {
				return {
					kind: "needs_slot",
					intent: "reminder",
					pendingTool: "create_reminder",
					partialArgs: { text },
					missingSlot: "datetime",
					promptText: "Pra quando? (ex: amanhã 14h, sexta 9h)",
				};
			}
			const dt = dateRes[0].date().toISOString();
			return {
				kind: "direct",
				intent: "reminder",
				tool: "create_reminder",
				toolArgs: { text, datetime: dt },
				confidence: 0.95,
				feedback: `Reminder criado: "${text}".`,
			};
		},
	},
	// "anotação curso X: <text>", "nota do curso X: <text>"
	{
		id: "course_note",
		regex: /^(?:anota[cç][aã]o|nota)\s+(?:do\s+)?curso\s+(.+?)(?::|\.|\s+sobre)?\s*(.*)$/i,
		intent: "course_note",
		build: (match, plugin): DispatchResult | null => {
			const courseName = match[1]?.trim();
			const rest = match[2]?.trim() ?? "";
			if (!courseName) return null;
			const course = plugin.kg.findCourseByName(courseName);
			if (!course) {
				return {
					kind: "fallback",
					reason: `Curso "${courseName}" não cadastrado. Cadastre via Quick Add primeiro.`,
				};
			}
			if (!rest || rest.length < 3) {
				return {
					kind: "needs_slot",
					intent: "course_note",
					pendingTool: "create_action_item",
					partialArgs: { course: course.name },
					missingSlot: "note_text",
					promptText: "O que você quer anotar sobre este curso?",
				};
			}
			return {
				kind: "direct",
				intent: "course_note",
				tool: "create_action_item",
				toolArgs: {
					text: `📚 ${course.name}: ${rest}`,
				},
				confidence: 0.88,
				feedback: `Anotação criada para curso "${course.name}".`,
			};
		},
	},
	// "agendar 1:1 com Miguel sexta 14h" / "agendar reunião com Maria amanhã"
	{
		id: "schedule_meeting",
		regex: /^(?:agend[ae]r?|marc[ae]r?)\s+(?:1:?1|um[\s-]?on[\s-]?one|reuni[aã]o|meet)\s+(?:com\s+)?(.+?)$/i,
		intent: "schedule_meeting",
		build: (match, plugin, query): DispatchResult | null => {
			const rest = match[1]?.trim();
			if (!rest) return null;
			// Pessoa = primeiras palavras antes de "amanhã"/"sexta"/"14h"
			const dateRes = chrono.pt.parse(query, new Date(), { forwardDate: true });
			let personPart = rest;
			if (dateRes.length > 0) {
				// Strip date tokens from rest
				for (const r of dateRes) {
					personPart = personPart.replace(r.text, "").trim();
				}
			}
			personPart = personPart.replace(/(?:em|às|as|no|na)\s*$/i, "").trim();
			if (!personPart || personPart.length < 2) return null;

			const person = plugin.kg.findPersonByName(personPart);
			if (!person) return null;

			if (dateRes.length === 0) {
				return {
					kind: "needs_slot",
					intent: "schedule_meeting",
					pendingTool: "schedule_meeting",
					partialArgs: { person: person.name },
					missingSlot: "datetime",
					promptText: `Quando vai ser o 1:1 com ${person.name}? (ex: amanhã 14h)`,
				};
			}

			return {
				kind: "direct",
				intent: "schedule_meeting",
				tool: "schedule_meeting",
				toolArgs: {
					person: person.name,
					datetime: dateRes[0].date().toISOString(),
				},
				confidence: 0.90,
				feedback: `Reunião agendada com ${person.name}.`,
			};
		},
	},
];

/**
 * Tenta despachar query via heurística. Retorna null se nenhum pattern match
 * (caller deve fallback pra LLM).
 */
export function tryDispatch(query: string, plugin: AtlasPlugin): DispatchResult | null {
	const trimmed = query.trim();
	if (!trimmed) return null;

	for (const pat of PATTERNS) {
		const match = pat.regex.exec(trimmed);
		if (!match) continue;
		try {
			const result = pat.build(match, plugin, trimmed);
			if (result) return result;
		} catch {
			// pattern internal error — try next
		}
	}

	return null;
}

/** Helper: extract date from query (any ISO string returned, or null). */
function parseDate(query: string): string | null {
	const res = chrono.pt.parse(query, new Date(), { forwardDate: true });
	if (res.length === 0) return null;
	return res[0].date().toISOString().split("T")[0];
}
