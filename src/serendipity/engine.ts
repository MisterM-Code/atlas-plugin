import { App, TFile, normalizePath, Notice } from "obsidian";
import { Notifier } from "../automation/notify";
import { logger } from "../utils/logger";
import { Indexer } from "../retrieval/indexer";
import { OllamaClient } from "../ollama/client";
import { isCoachPath } from "../coach/scope";

interface SerendipityState {
	version: 1;
	lastShown: Record<string, string>; // notePath → ISO date
	dismissed: Record<string, number>; // notePath → count
}

/**
 * Serendipity: 3×/dia mostra uma nota antiga + por que é relevante AGORA.
 *
 * Algoritmo de seleção:
 *  1. Filter: notas modificadas há ≥30 dias atrás
 *  2. Score por:
 *     - Não mostrada nos últimos 14 dias (dedupe)
 *     - Não dismissed muitas vezes (penalty)
 *     - Tem links para entidades atuais ativas no KG (relevance signal)
 *     - Backlinks count (importance)
 *     - Recency dampening (notas muito antigas têm bonus mas não infinito)
 *  3. Pega top-1
 *  4. Gera "por que é relevante" via LLM (1-2 linhas)
 *  5. Dispara notification
 */
export class SerendipityEngine {
	private state: SerendipityState = { version: 1, lastShown: {}, dismissed: {} };
	private dirty = false;
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private llm: import("../providers/llm-service").LLMService | null = null;

	constructor(
		private app: App,
		private notifier: Notifier,
		private ollama: OllamaClient,
		private smallModel: string,
		private statePath: string
	) {}

	setLLMService(llm: import("../providers/llm-service").LLMService): void {
		this.llm = llm;
	}

	async load(): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(this.statePath);
		if (!(file instanceof TFile)) return;
		try {
			const raw = await this.app.vault.read(file);
			const parsed = JSON.parse(raw);
			if (parsed.version === 1) this.state = parsed;
		} catch (e) {
			logger.warn("serendipity: load falhou", { error: String(e) });
		}
	}

	private async save(): Promise<void> {
		try {
			const json = JSON.stringify(this.state, null, 2);
			const file = this.app.vault.getAbstractFileByPath(this.statePath);
			if (file instanceof TFile) {
				await this.app.vault.modify(file, json);
			} else {
				const dir = this.statePath.split("/").slice(0, -1).join("/");
				if (dir && !this.app.vault.getAbstractFileByPath(dir)) {
					await this.app.vault.createFolder(dir);
				}
				await this.app.vault.create(this.statePath, json);
			}
			this.dirty = false;
		} catch (e) {
			logger.warn("serendipity: save falhou", { error: String(e) });
		}
	}

	private touch(): void {
		this.dirty = true;
		if (this.flushTimer !== null) clearTimeout(this.flushTimer);
		this.flushTimer = setTimeout(() => void this.save(), 1500);
	}

	async tick(): Promise<void> {
		const candidate = await this.pickCandidate();
		if (!candidate) return;

		const reason = await this.generateRelevanceReason(candidate);

		await this.notifier.notify({
			title: `💡 Atlas — Serendipity`,
			message: `"${candidate.basename}" — ${reason}`,
			severity: "low",
			channels: ["inAppNotice", "desktop"],
			subtitle: candidate.path,
		});

		this.state.lastShown[candidate.path] = new Date().toISOString();
		this.touch();
	}

	private async pickCandidate(): Promise<TFile | null> {
		const allFiles = this.app.vault.getMarkdownFiles();
		const now = Date.now();
		const minAge = 30 * 86_400_000;
		const recentlyShownCutoff = now - 14 * 86_400_000;

		const candidates: { file: TFile; score: number }[] = [];

		for (const f of allFiles) {
			// Filter
			if (isCoachPath(f.path)) continue;
			if (f.path.startsWith(".atlas") || f.path.includes("/templates/") || f.path.startsWith("99_Archive")) continue;
			if (now - f.stat.mtime < minAge) continue;
			if (f.stat.size < 200) continue; // skip empty/stub

			// Recently shown skip
			const lastShown = this.state.lastShown[f.path];
			if (lastShown) {
				const lastShownMs = new Date(lastShown).getTime();
				if (lastShownMs > recentlyShownCutoff) continue;
			}

			// Score
			let score = 0;

			// Older files get bonus, but capped
			const ageDays = (now - f.stat.mtime) / 86_400_000;
			score += Math.min(ageDays / 90, 3); // cap +3 at 9 months

			// Dismissed penalty
			const dismissCount = this.state.dismissed[f.path] ?? 0;
			score -= dismissCount * 1.5;

			// Backlinks bonus (uses Obsidian metadataCache)
			const backlinks = this.countBacklinks(f.path);
			score += Math.min(backlinks, 5);

			candidates.push({ file: f, score });
		}

		if (candidates.length === 0) return null;
		candidates.sort((a, b) => b.score - a.score);

		// Random sample from top-10 to add real serendipity
		const top = candidates.slice(0, 10);
		return top[Math.floor(Math.random() * top.length)].file;
	}

	private countBacklinks(path: string): number {
		const cache = this.app.metadataCache as unknown as {
			getBacklinksForFile?: (file: TFile) => { data: Map<string, unknown> };
		};
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return 0;
		try {
			const r = cache.getBacklinksForFile?.(file);
			if (r?.data) return r.data.size;
		} catch {
			// fallthrough
		}
		return 0;
	}

	private async generateRelevanceReason(file: TFile): Promise<string> {
		try {
			const indexer = new Indexer(this.app);
			const indexed = await indexer.indexFile(file);
			if (!indexed) return "Pode ser relevante hoje.";

			const ageDays = Math.round((Date.now() - file.stat.mtime) / 86_400_000);
			const excerpt = indexed.body.substring(0, 1500);

			const prompt = `Você é Atlas. O usuário escreveu uma nota há ${ageDays} dias. Em 1 frase curta (max 80 chars), diga POR QUÊ revisitá-la HOJE pode ser interessante. Seja específico, não genérico. PT-BR.

Nota:
"""
${excerpt}
"""

Por quê hoje (1 frase ≤80 chars):`;

			const out = this.llm
				? await this.llm.generate(prompt, {
						feature: "serendipity.engine",
						taskKind: "chat",
						temperature: 0.7,
						maxTokens: 50,
				  })
				: await this.ollama.generate(prompt, {
						model: this.smallModel,
						temperature: 0.7,
						max_tokens: 50,
				  });
			const cleaned = out.trim().split("\n")[0].substring(0, 100);
			return cleaned || `Você escreveu há ${ageDays} dias.`;
		} catch {
			const ageDays = Math.round((Date.now() - file.stat.mtime) / 86_400_000);
			return `Você escreveu há ${ageDays} dias — quer revisitar?`;
		}
	}

	dismiss(path: string): void {
		this.state.dismissed[path] = (this.state.dismissed[path] ?? 0) + 1;
		this.touch();
	}

	/**
	 * Retorna histórico recente: notas que Atlas mostrou, ordenadas por data desc.
	 * Usado pelo Lab → Serendipity sub-view.
	 */
	recent(limit = 10): { path: string; shownAt: string; dismissed: number }[] {
		const entries = Object.entries(this.state.lastShown).map(([path, shownAt]) => ({
			path,
			shownAt,
			dismissed: this.state.dismissed[path] ?? 0,
		}));
		entries.sort((a, b) => b.shownAt.localeCompare(a.shownAt));
		return entries.slice(0, limit);
	}
}

export function serendipityStatePath(atlasFolder: string): string {
	return normalizePath(`${atlasFolder}/serendipity-state.json`);
}
