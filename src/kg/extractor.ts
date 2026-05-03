import { OllamaClient } from "../ollama/client";
import { ExtractionResult, ExtractionResultT } from "./schemas";
import { logger } from "../utils/logger";
import type { ExtractionCache } from "./extraction-cache";
import { hashText } from "./extraction-cache";

const SYSTEM_PROMPT = `Você é o Atlas, um assistente que extrai entidades estruturadas de notas de coordenadores/coaches/estudantes.

Sua tarefa: dada uma nota (markdown em PT-BR), retornar JSON válido com as entidades mencionadas.

Regras críticas:
- Retorne APENAS JSON válido, sem texto adicional, sem markdown fences.
- Nomes de pessoas: extraia formas canônicas (ex: "João Silva", não "o João" ou "ele").
- Action items: descrição clara, owner se identificável, data se mencionada.
- Commitments: promessas explícitas tipo "vou fazer X até Y".
- Themes: padrões emergentes (ex: "carga-trabalho", "lideranca", "feedback").
- Decisões: o que foi decidido, com rationale se disponível.
- noteType: classifique a nota.
- summary: 1 linha (≤ 100 chars).

Schema esperado:
{
  "people": ["string"],
  "actionItems": [{"description": "string", "ownerName": "string?", "dueDateText": "string?", "priority": "P1|P2|P3|P4?"}],
  "commitments": [{"text": "string", "madeByName": "string", "madeToName": "string", "dueDateText": "string?", "weight": "low|medium|high"}],
  "themes": [{"name": "string", "sentiment": "blocker|strength|growth|neutral"}],
  "decisions": [{"text": "string", "rationale": "string?"}],
  "noteType": "daily|1on1|coaching|meeting|weekly-status|raid|incident|adr|paper|course|person|project|theme|other",
  "summary": "string"
}

Se uma categoria não tiver itens, retorne array vazio.`;

const FEW_SHOT_USER = `Note path: 03_Meetings/1on1/Maria/2026-05-08.md
Frontmatter type: 1on1, person: Maria Silva, framework: GROW

# 1:1 com Maria Silva — 08/05/2026

## Goal
Maria quer assumir liderança técnica do squad de pagamentos.

## Reality
Está sobrecarregada com 3 projetos em paralelo. Mencionou cansaço.

## Will
- Maria vai conversar com PO sobre repriorização até sexta (10/05).
- Eu vou agendar skip-level com diretora até quarta.

## Themes
#theme/carga #theme/lideranca`;

const FEW_SHOT_ASSISTANT = `{
  "people": ["Maria Silva"],
  "actionItems": [
    {"description": "Conversar com PO sobre repriorização", "ownerName": "Maria Silva", "dueDateText": "sexta 10/05"},
    {"description": "Agendar skip-level com diretora", "ownerName": "eu", "dueDateText": "quarta"}
  ],
  "commitments": [
    {"text": "Conversar com PO sobre repriorização até sexta", "madeByName": "Maria Silva", "madeToName": "eu", "dueDateText": "sexta 10/05", "weight": "medium"},
    {"text": "Agendar skip-level com diretora até quarta", "madeByName": "eu", "madeToName": "Maria Silva", "dueDateText": "quarta", "weight": "high"}
  ],
  "themes": [
    {"name": "carga-trabalho", "sentiment": "blocker"},
    {"name": "lideranca", "sentiment": "growth"}
  ],
  "decisions": [],
  "noteType": "1on1",
  "summary": "1:1 com Maria — quer liderança técnica, mas sobrecarregada. Plano: repriorizar com PO."
}`;

export interface ExtractContext {
	notePath: string;
	frontmatter?: Record<string, unknown>;
	body: string;
}

export class KGExtractor {
	// v0.23: optional LLMService — quando set, roteia via cloud-or-ollama com cost tracking
	private llm: import("../providers/llm-service").LLMService | null = null;
	// v0.47 E5: extraction cache pra skip LLM quando hash não mudou (90% cost cut em re-index)
	private cache: ExtractionCache | null = null;
	// v0.51: feedback store pra incluir negative examples (active learning)
	private feedback: import("./extraction-feedback").ExtractionFeedbackStore | null = null;

	constructor(private ollama: OllamaClient, private model: string) {}

	/** v0.23: wire LLMService pra cloud routing opt-in */
	setLLMService(llm: import("../providers/llm-service").LLMService): void {
		this.llm = llm;
	}

