import { Editor, MarkdownView, Notice, requestUrl } from "obsidian";
import type AtlasPlugin from "../../main";
import { logger } from "../utils/logger";

/**
 * Atlas Smart Paste:
 *   - URL → fetch metadata (title, description, og:image) + insert formatted card
 *   - JSON → format pretty + add code fence
 *   - Stack trace → insert as code block + offer debug AI
 *   - Plain text → default Obsidian paste behavior
 *
 * Trigger: command "Atlas: Smart paste" (hotkey opt-in) OR auto on Cmd+V if user enables.
 */

export async function smartPaste(plugin: AtlasPlugin): Promise<void> {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	const editor = view?.editor;
	if (!editor) {
		new Notice("Atlas: abra uma nota primeiro.");
		return;
	}

	let clipboard: string;
	try {
		clipboard = await navigator.clipboard.readText();
	} catch (e) {
		new Notice(`Atlas: erro lendo clipboard — ${String(e)}`);
		return;
	}

	if (!clipboard || clipboard.trim().length === 0) {
		new Notice("Atlas: clipboard vazio.");
		return;
	}

	const trimmed = clipboard.trim();
	const kind = detectKind(trimmed);
	logger.info("smart-paste: detected", { kind, length: trimmed.length });

	switch (kind) {
		case "url":
			await pasteUrl(plugin, editor, trimmed);
			break;
		case "json":
			pasteJson(editor, trimmed);
			break;
		case "stack-trace":
			pasteStackTrace(editor, trimmed);
			break;
		case "code":
			pasteCode(editor, trimmed);
			break;
		case "csv":
			pasteCsv(editor, trimmed);
			break;
		default:
			editor.replaceSelection(trimmed);
			break;
	}
}

type ClipboardKind = "url" | "json" | "stack-trace" | "code" | "csv" | "plain";

