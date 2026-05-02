/**
 * Atlas v0.13 — Smart Paste.
 *
 * Cola inteligente: detecta tipo de conteúdo no clipboard e processa adequadamente.
 *
 * Tipos detectados:
 * 1. **URL** → fetch metadata (title, description) e cola como "[title](url)\n> description"
 * 2. **Stack trace / erro** → propõe debug com LLM
 * 3. **JSON** → formata indentado
 * 4. **Markdown table** → cola direto formatado
 * 5. **CSV** → converte em markdown table
 * 6. **Slack/Teams quote** → reformata como blockquote citado
 * 7. **Código** → detecta linguagem e wrap em fence
 * 8. **Texto longo > 500 chars** → resume em 2-3 linhas via LLM
 *
 * UX: comando Cmd+P "Smart Paste" — analisa clipboard, mostra preview, confirma.
 */

import { App, MarkdownView, Modal, Notice, requestUrl } from "obsidian";
import type AtlasPlugin from "../../main";
import { applyResponsiveModal } from "../ui/modal-helpers";
import { logger } from "../utils/logger";

type PasteKind =
	| "url"
	| "json"
	| "csv"
	| "markdown-table"
	| "slack"
	| "stack-trace"
	| "code"
	| "long-text"
	| "plain";

interface DetectedPaste {
	kind: PasteKind;
	original: string;
	processed: string;
	meta?: { lang?: string; title?: string; description?: string; lines?: number };
}

export class SmartPasteModal extends Modal {
	private detected: DetectedPaste | null = null;

	constructor(app: App, private readonly plugin: AtlasPlugin) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		applyResponsiveModal(contentEl, { preferredWidth: 720, preferredHeight: 600 });
		contentEl.addClass("atlas-paste-modal");

		contentEl.createEl("h3", { cls: "atlas-paste-title", text: "📋 Smart Paste" });
		contentEl.createEl("div", {
			cls: "atlas-paste-subtitle",
			text: "Atlas detecta tipo de conteúdo no clipboard e processa: URLs viram links com metadata, JSON formata, código ganha fence, etc.",
		});

		const loading = contentEl.createDiv({
			cls: "atlas-paste-loading",
			text: "📋 Lendo clipboard...",
		});

