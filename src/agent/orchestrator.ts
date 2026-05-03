/**
 * Atlas v0.48 — Multi-agent Orchestrator (v0.47 E3 deferred).
 *
 * Pra queries complexas tipo "crie email sobre todos os sistemas da semana"
 * roteia em pipeline: Researcher (cheap LLM) → Writer (quality LLM).
 *
 * Token economy: researcher trabalha em modelo barato/local pra coletar dados
 * estruturados (compact JSON), writer recebe dados pré-mastigados e gera markdown
 * usando modelo qualidade. Total ≈ 6K tokens vs ≈ 50K em mega-prompt único.
 */

import type AtlasPlugin from "../../main";
import type { AgentResponse } from "./agent";
import { ResearcherAgent, type ResearchData } from "./researcher";
import { WriterAgent } from "./writer";
import { logger } from "../utils/logger";

const COMPLEX_PATTERNS = [
	// "gere relatório/email/análise/resumo/sumário/insight/brief sobre X"
	/^(?:gere?|cria(?:r)?|fa[çc]a|monte|elabor[ae])\s+(?:um\s+|uma\s+)?(?:relat[oó]rio|email|an[aá]lise|resumo|sum[aá]rio|consolida[cç][aã]o|insight|brief|documento)/i,
	// "email sobre/de/com X"
	/^(?:email|relat[oó]rio|an[aá]lise)\s+(?:sobre|de|com|dos|das)/i,
	// "consolide/agregue todas as X"
	/^(?:consolid|agreg|junt|reun)[ae]?\s+(?:tod[ao]s?|os|as)\s/i,
	// v0.70.0 BUG #8: deep research patterns expandidos
	// "deep dive em X" / "análise profunda dos últimos N" / "exhaustivamente sobre X"
	/(?:deep\s+dive|an[aá]lise\s+profunda|profundamente|exhaustiv|detalhad[ao])/i,
	// "o que <pessoa> disse sobre X" / "histórico de X" / "todas as <coisas> com Y"
	/^(?:o\s+que\s+\S{3,}\s+(?:disse|falou|comentou)|hist[oó]rico\s+de|todas?\s+(?:as|os)\s+\w+\s+(?:com|de|sobre))/i,
	// "compare X com Y" / "diferenças entre"
	/^(?:compare|comparar|comparativo|diferen[çc]as?\s+entre|vs\s)/i,
];

export interface OrchestrationResult {
	matched: boolean;
	intent?: "report" | "email" | "analysis" | "summary";
	scope?: {
		personName?: string;
		systemNames?: string[];
		period?: "today" | "week" | "month" | "custom";
	};
}

export class OrchestratorAgent {
	constructor(private plugin: AtlasPlugin) {}

	/** Heurística: query precisa de pipeline multi-agent? */
	matches(query: string): OrchestrationResult {
		const trimmed = query.trim();
		const matched = COMPLEX_PATTERNS.some((p) => p.test(trimmed));
		if (!matched) return { matched: false };

		// Extract intent type
		let intent: OrchestrationResult["intent"] = "summary";
		if (/email/i.test(trimmed)) intent = "email";
		else if (/relat[oó]rio/i.test(trimmed)) intent = "report";
		else if (/an[aá]lise/i.test(trimmed)) intent = "analysis";

		// Extract period (simple keywords)
		let period: OrchestrationResult["scope"] = {};
		if (/\bhoje\b/i.test(trimmed)) period = { period: "today" };
		else if (/\bsemana\b/i.test(trimmed)) period = { period: "week" };
		else if (/\bm[eê]s\b/i.test(trimmed)) period = { period: "month" };

		// Extract person name (first capitalized after "do/da/com")
		const personMatch = /(?:com|do|da|sobre)\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáàâãéèêíïóôõöúçñ]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáàâãéèêíïóôõöúçñ]+)?)/.exec(trimmed);
		if (personMatch) period.personName = personMatch[1];

		// Extract system names (heuristic: known systems mentioned)
		const systems: string[] = [];
		for (const sys of this.plugin.kg.data.systems) {
			const namePat = new RegExp(`\\b${escapeRegex(sys.name)}\\b`, "i");
			if (namePat.test(trimmed)) systems.push(sys.name);
		}
		if (systems.length > 0) period.systemNames = systems;

		return { matched: true, intent, scope: period };
	}

	/** Run full pipeline: research → write. Atualiza UI via progress callback. */
	async run(
		query: string,
		opts?: { onProgress?: (stage: string) => void }
	): Promise<AgentResponse> {
		const ctx = this.matches(query);
		opts?.onProgress?.("🔍 Pesquisando vault e KG...");

		const researcher = new ResearcherAgent(this.plugin);
		const data = await researcher.gather(query, ctx);

		opts?.onProgress?.("✍️ Compondo resposta...");

		const writer = new WriterAgent(this.plugin);
		const answer = await writer.compose(query, data, ctx);

		logger.info("orchestrator: pipeline complete", {
			intent: ctx.intent,
			dataKeys: Object.keys(data),
			answerLen: answer.length,
		});

		return {
			answer,
			citations: data.notesUsed?.map((p) => ({ notePath: p, snippet: "" })) ?? [],
			toolsUsed: ["orchestrator", "researcher", "writer"],
		};
	}
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type { ResearchData };
