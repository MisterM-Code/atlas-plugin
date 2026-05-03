/**
 * v0.63.0 — Markdown report generator pra Vault Importer.
 *
 * Gera nota em `01_Inbox/atlas-import-report-${YYYY-MM-DD-HHMM}.md` com sumário
 * completo do que foi importado, breakdowns, custos, conflicts.
 */

import type { App } from "obsidian";
import type { NoteType } from "./heuristic-classifier";

export interface ImportReportData {
	sourcePath: string;
	startedAt: number;
	finishedAt: number;
	totalNotes: number;
	moved: number;
	skipped: number;
	errors: number;
	costUSD: number;
	llmCalls: number;
	noteTypeBreakdown: Record<NoteType, number>;
	personsCreated: { name: string; aliases: string[] }[];
	systemsCreated: { name: string; vendor?: string }[];
	themesCreated: string[];
	conflictsResolved: { from: string; to: string; reason: string }[];
	skippedFiles: { path: string; reason: string }[];
}

export function renderImportReport(data: ImportReportData): string {
	const dur = Math.max(1, Math.round((data.finishedAt - data.startedAt) / 1000));
	const minutes = Math.floor(dur / 60);
	const seconds = dur % 60;
	const durStr = minutes > 0 ? `${minutes}min${seconds}s` : `${seconds}s`;
	const date = new Date(data.startedAt).toISOString().slice(0, 16).replace("T", " ");

	let md = `---
type: atlas-import-report
date: ${new Date(data.startedAt).toISOString().slice(0, 10)}
total: ${data.totalNotes}
moved: ${data.moved}
skipped: ${data.skipped}
errors: ${data.errors}
cost_usd: ${data.costUSD.toFixed(4)}
duration_seconds: ${dur}
source: "${data.sourcePath}"
---

# 📥 Atlas Import Report — ${date}

## ✨ Resumo

- **Source:** \`${data.sourcePath}\`
- **Duração:** ${durStr}
- **Total notas:** ${data.totalNotes}
- ✅ **Movidas:** ${data.moved}
- ⚠️ **Skipped:** ${data.skipped}
- ❌ **Erros:** ${data.errors}
- 💰 **Custo LLM:** $${data.costUSD.toFixed(4)} (${data.llmCalls} calls)

## 🗂️ Breakdown por noteType

| Tipo | Count |
|---|---|
`;
	const sortedTypes = Object.entries(data.noteTypeBreakdown)
		.filter(([, n]) => n > 0)
		.sort((a, b) => b[1] - a[1]);
	for (const [type, count] of sortedTypes) {
		md += `| ${type} | ${count} |\n`;
	}

	if (data.personsCreated.length > 0) {
		md += `\n## 👥 Pessoas criadas (${data.personsCreated.length})\n\n`;
		for (const p of data.personsCreated.slice(0, 50)) {
			const aliases = p.aliases.length > 0 ? ` (aliases: ${p.aliases.join(", ")})` : "";
			md += `- **${p.name}**${aliases}\n`;
		}
		if (data.personsCreated.length > 50) md += `- ... e mais ${data.personsCreated.length - 50}\n`;
	}

	if (data.systemsCreated.length > 0) {
		md += `\n## 🖥️ Sistemas detectados (${data.systemsCreated.length})\n\n`;
		for (const s of data.systemsCreated) {
			md += `- **${s.name}**${s.vendor ? ` — vendor: ${s.vendor}` : ""}\n`;
		}
	}

	if (data.themesCreated.length > 0) {
		md += `\n## 🎨 Themes (${data.themesCreated.length})\n\n`;
		for (const t of data.themesCreated.slice(0, 30)) md += `- #${t}\n`;
		if (data.themesCreated.length > 30) md += `- ... e mais ${data.themesCreated.length - 30}\n`;
	}

	if (data.conflictsResolved.length > 0) {
		md += `\n## ⚠️ Conflitos resolvidos (${data.conflictsResolved.length})\n\n`;
		for (const c of data.conflictsResolved.slice(0, 20)) {
			md += `- \`${c.from}\` → \`${c.to}\` (${c.reason})\n`;
		}
	}

	if (data.skippedFiles.length > 0) {
		md += `\n## ⚠️ Skipped files (${data.skippedFiles.length})\n\n`;
		for (const s of data.skippedFiles.slice(0, 30)) {
			md += `- \`${s.path}\` — ${s.reason}\n`;
		}
		if (data.skippedFiles.length > 30) md += `- ... e mais ${data.skippedFiles.length - 30}\n`;
	}

	md += `\n## 🚀 Next steps\n\n`;
	md += `- Abra **🌐 Knowledge** tab pra revisar entidades criadas\n`;
	md += `- Use **🔍 Chat** pra perguntar coisas sobre as notas importadas\n`;
	md += `- Notas com tag \`#atlas/needs-review\` precisam de revisão manual\n`;
	return md;
}

export async function writeImportReport(
	app: App,
	data: ImportReportData,
	folder = "01_Inbox"
): Promise<string> {
	const date = new Date(data.startedAt);
	const stamp = date.toISOString().slice(0, 16).replace(/[:T]/g, "-");
	const path = `${folder}/atlas-import-report-${stamp}.md`;
	const md = renderImportReport(data);
	await app.vault.adapter.write(path, md);
	return path;
}