	/** v0.47 E5: wire extraction cache (opt-in mas highly recommended) */
	setCache(cache: ExtractionCache): void {
		this.cache = cache;
	}

	/** v0.51: wire feedback store pra anti-examples no prompt */
	setFeedback(feedback: import("./extraction-feedback").ExtractionFeedbackStore): void {
		this.feedback = feedback;
	}

	async extract(ctx: ExtractContext): Promise<ExtractionResultT | null> {
		// v0.51: build prompt com anti-exemplos do feedback store
		let antiExamples = "";
		if (this.feedback) {
			try {
				const negs = await this.feedback.recentRejections({ limit: 8 });
				if (negs.length > 0) {
					antiExamples =
						"\n\n## Anti-exemplos (NÃO extrair como entity — usuário rejeitou):\n" +
						negs.map((n) => `- ${n.kind}: "${n.text}"${n.reason ? ` (motivo: ${n.reason})` : ""}`).join("\n") +
						"\n";
				}
			} catch {
				// best-effort, não bloqueia
			}
		}

		const userPrompt = this.buildUserPrompt(ctx) + antiExamples;

		// v0.47 E5: cache hit check ANTES de qualquer LLM call
		if (this.cache) {
			try {
				const hash = await hashText(userPrompt);
				const cached = this.cache.get(ctx.notePath, hash, this.model);
				if (cached) {
					return cached; // ZERO LLM tokens
				}
				// miss → guarda hash pra set após extração bem-sucedida
				(ctx as ExtractContext & { __atlasHash?: string }).__atlasHash = hash;
			} catch (e) {
				logger.warn("extractor: cache hash failed", { error: String(e) });
			}
		}

		try {
			const messages = [
				{ role: "system" as const, content: SYSTEM_PROMPT },
				{ role: "user" as const, content: FEW_SHOT_USER },
				{ role: "assistant" as const, content: FEW_SHOT_ASSISTANT },
				{ role: "user" as const, content: userPrompt },
			];
			// v0.23: route via LLMService quando configured (cloud auto se routing.extraction = cloud)
			const raw = this.llm
				? await this.llm.chat(messages, {
						feature: "kg.extractor",
						taskKind: "extraction",
						temperature: 0.1,
						maxTokens: 2000,
						jsonFormat: true,
						// v0.52.2: extraction é structured output mecânico — sempre simple (Haiku/mini)
						complexityHint: "simple",
				  })
				: await this.ollama.chat(messages, {
						model: this.model,
						temperature: 0.1,
						format: "json",
						max_tokens: 2000,
				  });

			const cleaned = this.cleanJson(raw);
			const parsed = JSON.parse(cleaned);
			const result = ExtractionResult.safeParse(parsed);
			if (!result.success) {
				logger.warn("Extractor: validação Zod falhou", {
					issues: result.error.issues,
					raw: cleaned.substring(0, 200),
				});
				return null;
			}
			// v0.47 E5: store no cache pra próximas re-indexações skiparem LLM
			if (this.cache) {
				const stored = (ctx as ExtractContext & { __atlasHash?: string }).__atlasHash;
				if (stored) this.cache.set(ctx.notePath, stored, this.model, result.data);
			}
			return result.data;
		} catch (e) {
			logger.warn("Extractor: falhou", { path: ctx.notePath, error: String(e) });
			return null;
		}
	}

	private buildUserPrompt(ctx: ExtractContext): string {
		const fmStr = ctx.frontmatter
			? Object.entries(ctx.frontmatter)
					.filter(([k]) => !["tags", "status"].includes(k))
					.map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
					.join(", ")
			: "(nenhum)";

		// Truncate body to ~6000 chars to avoid context overflow on small models
		const body = ctx.body.length > 6000 ? ctx.body.slice(0, 6000) + "\n[...truncado...]" : ctx.body;

		return `Note path: ${ctx.notePath}
Frontmatter: ${fmStr}

${body}`;
	}

	private cleanJson(raw: string): string {
		// Strip code fences if model included them
		let s = raw.trim();
		const fence = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
		if (fence) s = fence[1].trim();
		// Find first { ... last }
		const first = s.indexOf("{");
		const last = s.lastIndexOf("}");
		if (first >= 0 && last > first) {
			s = s.substring(first, last + 1);
		}
		return s;
	}
}
