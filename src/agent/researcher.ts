/**
 * Atlas v0.48 — Researcher Agent.
 *
 * Especializado em coletar dados estruturados do KG + vault. Roda em modelo
 * barato/local (cheap, fast). Retorna ResearchData (JSON conciso) pro Writer.
 *
 * Token economy: usa tools existentes (aggregate_systems_by_period, KG queries)
 * e LLMService com taskKind="extraction" → roteia pra Haiku (cheap) ou Ollama local.
 */

import type AtlasPlugin from "../../main";
import type { OrchestrationResult } from "./orchestrator";
import { logger } from "../utils/logger";

export interface ResearchData {
	personSummary?: {
		name: string;
		sessionsCount: number;
		recentSessions: Array<{ date: string; framework?: string; sourceNotePath?: string }>;
		topThemes: Array<{ name: string; frequency: number; sentiment?: string }>;
		openCommitments: number;
	};
	systemAggregation?: Array<{ system: string; mentions: number; notePaths: string[] }>;
	period?: { start: string; end: string; label: string };
	rawDigest?: string; // freeform notes for writer
	notesUsed?: string[];
}

export class ResearcherAgent {
	constructor(private plugin: AtlasPlugin) {}

	async gather(query: string, ctx: OrchestrationResult): Promise<ResearchData> {
		const data: ResearchData = { notesUsed: [] };

		// Person scope → KG aggregation
		if (ctx.scope?.personName) {
			const person = this.plugin.kg.findPersonByName(ctx.scope.personName);
			if (person) {
				const sessions = this.plugin.kg.listSessionsByPerson(person.id);
				const recent = sessions.slice(0, 10);
				const themes = this.plugin.kg.listTopThemesForPerson(person.id, 8);
				const commits = this.plugin.kg.listOpenCommitmentsBetween(person.id, "eu");
				data.personSummary = {
					name: person.name,
					sessionsCount: sessions.length,
					recentSessions: recent.map((s) => ({
						date: s.date,
						framework: s.framework,
						sourceNotePath: s.sourceNotePath,
					})),
					topThemes: themes.map((t) => ({
						name: t.name,
						frequency: t.frequency,
						sentiment: t.sentiment,
					})),
					openCommitments: commits.length,
				};
				for (const s of recent) {
					if (s.sourceNotePath) data.notesUsed?.push(s.sourceNotePath);
				}
			}
		}

		// Period + systems → aggregate via existing tool
		if (ctx.scope?.period) {
			const range = this.computePeriodRange(ctx.scope.period);
			data.period = range;
			try {
				const toolMod = await import("./tool-registry");
				const result = await toolMod.executeTool(
					"aggregate_systems_by_period",
					{ period: ctx.scope.period },
					this.plugin,
					{ skipConfirm: true }
				);
				if (result.ok && result.data) {
					const aggregated = (result.data as { aggregated?: Array<{ system: string; count: number; paths: string[] }> }).aggregated ?? [];
					data.systemAggregation = aggregated.map((a) => ({
						system: a.system,
						mentions: a.count,
						notePaths: a.paths,
					}));
					// merge note paths
					for (const a of aggregated) {
						for (const p of a.paths) {
							if (!data.notesUsed?.includes(p)) data.notesUsed?.push(p);
						}
					}
				}
			} catch (e) {
				logger.warn("researcher: aggregate_systems failed", { error: String(e) });
			}
		}

		// Optional: ask cheap LLM to digest the raw query into research notes (opt-in if data thin)
		const hasData = data.personSummary || (data.systemAggregation?.length ?? 0) > 0;
		if (!hasData && this.plugin.llm) {
			try {
				const digest = await this.plugin.llm.chat(
					[
						{
							role: "system" as const,
							content:
								"Você é pesquisador. Resuma em <=80 palavras o que precisa ser coletado pra responder a query. Seja específico e cite ferramentas/queries necessárias.",
						},
						{ role: "user" as const, content: query },
					],
					{
						feature: "agent.researcher",
						taskKind: "extraction",
						temperature: 0.2,
						maxTokens: 200,
						// v0.52.2: research = digest curto, sempre cheap model
						complexityHint: "simple",
					}
				);
				data.rawDigest = digest;
			} catch (e) {
				logger.warn("researcher: digest LLM failed", { error: String(e) });
			}
		}

		logger.info("researcher: gathered", {
			hasPerson: !!data.personSummary,
			systemCount: data.systemAggregation?.length ?? 0,
			notes: data.notesUsed?.length ?? 0,
		});

		return data;
	}

	private computePeriodRange(p: "today" | "week" | "month" | "custom"): {
		start: string;
		end: string;
		label: string;
	} {
		const now = new Date();
		const end = now.toISOString().split("T")[0];
		const startD = new Date(now);
		let label = "";
		if (p === "today") {
			label = "hoje";
		} else if (p === "week") {
			startD.setDate(now.getDate() - 7);
			label = "última semana";
		} else if (p === "month") {
			startD.setDate(now.getDate() - 30);
			label = "último mês";
		}
		const start = startD.toISOString().split("T")[0];
		return { start, end, label };
	}
}
