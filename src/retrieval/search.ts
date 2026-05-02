import { Chunk } from "./indexer";
import { cosineSimilarity, Embedder } from "./embedder";
import { Reranker } from "./reranker";

export interface SearchResult {
	chunkId: string;
	notePath: string;
	score: number;
	bm25Score: number;
	denseScore: number;
	rerankerScore?: number;
	snippet: string;
	context: string;
}

export interface SearchOptions {
	topK?: number;
	useReranker?: boolean;
}

/**
 * Hybrid search: BM25-lite (TF-IDF) + dense embeddings + Reciprocal Rank Fusion.
 */
export class HybridSearcher {
	private chunks = new Map<string, Chunk>();
	private invertedIndex = new Map<string, Map<string, number>>(); // term → chunkId → tf
	private chunkLength = new Map<string, number>(); // chunkId → token count
	private avgLength = 0;
	private docFreq = new Map<string, number>(); // term → number of chunks containing it
	private totalChunks = 0;

	constructor(private embedder: Embedder, private reranker?: Reranker) {}

	indexChunks(chunks: Chunk[]): void {
		this.chunks.clear();
		this.invertedIndex.clear();
		this.chunkLength.clear();
		this.docFreq.clear();
		this.totalChunks = chunks.length;
		let totalLen = 0;

		for (const c of chunks) {
			this.chunks.set(c.chunkId, c);
			const tokens = tokenize(c.text + " " + c.context);
			this.chunkLength.set(c.chunkId, tokens.length);
			totalLen += tokens.length;

			const tf = new Map<string, number>();
			for (const t of tokens) {
				tf.set(t, (tf.get(t) ?? 0) + 1);
			}
			for (const [term, count] of tf) {
				if (!this.invertedIndex.has(term)) {
					this.invertedIndex.set(term, new Map());
				}
				this.invertedIndex.get(term)!.set(c.chunkId, count);
				this.docFreq.set(term, (this.docFreq.get(term) ?? 0) + 1);
			}
		}

		this.avgLength = chunks.length > 0 ? totalLen / chunks.length : 0;
	}

	private bm25(query: string, k1 = 1.5, b = 0.75): Map<string, number> {
		const scores = new Map<string, number>();
		const queryTokens = tokenize(query);

		for (const term of queryTokens) {
			const postings = this.invertedIndex.get(term);
			if (!postings) continue;
			const df = this.docFreq.get(term) ?? 0;
			if (df === 0) continue;
			const idf = Math.log(1 + (this.totalChunks - df + 0.5) / (df + 0.5));

			for (const [chunkId, tf] of postings) {
				const len = this.chunkLength.get(chunkId) ?? 0;
				const norm = 1 - b + b * (len / Math.max(this.avgLength, 1));
				const tfNorm = (tf * (k1 + 1)) / (tf + k1 * norm);
				scores.set(chunkId, (scores.get(chunkId) ?? 0) + idf * tfNorm);
			}
		}
		return scores;
	}

	private async dense(query: string, topK: number): Promise<Map<string, number>> {
		const scores = new Map<string, number>();
		try {
			const queryVecs = await this.embedder["ollama"].embed(query, (this.embedder as unknown as { model: string }).model);
			const qv = queryVecs[0];
			if (!qv || qv.length === 0) return scores;

			for (const [chunkId, vec] of this.embedder.getAllVectors()) {
				if (!this.chunks.has(chunkId)) continue;
				scores.set(chunkId, cosineSimilarity(qv, vec));
			}
		} catch {
			// dense failed (Ollama down), fall back to BM25 only
			return scores;
		}
		// Keep only top 3*topK to limit RRF fusion noise
		return topNMap(scores, topK * 3);
	}

