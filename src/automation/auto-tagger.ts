import { App, TFile, Notice } from "obsidian";
import { OllamaClient } from "../ollama/client";
import { Indexer } from "../retrieval/indexer";
import { logger } from "../utils/logger";
import { z } from "zod";
import { isCoachPath } from "../coach/scope";

const TagSuggestion = z.object({
	tags: z.array(z.string()).max(8),
});

const SYSTEM_PROMPT = `Você é Atlas, especialista em classificar notas de coordenadores/coaches/estudantes.

Dada uma nota markdown em PT-BR, sugira **2 a 5 tags relevantes** seguindo regras:

1. **Tags hierárquicas** quando faz sentido: \`#theme/carga-trabalho\`, \`#project/migracao-bd\`, \`#person/joao\`.
2. **Tags categoria de alto nível**: \`#1on1\`, \`#meeting\`, \`#decision\`, \`#blocker\`, \`#followup\`, \`#paper\`, \`#study\`, \`#incident\`, \`#raid\`, \`#okr\`.
3. **Tags emocionais/sentiment** quando claro: \`#urgent\`, \`#stuck\`, \`#breakthrough\`, \`#win\`.
4. **NÃO crie tags genéricas demais**: evite \`#nota\`, \`#texto\`, \`#diario\`. Prefira específicas.
5. **NÃO duplique tags já presentes** no frontmatter.
6. Use **kebab-case**, sem acentos: \`carga-trabalho\` e não \`carga_trabalho\` ou \`Carga Trabalho\`.
7. Tags em PT-BR, exceto categorias técnicas (#api, #okr, #raid).

Retorne JSON puro:
{"tags": ["tag1", "tag2", "tag3"]}

Sem markdown, sem texto extra.`;

const FEW_SHOT_USER = `Note: 03_Meetings/1on1/Maria/2026-05-08.md
Existing tags: 1on1
Frontmatter type: 1on1, person: Maria Silva, framework: GROW

# 1:1 Maria — 08/05/2026

## Goal
Maria quer assumir liderança técnica do squad.

## Reality
Está sobrecarregada. Mencionou cansaço pela 4ª vez.

## Will
- Conversar com PO até sexta sobre repriorização

#theme/carga`;

const FEW_SHOT_ASSISTANT = `{"tags": ["theme/lideranca", "theme/carga-trabalho", "blocker", "person/maria-silva", "followup"]}`;

export interface AutoTagOptions {
	debounceMs: number;
	maxFileSize: number;
	excludeFolders: string[];
}

export class AutoTagger {
	private debouncers = new Map<string, ReturnType<typeof setTimeout>>();
	private indexer: Indexer;
	// v0.22 Sprint H: optional LLMService — toggle settings.providers.allowAutoTaggerCloud controla cloud usage
	private llmService: { willUseCloud: () => boolean; chat: (msgs: unknown[], opts: unknown) => Promise<string> } | null = null;
	private allowCloud = false;

	constructor(
		private app: App,
		private ollama: OllamaClient,
		private model: string,
		private opts: AutoTagOptions
	) {
		this.indexer = new Indexer(app);
	}

	/** v0.22: opt-in cloud routing pra auto-tagger (default OFF — high freq risk) */
	configureCloud(allow: boolean, llm: typeof this.llmService): void {
		this.allowCloud = allow;
		this.llmService = llm;
	}

	register(register: (cb: () => void) => void): () => void {
		const handler = (file: TFile) => {
			if (!(file instanceof TFile)) return;
			if (file.extension !== "md") return;
			if (file.stat.size > this.opts.maxFileSize) return;
			if (this.opts.excludeFolders.some((f) => file.path.startsWith(f))) return;
			if (isCoachPath(file.path)) return; // do not auto-tag coachees (privacy)

			// Debounce per-file
			const existing = this.debouncers.get(file.path);
			if (existing) clearTimeout(existing);

			const t = setTimeout(() => {
				this.debouncers.delete(file.path);
				void this.processFile(file);
			}, this.opts.debounceMs);

			this.debouncers.set(file.path, t);
		};

		const ref = this.app.vault.on("modify", handler);

		const cleanup = () => {
			this.app.vault.offref(ref);
			for (const t of this.debouncers.values()) clearTimeout(t);
			this.debouncers.clear();
		};
		register(cleanup);
		return cleanup;
	}