		try {
			const text = await navigator.clipboard.readText();
			loading.remove();

			if (!text.trim()) {
				contentEl.createDiv({ cls: "atlas-paste-empty", text: "Clipboard vazio." });
				return;
			}

			// Detect + process
			contentEl.createDiv({
				cls: "atlas-paste-processing",
				text: `⏳ Analisando ${text.length} chars...`,
			});
			this.detected = await detectAndProcess(text, this.plugin);
			this.renderResult(contentEl, text);
		} catch (e) {
			loading.remove();
			logger.error("smart-paste: clipboard read failed", { error: String(e) });
			contentEl.createDiv({
				cls: "atlas-paste-error",
				text: `Erro ao ler clipboard: ${String(e)}. Permissão de clipboard pode estar bloqueada.`,
			});
		}
	}

	private renderResult(parent: HTMLElement, original: string): void {
		// Remove processing message
		parent.querySelectorAll(".atlas-paste-processing").forEach((el) => el.remove());

		if (!this.detected) return;

		// Kind badge
		const kindBox = parent.createDiv({ cls: "atlas-paste-kind-box" });
		kindBox.createEl("span", {
			cls: "atlas-paste-kind-emoji",
			text: kindEmoji(this.detected.kind),
		});
		kindBox.createEl("strong", { text: kindLabel(this.detected.kind) });
		if (this.detected.meta) {
			const m = this.detected.meta;
			const metaParts: string[] = [];
			if (m.lang) metaParts.push(`lang: ${m.lang}`);
			if (m.lines) metaParts.push(`${m.lines} linhas`);
			if (m.title) metaParts.push(`"${m.title.substring(0, 40)}"`);
			if (metaParts.length > 0) {
				kindBox.createEl("span", {
					cls: "atlas-paste-kind-meta",
					text: ` · ${metaParts.join(" · ")}`,
				});
			}
		}

		// Side-by-side
		const grid = parent.createDiv({ cls: "atlas-paste-grid" });

		const leftCol = grid.createDiv({ cls: "atlas-paste-col" });
		leftCol.createEl("div", { cls: "atlas-paste-col-label", text: "ORIGINAL" });
		const leftPre = leftCol.createEl("pre", { cls: "atlas-paste-pre" });
		leftPre.setText(original.substring(0, 2000) + (original.length > 2000 ? "..." : ""));

		const rightCol = grid.createDiv({ cls: "atlas-paste-col" });
		rightCol.createEl("div", { cls: "atlas-paste-col-label", text: "PROCESSADO" });
		const rightTa = rightCol.createEl("textarea", {
			cls: "atlas-paste-output-textarea",
		}) as HTMLTextAreaElement;
		rightTa.value = this.detected.processed;

		// Actions
		const actions = parent.createDiv({ cls: "atlas-paste-actions" });

		const cancelBtn = actions.createEl("button", { text: "Cancelar" });
		cancelBtn.addEventListener("click", () => this.close());

		const useOriginalBtn = actions.createEl("button", { text: "Usar original" });
		useOriginalBtn.addEventListener("click", () => {
			this.applyPaste(original);
		});

		const insertBtn = actions.createEl("button", {
			cls: "atlas-paste-insert-btn mod-cta",
			text: "📋 Inserir processado",
		});
		insertBtn.addEventListener("click", () => {
			this.applyPaste(rightTa.value);
		});
	}

	private applyPaste(text: string): void {
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (view) {
			view.editor.replaceSelection(text);
			new Notice("Atlas: inserido no editor.");
		} else {
			void navigator.clipboard.writeText(text);
			new Notice("Atlas: copiado pra clipboard (sem nota ativa).");
		}
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

// ──────────────────────────────────────────────────────────
// Detection + processing logic

async function detectAndProcess(text: string, plugin: AtlasPlugin): Promise<DetectedPaste> {
	const trimmed = text.trim();

	// 1. URL detection (single URL)
	const urlMatch = trimmed.match(/^(https?:\/\/[^\s]+)$/);
	if (urlMatch) {
		const url = urlMatch[1];
		try {
			const meta = await fetchUrlMeta(url);
			return {
				kind: "url",
				original: text,
				processed: `[${meta.title || url}](${url})\n> ${meta.description || ""}`.trim(),
				meta: { title: meta.title, description: meta.description },
			};
		} catch {
			return {
				kind: "url",
				original: text,
				processed: `[${url}](${url})`,
			};
		}
	}

	// 2. JSON
	if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
		try {
			const parsed = JSON.parse(trimmed);
			return {
				kind: "json",
				original: text,
				processed: "```json\n" + JSON.stringify(parsed, null, 2) + "\n```",
				meta: { lang: "json", lines: trimmed.split("\n").length },
			};
		} catch {
			// not valid JSON, continue
		}
	}

	// 3. Markdown table (already formatted)
	if (/^\|.*\|$/m.test(trimmed) && /^\|[-:|\s]+\|$/m.test(trimmed)) {
		return {
			kind: "markdown-table",
			original: text,
			processed: trimmed,
			meta: { lines: trimmed.split("\n").length },
		};
	}

	// 4. CSV (rough heuristic: 3+ lines with same number of commas)
	const csvLines = trimmed.split("\n").filter(Boolean);
	if (csvLines.length >= 3) {
		const commas = csvLines.map((l) => (l.match(/,/g) ?? []).length);
		const allSame = commas.every((c) => c === commas[0]) && commas[0] >= 1;
		if (allSame) {
			const processed = csvToMarkdownTable(csvLines);
			return {
				kind: "csv",
				original: text,
				processed,
				meta: { lines: csvLines.length },
			};
		}
	}

	// 5. Slack/Teams quote (lines starting with "Username:" or "[time] User:")
	if (/^[A-Z][a-zA-Z]+\s*\([^)]+\):/m.test(trimmed) || /^[A-Z][a-zA-Z]+:/m.test(trimmed)) {
		const blockquoted = trimmed
			.split("\n")
			.map((l) => "> " + l)
			.join("\n");
		return {
			kind: "slack",
			original: text,
			processed: blockquoted,
			meta: { lines: trimmed.split("\n").length },
		};
	}

	// 6. Stack trace heuristic
	if (/^\s*at\s+\S+\s*\(.*:\d+:\d+\)/m.test(trimmed) || /Error:|Exception:|Traceback/i.test(trimmed)) {
		return {
			kind: "stack-trace",
			original: text,
			processed: "```\n" + trimmed + "\n```\n\n> 💡 Use `Atlas: Reasoning Mode` pra ajuda no debug.",
			meta: { lines: trimmed.split("\n").length },
		};
	}

	// 7. Code (3+ lines with consistent indentation or has function/const/class keywords)
	const lines = trimmed.split("\n");
	if (
		lines.length >= 3 &&
		(/\b(function|const|let|var|class|def|import|export|public|private)\b/.test(trimmed) ||
			lines.filter((l) => l.startsWith("\t") || l.startsWith("  ")).length / lines.length > 0.5)
	) {
		const lang = detectLanguage(trimmed);
		return {
			kind: "code",
			original: text,
			processed: "```" + lang + "\n" + trimmed + "\n```",
			meta: { lang, lines: lines.length },
		};
	}

	// 8. Long text → summarize via LLM
	if (text.length > 500) {
		try {
			const summary = await plugin.ollama.generate(
				`Resuma este texto em 2-3 linhas em PT-BR (apenas o resumo, sem prefácio):\n\n${text.substring(0, 3000)}`,
				{
					model: plugin.settings.ollama.generationModel,
					temperature: 0.4,
					max_tokens: 200,
				}
			);
			return {
				kind: "long-text",
				original: text,
				processed: `> 💡 Resumo Atlas:\n> ${summary.trim().replace(/\n/g, "\n> ")}\n\n${text}`,
				meta: { lines: text.split("\n").length },
			};
		} catch {
			// LLM failed, fall through
		}
	}

	// Default: plain
	return {
		kind: "plain",
		original: text,
		processed: text,
	};
}

