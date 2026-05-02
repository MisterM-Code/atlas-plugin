import { App, TFile, Notice } from "obsidian";
import { OllamaClient } from "../ollama/client";
import { logger } from "../utils/logger";

const TLDR_START = "<!-- atlas-tldr-start -->";
const TLDR_END = "<!-- atlas-tldr-end -->";

const SYSTEM_PROMPT = `Você é Atlas. Sua tarefa: gerar um TLDR de 2-4 linhas em PT-BR para uma nota markdown.

Regras:
- Capture as ideias-chave / decisões / pessoas / temas principais
- Sem invenção de fatos
- Tom factual, direto
- Sem markdown nas frases (texto puro)
- ≤ 250 caracteres por frase, ≤ 4 frases total
- NÃO repita o título da nota`;

export interface AutoSummaryOptions {
	minWords: number;
	model: string;
}

export class AutoSummaryTool {
	private llm: import("../providers/llm-service").LLMService | null = null;

	constructor(private app: App, private ollama: OllamaClient, private opts: AutoSummaryOptions) {}

	setLLMService(llm: import("../providers/llm-service").LLMService): void {
		this.llm = llm;
	}

	async generateForFile(file: TFile): Promise<string | null> {
		try {
			const raw = await this.app.vault.read(file);

			// Extract body without frontmatter and existing TLDR
			const body = stripFrontmatter(raw);
			const cleanBody = stripExistingTldr(body);

			const wordCount = cleanBody.split(/\s+/).filter(Boolean).length;
			if (wordCount < this.opts.minWords) return null;

			const truncated = cleanBody.length > 8000 ? cleanBody.substring(0, 8000) : cleanBody;

			const prompt = `${SYSTEM_PROMPT}

Nota:
"""
${truncated}
"""

TLDR (2-4 linhas):`;

			const out = this.llm
				? await this.llm.generate(prompt, {
						feature: "tools.auto-summary",
						taskKind: "summarization",
						temperature: 0.3,
						maxTokens: 250,
				  })
				: await this.ollama.generate(prompt, {
						model: this.opts.model,
						temperature: 0.3,
						max_tokens: 250,
				  });

			return cleanSummary(out);
		} catch (e) {
			logger.warn("auto-summary: falhou", { path: file.path, error: String(e) });
			return null;
		}
	}

	async applyToFile(file: TFile): Promise<boolean> {
		const summary = await this.generateForFile(file);
		if (!summary) return false;

		const raw = await this.app.vault.read(file);
		const updated = injectTldr(raw, summary);
		if (updated === raw) return false;

		await this.app.vault.modify(file, updated);
		return true;
	}
}

function stripFrontmatter(raw: string): string {
	const m = raw.match(/^---\n[\s\S]*?\n---\n?/);
	return m ? raw.substring(m[0].length) : raw;
}

function stripExistingTldr(body: string): string {
	const re = new RegExp(
		`${escapeRegex(TLDR_START)}[\\s\\S]*?${escapeRegex(TLDR_END)}\\n*`,
		"g"
	);
	return body.replace(re, "");
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanSummary(s: string): string {
	let out = s.trim();
	out = out.replace(/^TLDR[:\s]*/i, "");
	out = out.replace(/^\s*[-*]\s+/gm, ""); // strip bullet markers
	out = out.replace(/\n{2,}/g, "\n");
	// Truncate if too long
	if (out.length > 700) out = out.substring(0, 700) + "…";
	return out;
}

function injectTldr(raw: string, summary: string): string {
	const tldrBlock = `${TLDR_START}\n> [!info]+ TLDR (Atlas)\n${summary
		.split("\n")
		.map((l) => `> ${l}`)
		.join("\n")}\n${TLDR_END}\n\n`;

	// Find frontmatter end OR start of body
	const fmMatch = raw.match(/^---\n[\s\S]*?\n---\n/);
	const startIdx = fmMatch ? fmMatch[0].length : 0;

	// Check if existing TLDR block — replace
	const existingStart = raw.indexOf(TLDR_START);
	const existingEnd = raw.indexOf(TLDR_END);
	if (existingStart >= 0 && existingEnd > existingStart) {
		const before = raw.substring(0, existingStart);
		const after = raw.substring(existingEnd + TLDR_END.length).replace(/^\n+/, "");
		return before + tldrBlock + after;
	}

	// Insert after frontmatter (and before first heading if any)
	const beforeBody = raw.substring(0, startIdx);
	const afterBody = raw.substring(startIdx);

	// If body starts with a # heading, insert TLDR AFTER the title line
	const titleMatch = afterBody.match(/^(#\s.+\n)/);
	if (titleMatch) {
		return (
			beforeBody +
			titleMatch[1] +
			"\n" +
			tldrBlock +
			afterBody.substring(titleMatch[1].length)
		);
	}

	return beforeBody + tldrBlock + afterBody;
}

export function autoSummaryEnabled(): boolean {
	return true;
}

export async function generateSummaryForActiveNote(plugin: import("../../main").default): Promise<void> {
	const file = plugin.app.workspace.getActiveFile();
	if (!file) {
		new Notice("Atlas: abra uma nota primeiro.");
		return;
	}

	const ok = await plugin.ollama.ping();
	if (!ok) {
		new Notice("Atlas: Ollama offline.");
		return;
	}

	const notice = new Notice("Atlas: gerando TLDR...", 0);
	const tool = new AutoSummaryTool(plugin.app, plugin.ollama, {
		minWords: 100,
		model: plugin.settings.ollama.smallModel,
	});
	if (plugin.llm) tool.setLLMService(plugin.llm);

	try {
		const applied = await tool.applyToFile(file);
		notice.hide();
		if (applied) {
			new Notice("Atlas: TLDR adicionado no topo da nota.", 6000);
		} else {
			new Notice("Atlas: nota muito curta para TLDR (mín 100 palavras).");
		}
	} catch (e) {
		notice.hide();
		new Notice(`Atlas: erro — ${String(e)}`, 8000);
	}
}
