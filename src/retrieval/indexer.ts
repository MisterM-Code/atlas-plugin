import { App, TFile, parseFrontMatterEntry, getAllTags } from "obsidian";
import { getExcludedFolders, getInclusiveFolders } from "../coach/scope";
import { logger } from "../utils/logger";

export interface IndexedNote {
	path: string;
	mtime: number;
	frontmatter: Record<string, unknown>;
	body: string;
	tags: string[];
	links: string[]; // [[wikilinks]]
	wordCount: number;
}

export interface Chunk {
	notePath: string;
	chunkId: string;
	context: string; // contextual prefix (Anthropic-style)
	text: string;
	startOffset: number;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;
const WIKILINK_RE = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
const TAG_RE = /(?:^|\s)#([a-zA-Z][a-zA-Z0-9_/-]*)/g;

export class Indexer {
	constructor(private app: App, private excludedFolders: string[] = []) {}

	/** Index all .md files in vault, optionally filtering folders. */
	async indexVault(includeFolderPrefix?: string[]): Promise<IndexedNote[]> {
		const files = this.app.vault.getMarkdownFiles();
		const notes: IndexedNote[] = [];

		const scopeExcluded = getExcludedFolders();
		const scopeInclusive = getInclusiveFolders();
		const effectiveExcluded = [...this.excludedFolders, ...scopeExcluded];

		for (const f of files) {
			if (effectiveExcluded.some((ef) => f.path.startsWith(ef))) continue;

			// Scope inclusive (e.g. Coach Mode = only coach folder)
			if (scopeInclusive && scopeInclusive.length > 0) {
				if (!scopeInclusive.some((p) => f.path.startsWith(p))) continue;
			}

			if (
				includeFolderPrefix &&
				includeFolderPrefix.length > 0 &&
				!includeFolderPrefix.some((p) => f.path.startsWith(p))
			) {
				continue;
			}

			try {
				const raw = await this.app.vault.read(f);
				notes.push(this.parseNote(f, raw));
			} catch (e) {
				logger.warn("indexer: read failed", { path: f.path, error: String(e) });
			}
		}
		logger.info(`indexer: ${notes.length} notas processadas`);
		return notes;
	}

	async indexFile(file: TFile): Promise<IndexedNote | null> {
		if (this.shouldExclude(file.path)) return null;
		try {
			const raw = await this.app.vault.read(file);
			return this.parseNote(file, raw);
		} catch (e) {
			logger.warn("indexer: indexFile failed", { path: file.path, error: String(e) });
			return null;
		}
	}

	private shouldExclude(path: string): boolean {
		return this.excludedFolders.some((f) => path.startsWith(f));
	}

	private parseNote(file: TFile, raw: string): IndexedNote {
		const { frontmatter, body } = splitFrontmatter(raw);
		const tags = extractTags(body, frontmatter);
		const links = extractWikilinks(body);
		const wordCount = body.split(/\s+/).filter(Boolean).length;

		return {
			path: file.path,
			mtime: file.stat.mtime,
			frontmatter,
			body,
			tags,
			links,
			wordCount,
		};
	}

