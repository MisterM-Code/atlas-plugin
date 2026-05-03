/**
 * v0.68.0 — Detector de formato de export externo (Notion / Roam / Obsidian).
 *
 * Heurística pra identificar a origem do vault e aplicar transformações específicas
 * (ex: stripping de UUID suffix em filenames Notion).
 */

import type { ImportManifest } from "./import-pipeline";

export type SourceFormat = "notion" | "roam" | "obsidian" | "logseq" | "unknown";

export interface SourceDetection {
	format: SourceFormat;
	confidence: number; // 0..1
	notionUuidPattern?: boolean; // true se filenames têm UUID hex 32-char suffix
	hints: string[]; // human-readable explanation
}

/**
 * Detecta o formato analisando paths/filenames de uma amostra (até 50 arquivos).
 */
export function detectSourceFormat(manifest: ImportManifest[]): SourceDetection {
	const sample = manifest.slice(0, 50);
	const hints: string[] = [];

	// Notion patterns:
	// - Filename: "Page title <32-char-hex-uuid>.md"
	// - Often has folders with same UUID for attachments
	// - "Untitled <UUID>.md" common pattern
	const notionFilenameRegex = /\s[a-f0-9]{32}\.md$/;
	const notionMatchCount = sample.filter((m) => notionFilenameRegex.test(m.relPath)).length;
	const notionRatio = sample.length > 0 ? notionMatchCount / sample.length : 0;

	// Roam patterns:
	// - Single JSON file (Roam exports as one big JSON, not markdown)
	// - OR markdown via Roam-to-Obsidian converter (usually `.md` with `roam-edn` style)
	const hasRoamJson = sample.some((m) => m.ext === "json" && /roam/i.test(m.relPath));

	// Logseq patterns:
	// - Folders `journals/` and `pages/`
	// - Block-based notation `((uuid))` and `[[]]`
	const logseqJournals = sample.filter((m) => /^journals\//i.test(m.relPath)).length;
	const logseqPages = sample.filter((m) => /^pages\//i.test(m.relPath)).length;

	if (notionRatio > 0.5) {
		hints.push(`${notionMatchCount}/${sample.length} arquivos com UUID Notion suffix`);
		return {
			format: "notion",
			confidence: Math.min(1, notionRatio + 0.3),
			notionUuidPattern: true,
			hints,
		};
	}

	if (hasRoamJson) {
		hints.push("JSON Roam Research detectado");
		return { format: "roam", confidence: 0.85, hints };
	}

	if (logseqJournals > 3 && logseqPages > 3) {
		hints.push(`Logseq: ${logseqJournals} journals + ${logseqPages} pages`);
		return { format: "logseq", confidence: 0.85, hints };
	}

	// Default: assume Obsidian-compatible markdown
	if (sample.filter((m) => m.ext === "md").length > sample.length * 0.5) {
		hints.push("Estrutura Obsidian-compatível (markdown puro)");
		return { format: "obsidian", confidence: 0.7, hints };
	}

	hints.push("Formato não reconhecido — tentando como Obsidian");
	return { format: "unknown", confidence: 0.3, hints };
}

/**
 * Notion: remove UUID suffix do filename pra produzir nome limpo.
 * Ex: "Reuniao com Maria abc123def456789012345678901234ab.md" → "Reuniao com Maria.md"
 */
export function stripNotionUuid(filename: string): string {
	const re = /^(.+?)\s+([a-f0-9]{32})(\.md)$/;
	const m = re.exec(filename);
	if (!m) return filename;
	return `${m[1].trim()}${m[3]}`;
}

/**
 * Notion frontmatter conversion: detecta padrão "Property: value" no topo do body
 * e converte pra YAML frontmatter Atlas-compatível.
 *
 * Ex Notion body:
 *   Property: Done
 *   Tags: Work, Important
 *   Created: 2026-04-15
 *
 *   Real content here...
 *
 * → frontmatter: { property: "Done", tags: ["Work", "Important"], created: "2026-04-15" } + body sem props
 */
export function convertNotionInlineProps(body: string): {
	props: Record<string, unknown>;
	cleanBody: string;
} {
	const props: Record<string, unknown> = {};
	const lines = body.split("\n");
	let i = 0;
	// Read leading "Key: value" lines until first blank or non-prop line
	while (i < lines.length) {
		const line = lines[i].trim();
		if (line === "") break;
		const m = line.match(/^([A-Z][a-zA-Z0-9 ]+):\s*(.*)$/);
		if (!m) break;
		const key = m[1].toLowerCase().replace(/\s+/g, "_");
		const val = m[2].trim();
		props[key] = val.includes(",") ? val.split(",").map((s) => s.trim()) : val;
		i += 1;
	}
	if (i === 0) return { props: {}, cleanBody: body };
	// Skip leading blank lines after props
	while (i < lines.length && lines[i].trim() === "") i += 1;
	return { props, cleanBody: lines.slice(i).join("\n") };
}
