import { App, normalizePath, TFile } from "obsidian";
import { OllamaClient } from "../ollama/client";
import { logger } from "../utils/logger";
import type { LLMService } from "../providers/llm-service";

interface EmbeddingCacheEntry {
	hash: string; // sha256 of text+context
	vector: number[];
	updatedAt: string;
}

interface EmbeddingCache {
	version: 1;
	model: string;
	dim: number;
	entries: Record<string, EmbeddingCacheEntry>; // chunkId → entry
}

export class Embedder {
	private cache: EmbeddingCache;
	private dirty = false;
	private flushTimer: number | null = null;
	// v0.18: optional LLMService — when set, route embeddings through cloud-or-ollama
	private llm: LLMService | null = null;

	constructor(
		private app: App,
		private ollama: OllamaClient,
		private model: string,
		private cachePath: string
	) {
		this.cache = { version: 1, model, dim: 0, entries: {} };
	}

	/** v0.18: wire LLMService for cloud embedding auto-route. */
	setLLMService(llm: LLMService): void {
		this.llm = llm;
	}

	async load(): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(this.cachePath);
		if (!(file instanceof TFile)) return;
		try {
			const raw = await this.app.vault.read(file);
			const parsed = JSON.parse(raw) as EmbeddingCache;
			if (parsed.version === 1 && parsed.model === this.model) {
				this.cache = parsed;
				logger.info(`embedder: cache carregado (${Object.keys(parsed.entries).length} entries)`);
			}
		} catch (e) {
			logger.warn("embedder: cache load falhou", { error: String(e) });
		}
	}

	async save(): Promise<void> {
		const json = JSON.stringify(this.cache, null, 2);
		const file = this.app.vault.getAbstractFileByPath(this.cachePath);
		try {
			if (file instanceof TFile) {
				await this.app.vault.modify(file, json);
			} else {
				const folder = this.cachePath.split("/").slice(0, -1).join("/");
				if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
					await this.app.vault.createFolder(folder);
				}
				await this.app.vault.create(this.cachePath, json);
			}
			this.dirty = false;
		} catch (e) {
			logger.error("embedder: cache save falhou", { error: String(e) });
		}
	}

	private touch(): void {
		this.dirty = true;
		if (this.flushTimer !== null) window.clearTimeout(this.flushTimer);
		this.flushTimer = window.setTimeout(() => void this.save(), 2000);
	}

	/**
	 * Embed a chunk, using cache when possible.
	 */
	async embedChunk(chunkId: string, context: string, text: string): Promise<number[]> {
		const fullText = `${context}\n\n${text}`;
		const hash = await sha256(fullText);
		const cached = this.cache.entries[chunkId];
		if (cached && cached.hash === hash) {
			return cached.vector;
		}

		// v0.18: route through LLMService (cloud auto if OpenAI key configured) or fallback to ollama
		const vectors = this.llm
			? await this.llm.embed([fullText], { feature: "embedder.chunk" })
			: await this.ollama.embed(fullText, this.model);
		const v = vectors[0] ?? [];
		if (v.length === 0) throw new Error("Embed retornou vetor vazio");
		if (this.cache.dim === 0) this.cache.dim = v.length;

		this.cache.entries[chunkId] = {
			hash,
			vector: v,
			updatedAt: new Date().toISOString(),
		};
		this.touch();
		return v;
	}

	/** Bulk embed with progress callback. */
	async embedBatch(
		items: { chunkId: string; context: string; text: string }[],
		onProgress?: (done: number, total: number) => void
	): Promise<Map<string, number[]>> {
		const out = new Map<string, number[]>();
		let done = 0;
		for (const it of items) {
			try {
				const v = await this.embedChunk(it.chunkId, it.context, it.text);
				out.set(it.chunkId, v);
			} catch (e) {
				logger.warn("embedder: chunk falhou", {
					chunkId: it.chunkId,
					error: String(e),
				});
			}
			done++;
			if (onProgress && done % 5 === 0) onProgress(done, items.length);
		}
		if (onProgress) onProgress(done, items.length);
		await this.save();
		return out;
	}

	getAllVectors(): Map<string, number[]> {
		const m = new Map<string, number[]>();
		for (const [k, v] of Object.entries(this.cache.entries)) {
			m.set(k, v.vector);
		}
		return m;
	}

	deleteByPath(notePath: string): void {
		for (const k of Object.keys(this.cache.entries)) {
			if (k.startsWith(notePath + "#")) {
				delete this.cache.entries[k];
			}
		}
		this.touch();
	}
}

// ─────────────────────────────────────────────────────────────────────

async function sha256(text: string): Promise<string> {
	const data = new TextEncoder().encode(text);
	const hash = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(hash))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) return 0;
	let dot = 0,
		na = 0,
		nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	const denom = Math.sqrt(na) * Math.sqrt(nb);
	return denom === 0 ? 0 : dot / denom;
}
