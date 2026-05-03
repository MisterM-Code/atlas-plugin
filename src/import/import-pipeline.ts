/**
 * v0.63.0 — Vault Importer Pipeline (orquestrador dos 6 stages).
 *
 * Stage 1: Scan → manifest (read-only, só metadata)
 * Stage 2: Classify (heurística zero-LLM)
 * Stage 3: Extract entities (LLM apenas se confidence < 0.7)
 * Stage 4: Categorize folders (rules + map)
 * Stage 5: Move + rewrite wikilinks (Obsidian preserva backlinks)
 * Stage 6: Index + embed + KG upsert
 *
 * Reusa: KGExtractor, ExtractionCache, SystemDetector, KGStore, Indexer, Embedder.
 */

import { App, normalizePath, TFile } from "obsidian";
import type AtlasPlugin from "../../main";
import { classify, ClassifyResult, NoteType, targetFolderFor } from "./heuristic-classifier";
import { resolveDuplicate, detectBrokenLinks, markBrokenLink } from "./conflict-resolver";
import { detectSourceFormat, stripNotionUuid, SourceFormat } from "./source-detector";
import { writeImportReport, ImportReportData } from "./import-report";
import { logger } from "../utils/logger";
import type { ExtractionResultT } from "../kg/schemas";

const CONFIDENCE_THRESHOLD = 0.7;

export interface ImportManifest {
	relPath: string;        // path relativo ao source root
	absPath: string;        // path absoluto na vault adapter
	size: number;
	mtime: number;
	ext: string;
}

export interface ClassifiedNote extends ImportManifest {
	noteType: NoteType;
	confidence: number;
	matchedRule: number;
	reason: string;
	tags: string[];
	frontmatter: Record<string, unknown>;
	bodyPreview?: string;
	llmExtraction?: ExtractionResultT | null;
	systemMatchCount: number;
	// User overrides (set durante review)
	userOverride?: { noteType?: NoteType; rejected?: boolean; targetFolder?: string };
}

export interface MovePlan {
	source: string;
	target: string;
	noteType: NoteType;
	conflict?: { resolution: "suffix" | "archive"; originalTarget: string };
}

export interface ImportOptions {
	sourceFolder: string;          // path relativo ao vault OU absoluto
	includeAttachments?: boolean;  // default false
	extractWithLLM?: boolean;      // default true
	autoTagAfter?: boolean;        // default false
	moveFiles?: boolean;           // default true
	backupBeforeMove?: boolean;    // default false
	confidenceThreshold?: number;  // default 0.7
}

export interface PipelineProgress {
	stage: 1 | 2 | 3 | 4 | 5 | 6;
	stageName: string;
	processed: number;
	total: number;
	skipped: number;
	errors: number;
	llmCalls: number;
	costUSD: number;
	currentItem?: string;
	logLine?: string;
}

export type ProgressCallback = (p: PipelineProgress) => void;

export interface PipelineResult {
	report: ImportReportData;
	reportPath: string;
}

export class ImportPipeline {
	private app: App;
	private startedAt = 0;
	private llmCalls = 0;
	private costUSD = 0;
	private cancelled = false;
	// v0.68: detected source format (notion/roam/obsidian) — afeta filename normalization
	private sourceFormat: SourceFormat = "unknown";

	constructor(private plugin: AtlasPlugin) {
		this.app = plugin.app;
	}

	cancel(): void {
		this.cancelled = true;
	}