	async search(query: string, topK = 10, options: SearchOptions = {}): Promise<SearchResult[]> {
		const useReranker = options.useReranker ?? !!this.reranker;
		const bm25Scores = this.bm25(query);
		const denseScores = await this.dense(query, topK);

		// Recall: pick top-30 to feed reranker (ou topK se sem reranker)
		const recallSize = useReranker ? Math.min(30, this.totalChunks) : topK;

		const fused = reciprocalRankFusion([bm25Scores, denseScores]);
		const sorted = Array.from(fused.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, recallSize);

		const recall: SearchResult[] = [];
		for (const [chunkId, fusedScore] of sorted) {
			const chunk = this.chunks.get(chunkId);
			if (!chunk) continue;
			recall.push({
				chunkId,
				notePath: chunk.notePath,
				score: fusedScore,
				bm25Score: bm25Scores.get(chunkId) ?? 0,
				denseScore: denseScores.get(chunkId) ?? 0,
				snippet: makeSnippet(chunk.text, query),
				context: chunk.context,
			});
		}

		if (!useReranker || !this.reranker || recall.length <= topK) {
			return recall.slice(0, topK);
		}

		// Reranker stage
		try {
			const rerankInput = recall.map((r) => ({
				id: r.chunkId,
				text: r.snippet + "\n" + (this.chunks.get(r.chunkId)?.text ?? ""),
				prevScore: r.score,
			}));
			const reranked = await this.reranker.rerank(query, rerankInput, topK);
			const idToResult = new Map(recall.map((r) => [r.chunkId, r]));
			const out: SearchResult[] = [];
			for (const rr of reranked) {
				const orig = idToResult.get(rr.id);
				if (!orig) continue;
				out.push({ ...orig, score: rr.score, rerankerScore: rr.score });
			}
			return out;
		} catch {
			// Fallback to non-reranked
			return recall.slice(0, topK);
		}
	}

	getChunk(chunkId: string): Chunk | undefined {
		return this.chunks.get(chunkId);
	}

	getChunksByPath(notePath: string): Chunk[] {
		return Array.from(this.chunks.values()).filter((c) => c.notePath === notePath);
	}
}

// ─────────────────────────────────────────────────────────────

const STOPWORDS_PT = new Set([
	"a", "à", "às", "ao", "aos", "as", "o", "os", "um", "uma", "uns", "umas",
	"de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas", "por", "para",
	"com", "sem", "sob", "sobre", "ante", "após", "até", "desde", "entre", "perante",
	"e", "ou", "mas", "que", "se", "como", "quando", "onde", "porque", "pois",
	"é", "foi", "ser", "tem", "ter", "está", "estão", "ele", "ela", "eles", "elas",
	"isso", "isto", "aquilo", "este", "esta", "esse", "essa", "aquele", "aquela",
	"meu", "minha", "seu", "sua", "nosso", "nossa", "também", "já", "ainda",
]);

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9\s]/g, " ")
		.split(/\s+/)
		.filter((t) => t.length > 2 && !STOPWORDS_PT.has(t));
}

function reciprocalRankFusion(rankings: Map<string, number>[], k = 60): Map<string, number> {
	const fused = new Map<string, number>();
	for (const r of rankings) {
		const sorted = Array.from(r.entries()).sort((a, b) => b[1] - a[1]);
		sorted.forEach(([id], rank) => {
			fused.set(id, (fused.get(id) ?? 0) + 1 / (k + rank + 1));
		});
	}
	return fused;
}

function topNMap(m: Map<string, number>, n: number): Map<string, number> {
	const sorted = Array.from(m.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, n);
	return new Map(sorted);
}

function makeSnippet(text: string, query: string, maxChars = 200): string {
	const queryTokens = tokenize(query);
	const lower = text.toLowerCase();
	let bestIdx = 0;
	let bestScore = 0;

	for (const t of queryTokens) {
		const idx = lower.indexOf(t);
		if (idx >= 0) {
			const score = 1 / (1 + idx); // prefer earlier matches
			if (score > bestScore) {
				bestScore = score;
				bestIdx = idx;
			}
		}
	}

	const start = Math.max(0, bestIdx - 50);
	const end = Math.min(text.length, start + maxChars);
	let snippet = text.substring(start, end).replace(/\s+/g, " ").trim();
	if (start > 0) snippet = "…" + snippet;
	if (end < text.length) snippet = snippet + "…";
	return snippet;
}