	/**
	 * Chunk a note using heading-aware sliding window.
	 * Adds Anthropic-style contextual prefix to each chunk.
	 */
	chunk(note: IndexedNote, opts?: { maxChars?: number; overlap?: number }): Chunk[] {
		const maxChars = opts?.maxChars ?? 1200;
		const overlap = opts?.overlap ?? 150;

		const context = buildContextPrefix(note);
		const text = note.body.trim();

		if (text.length <= maxChars) {
			return [
				{
					notePath: note.path,
					chunkId: `${note.path}#0`,
					context,
					text,
					startOffset: 0,
				},
			];
		}

		const chunks: Chunk[] = [];
		const sections = splitByHeadings(text);
		let buffer = "";
		let bufferOffset = 0;
		let idx = 0;

		const flush = (offset: number) => {
			if (buffer.trim().length === 0) return;
			chunks.push({
				notePath: note.path,
				chunkId: `${note.path}#${idx++}`,
				context,
				text: buffer.trim(),
				startOffset: offset,
			});
			// keep last `overlap` chars
			buffer = overlap > 0 ? buffer.slice(-overlap) : "";
		};

		for (const sec of sections) {
			if (buffer.length + sec.length > maxChars) {
				flush(bufferOffset);
				bufferOffset += buffer.length;
			}
			buffer += sec;
		}
		flush(bufferOffset);

		return chunks;
	}
}

// ─────────────────────────────────────────────────────────────────────

function splitFrontmatter(raw: string): { frontmatter: Record<string, unknown>; body: string } {
	const m = raw.match(FRONTMATTER_RE);
	if (!m) return { frontmatter: {}, body: raw };
	const yaml = m[1];
	const body = raw.substring(m[0].length);
	const fm = parseSimpleYaml(yaml);
	return { frontmatter: fm, body };
}

/** Minimal YAML parser for flat key:value frontmatter (sufficient for our templates). */
function parseSimpleYaml(yaml: string): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	const lines = yaml.split("\n");
	let currentKey: string | null = null;
	let currentList: string[] | null = null;

	for (const line of lines) {
		if (!line.trim()) continue;

		// list item
		const listMatch = line.match(/^\s+-\s*(.*)$/);
		if (listMatch && currentList) {
			currentList.push(stripQuotes(listMatch[1]));
			continue;
		}

		// key: value
		const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
		if (kv) {
			if (currentList && currentKey) {
				out[currentKey] = currentList;
				currentList = null;
			}
			currentKey = kv[1];
			const val = kv[2].trim();
			if (val === "" || val === "|" || val === ">") {
				// might be list or empty
				currentList = [];
				out[currentKey] = currentList;
			} else {
				out[currentKey] = parseScalar(val);
				currentList = null;
			}
		}
	}
	if (currentKey && currentList) {
		out[currentKey] = currentList;
	}
	return out;
}

function parseScalar(v: string): unknown {
	const s = stripQuotes(v);
	if (s === "true") return true;
	if (s === "false") return false;
	if (/^-?\d+$/.test(s)) return parseInt(s, 10);
	if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
	return s;
}

function stripQuotes(v: string): string {
	const s = v.trim();
	if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
		return s.slice(1, -1);
	}
	return s;
}

function extractTags(body: string, fm: Record<string, unknown>): string[] {
	const tags = new Set<string>();
	let m: RegExpExecArray | null;
	while ((m = TAG_RE.exec(body)) !== null) {
		tags.add(m[1]);
	}
	const fmTags = fm["tags"];
	if (Array.isArray(fmTags)) {
		for (const t of fmTags) {
			if (typeof t === "string") tags.add(t);
		}
	} else if (typeof fmTags === "string") {
		fmTags.split(/[,\s]+/).filter(Boolean).forEach((t) => tags.add(t));
	}
	return Array.from(tags);
}

function extractWikilinks(body: string): string[] {
	const out = new Set<string>();
	let m: RegExpExecArray | null;
	while ((m = WIKILINK_RE.exec(body)) !== null) {
		out.add(m[1].trim());
	}
	return Array.from(out);
}

function buildContextPrefix(note: IndexedNote): string {
	const parts: string[] = [];
	const fm = note.frontmatter;

	if (fm.type) parts.push(`Tipo: ${fm.type}`);
	if (fm.date) parts.push(`Data: ${fm.date}`);
	if (fm.person) parts.push(`Pessoa: ${fm.person}`);
	if (fm.coachee) parts.push(`Coachee: ${fm.coachee}`);
	if (fm.framework) parts.push(`Framework: ${fm.framework}`);

	const folder = note.path.split("/").slice(0, -1).join("/") || "(raiz)";
	parts.push(`Pasta: ${folder}`);

	return parts.join(" · ");
}

function splitByHeadings(text: string): string[] {
	// Split keeping headings with their content
	const lines = text.split("\n");
	const sections: string[] = [];
	let current = "";
	for (const l of lines) {
		if (/^#{1,6}\s/.test(l) && current.length > 0) {
			sections.push(current);
			current = "";
		}
		current += l + "\n";
	}
	if (current) sections.push(current);
	return sections;
}
