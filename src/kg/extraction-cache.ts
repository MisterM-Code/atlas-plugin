/**
 * Atlas v0.47 E5 — Extraction Cache.
 *
 * Cache LLM extractions por hash SHA-256 do conteúdo da nota.
 * Skip LLM call quando hash não mudou — economia de tokens em re-index.
 *
 * Resultado esperado: 1.000 notas re-indexadas → 90% cache hit em
 * subsequent re-indexes → 90% redução de custo LLM.
 *
 * Stored em `.atlas/extraction-cache.json` (in-memory loaded on startup).
 */

import { App, normalizePath, TFile } from "obsidian";
import type { ExtractionResultT } from "./schemas";
import { logger } from "../utils/logger";

interface CacheEntry {
	hash: string; // SHA-256 do conteúdo
	model: string; // qual modelo gerou (invalidate se trocou)
	result: ExtractionResultT;
	timestamp: number;
}

interface CacheData {
	version: number;
	entries: Record<string, CacheEntry>; // key = notePath
}

const CACHE_FILE = "extraction-cache.json";
const VERSION = 1;
const MAX_AGE_MS = 90 * 86_400_000; // 90 dias

export class ExtractionCache {
	private data: CacheData = { version: VERSION, entries: {} };
	private dirty = false;
	private flushTimer: number | null = null;

	constructor(private readonly app: App, private readonly atlasFolder: string) {}

	private get path(): string {
		return normalizePath(`${this.atlasFolder}/${CACHE_FILE}`);
	}

	async load(): Promise<void> {
		try {
			const file = this.app.vault.getAbstractFileByPath(this.path);
			if (!(file instanceof TFile)) {
				logger.info("extraction-cache: novo (arquivo não existe)");
				return;
			}
			const raw = await this.app.vault.read(file);
			const parsed = JSON.parse(raw) as CacheData;
			if (parsed.version !== VERSION) {
				logger.info("extraction-cache: version bump → invalidate all");
				this.data = { version: VERSION, entries: {} };
				return;
			}
			this.data = parsed;
			logger.info("extraction-cache: carregado", {
				entries: Object.keys(parsed.entries).length,
			});
			// Cleanup expired entries
			this.purgeOld();
		} catch (e) {
			logger.warn("extraction-cache: load failed", { error: String(e) });
			this.data = { version: VERSION, entries: {} };
		}
	}

	private purgeOld(): void {
		const cutoff = Date.now() - MAX_AGE_MS;
		let removed = 0;
		for (const [key, entry] of Object.entries(this.data.entries)) {
			if (entry.timestamp < cutoff) {
				delete this.data.entries[key];
				removed++;
			}
		}
		if (removed > 0) {
			logger.info(`extraction-cache: ${removed} entries expirados purged`);
			this.touch();
		}
	}

	async save(): Promise<void> {
		const json = JSON.stringify(this.data);
		try {
			const file = this.app.vault.getAbstractFileByPath(this.path);
			if (file instanceof TFile) {
				await this.app.vault.modify(file, json);
			} else {
				if (!this.app.vault.getAbstractFileByPath(this.atlasFolder)) {
					await this.app.vault.createFolder(this.atlasFolder);
				}
				await this.app.vault.create(this.path, json);
			}
			this.dirty = false;
		} catch (e) {
			logger.warn("extraction-cache: save failed", { error: String(e) });
		}
	}

	private touch(): void {
		this.dirty = true;
		if (this.flushTimer !== null) window.clearTimeout(this.flushTimer);
		this.flushTimer = window.setTimeout(() => void this.save(), 5000);
	}

	/**
	 * Get cached result if hash + model match.
	 * Returns null if stale (caller should re-extract).
	 */
	get(notePath: string, hash: string, model: string): ExtractionResultT | null {
		const entry = this.data.entries[notePath];
		if (!entry) return null;
		if (entry.hash !== hash) return null; // content changed
		if (entry.model !== model) return null; // model changed → re-extract
		return entry.result;
	}

	set(notePath: string, hash: string, model: string, result: ExtractionResultT): void {
		this.data.entries[notePath] = {
			hash,
			model,
			result,
			timestamp: Date.now(),
		};
		this.touch();
	}

	stats(): { entries: number; sizeKB: number } {
		const json = JSON.stringify(this.data);
		return {
			entries: Object.keys(this.data.entries).length,
			sizeKB: Math.round(json.length / 1024),
		};
	}
}

/**
 * SHA-256 hash via Web Crypto API (browser/Electron native).
 * Retorna hex string.
 */
export async function hashText(text: string): Promise<string> {
	const encoder = new TextEncoder();
	const buffer = encoder.encode(text);
	const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
