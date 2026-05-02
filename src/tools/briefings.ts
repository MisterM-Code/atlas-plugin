import { App, TFile } from "obsidian";
import { KGStore } from "../kg/store";
import { Indexer } from "../retrieval/indexer";
import { logger } from "../utils/logger";
import { markdownToHtmlEmail } from "../automation/markdown-html";

export interface BriefingData {
	dateLabel: string;
	meetingsToday: { time?: string; description: string; notePath: string }[];
	tasksDueToday: { description: string; due?: string; notePath: string }[];
	overdueTasksCount: number;
	openCriticalRisks: { description: string }[];
	openCommitmentsCount: number;
	patterns: { theme: string; mentions: number }[];
	flashcardsDue: number;
}

export class BriefingsTool {
	constructor(
		private app: App,
		private kg: KGStore,
		private folders: { daily: string; meetings: string; raid: string }
	) {}

	async morningBriefing(now = new Date()): Promise<{ markdown: string; html: string; data: BriefingData }> {
		const data = await this.collect(now);
		const markdown = this.renderMarkdown(data, "morning");
		const html = this.renderHtml(data, "morning");
		return { markdown, html, data };
	}

	async eveningReview(now = new Date()): Promise<{ markdown: string; html: string; data: BriefingData }> {
		const data = await this.collect(now);
		const markdown = this.renderMarkdown(data, "evening");
		const html = this.renderHtml(data, "evening");
		return { markdown, html, data };
	}

	private async collect(now: Date): Promise<BriefingData> {
		const today = now.toISOString().split("T")[0];
		const indexer = new Indexer(this.app);

		// Meetings today (from notes with date in path or frontmatter matching today)
		const meetingsToday: BriefingData["meetingsToday"] = [];
		try {
			const meetingNotes = await indexer.indexVault([this.folders.meetings]);
			for (const n of meetingNotes) {
				const fmDate = n.frontmatter.date as string | undefined;
				const isTodayPath = n.path.includes(today);
				if (fmDate?.startsWith(today) || isTodayPath) {
					const time = n.frontmatter.time as string | undefined;
					const titleLine = n.body.split("\n").find((l) => l.startsWith("# "));
					meetingsToday.push({
						time,
						description: titleLine?.replace(/^#\s+/, "").trim() ?? n.path,
						notePath: n.path,
					});
				}
			}
		} catch (e) {
			logger.warn("briefing: meetings collection falhou", { error: String(e) });
		}

		// Tasks
		const allTasks = this.kg.data.actionItems;
		const tasksDueToday = allTasks
			.filter((a) => a.status !== "completed" && a.status !== "cancelled" && a.dueDate?.startsWith(today))
			.slice(0, 10)
			.map((a) => ({
				description: a.description,
				due: a.dueDate,
				notePath: a.sourceNotePath,
			}));

		const overdueTasksCount = allTasks.filter(
			(a) =>
				a.status !== "completed" &&
				a.status !== "cancelled" &&
				a.dueDate &&
				a.dueDate < today
		).length;

		// Risks
		const openCriticalRisks = this.kg.data.risks
			.filter((r) => r.status === "open" && (r.priority === "P1" || r.priority === "P2"))
			.slice(0, 3)
			.map((r) => ({ description: r.description }));

		// Commitments
		const openCommitmentsCount = this.kg.data.commitments.filter((c) => c.status === "open").length;

		// Patterns: top themes seen frequently in last 30 days
		const recentThemeThreshold = new Date(now);
		recentThemeThreshold.setDate(recentThemeThreshold.getDate() - 30);
		const recentIso = recentThemeThreshold.toISOString();
		const patterns = this.kg.data.themes
			.filter((t) => t.lastSeen >= recentIso && t.frequency >= 3)
			.sort((a, b) => b.frequency - a.frequency)
			.slice(0, 3)
			.map((t) => ({ theme: t.name, mentions: t.frequency }));

		return {
			dateLabel: now.toLocaleDateString("pt-BR", {
				weekday: "long",
				day: "2-digit",
				month: "long",
			}),
			meetingsToday,
			tasksDueToday,
			overdueTasksCount,
			openCriticalRisks,
			openCommitmentsCount,
			patterns,
			flashcardsDue: 0, // wired in Phase 5
		};
	}

	private renderMarkdown(d: BriefingData, kind: "morning" | "evening"): string {
		const greeting = kind === "morning" ? "🌅 Bom dia" : "🌇 Fim de tarde";
		return `# ${greeting} — ${d.dateLabel}

## 📅 Agenda hoje (${d.meetingsToday.length})
${
	d.meetingsToday.length > 0
		? d.meetingsToday.map((m) => `- ${m.time ?? "—"} · ${m.description}`).join("\n")
		: "_Nenhuma reunião registrada._"
}

## ⚡ Tasks vencendo hoje (${d.tasksDueToday.length})
${
	d.tasksDueToday.length > 0
		? d.tasksDueToday.map((t) => `- [ ] ${t.description}`).join("\n")
		: "_Nenhuma._"
}

${d.overdueTasksCount > 0 ? `## ⚠️ Tasks atrasadas: ${d.overdueTasksCount}` : ""}

## 🔁 Commitments abertos: ${d.openCommitmentsCount}

${
	d.openCriticalRisks.length > 0
		? `## 🚨 Risks críticos abertos\n${d.openCriticalRisks.map((r) => `- ${r.description}`).join("\n")}`
		: ""
}

${
	d.patterns.length > 0
		? `## 💡 Padrões emergindo (últimos 30 dias)\n${d.patterns.map((p) => `- **${p.theme}** (${p.mentions} menções)`).join("\n")}`
		: ""
}

${kind === "evening" ? "\n💭 Hora de fechar o daily log? Use **Atlas: Daily log**." : ""}
`;
	}

	private renderHtml(d: BriefingData, kind: "morning" | "evening"): string {
		const md = this.renderMarkdown(d, kind);
		return markdownToHtmlEmail(md, {
			title: kind === "morning" ? "Briefing Matinal" : "Evening Review",
		});
	}
}