async function fetchUrlMeta(url: string): Promise<{ title?: string; description?: string }> {
	try {
		const response = await requestUrl({ url, throw: false });
		if (response.status !== 200) return {};
		const html = response.text;
		const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
		const descMatch =
			html.match(/<meta\s+name="description"\s+content="([^"]+)"/i) ??
			html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
		return {
			title: titleMatch?.[1]?.trim().substring(0, 200),
			description: descMatch?.[1]?.trim().substring(0, 300),
		};
	} catch {
		return {};
	}
}

function csvToMarkdownTable(lines: string[]): string {
	const header = lines[0].split(",").map((c) => c.trim());
	const rows = lines.slice(1).map((l) => l.split(",").map((c) => c.trim()));
	const out: string[] = [];
	out.push("| " + header.join(" | ") + " |");
	out.push("|" + header.map(() => "---").join("|") + "|");
	for (const r of rows) {
		out.push("| " + r.join(" | ") + " |");
	}
	return out.join("\n");
}

function detectLanguage(code: string): string {
	if (/\b(function|const|let|var|=>)\b/.test(code) && /\bimport\s+.*from/.test(code)) return "ts";
	if (/\bdef\s+\w+\(/.test(code) || /\bimport\s+\w+/m.test(code) && /\bself\b/.test(code)) return "py";
	if (/\bpublic\s+(class|static)/.test(code)) return "java";
	if (/\bfunc\s+\w+/.test(code) && /\bvar\s+\w+\s+/.test(code)) return "go";
	if (/^\s*(fn|let mut|impl)\s+/m.test(code)) return "rust";
	if (/\b(SELECT|FROM|WHERE|GROUP BY)\b/i.test(code)) return "sql";
	if (/<\/[a-z]+>/.test(code) && /<[a-z]+/.test(code)) return "html";
	if (/^[\s\w-]+:\s*\S+/m.test(code) && code.includes(":")) return "yaml";
	return "";
}

function kindEmoji(k: PasteKind): string {
	switch (k) {
		case "url": return "🔗";
		case "json": return "{}";
		case "csv": return "📊";
		case "markdown-table": return "🗂️";
		case "slack": return "💬";
		case "stack-trace": return "🚨";
		case "code": return "</>";
		case "long-text": return "📄";
		case "plain": return "📋";
	}
}

function kindLabel(k: PasteKind): string {
	switch (k) {
		case "url": return "URL com metadata";
		case "json": return "JSON formatado";
		case "csv": return "CSV → Markdown table";
		case "markdown-table": return "Markdown table";
		case "slack": return "Slack/Teams quote";
		case "stack-trace": return "Stack trace / erro";
		case "code": return "Código";
		case "long-text": return "Texto longo (resumido)";
		case "plain": return "Texto simples";
	}
}
