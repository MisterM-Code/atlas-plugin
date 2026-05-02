import { OllamaClient } from "../ollama/client";
import { logger } from "../utils/logger";

/**
 * Reranker via bge-reranker-v2-m3 (rodado pelo Ollama via /api/embed-style call,
 * ou via prompt-based reranking se modelo dedicado não disponível).
 *
 * Estratégia 8 GB: load/unload por query (overhead +200ms aceitável).
 *
 * Usa dois modos:
 *   1. **Cross-encoder via Ollama** — se modelo disponível, score relevance(query, doc)
 *   2. **Prompt-based fallback** — pede ao modelo principal pra ranquear top-K (mais lento, sempre funciona)
 */

export interface RerankCandidate {
	id: string;
	text: string;
	prevScore: number;
}

export interface RerankResult {
	id: string;
	score: number;
	rank: number;
}

export class Reranker {
	private modelChecked = false;
	private modelAvailable = false;

	constructor(
		private ollama: OllamaClient,
		private rerankerModel: string,
		private fallbackGenModel: string
	) {}

	private async ensureModel(): Promise<boolean> {
		if (this.modelChecked) return this.modelAvailable;
		this.modelChecked = true;
		try {
			this.modelAvailable = await this.ollama.hasModel(this.rerankerModel);
		} catch {
			this.modelAvailable = false;
		}
		return this.modelAvailable;
	}

	async rerank(
		query: string,
		candidates: RerankCandidate[],
		topK = 8
	): Promise<RerankResult[]> {
		if (candidates.length === 0) return [];
		if (candidates.length <= topK) {
			return candidates.map((c, i) => ({ id: c.id, score: c.prevScore, rank: i }));
		}

		const hasModel = await this.ensureModel();
		if (hasModel) {
			try {
				return await this.rerankWithCrossEncoder(query, candidates, topK);
			} catch (e) {
				logger.warn("reranker: cross-encoder falhou, fallback para LLM", {
					error: String(e),
				});
			}
		}

		return this.rerankWithLlmPrompt(query, candidates, topK);
	}

	private async rerankWithCrossEncoder(
		query: string,
		candidates: RerankCandidate[],
		topK: number
	): Promise<RerankResult[]> {
		// bge-reranker-v2-m3 via Ollama: pode usar /api/embed (encode pares) e cosine,
		// OU via /api/generate com prompt especial pedindo score.
		// Aqui usamos approach prompt-based no próprio reranker (mais robusto cross-Ollama versions).
		const scored: RerankResult[] = [];
		for (let i = 0; i < candidates.length; i++) {
			const c = candidates[i];
			const prompt = `Query: ${query}\n\nDocument: ${c.text.substring(0, 800)}\n\nRelevance score (0.0-1.0):`;
			try {
				const out = await this.ollama.generate(prompt, {
					model: this.rerankerModel,
					temperature: 0,
					max_tokens: 5,
				});
				const score = parseScore(out);
				scored.push({ id: c.id, score, rank: i });
			} catch {
				// keep prev score
				scored.push({ id: c.id, score: c.prevScore, rank: i });
			}
		}
		scored.sort((a, b) => b.score - a.score);
		return scored.slice(0, topK).map((s, i) => ({ ...s, rank: i }));
	}

	private async rerankWithLlmPrompt(
		query: string,
		candidates: RerankCandidate[],
		topK: number
	): Promise<RerankResult[]> {
		// Listwise reranking via main model: ask LLM to pick top K and order.
		const indexed = candidates.slice(0, 30); // limit context
		const docs = indexed
			.map(
				(c, i) =>
					`[${i}] ${c.text.substring(0, 400).replace(/\n+/g, " ")}`
			)
			.join("\n\n");

		const prompt = `Você é um ranker. Dada a consulta do usuário, ordene os documentos do MAIS para o MENOS relevante.

Consulta: "${query}"

Documentos (numerados):
${docs}

Retorne APENAS uma lista de índices dos top ${topK} documentos mais relevantes, separados por vírgula. Sem texto extra.

Exemplo: 3,7,1,12,5

Resposta:`;

		try {
			const out = await this.ollama.generate(prompt, {
				model: this.fallbackGenModel,
				temperature: 0,
				max_tokens: 100,
			});
			const indices = parseIndexList(out, indexed.length);
			if (indices.length === 0) {
				return indexed
					.slice(0, topK)
					.map((c, i) => ({ id: c.id, score: c.prevScore, rank: i }));
			}
			const taken = new Set<number>();
			const ordered: RerankResult[] = [];
			let rank = 0;
			for (const idx of indices) {
				if (taken.has(idx)) continue;
				taken.add(idx);
				const cand = indexed[idx];
				if (!cand) continue;
				ordered.push({ id: cand.id, score: 1 - rank / topK, rank });
				rank++;
				if (ordered.length >= topK) break;
			}
			return ordered;
		} catch (e) {
			logger.warn("reranker: LLM listwise falhou", { error: String(e) });
			return indexed
				.slice(0, topK)
				.map((c, i) => ({ id: c.id, score: c.prevScore, rank: i }));
		}
	}

	/** Free model from Ollama RAM after rerank (8 GB strategy). */
	async unloadIfLoaded(): Promise<void> {
		if (!this.modelAvailable) return;
		try {
			await this.ollama.generate("", {
				model: this.rerankerModel,
				temperature: 0,
				max_tokens: 1,
			});
			// Ollama unload via empty keep_alive is implicit per-request; this is a best-effort signal.
		} catch {
			// ignore
		}
	}
}

function parseScore(text: string): number {
	const m = text.match(/(\d*\.?\d+)/);
	if (!m) return 0;
	const v = parseFloat(m[1]);
	if (isNaN(v)) return 0;
	if (v > 1 && v <= 10) return v / 10; // 0-10 scale → normalize
	return Math.max(0, Math.min(1, v));
}

function parseIndexList(text: string, max: number): number[] {
	const cleaned = text.replace(/[^0-9,\s]/g, " ").trim();
	const parts = cleaned.split(/[,\s]+/).filter(Boolean);
	const out: number[] = [];
	for (const p of parts) {
		const n = parseInt(p, 10);
		if (!isNaN(n) && n >= 0 && n < max) out.push(n);
	}
	return out;
}