	/**
	 * Stage 1: Scan + parse-only (NÃO carrega body de tudo, só metadata).
	 */
	async scan(opts: ImportOptions, onProgress?: ProgressCallback): Promise<ImportManifest[]> {
		const adapter = this.app.vault.adapter;
		const sourceFolder = normalizePath(opts.sourceFolder);
		const includeAttachments = opts.includeAttachments ?? false;
		const manifest: ImportManifest[] = [];

		const visit = async (rel: string): Promise<void> => {
			if (this.cancelled) return;
			const list = await adapter.list(rel);
			for (const file of list.files) {
				if (this.cancelled) return;
				const ext = (file.split(".").pop() ?? "").toLowerCase();
				const isMd = ext === "md" || ext === "markdown";
				if (!isMd && !includeAttachments) continue;
				const stat = await adapter.stat(file).catch(() => null);
				if (!stat) continue;
				manifest.push({
					relPath: file.startsWith(sourceFolder) ? file.slice(sourceFolder.length + 1) : file,
					absPath: file,
					size: stat.size,
					mtime: stat.mtime,
					ext,
				});
				if (onProgress && manifest.length % 25 === 0) {
					onProgress({
						stage: 1,
						stageName: "Scan",
						processed: manifest.length,
						total: manifest.length,
						skipped: 0,
						errors: 0,
						llmCalls: 0,
						costUSD: 0,
						currentItem: file,
					});
				}
			}
			for (const dir of list.folders) {
				if (this.cancelled) return;
				if (dir.startsWith(".") || dir.endsWith("/.atlas") || dir.endsWith("/.obsidian")) continue;
				await visit(dir);
			}
		};

		await visit(sourceFolder);
		// v0.68: detectar formato de origem (Notion/Roam/Obsidian) pós-scan
		const detection = detectSourceFormat(manifest);
		this.sourceFormat = detection.format;
		logger.info("import: source format detected", {
			format: detection.format,
			confidence: detection.confidence,
			hints: detection.hints,
		});
		onProgress?.({
			stage: 1,
			stageName: `Scan complete (source: ${detection.format})`,
			processed: manifest.length,
			total: manifest.length,
			skipped: 0,
			errors: 0,
			llmCalls: 0,
			costUSD: 0,
		});
		return manifest;
	}

	/** v0.68: getter pra wizard mostrar formato detectado na UI */
	getSourceFormat(): SourceFormat {
		return this.sourceFormat;
	}

	/**
	 * Stage 2: Classify cada nota via heurística (zero LLM).
	 */
	async classify(
		manifest: ImportManifest[],
		onProgress?: ProgressCallback
	): Promise<ClassifiedNote[]> {
		const adapter = this.app.vault.adapter;
		const sysDetector = (this.plugin as unknown as { systemDetector?: { detect: (s: string) => unknown[] } })
			.systemDetector;
		const out: ClassifiedNote[] = [];
		let i = 0;

		for (const m of manifest) {
			if (this.cancelled) break;
			i += 1;
			try {
				if (m.ext !== "md" && m.ext !== "markdown") {
					// attachments — skip classification
					out.push({
						...m,
						noteType: "other",
						confidence: 0,
						matchedRule: 0,
						reason: "non-md",
						tags: [],
						frontmatter: {},
						systemMatchCount: 0,
					});
					continue;
				}
				const body = await adapter.read(m.absPath);
				const { fm, tags, content } = parseFrontmatterAndTags(body);
				const systemMatchCount = sysDetector
					? sysDetector.detect(content).length
					: 0;
				const c: ClassifyResult = classify({
					path: m.relPath,
					body: content,
					frontmatter: fm,
					tags,
					systemMatchCount,
				});
				out.push({
					...m,
					noteType: c.noteType,
					confidence: c.confidence,
					matchedRule: c.matchedRule,
					reason: c.reason,
					tags,
					frontmatter: fm,
					bodyPreview: content.slice(0, 200),
					systemMatchCount,
				});
			} catch (e) {
				logger.warn("classify: failed", { path: m.absPath, error: String(e) });
				out.push({
					...m,
					noteType: "other",
					confidence: 0,
					matchedRule: 0,
					reason: `read-error: ${String(e)}`,
					tags: [],
					frontmatter: {},
					systemMatchCount: 0,
				});
			}
			if (onProgress && i % 25 === 0) {
				onProgress({
					stage: 2,
					stageName: "Classify",
					processed: i,
					total: manifest.length,
					skipped: 0,
					errors: 0,
					llmCalls: 0,
					costUSD: 0,
					currentItem: m.relPath,
				});
				await sleep(0);
			}
		}
		return out;
	}

