import { App, normalizePath, TFile } from "obsidian";
import type AtlasPlugin from "../../main";
import { Indexer } from "../retrieval/indexer";
import { isCoachPath } from "../coach/scope";

interface YearStats {
	year: number;
	totalNotes: number;
	dailyLogs: number;
	meetings: number;
	oneOnOnes: number;
	papersRead: number;
	flashcardsCreated: number;
	tasksCompleted: number;
	commitmentsKept: number;
	wordsWritten: number;
	topThemes: { name: string; freq: number }[];
	topPeople: { name: string; sessions: number }[];
	mostActiveMonth: { month: string; count: number };
	mostActiveDay: string;
	streak: { longest: number; current: number };
	moodAverage: number | null;
}

/**
 * Year in Review — Spotify Wrapped style.
 * Spans current year (or specified year).
 * Generates a richly formatted markdown that can become a tweet/share card.
 */
export class YearInReviewTool {
	constructor(private app: App, private plugin: AtlasPlugin) {}

	async generate(year?: number): Promise<{ notePath: string; markdown: string; stats: YearStats }> {
		const targetYear = year ?? new Date().getFullYear();
		const stats = await this.collectStats(targetYear);

		const md = this.renderMarkdown(stats);
		const path = normalizePath(
			`${this.plugin.settings.folders.reports}/year-in-review/${targetYear}.md`
		);

		const dir = path.split("/").slice(0, -1).join("/");
		if (!this.app.vault.getAbstractFileByPath(dir)) {
			await this.app.vault.createFolder(dir);
		}

		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, md);
		} else {
			await this.app.vault.create(path, md);
		}

		return { notePath: path, markdown: md, stats };
	}

	private async collectStats(year: number): Promise<YearStats> {
		const startMs = new Date(`${year}-01-01T00:00:00`).getTime();
		const endMs = new Date(`${year}-12-31T23:59:59`).getTime();

		const indexer = new Indexer(this.app, [".atlas", ".obsidian", ".trash"]);
		const allFiles = this.app.vault.getMarkdownFiles();

		const yearFiles = allFiles.filter((f) => {
			if (isCoachPath(f.path)) return false;
			return f.stat.mtime >= startMs && f.stat.mtime <= endMs;
		});

		// Daily logs
		const dailyLogs = yearFiles.filter((f) =>
			f.path.startsWith(this.plugin.settings.folders.daily)
		).length;

		// Meetings + 1:1s
		const meetingFiles = yearFiles.filter((f) =>
			f.path.startsWith(this.plugin.settings.folders.meetings)
		);
		const meetings = meetingFiles.length;
		const oneOnOnes = meetingFiles.filter((f) => f.path.includes("1on1")).length;

		// Papers
		const papersRead = yearFiles.filter((f) =>
			f.path.startsWith(this.plugin.settings.folders.studies + "/papers")
		).length;

		// Flashcards (from KG store)
		const flashcardsCreated = this.plugin.flashcards
			.allCards()
			.filter((c) => c.createdAt >= new Date(startMs).toISOString() && c.createdAt <= new Date(endMs).toISOString())
			.length;

		// Tasks completed
		const tasksCompleted = this.plugin.kg.data.actionItems.filter(
			(a) =>
				a.status === "completed" &&
				a.completedDate &&
				a.completedDate >= new Date(startMs).toISOString() &&
				a.completedDate <= new Date(endMs).toISOString()
		).length;

		const commitmentsKept = this.plugin.kg.data.commitments.filter(
			(c) =>
				c.status === "fulfilled" &&
				c.updatedAt >= new Date(startMs).toISOString() &&
				c.updatedAt <= new Date(endMs).toISOString()
		).length;

		// Words written + activity heatmap
		let wordsWritten = 0;
		const monthCount: Record<string, number> = {};
		const dayCount: Record<string, number> = {};
		for (const f of yearFiles) {
			try {
				const indexed = await indexer.indexFile(f);
				if (indexed) wordsWritten += indexed.wordCount;
			} catch {
				// continue
			}
			const dt = new Date(f.stat.mtime);
			const monthKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
			monthCount[monthKey] = (monthCount[monthKey] ?? 0) + 1;
			const dayKey = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][dt.getDay()];
			dayCount[dayKey] = (dayCount[dayKey] ?? 0) + 1;
		}

		const mostActiveMonth = Object.entries(monthCount).sort(
			(a, b) => b[1] - a[1]
		)[0] ?? ["-", 0];
		const mostActiveDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0] ?? ["-", 0];

		// Top themes (filtered to year)
		const yearStartIso = new Date(startMs).toISOString();
		const yearEndIso = new Date(endMs).toISOString();
		const yearThemes = this.plugin.kg.data.themes.filter(
			(t) => t.lastSeen >= yearStartIso && t.firstSeen <= yearEndIso
		);
		const topThemes = yearThemes
			.sort((a, b) => b.frequency - a.frequency)
			.slice(0, 5)
			.map((t) => ({ name: t.name, freq: t.frequency }));

		// Top people (sessions count)
		const sessionsByPerson = new Map<string, number>();
		for (const s of this.plugin.kg.data.sessions) {
			if (s.date < `${year}-01-01` || s.date > `${year}-12-31`) continue;
			if (!s.personId) continue;
			sessionsByPerson.set(s.personId, (sessionsByPerson.get(s.personId) ?? 0) + 1);
		}
		const topPeople = Array.from(sessionsByPerson.entries())
			.map(([id, count]) => {
				const person = this.plugin.kg.data.people.find((p) => p.id === id);
				return { name: person?.name ?? id, sessions: count };
			})
			.sort((a, b) => b.sessions - a.sessions)
			.slice(0, 5);

		// Streaks (daily logs)
		const streak = await this.computeStreaks(year);

		// Mood (from frontmatter mood field if numeric)
		let moodSum = 0;
		let moodCount = 0;
		for (const f of yearFiles.filter((f) => f.path.startsWith(this.plugin.settings.folders.daily))) {
			const cache = this.app.metadataCache.getFileCache(f);
			const m = cache?.frontmatter?.mood;
			if (typeof m === "number") {
				moodSum += m;
				moodCount++;
			} else if (typeof m === "string" && /^\d+$/.test(m)) {
				moodSum += parseInt(m, 10);
				moodCount++;
			}
		}
		const moodAverage = moodCount > 0 ? moodSum / moodCount : null;

		return {
			year,
			totalNotes: yearFiles.length,
			dailyLogs,
			meetings,
			oneOnOnes,
			papersRead,
			flashcardsCreated,
			tasksCompleted,
			commitmentsKept,
			wordsWritten,
			topThemes,
			topPeople,
			mostActiveMonth: { month: mostActiveMonth[0] as string, count: mostActiveMonth[1] as number },
			mostActiveDay: mostActiveDay[0] as string,
			streak,
			moodAverage,
		};
	}

	private async computeStreaks(year: number): Promise<{ longest: number; current: number }> {
		const dailyFolder = this.plugin.settings.folders.daily;
		const startMs = new Date(`${year}-01-01`).getTime();
		const todayMs = new Date().getTime();
		const yearEndMs = Math.min(todayMs, new Date(`${year}-12-31`).getTime());
		const days = Math.floor((yearEndMs - startMs) / 86_400_000) + 1;

		let longest = 0;
		let current = 0;
		let runningStreak = 0;
		for (let i = 0; i < days; i++) {
			const d = new Date(startMs + i * 86_400_000);
			const yyyy = d.getFullYear();
			const mm = String(d.getMonth() + 1).padStart(2, "0");
			const dd = String(d.getDate()).padStart(2, "0");
			const path = `${dailyFolder}/${yyyy}/${mm}/${yyyy}-${mm}-${dd}.md`;
			const exists = this.app.vault.getAbstractFileByPath(path);
			if (exists instanceof TFile) {
				runningStreak++;
				if (runningStreak > longest) longest = runningStreak;
			} else {
				runningStreak = 0;
			}
		}
		current = runningStreak;
		return { longest, current };
	}

	private renderMarkdown(s: YearStats): string {
		const moodEmoji = s.moodAverage
			? s.moodAverage >= 4
				? "😄"
				: s.moodAverage >= 3
					? "😊"
					: s.moodAverage >= 2
						? "😐"
						: "😔"
			: "—";

		return `---
type: year-in-review
year: ${s.year}
generated_at: ${new Date().toISOString()}
generated_by: atlas
shareable: true
---

# 🎉 Atlas Wrapped — ${s.year}

> _Seu ano em palavras, pessoas, ideias e hábitos._

---

## ✍️ Você escreveu **${s.totalNotes.toLocaleString("pt-BR")}** notas

\`\`\`mermaid
pie title Distribuição
    "Daily logs" : ${s.dailyLogs}
    "Reuniões" : ${s.meetings}
    "Papers" : ${s.papersRead}
    "Outras" : ${Math.max(0, s.totalNotes - s.dailyLogs - s.meetings - s.papersRead)}
\`\`\`

| Métrica | Valor |
|---|---|
| 📓 Daily logs | **${s.dailyLogs}** |
| 🤝 Reuniões | **${s.meetings}** (${s.oneOnOnes} foram 1:1s) |
| 📄 Papers / livros | **${s.papersRead}** |
| 🃏 Flashcards criados | **${s.flashcardsCreated}** |
| ✅ Tasks completadas | **${s.tasksCompleted}** |
| 🤞 Commitments cumpridos | **${s.commitmentsKept}** |
| 📝 Palavras escritas | **${s.wordsWritten.toLocaleString("pt-BR")}** |

---

## 🔥 Seu streak de daily log

- **Maior streak**: ${s.streak.longest} dias
- **Streak atual**: ${s.streak.current} dias
- **Mês mais ativo**: ${s.mostActiveMonth.month} (${s.mostActiveMonth.count} notas)
- **Dia da semana favorito**: ${s.mostActiveDay}

${s.moodAverage !== null ? `## ${moodEmoji} Mood médio: ${s.moodAverage.toFixed(1)} / 5\n` : ""}

---

## 🏷️ Top 5 temas que você revisitou

${
	s.topThemes.length > 0
		? s.topThemes.map((t, i) => `${i + 1}. **${t.name}** — ${t.freq}× menções`).join("\n")
		: "_(KG ainda não tinha temas suficientes)_"
}

---

## 👥 Pessoas que mais apareceram nas suas notas

${
	s.topPeople.length > 0
		? s.topPeople.map((p, i) => `${i + 1}. **${p.name}** — ${p.sessions} sessões`).join("\n")
		: "_(KG ainda não tinha pessoas suficientes)_"
}

---

## 📊 Atlas usou IA para você ${s.year - 2025 === 0 ? "começar" : "evoluir"} sua vida pessoal

- **Resumos gerados**: aprox. ${Math.floor(s.totalNotes / 20)} (1 por ~20 notas)
- **Reuniões com brief automático**: ${s.meetings} (Atlas preparou ${s.oneOnOnes} 1:1s)
- **Weekly reports enviados**: aprox. 52 (toda sexta)
- **Briefings matinais recebidos**: aprox. 365

---

## 🎯 Pra ${s.year + 1} Atlas sugere

> _Tendências detectadas + hábitos em progresso_

- ${s.streak.current >= 7 ? `🔥 Continuar sua streak de daily log de **${s.streak.current} dias**` : "📓 Voltar ao hábito de daily logs (consistência > intensidade)"}
- ${s.flashcardsCreated > 100 ? "🧠 Você está aprendendo bem. Diversifique decks." : "📚 Estudar mais — gerar flashcards de papers que você lê"}
- ${s.commitmentsKept >= s.commitmentsKept * 0.7 ? "🤞 Você mantém suas promessas. Continue assim." : "⚠️ Cuidado com commitments. Quebre em sub-tasks menores."}
- ${s.papersRead < 12 ? "📄 1 paper por mês como meta?" : "🎓 Você lê muito. Compartilhe insights publicamente?"}

---

## 📤 Compartilhe (cuidado: dados pessoais)

> Use o **comando "Atlas: Share Card"** para gerar versão sanitizada (anonimiza pessoas, remove números sensíveis) pra postar no LinkedIn/Twitter.

---

_Gerado pelo Atlas — segundo cérebro local. ${s.year} foi seu. ${s.year + 1} também é._ 💜
`;
	}
}