function detectKind(text: string): ClipboardKind {
	// URL: single line, starts with http(s)
	if (/^https?:\/\/[^\s]+$/.test(text) || (text.split("\n").length === 1 && /^https?:\/\//.test(text))) {
		return "url";
	}

	// JSON: starts with { or [, parses
	const candidate = text.trim();
	if ((candidate.startsWith("{") && candidate.endsWith("}")) || (candidate.startsWith("[") && candidate.endsWith("]"))) {
		try {
			JSON.parse(candidate);
			return "json";
		} catch {
			// fall through
		}
	}

	// Stack trace: contains "at " followed by file:line, OR "Traceback (most recent call last)"
	if (
		/Traceback \(most recent call last\)/.test(text) ||
		/^\s*at\s+\S+\s+\(.+:\d+(:\d+)?\)/m.test(text) ||
		/Exception in thread/.test(text) ||
		/Error:\s+.+\n\s+at\s/.test(text)
	) {
		return "stack-trace";
	}

	// Code-like: many curly braces, semicolons, function/class keywords
	const codeIndicators =
		(text.match(/[{}();]/g)?.length ?? 0) +
		(text.match(/\b(function|class|const|let|var|def|import|from|public|private)\b/g)?.length ?? 0);
	if (codeIndicators >= 5 && text.split("\n").length >= 3) {
		return "code";
	}

	// CSV-like: ≥3 lines with consistent comma/tab separators
	const lines = text.split("\n").filter((l) => l.trim());
	if (lines.length >= 3) {
		const firstSep = (lines[0].match(/,/g)?.length ?? 0);
		const lastSep = (lines[lines.length - 1].match(/,/g)?.length ?? 0);
		if (firstSep >= 2 && firstSep === lastSep) return "csv";
	}

	return "plain";
}

async function pasteUrl(plugin: AtlasPlugin, editor: Editor, url: string): Promise<void> {
	const notice = new Notice(`Atlas: buscando metadata de ${url.substring(0, 50)}...`, 0);
	try {
		const meta = await fetchUrlMetadata(url);
		notice.hide();

		const card = renderUrlCard(url, meta);
		editor.replaceSelection(card);
		new Notice(`Atlas: ${meta.title ?? "URL"} inserido.`);
	} catch (e) {
		notice.hide();
		// Fallback: insert as simple link
		editor.replaceSelection(`[${url}](${url})`);
		new Notice(`Atlas: metadata indisponível, inseri link simples.`);
		logger.warn("smart-paste: fetch falhou", { url, error: String(e) });
	}
}

function pasteJson(editor: Editor, text: string): void {
	try {
		const parsed = JSON.parse(text);
		const formatted = JSON.stringify(parsed, null, 2);
		editor.replaceSelection("```json\n" + formatted + "\n```");
		new Notice("Atlas: JSON formatado e inserido.");
	} catch {
		editor.replaceSelection(text);
	}
}

function pasteStackTrace(editor: Editor, text: string): void {
	const lang = detectStackLanguage(text);
	editor.replaceSelection(
		`### 🚨 Stack trace\n\n\`\`\`${lang}\n${text}\n\`\`\`\n\n> _Comando: Cmd+P → "Atlas: Inline AI" → "Explicar simples" para análise_\n`
	);
	new Notice("Atlas: stack trace inserido. Use Cmd+Shift+I para análise.");
}

function pasteCode(editor: Editor, text: string): void {
	const lang = guessCodeLanguage(text);
	editor.replaceSelection("```" + lang + "\n" + text + "\n```");
	new Notice(`Atlas: bloco de código (${lang}) inserido.`);
}

function pasteCsv(editor: Editor, text: string): void {
	const lines = text.split("\n").filter((l) => l.trim());
	const sep = ",";
	const rows = lines.map((l) => l.split(sep).map((c) => c.trim()));
	if (rows.length === 0) {
		editor.replaceSelection(text);
		return;
	}
	const headers = rows[0];
	const body = rows.slice(1);

	const md: string[] = [];
	md.push("| " + headers.join(" | ") + " |");
	md.push("|" + headers.map(() => "---").join("|") + "|");
	for (const row of body) {
		// pad/truncate to header length
		while (row.length < headers.length) row.push("");
		md.push("| " + row.slice(0, headers.length).join(" | ") + " |");
	}
	editor.replaceSelection(md.join("\n"));
	new Notice(`Atlas: CSV → tabela markdown (${body.length} linhas).`);
}

// ─── URL metadata fetch ───

interface UrlMeta {
	title?: string;
	description?: string;
	siteName?: string;
	image?: string;
	author?: string;
	publishedAt?: string;
}

async function fetchUrlMetadata(url: string): Promise<UrlMeta> {
	const res = await requestUrl({
		url,
		method: "GET",
		headers: {
			"User-Agent": "Mozilla/5.0 (Atlas Obsidian Plugin)",
			Accept: "text/html,application/xhtml+xml",
		},
		throw: false,
	});

	if (res.status >= 400) throw new Error(`HTTP ${res.status}`);

	const html = res.text;
	return parseHtmlMeta(html);
}

function parseHtmlMeta(html: string): UrlMeta {
	const meta: UrlMeta = {};

	const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
	if (titleMatch) meta.title = decodeEntities(titleMatch[1].trim());

	const ogTitle = matchMeta(html, "og:title");
	if (ogTitle) meta.title = ogTitle;

	const ogDesc = matchMeta(html, "og:description") ?? matchMeta(html, "description");
	if (ogDesc) meta.description = ogDesc;

	const ogSite = matchMeta(html, "og:site_name");
	if (ogSite) meta.siteName = ogSite;

	const ogImage = matchMeta(html, "og:image");
	if (ogImage) meta.image = ogImage;

	const author = matchMeta(html, "article:author") ?? matchMeta(html, "author");
	if (author) meta.author = author;

	const published = matchMeta(html, "article:published_time");
	if (published) meta.publishedAt = published;

	return meta;
}

function matchMeta(html: string, name: string): string | undefined {
	const re = new RegExp(
		`<meta\\s+(?:property|name)=["']${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']\\s+content=["']([^"']+)["']`,
		"i"
	);
	const altRe = new RegExp(
		`<meta\\s+content=["']([^"']+)["']\\s+(?:property|name)=["']${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
		"i"
	);
	const m = html.match(re) ?? html.match(altRe);
	return m ? decodeEntities(m[1].trim()) : undefined;
}

function decodeEntities(s: string): string {
	return s
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, " ");
}

function renderUrlCard(url: string, meta: UrlMeta): string {
	const lines: string[] = [];
	lines.push(`> [!info] ${meta.siteName ?? hostname(url)}`);
	if (meta.title) lines.push(`> **[${meta.title}](${url})**`);
	else lines.push(`> [${url}](${url})`);
	if (meta.description) {
		const desc =
			meta.description.length > 200
				? meta.description.substring(0, 200) + "…"
				: meta.description;
		lines.push(`> ${desc}`);
	}
	const metaLine: string[] = [];
	if (meta.author) metaLine.push(`✍️ ${meta.author}`);
	if (meta.publishedAt) metaLine.push(`📅 ${meta.publishedAt.substring(0, 10)}`);
	if (metaLine.length > 0) lines.push(`> ${metaLine.join(" · ")}`);
	if (meta.image && /^https?:\/\//.test(meta.image)) {
		lines.push(`> ![](${meta.image})`);
	}
	return lines.join("\n");
}

function hostname(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

function detectStackLanguage(text: string): string {
	if (/Traceback \(most recent call last\)/.test(text)) return "python";
	if (/^\s*at\s+\S+\s+\(.+\.(js|ts|jsx|tsx):\d+/m.test(text)) return "javascript";
	if (/Exception in thread/.test(text)) return "java";
	if (/^\s*\d+:\s+\S/m.test(text)) return "ruby";
	return "text";
}

function guessCodeLanguage(text: string): string {
	if (/\b(function|const|let|var|=>|console\.log)\b/.test(text)) {
		if (/\b(interface|type\s+\w+\s*=|<.+>)\b/.test(text)) return "typescript";
		return "javascript";
	}
	if (/\b(def\s|import\s|from\s.*\simport|print\()/.test(text)) return "python";
	if (/\bSELECT\s|FROM\s|WHERE\s/i.test(text)) return "sql";
	if (/\bpublic\s+(static\s+)?(class|void|String)/.test(text)) return "java";
	if (/^#include|int main\(/.test(text)) return "cpp";
	if (/^package\s|func\s/.test(text)) return "go";
	if (/<\?php/.test(text)) return "php";
	if (/<[a-z]+[\s>]/i.test(text)) return "html";
	return "text";
}