	/**
	 * Stage 3: Extract entities via LLM apenas para low-confidence notes.
	 */
	async extract(
		notes: ClassifiedNote[],
		opts: ImportOptions,
		onProgress?: ProgressCallback
	): Promise<ClassifiedNote[]> {
		if (!opts.extractWithLLM) return notes;
		const threshold = opts.confidenceThreshold ?? CONFIDENCE_THRESHOLD;
		const lowConf = notes.filter(
			(n) => n.confidence < threshold && (n.ext === "md" || n.ext === "markdown") && !n.userOverride?.rejected
		);
		const extractor = (this.plugin as unknown as { kgExtractor?: import("../kg/extractor").KGExtractor })
			.kgExtractor;
		if (!extractor) {
			logger.warn("extract: KGExtractor not available, skipping");
			return notes;
		}
		let i = 0;
		for (const note of lowConf) {
			if (this.cancelled) break;
			i += 1;
			try {
				const body = await this.app.vault.adapter.read(note.absPath);
				const { fm, content } = parseFrontmatterAndTags(body);
				const result = await extractor.extract({
					notePath: note.relPath,
					frontmatter: fm,
					body: content,
				});
				note.llmExtraction = result;
				this.llmCalls += 1;
				// Cost approx: 4K tokens × $0.25/M = $0.001 per call (Haiku-ish)
				this.costUSD += 0.001;
				// Upgrade noteType if LLM detected
				if (result?.noteType && result.noteType !== "other") {
					note.noteType = result.noteType as NoteType;
					note.confidence = 0.85;
					note.reason += " · LLM-upgraded";
				}
			} catch (e) {
				logger.warn("extract: failed", { path: note.relPath, error: String(e) });
			}
			if (onProgress && i % 5 === 0) {
				onProgress({
					stage: 3,
					stageName: "LLM extract",
					processed: i,
					total: lowConf.length,
					skipped: 0,
					errors: 0,
					llmCalls: this.llmCalls,
					costUSD: this.costUSD,
					currentItem: note.relPath,
				});
				await sleep(0);
			}
		}
		return notes;
	}

	/**
	 * Stage 4: Build move plan from classified notes (folder mapping + conflict resolution).
	 */
	async buildMovePlan(notes: ClassifiedNote[]): Promise<MovePlan[]> {
		const plan: MovePlan[] = [];
		for (const note of notes) {
			if (note.userOverride?.rejected) continue;
			const targetFolder = note.userOverride?.targetFolder
				?? targetFolderFor(note.userOverride?.noteType ?? note.noteType);
			let filename = note.relPath.split("/").pop()!;
			// v0.68: Notion exports → strip UUID hex 32-char suffix
			if (this.sourceFormat === "notion") {
				filename = stripNotionUuid(filename);
			}
			const targetPath = normalizePath(`${targetFolder}/${filename}`);
			const safe = await resolveDuplicate(this.app, targetPath);
			plan.push({
				source: note.absPath,
				target: safe,
				noteType: note.userOverride?.noteType ?? note.noteType,
				conflict: safe !== targetPath ? { resolution: "suffix", originalTarget: targetPath } : undefined,
			});
		}
		return plan;
	}

