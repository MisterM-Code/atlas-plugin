/**
 * Atlas v0.48 — Writer Agent.
 *
 * Recebe ResearchData (dados pré-mastigados pelo Researcher) e gera markdown
 * profissional em PT-BR. Usa modelo qualidade (Sonnet/Opus se cloud, ou qwen
 * local). taskKind="writing" pra routing apropriado.
 *
 * Token economy: input já é compacto (research data em JSON), prompt focado.
 */

import type AtlasPlugin from "../../main";
import type { OrchestrationResult } from "./orchestrator";
import type { ResearchData } from "./researcher";
import { logger } from "../utils/logger";

const SYSTEM_PROMPT = `Você é o Atlas Writer — escritor profissional brasileiro. Sua tarefa: receber dados estruturados (JSON) + query do usuário e produzir markdown em PT-BR.

Regras:
- Direto, executivo, sem floreio.
- Sempre estruture: cabeçalho + sumário (2-3 linhas) + dados em tabela ou lista + insights.
- Cite notas-fonte usando [Nota: caminho.md] inline quando referencia algo específico.
- Para emails: estruture com Subject + body markdown. NUNCA invente destinatário.
- Para relatórios: cabeçalho com período + sumário executivo + dados + recomendações.
- Se dados são insuficientes, diga claramente: "Dados insuficientes — execute X primeiro".
- Comprimento: 300-800 palavras max.
- Nunca invente fatos, nomes, datas. Se ResearchData não tem o dado, omita.`;

export class WriterAgent {
	constructor(private plugin: AtlasPlugin) {}

	async compose(
		query: string,
		data: ResearchData,
		ctx: OrchestrationResult
	): Promise<string> {
		const userPrompt = this.buildPrompt(query, data, ctx);

		try {
			const llm = this.plugin.llm;
			if (!llm) {
				return this.fallbackTemplate(query, data, ctx);
			}

			const answer = await llm.chat(
				[
					{ role: "system" as const, content: SYSTEM_PROMPT },
					{ role: "user" as const, content: userPrompt },
				],
				{
					feature: "agent.writer",
					taskKind: "summarization", // pra cloud routing prefer Sonnet/Opus quando configured
					temperature: 0.4,
					maxTokens: 1500,
				}
			);
			return answer;
		} catch (e) {
			logger.warn("writer: LLM failed, using fallback template", { error: String(e) });
			return this.fallbackTemplate(query, data, ctx);
		}
	}

	private buildPrompt(query: string, data: ResearchData, ctx: OrchestrationResult): string {
		const lines: string[] = [
			`Query do usuário: ${query}`,
			"",
			`Tipo de output: ${ctx.intent ?? "summary"}`,
		];

		if (ctx.scope?.period && data.period) {
			lines.push(`Período: ${data.period.label} (${data.period.start} → ${data.period.end})`);
		}

		lines.push("", "## Dados coletados (Researcher):", "```json");
		lines.push(JSON.stringify(data, null, 2));
		lines.push("```", "", "Componha agora o markdown final seguindo as regras do system prompt.");
		return lines.join("\n");
	}

	/** Fallback: template estruturado quando LLM indisponível. Sem alucinação. */
	private fallbackTemplate(
		query: string,
		data: ResearchData,
		ctx: OrchestrationResult
	): string {
		const lines: string[] = [];
		const intent = ctx.intent ?? "summary";

		if (intent === "email") {
			lines.push(`# 📧 Draft de email`);
			lines.push(``);
			lines.push(`**Subject:** ${this.guessSubject(query, data)}`);
			lines.push(``);
			lines.push(`---`);
			lines.push(``);
		} else {
			lines.push(`# 📊 ${intent.charAt(0).toUpperCase() + intent.slice(1)}`);
			lines.push(``);
		}

		if (data.period) {
			lines.push(`**Período:** ${data.period.label} (${data.period.start} → ${data.period.end})`);
			lines.push(``);
		}

		if (data.personSummary) {
			lines.push(`## 👤 ${data.personSummary.name}`);
			lines.push(`- Sessões totais: ${data.personSummary.sessionsCount}`);
			lines.push(`- Commitments abertos: ${data.personSummary.openCommitments}`);
			if (data.personSummary.topThemes.length > 0) {
				lines.push(`- Temas top: ${data.personSummary.topThemes.map((t) => `${t.name} (${t.frequency}×)`).join(", ")}`);
			}
			if (data.personSummary.recentSessions.length > 0) {
				lines.push(``);
				lines.push(`### Sessões recentes`);
				for (const s of data.personSummary.recentSessions.slice(0, 5)) {
					const path = s.sourceNotePath ? ` — [Nota: ${s.sourceNotePath}]` : "";
					lines.push(`- ${s.date}${s.framework ? ` (${s.framework})` : ""}${path}`);
				}
			}
			lines.push(``);
		}

		if (data.systemAggregation && data.systemAggregation.length > 0) {
			lines.push(`## 🖥️ Sistemas mencionados`);
			lines.push(``);
			lines.push(`| Sistema | Menções | Notas |`);
			lines.push(`|---|---|---|`);
			for (const s of data.systemAggregation) {
				lines.push(`| ${s.system} | ${s.mentions} | ${s.notePaths.length} |`);
			}
			lines.push(``);
		}

		if (data.rawDigest) {
			lines.push(`## 📝 Notas`);
			lines.push(data.rawDigest);
			lines.push(``);
		}

		if (!data.personSummary && !data.systemAggregation?.length && !data.rawDigest) {
			lines.push(`> ℹ️ Não encontrei dados estruturados pra essa query. Tente:`);
			lines.push(`> - Indexar o vault ("Atlas: Index vault")`);
			lines.push(`> - Cadastrar pessoas/sistemas via FAB → Quick Add`);
			lines.push(`> - Ser mais específico (período, pessoa, sistema)`);
		}

		return lines.join("\n");
	}

	private guessSubject(query: string, data: ResearchData): string {
		const period = data.period?.label ?? "";
		if (data.personSummary) return `Atualização sobre ${data.personSummary.name} ${period}`;
		if (data.systemAggregation?.length) return `Status sistemas ${period}`;
		return `Resumo Atlas ${period}`;
	}
}