	private async processFile(file: TFile): Promise<void> {
		const ok = await this.ollama.ping();
		if (!ok) return; // silent fail, no notification

		try {
			const indexed = await this.indexer.indexFile(file);
			if (!indexed) return;

			// Skip very short notes
			if (indexed.wordCount < 30) return;

			const existingTags = indexed.tags;
			const fmExcerpt = JSON.stringify(indexed.frontmatter).substring(0, 300);
			const bodyExcerpt =
				indexed.body.length > 4000
					? indexed.body.substring(0, 4000)
					: indexed.body;

			const userPrompt = `Note: ${file.path}
Existing tags: ${existingTags.join(", ") || "(nenhuma)"}
Frontmatter: ${fmExcerpt}

${bodyExcerpt}`;

			// v0.22 Sprint H: cloud só se opt-in explícito (default Ollama — proteção contra cost overrun)
			const messages = [
				{ role: "system" as const, content: SYSTEM_PROMPT },
				{ role: "user" as const, content: FEW_SHOT_USER },
				{ role: "assistant" as const, content: FEW_SHOT_ASSISTANT },
				{ role: "user" as const, content: userPrompt },
			];
			let raw: string;
			if (this.allowCloud && this.llmService) {
				raw = await this.llmService.chat(messages, {
					feature: "automation.auto-tagger",
					taskKind: "extraction",
					temperature: 0.2,
					maxTokens: 200,
					jsonFormat: true,
				});
			} else {
				raw = await this.ollama.chat(messages, {
					model: this.model,
					temperature: 0.2,
					format: "json",
					max_tokens: 200,
				});
			}

			const cleaned = cleanJson(raw);
			let parsed: unknown;
			try {
				parsed = JSON.parse(cleaned);
			} catch {
				logger.warn("auto-tagger: JSON inválido", { raw: cleaned.substring(0, 100) });
				return;
			}
			const result = TagSuggestion.safeParse(parsed);
			if (!result.success) {
				logger.warn("auto-tagger: validação falhou");
				return;
			}

			const suggested = result.data.tags
				.map((t) => normalizeTag(t))
				.filter((t) => t && !existingTags.includes(t));

			if (suggested.length === 0) return;

			await this.applyTagsToFrontmatter(file, suggested);

			// Subtle notice (only if user is staring at this file, otherwise silent)
			const view = this.app.workspace.getActiveFile();
			if (view?.path === file.path) {
				new Notice(`🏷️ Atlas: +${suggested.length} tag${suggested.length > 1 ? "s" : ""}: ${suggested.join(", ")}`, 4000);
			}
		} catch (e) {
			logger.warn("auto-tagger: erro", { path: file.path, error: String(e) });
		}
	}

	private async applyTagsToFrontmatter(file: TFile, newTags: string[]): Promise<void> {
		try {
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				const current: string[] = Array.isArray(fm.tags)
					? fm.tags
					: typeof fm.tags === "string"
						? fm.tags.split(/[,\s]+/).filter(Boolean)
						: [];
				const merged = Array.from(new Set([...current, ...newTags]));
				fm.tags = merged;
			});
		} catch (e) {
			logger.warn("auto-tagger: applyTags falhou", { error: String(e) });
		}
	}

	/** Manual trigger for active note (no debounce). */
	async tagFileNow(file: TFile): Promise<void> {
		const old = this.debouncers.get(file.path);
		if (old) clearTimeout(old);
		this.debouncers.delete(file.path);
		await this.processFile(file);
	}
}

function cleanJson(raw: string): string {
	let s = raw.trim();
	const fence = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
	if (fence) s = fence[1].trim();
	const first = s.indexOf("{");
	const last = s.lastIndexOf("}");
	if (first >= 0 && last > first) s = s.substring(first, last + 1);
	return s;
}

function normalizeTag(tag: string): string {
	return tag
		.replace(/^#+/, "") // strip leading #
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9/_-]+/g, "-")
		.replace(/^-|-$/g, "")
		.replace(/-+/g, "-");
}
