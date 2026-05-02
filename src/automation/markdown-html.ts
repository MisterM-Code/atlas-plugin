/**
 * Markdown → HTML rendering for email bodies.
 * Lightweight, no external deps. Sufficient for our generated reports.
 */

const ESCAPE_MAP: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

function esc(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

interface RenderOptions {
	title?: string;
	headerColor?: string;
	signatureName?: string;
	signatureRole?: string;
}

export function markdownToHtmlEmail(md: string, opts: RenderOptions = {}): string {
	// Strip frontmatter and Atlas-specific commands
	const cleaned = md
		.replace(/^---\n[\s\S]*?\n---\n?/, "")
		.replace(/\[📧 \*\*Aprovar e enviar para gerência\*\*\]\([^)]+\)/g, "")
		.replace(/<!-- atlas-[\w-]+-(start|end) -->/g, "");

	const body = renderBlocks(cleaned);
	const headerColor = opts.headerColor ?? "#1a4d8f";
	const title = opts.title ?? "Atlas Report";

	return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color:#222; max-width:760px; margin:24px auto; padding:0 16px; line-height:1.5; }
h1, h2, h3 { color:${headerColor}; }
h1 { border-bottom: 2px solid ${headerColor}; padding-bottom: 8px; }
h2 { margin-top: 28px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
h3 { margin-top: 18px; }
table { border-collapse: collapse; margin: 12px 0; width: 100%; }
th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
th { background: #f5f5f5; }
code { background: #f4f4f4; padding: 1px 4px; border-radius: 3px; font-family: monospace; }
blockquote { border-left: 3px solid ${headerColor}; margin: 12px 0; padding: 6px 12px; background: #f9f9f9; color:#555; }
.atlas-footer { margin-top: 36px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 11px; color:#888; }
ul, ol { padding-left: 24px; }
li { margin: 2px 0; }
</style>
</head>
<body>
${body}
${opts.signatureName ? `<p class="atlas-footer">— ${esc(opts.signatureName)}${opts.signatureRole ? `, ${esc(opts.signatureRole)}` : ""}<br/><em>Gerado por Atlas — segundo cérebro local</em></p>` : `<p class="atlas-footer"><em>Gerado por Atlas</em></p>`}
</body>
</html>`;
}

function renderBlocks(md: string): string {
	const lines = md.split("\n");
	const out: string[] = [];
	let i = 0;

	while (i < lines.length) {
		const l = lines[i];

		// Heading
		const heading = l.match(/^(#{1,6})\s+(.*)$/);
		if (heading) {
			const level = heading[1].length;
			out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
			i++;
			continue;
		}

		// Horizontal rule
		if (/^---+\s*$/.test(l)) {
			out.push("<hr/>");
			i++;
			continue;
		}

		// Table
		if (l.includes("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
			const tableLines: string[] = [l];
			i++;
			tableLines.push(lines[i]); // separator
			i++;
			while (i < lines.length && lines[i].includes("|")) {
				tableLines.push(lines[i]);
				i++;
			}
			out.push(renderTable(tableLines));
			continue;
		}

		// Blockquote
		if (l.startsWith("> ")) {
			const block: string[] = [];
			while (i < lines.length && lines[i].startsWith("> ")) {
				block.push(lines[i].substring(2));
				i++;
			}
			out.push(`<blockquote>${renderInline(block.join("<br/>"))}</blockquote>`);
			continue;
		}

		// Lists
		if (/^[\s]*[-*]\s+/.test(l)) {
			const items: string[] = [];
			while (i < lines.length && /^[\s]*[-*]\s+/.test(lines[i])) {
				const text = lines[i].replace(/^[\s]*[-*]\s+/, "");
				items.push(`<li>${renderInline(text)}</li>`);
				i++;
			}
			out.push(`<ul>${items.join("")}</ul>`);
			continue;
		}

		if (/^[\s]*\d+\.\s+/.test(l)) {
			const items: string[] = [];
			while (i < lines.length && /^[\s]*\d+\.\s+/.test(lines[i])) {
				const text = lines[i].replace(/^[\s]*\d+\.\s+/, "");
				items.push(`<li>${renderInline(text)}</li>`);
				i++;
			}
			out.push(`<ol>${items.join("")}</ol>`);
			continue;
		}

		// Skip code blocks (don't try to render Dataview/Mermaid in email)
		if (l.startsWith("```")) {
			i++;
			while (i < lines.length && !lines[i].startsWith("```")) {
				i++;
			}
			i++;
			continue;
		}

		// Paragraph
		if (l.trim()) {
			const para: string[] = [l];
			i++;
			while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
				para.push(lines[i]);
				i++;
			}
			out.push(`<p>${renderInline(para.join(" "))}</p>`);
			continue;
		}

		i++;
	}

	return out.join("\n");
}

function isBlockStart(l: string): boolean {
	return /^#{1,6}\s/.test(l) || /^[\s]*[-*]\s/.test(l) || /^[\s]*\d+\.\s/.test(l) || /^>\s/.test(l) || /^---+\s*$/.test(l) || l.startsWith("```");
}

function renderTable(lines: string[]): string {
	if (lines.length < 2) return lines.join("<br/>");
	const cells = (line: string) =>
		line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
	const headerCells = cells(lines[0]);
	const rows = lines.slice(2).map(cells);
	const head = `<tr>${headerCells.map((c) => `<th>${renderInline(c)}</th>`).join("")}</tr>`;
	const body = rows
		.map((r) => `<tr>${r.map((c) => `<td>${renderInline(c)}</td>`).join("")}</tr>`)
		.join("");
	return `<table>${head}${body}</table>`;
}

function renderInline(text: string): string {
	let s = esc(text);
	// Bold
	s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
	s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
	// Italic
	s = s.replace(/(?:^|[^*])\*([^*]+)\*(?:[^*]|$)/g, (m, g) => m.replace(`*${g}*`, `<em>${g}</em>`));
	// Code inline
	s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
	// Wikilinks → text
	s = s.replace(/\[\[([^\]|#]+)(?:[|#]([^\]]+))?\]\]/g, (_m, target, label) => esc(label ?? target));
	// Standard links
	s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
	// Emojis preserved (already in unicode)
	return s;
}
