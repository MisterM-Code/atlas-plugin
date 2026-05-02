/**
 * Atlas v0.51 — Active Learning loop pra extrações do KG.
 *
 * User confirma/rejeita entities extraídas pelo LLM em batch.
 * Rejeições viram few-shot negative examples na próxima extração.
 *
 * Storage:
 *   .atlas/extraction-feedback.jsonl — append-only log
 *
 * Schema por linha:
 *   { ts, kind, action: "accept"|"reject", text, notePath?, reason? }
 *
 * Uso (no extractor):
 *   const negs = await feedback.recentRejections({ limit: 5 });
 *   prompt += `\n## Anti-exemplos (NÃO extrair):\n${negs.map(n => `- ${n.text}`).join("\n")}`;
 */

import { App, normalizePath, TFile } from "obsidian";
import { logger } from "../utils/logger";

export type FeedbackKind = "person" | "system" | "product" | "course" | "theme" | "actionItem" | "commitment" | "decision";
export type FeedbackAction = "accept" | "reject";

export interface FeedbackEntry {
	ts: string;
	kind: FeedbackKind;
	action: FeedbackAction;
	text: string;
	notePath?: string;
	reason?: string;
}

const LOG_PATH_SUFFIX = "extraction-feedback.jsonl";
const MAX_LINES_KEEP = 500; // rolling window

export class ExtractionFeedbackStore {
	private cache: FeedbackEntry[] = [];
	private loaded = false;

	constructor(private app: App, private atlasFolder: string) {}

	private get path(): string {
		return normalizePath(`${this.atlasFolder}/${LOG_PATH_SUFFIX}`);
	}

	async load(): Promise<void> {
		if (this.loaded) return;
		try {
			const file = this.app.vault.getAbstractFileByPath(this.path);
			if (!(file instanceof TFile)) {
				this.loaded = true;
				return;
			}
			const raw = await this.app.vault.read(file);
			const lines = raw.split("\n").filter((l) => l.trim().length > 0);
			this.cache = lines
				.map((l) => {
					try {
						return JSON.parse(l) as FeedbackEntry;
					} catch {
						return null;
					}
				})
				.filter((x): x is FeedbackEntry => x !== null);
			// Trim to rolling window
			if (this.cache.length > MAX_LINES_KEEP) {
				this.cache = this.cache.slice(-MAX_LINES_KEEP);
				await this.persistAll();
			}
			this.loaded = true;
		} catch (e) {
			logger.warn("extraction-feedback: load failed", { error: String(e) });
			this.loaded = true;
		}
	}

	async record(entry: Omit<FeedbackEntry, "ts">): Promise<void> {
		await this.load();
		const full: FeedbackEntry = { ts: new Date().toISOString(), ...entry };
		this.cache.push(full);
		await this.appendLine(full);
	}

	private async appendLine(entry: FeedbackEntry): Promise<void> {
		const line = JSON.stringify(entry) + "\n";
		try {
			const file = this.app.vault.getAbstractFileByPath(this.path);
			if (file instanceof TFile) {
				const cur = await this.app.vault.read(file);
				await this.app.vault.modify(file, cur + line);
			} else {
				if (!this.app.vault.getAbstractFileByPath(this.atlasFolder)) {
					await this.app.vault.createFolder(this.atlasFolder);
				}
				await this.app.vault.create(this.path, line);
			}
		} catch (e) {
			logger.warn("extraction-feedback: append failed", { error: String(e) });
		}
	}

	private async persistAll(): Promise<void> {
		const content = this.cache.map((e) => JSON.stringify(e)).join("\n") + "\n";
		try {
			const file = this.app.vault.getAbstractFileByPath(this.path);
			if (file instanceof TFile) {
				await this.app.vault.modify(file, content);
			} else {
				await this.app.vault.create(this.path, content);
			}
		} catch (e) {
			logger.warn("extraction-feedback: persistAll failed", { error: String(e) });
		}
	}

	/** Last N rejections, optionally filtered by kind. Used as anti-examples in prompt. */
	async recentRejections(opts: { kind?: FeedbackKind; limit?: number } = {}): Promise<FeedbackEntry[]> {
		await this.load();
		const limit = opts.limit ?? 5;
		const filtered = this.cache.filter(
			(e) => e.action === "reject" && (!opts.kind || e.kind === opts.kind)
		);
		return filtered.slice(-limit);
	}

	async stats(): Promise<{ accepts: number; rejects: number; total: number; byKind: Record<string, { accepts: number; rejects: number }> }> {
		await this.load();
		const byKind: Record<string, { accepts: number; rejects: number }> = {};
		let accepts = 0;
		let rejects = 0;
		for (const e of this.cache) {
			if (e.action === "accept") accepts++;
			else rejects++;
			if (!byKind[e.kind]) byKind[e.kind] = { accepts: 0, rejects: 0 };
			if (e.action === "accept") byKind[e.kind].accepts++;
			else byKind[e.kind].rejects++;
		}
		return { accepts, rejects, total: this.cache.length, byKind };
	}
}
