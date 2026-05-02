import { App, normalizePath, TFile } from "obsidian";
import { KGStore } from "../kg/store";
import { OllamaClient } from "../ollama/client";
import { Indexer } from "../retrieval/indexer";
import { MapReduceSummarizer } from "../summarizer/map-reduce";
import { logger } from "../utils/logger";

export interface WeeklyReportInput {
	weekEnd?: Date; // default = today (Friday usually)
	periodDays?: number; // default = 7
}

export interface WeeklyReportOutput {
	notePath: string;
	markdown: string;
	periodStart: Date;
	periodEnd: Date;
	stats: {
		dailyLogs: number;
		meetings: number;
		oneOnOnes: number;
		tasksCompleted: number;
		tasksOpen: number;
		incidents: number;
	};
}

export class WeeklyReportTool {
	constructor(
		private app: App,
		private kg: KGStore,
		private ollama: OllamaClient,
		private model: string,
		private folders: { daily: string; meetings: string; reports: string; raid: string; incidents: string }
	) {}

	async run(input: WeeklyReportInput = {}): Promise<WeeklyReportOutput> {
		const periodEnd = input.weekEnd ?? new Date();
		const periodDays = input.periodDays ?? 7;
		const periodStart = new Date(periodEnd);
		periodStart.setDate(periodStart.getDate() - periodDays);

		const isoStart = periodStart.toISOString();
		const isoEnd = periodEnd.toISOString();

		// 1. Collect notes from period
		const indexer = new Indexer(this.app);
		const allNotes = await indexer.indexVault([
			this.folders.daily,
			this.folders.meetings,
			this.folders.incidents,
			this.folders.raid,
		]);

		const periodNotes = allNotes.filter((n) => {
			const mtime = new Date(n.mtime).toISOString();
			return mtime >= isoStart && mtime <= isoEnd;
		});

		const dailyNotes = periodNotes.filter((n) => n.path.startsWith(this.folders.daily));
		const meetingNotes = periodNotes.filter((n) => n.path.startsWith(this.folders.meetings));
		const oneOnOneNotes = meetingNotes.filter((n) => n.path.includes("1on1"));
		const incidentNotes = periodNotes.filter((n) => n.path.startsWith(this.folders.incidents));

		// 2. KG-derived stats
		const periodSessions = this.kg.data.sessions.filter((s) => {
			const d = s.date;
			return d >= isoStart.split("T")[0] && d <= isoEnd.split("T")[0];
		});
		const completedActions = this.kg.data.actionItems.filter((a) => {
			if (a.status !== "completed" || !a.completedDate) return false;
			return a.completedDate >= isoStart && a.completedDate <= isoEnd;
		});
		const openActions = this.kg.data.actionItems.filter((a) => a.status === "open" || a.status === "in-progress");
		const openRisks = this.kg.data.risks.filter((r) => r.status === "open");
		const topRisks = openRisks
			.sort((a, b) => b.priority.localeCompare(a.priority))
			.slice(0, 3);
		const openCommitments = this.kg.data.commitments.filter((c) => c.status === "open");

		// 3. LLM map-reduce on notes
		const mr = new MapReduceSummarizer(this.ollama);
		const noteChunks = periodNotes
			.slice(0, 30)
			.map((n) => `Path: ${n.path}\n\n${n.body.substring(0, 1800)}`);

		let llmSummary = "";
		if (noteChunks.length > 0) {
			try {
				llmSummary = await mr.run(noteChunks, {
					model: this.model,
					mapPrompt: (chunk) =>
						`Resuma esta nota em 2-4 bullets focando em: decisões, bloqueios, status de projetos, sentiment do time. Sem invenções. PT-BR.

${chunk}

Resumo:`,
					reducePrompt: (summaries) =>
						`Você é Atlas. Consolide os ${summaries.length} resumos abaixo em um Status Report executivo da semana.

Estrutura (escreva EM PT-BR, executivo, factual):

## 🟢 Highlights (3 bullets curtos)
[principais realizações]

## 🔴 Lowlights / desafios
[o que não foi tão bem]

## 🌡️ Pulse do time
[sentiment geral, sinais relevantes]

## 🎯 Foco próxima semana
[3 prioridades inferidas]

Resumos:
${summaries.map((s, i) => `--- ${i + 1} ---\n${s}`).join("\n\n")}

Status report:`,
					mapTemperature: 0.2,
					reduceTemperature: 0.4,
					maxTokensMap: 250,
					maxTokensReduce: 1500,
				});
			} catch (e) {
				logger.warn("weekly: LLM falhou, gerando relatório sem IA", {
					error: String(e),
				});
			}
		}

		// 4. Build markdown
		const fmt = (d: Date) => d.toISOString().split("T")[0];
		const weekNum = getWeekNumber(periodEnd);
		const year = periodEnd.getFullYear();
		const reportId = `W${String(weekNum).padStart(2, "0")}-${year}`;

		const markdown = this.buildMarkdown({
			reportId,
			periodStart: fmt(periodStart),
			periodEnd: fmt(periodEnd),
			llmSummary,
			stats: {
				dailyLogs: dailyNotes.length,
				meetings: meetingNotes.length,
				oneOnOnes: oneOnOneNotes.length,
				tasksCompleted: completedActions.length,
				tasksOpen: openActions.length,
				incidents: incidentNotes.length,
			},
			topRisks,
			openCommitments: openCommitments.slice(0, 5),
			recentSessions: periodSessions,
			incidentNotes: incidentNotes.map((n) => n.path),
		});

		// 5. Save note
		const dir = `${this.folders.reports}/weekly`;
		if (!this.app.vault.getAbstractFileByPath(dir)) {
			await this.app.vault.createFolder(dir);
		}
		const path = normalizePath(`${dir}/${reportId}.md`);
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, markdown);
		} else {
			await this.app.vault.create(path, markdown);
		}

		return {
			notePath: path,
			markdown,
			periodStart,
			periodEnd,
			stats: {
				dailyLogs: dailyNotes.length,
				meetings: meetingNotes.length,
				oneOnOnes: oneOnOneNotes.length,
				tasksCompleted: completedActions.length,
				tasksOpen: openActions.length,
				incidents: incidentNotes.length,
			},
		};
	}

	private buildMarkdown(data: {
		reportId: string;
		periodStart: string;
		periodEnd: string;
		llmSummary: string;
		stats: {
			dailyLogs: number;
			meetings: number;
			oneOnOnes: number;
			tasksCompleted: number;
			tasksOpen: number;
			incidents: number;
		};
		topRisks: { description: string; priority: string; ownerId?: string; mitigationPlan?: string }[];
		openCommitments: { text: string; madeBy: string; madeTo: string; dueDate?: string }[];
		recentSessions: { date: string; type: string; sourceNotePath: string }[];
		incidentNotes: string[];
	}): string {
		const ms = data.stats;
		const completionRate = ms.tasksCompleted + ms.tasksOpen > 0
			? Math.round((ms.tasksCompleted / (ms.tasksCompleted + ms.tasksOpen)) * 100)
			: 0;

		const llmBlock = data.llmSummary || `## 🟢 Highlights\n- _(LLM offline — preencha manualmente)_\n\n## 🔴 Lowlights\n- \n\n## 🌡️ Pulse do time\n- \n\n## 🎯 Foco próxima semana\n- `;

		// Mermaid charts (Obsidian renderiza nativamente)
		const taskChart = `\`\`\`mermaid
pie title Tasks na semana
    "Completadas" : ${ms.tasksCompleted}
    "Abertas" : ${ms.tasksOpen}
\`\`\``;

		const activityChart = `\`\`\`mermaid
%%{init: {'theme':'default'}}%%
graph LR
    A[Daily Logs<br/>${ms.dailyLogs}] --> X[Semana ${data.reportId}]
    B[Reuniões<br/>${ms.meetings}] --> X
    C[1:1s<br/>${ms.oneOnOnes}] --> X
    D[Incidents<br/>${ms.incidents}] --> X
\`\`\``;

		const risksTable =
			data.topRisks.length > 0
				? `| ID | Prioridade | Descrição | Mitigação |\n|---|---|---|---|\n` +
					data.topRisks
						.map(
							(r) =>
								`| _ | ${r.priority} | ${r.description.substring(0, 80)} | ${r.mitigationPlan?.substring(0, 60) ?? "—"} |`
						)
						.join("\n")
				: "_Nenhum risco crítico aberto._";

		const commitmentsList =
			data.openCommitments.length > 0
				? data.openCommitments
						.map(
							(c) =>
								`- _${c.madeBy === "eu" ? "Eu" : c.madeBy}_ → _${c.madeTo === "eu" ? "Eu" : c.madeTo}_: "${c.text}" — ${c.dueDate ?? "(sem data)"}`
						)
						.join("\n")
				: "_Nenhum commitment aberto._";

		return `---
type: weekly-status
report_id: ${data.reportId}
period_start: ${data.periodStart}
period_end: ${data.periodEnd}
status: draft
generated_by: atlas
generated_at: ${new Date().toISOString()}
tags:
  - report
  - weekly
---

# 📊 Weekly Status Report — ${data.reportId}

> **Período:** ${data.periodStart} → ${data.periodEnd}

[📧 **Aprovar e enviar para gerência**](atlas://send-weekly?report=${data.reportId})

---

${llmBlock}

---

## 📈 Métricas-chave

| Métrica | Valor |
|---|---|
| Daily logs | ${ms.dailyLogs} |
| Reuniões totais | ${ms.meetings} |
| 1:1s | ${ms.oneOnOnes} |
| Tasks completadas | ${ms.tasksCompleted} |
| Tasks abertas | ${ms.tasksOpen} |
| Action item completion | ${completionRate}% |
| Incidents | ${ms.incidents} |

${taskChart}

${activityChart}

## ⚠️ Top Risks

${risksTable}

## 🔁 Commitments abertos (top 5)

${commitmentsList}

## 📋 Sessões da semana (${data.recentSessions.length})

${
	data.recentSessions.length > 0
		? data.recentSessions
				.map((s) => `- ${s.date} · ${s.type} · [[${s.sourceNotePath.replace(/\.md$/, "")}]]`)
				.join("\n")
		: "_Nenhuma sessão registrada no KG nesta semana._"
}

${
	data.incidentNotes.length > 0
		? `\n## 🚨 Incidents da semana\n\n${data.incidentNotes.map((p) => `- [[${p.replace(/\.md$/, "")}]]`).join("\n")}`
		: ""
}

---

_Atlas v0.1 · gerado automaticamente · revise antes de enviar_
`;
	}
}

function getWeekNumber(d: Date): number {
	const target = new Date(d.valueOf());
	const dayNr = (d.getDay() + 6) % 7;
	target.setDate(target.getDate() - dayNr + 3);
	const firstThursday = target.valueOf();
	target.setMonth(0, 1);
	if (target.getDay() !== 4) {
		target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
	}
	return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}