	/**
	 * Stage 5: Apply move plan (file rename preserves backlinks via Obsidian).
	 */
	async applyMovePlan(
		plan: MovePlan[],
		onProgress?: ProgressCallback
	): Promise<{ moved: number; errors: number; conflicts: { from: string; to: string; reason: string }[] }> {
		let moved = 0;
		let errors = 0;
		const conflicts: { from: string; to: string; reason: string }[] = [];
		let i = 0;
		for (const m of plan) {
			if (this.cancelled) break;
			i += 1;
			try {
				// Garantir parent folder
				const parent = m.target.substring(0, m.target.lastIndexOf("/"));
				if (parent) {
					const exists = await this.app.vault.adapter.exists(parent);
					if (!exists) await this.app.vault.adapter.mkdir(parent);
				}
				// Mark broken links no body antes de mover
				const file = this.app.vault.getAbstractFileByPath(m.source);
				if (file instanceof TFile) {
					try {
						const body = await this.app.vault.cachedRead(file);
						const broken = detectBrokenLinks(this.app, body);
						if (broken.length > 0) {
							let updated = body;
							for (const b of broken) updated = markBrokenLink(updated, b);
							await this.app.vault.modify(file, updated);
						}
					} catch {/* best effort */}
					// fileManager.renameFile reescreve backlinks atomicamente
					await this.app.fileManager.renameFile(file, m.target);
					moved += 1;
					if (m.conflict) {
						conflicts.push({
							from: m.source,
							to: m.target,
							reason: `duplicate filename, suffixed`,
						});
					}
				} else {
					errors += 1;
				}
			} catch (e) {
				errors += 1;
				logger.warn("applyMovePlan: failed", { source: m.source, error: String(e) });
			}
			if (onProgress && i % 10 === 0) {
				onProgress({
					stage: 5,
					stageName: "Move",
					processed: i,
					total: plan.length,
					skipped: 0,
					errors,
					llmCalls: this.llmCalls,
					costUSD: this.costUSD,
					currentItem: m.source,
				});
				await sleep(0);
			}
		}
		return { moved, errors, conflicts };
	}

	/**
	 * Stage 6: Trigger index + KG upsert para entidades extraídas.
	 */
	async indexAndUpsert(
		notes: ClassifiedNote[],
		onProgress?: ProgressCallback
	): Promise<{ persons: { name: string; aliases: string[] }[]; systems: { name: string; vendor?: string }[]; themes: string[] }> {
		const kg = (this.plugin as unknown as { kg?: import("../kg/store").KGStore }).kg;
		const persons: { name: string; aliases: string[] }[] = [];
		const systemsSet = new Set<string>();
		const themesSet = new Set<string>();

		if (!kg) return { persons: [], systems: [], themes: [] };

		let i = 0;
		const personSeen = new Set<string>();
		for (const note of notes) {
			if (this.cancelled) break;
			i += 1;
			const ex = note.llmExtraction;
			if (!ex) continue;
			// Persons (ExtractionResult.people is string[] — list of names)
			for (const name of ex.people ?? []) {
				if (!name || personSeen.has(name)) continue;
				personSeen.add(name);
				try {
					kg.upsertPerson({ name, aliases: [], type: "other" });
					persons.push({ name, aliases: [] });
				} catch (e) {
					logger.warn(`kg.upsertPerson failed for ${name}: ${String(e)}`);
				}
			}
			// Themes
			for (const t of ex.themes ?? []) {
				if (t.name) themesSet.add(t.name);
			}
			if (i % 10 === 0) {
				onProgress?.({
					stage: 6,
					stageName: "KG upsert",
					processed: i,
					total: notes.length,
					skipped: 0,
					errors: 0,
					llmCalls: this.llmCalls,
					costUSD: this.costUSD,
					currentItem: note.relPath,
				});
				await sleep(0);
			}
		}
		return { persons, systems: Array.from(systemsSet).map((n) => ({ name: n })), themes: Array.from(themesSet) };
	}

	/**
	 * Pipeline completo: usa as etapas acima em sequência. Retorna report data.
	 */
	async run(opts: ImportOptions, onProgress?: ProgressCallback): Promise<PipelineResult> {
		this.startedAt = Date.now();
		this.cancelled = false;
		this.llmCalls = 0;
		this.costUSD = 0;

		// 1. Scan
		const manifest = await this.scan(opts, onProgress);
		// 2. Classify
		const classified = await this.classify(manifest, onProgress);
		// 3. Extract (low-confidence only)
		await this.extract(classified, opts, onProgress);
		// 4. Build move plan
		const plan = opts.moveFiles !== false ? await this.buildMovePlan(classified) : [];
		// 5. Apply
		const moveResult = opts.moveFiles !== false
			? await this.applyMovePlan(plan, onProgress)
			: { moved: 0, errors: 0, conflicts: [] };
		// 6. KG upsert
		const upsertResult = await this.indexAndUpsert(classified, onProgress);

		// Build noteType breakdown
		const breakdown: Record<NoteType, number> = {
			"daily": 0, "1on1": 0, "meeting": 0, "weekly-status": 0, "project": 0,
			"person": 0, "raid": 0, "incident": 0, "adr": 0, "paper": 0, "course": 0,
			"theme": 0, "knowledge": 0, "inbox": 0, "other": 0,
		};
		for (const n of classified) {
			if (!n.userOverride?.rejected) breakdown[n.noteType] += 1;
		}

		const report: ImportReportData = {
			sourcePath: opts.sourceFolder,
			startedAt: this.startedAt,
			finishedAt: Date.now(),
			totalNotes: classified.length,
			moved: moveResult.moved,
			skipped: classified.filter((n) => n.userOverride?.rejected).length,
			errors: moveResult.errors,
			costUSD: this.costUSD,
			llmCalls: this.llmCalls,
			noteTypeBreakdown: breakdown,
			personsCreated: upsertResult.persons,
			systemsCreated: upsertResult.systems,
			themesCreated: upsertResult.themes,
			conflictsResolved: moveResult.conflicts,
			skippedFiles: classified
				.filter((n) => n.userOverride?.rejected || n.matchedRule === 0)
				.map((n) => ({ path: n.relPath, reason: n.userOverride?.rejected ? "user-rejected" : n.reason })),
		};
		const reportPath = await writeImportReport(this.app, report);

		// Track in importHistory
		const settings = (this.plugin as unknown as {
			settings: { importHistory?: { ranAt: number; sourcePath: string; total: number; cost: number }[] };
			saveSettings(): Promise<void>;
		}).settings;
		if (settings) {
			settings.importHistory = settings.importHistory ?? [];
			settings.importHistory.push({
				ranAt: this.startedAt,
				sourcePath: opts.sourceFolder,
				total: classified.length,
				cost: this.costUSD,
			});
			await (this.plugin as unknown as { saveSettings(): Promise<void> }).saveSettings();
		}

		return { report, reportPath };
	}
}

// ─── helpers ───

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

function parseFrontmatterAndTags(body: string): {
	fm: Record<string, unknown>;
	tags: string[];
	content: string;
} {
	let fm: Record<string, unknown> = {};
	let content = body;
	if (body.startsWith("---\n")) {
		const end = body.indexOf("\n---", 4);
		if (end > 0) {
			const yaml = body.slice(4, end);
			content = body.slice(end + 4).replace(/^\n+/, "");
			try {
				fm = parseSimpleYaml(yaml);
			} catch {/* swallow */}
		}
	}
	// Tags from frontmatter + inline
	const tags: string[] = [];
	const fmTags = fm.tags;
	if (Array.isArray(fmTags)) {
		for (const t of fmTags) if (typeof t === "string") tags.push(t.replace(/^#/, ""));
	} else if (typeof fmTags === "string") {
		tags.push(...fmTags.split(/[\s,]+/).filter(Boolean).map((t) => t.replace(/^#/, "")));
	}
	const inline = content.match(/(?:^|\s)#([a-zA-Z0-9_/-]+)/g) ?? [];
	for (const m of inline) tags.push(m.trim().replace(/^#/, ""));
	return { fm, tags, content };
}

function parseSimpleYaml(yaml: string): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const line of yaml.split("\n")) {
		const m = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
		if (!m) continue;
		const key = m[1];
		const raw = m[2].trim();
		if (!raw) continue;
		if (raw.startsWith("[") && raw.endsWith("]")) {
			out[key] = raw.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
		} else {
			out[key] = raw.replace(/^["']|["']$/g, "");
		}
	}
	return out;
}
