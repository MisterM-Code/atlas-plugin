/**
 * Atlas v0.14 — Pattern Detectors.
 *
 * 4 detectores que analisam KG + notas e surfaceiam padrões importantes:
 *
 * 1. **Repeating Theme Alert** — tema mencionado por 5+ pessoas distintas = sinal sistêmico
 * 2. **Coachee Plateau Detector** — coachee com mesmos themes em 3+ sessões sem evolução
 * 3. **Inconsistency Detector** — você diz X em 1:1 e Y contraditório em meeting do mesmo dia
 * 4. **Stale OKR Alert** — KRs sem update há 14+ dias
 */

import { App, Modal, Notice, TFile } from "obsidian";
import type AtlasPlugin from "../../main";
import type { ThemeT, SessionT } from "../kg/schemas";
import { applyResponsiveModal } from "../ui/modal-helpers";
import { logger } from "../utils/logger";

// ──────────────────────────────────────────────────────────
// 1. Repeating Theme Alert

interface SystemicTheme {
	theme: ThemeT;
	peopleCount: number;
	peopleNames: string[];
	totalMentions: number;
}

export function detectSystemicThemes(plugin: AtlasPlugin, minPeople = 5): SystemicTheme[] {
	const kg = plugin.kg.data;
	const out: SystemicTheme[] = [];

	for (const t of kg.themes) {
		if (t.personIds.length < minPeople) continue;
		const names = t.personIds
			.map((pid) => kg.people.find((p) => p.id === pid)?.name)
			.filter(Boolean) as string[];
		out.push({
			theme: t,
			peopleCount: t.personIds.length,
			peopleNames: names,
			totalMentions: t.frequency,
		});
	}

	out.sort((a, b) => b.peopleCount - a.peopleCount);
	return out;
}

export class RepeatingThemeAlertModal extends Modal {
	constructor(app: App, private readonly plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		applyResponsiveModal(contentEl, { preferredWidth: 720 });
		contentEl.addClass("atlas-systemic-modal");

		contentEl.createEl("h3", { cls: "atlas-systemic-title", text: "📡 Repeating Theme Alert" });
		contentEl.createEl("div", {
			cls: "atlas-systemic-subtitle",
			text: "Temas mencionados por 5+ pessoas distintas = sinal sistêmico (não problema individual). Considere ação organizacional.",
		});

		const themes = detectSystemicThemes(this.plugin, 5);

		if (themes.length === 0) {
			contentEl.createDiv({
				cls: "atlas-systemic-empty",
				text: "✅ Nenhum tema sistêmico detectado. Cada conversa é única (por enquanto).",
			});
			return;
		}

		contentEl.createDiv({
			cls: "atlas-systemic-count",
			text: `${themes.length} tema(s) com sinal sistêmico:`,
		});

		for (const st of themes) {
			const card = contentEl.createDiv({ cls: "atlas-systemic-card" });

			const header = card.createDiv({ cls: "atlas-systemic-card-header" });
			header.createEl("span", { cls: "atlas-systemic-card-emoji", text: "📡" });
			header.createEl("strong", { cls: "atlas-systemic-card-name", text: st.theme.name });
			header.createEl("span", {
				cls: `atlas-systemic-card-sentiment is-${st.theme.sentiment}`,
				text: ` ${st.theme.sentiment}`,
			});

			const meta = card.createDiv({ cls: "atlas-systemic-card-meta" });
			meta.setText(
				`${st.peopleCount} pessoas distintas · ${st.totalMentions} menções totais`
			);

			const people = card.createDiv({ cls: "atlas-systemic-card-people" });
			for (const name of st.peopleNames.slice(0, 12)) {
				people.createEl("span", { cls: "atlas-systemic-people-chip", text: name });
			}
			if (st.peopleNames.length > 12) {
				people.createEl("span", {
					cls: "atlas-systemic-people-more",
					text: `+${st.peopleNames.length - 12}`,
				});
			}

			// Recommended action based on sentiment
			const tip = card.createDiv({ cls: "atlas-systemic-card-tip" });
			if (st.theme.sentiment === "blocker") {
				tip.setText(
					"💡 Bloqueio sistêmico. Considere all-hands ou ação organizacional. Não resolva 1:1 a 1:1."
				);
			} else if (st.theme.sentiment === "growth") {
				tip.setText("💡 Necessidade de aprendizado coletiva. Workshop ou tech talk?");
			} else {
				tip.setText("💡 Padrão recorrente. Vale levar pra retrospectiva ou skip-level.");
			}
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

// ──────────────────────────────────────────────────────────
// 2. Coachee Plateau Detector

interface CoacheeStatus {
	personId: string;
	personName: string;
	totalSessions: number;
	recentSessions: SessionT[];
	repeatedThemes: string[];
	plateauScore: number; // 0-1
	verdict: "progressing" | "watch" | "plateau";
}

export function detectCoacheePlateau(plugin: AtlasPlugin): CoacheeStatus[] {
	const kg = plugin.kg.data;
	const coachees = kg.people.filter((p) => p.type === "coachee");
	const out: CoacheeStatus[] = [];

	for (const c of coachees) {
		const sessions = kg.sessions
			.filter((s) => s.personId === c.id && s.type === "coaching")
			.sort((a, b) => b.date.localeCompare(a.date));

		if (sessions.length < 3) {
			continue; // need 3+ sessions to detect plateau
		}

		const recent = sessions.slice(0, 5);
		// Count theme repetition across recent sessions
		const themeCount = new Map<string, number>();
		for (const sess of recent) {
			for (const topic of sess.topics) {
				themeCount.set(topic, (themeCount.get(topic) ?? 0) + 1);
			}
		}

		const repeated = Array.from(themeCount.entries())
			.filter(([, n]) => n >= 3) // same theme in 3+ recent sessions
			.map(([t]) => t);

		const plateauScore = repeated.length / Math.max(themeCount.size, 1);

		let verdict: CoacheeStatus["verdict"] = "progressing";
		if (plateauScore > 0.4 || (repeated.length >= 2 && recent.length >= 4)) {
			verdict = "plateau";
		} else if (plateauScore > 0.2) {
			verdict = "watch";
		}

		out.push({
			personId: c.id,
			personName: c.name,
			totalSessions: sessions.length,
			recentSessions: recent,
			repeatedThemes: repeated,
			plateauScore,
			verdict,
		});
	}

	out.sort((a, b) => {
		const order = { plateau: 0, watch: 1, progressing: 2 };
		return order[a.verdict] - order[b.verdict];
	});

	return out;
}

export class CoacheePlateauModal extends Modal {
	constructor(app: App, private readonly plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		applyResponsiveModal(contentEl, { preferredWidth: 640 });
		contentEl.addClass("atlas-plateau-modal");

		contentEl.createEl("h3", { cls: "atlas-plateau-title", text: "🌱 Coachee Plateau Detector" });
		contentEl.createEl("div", {
			cls: "atlas-plateau-subtitle",
			text: "Coachees com mesmos themes em 3+ sessões consecutivas sinalizam que sua abordagem atual não está destravando. Considere mudar framework.",
		});

		const coachees = detectCoacheePlateau(this.plugin);

		if (coachees.length === 0) {
			contentEl.createDiv({
				cls: "atlas-plateau-empty",
				text: "Nenhum coachee com 3+ sessões cadastradas ou sem plateau detectado.",
			});
			return;
		}

		for (const c of coachees) {
			const card = contentEl.createDiv({ cls: `atlas-plateau-card is-${c.verdict}` });

			const header = card.createDiv({ cls: "atlas-plateau-card-header" });
			const emoji = c.verdict === "plateau" ? "🚧" : c.verdict === "watch" ? "🟡" : "✅";
			header.createEl("span", { cls: "atlas-plateau-emoji", text: emoji });
			header.createEl("strong", { text: c.personName });
			header.createEl("span", {
				cls: "atlas-plateau-card-verdict",
				text:
					c.verdict === "plateau"
						? " — PLATEAU"
						: c.verdict === "watch"
							? " — atenção"
							: " — progredindo",
			});

			const meta = card.createDiv({ cls: "atlas-plateau-card-meta" });
			meta.setText(
				`${c.totalSessions} sessões totais · ${c.recentSessions.length} recentes · plateau score ${(c.plateauScore * 100).toFixed(0)}%`
			);

			if (c.repeatedThemes.length > 0) {
				const themesRow = card.createDiv({ cls: "atlas-plateau-card-themes" });
				themesRow.createEl("span", {
					cls: "atlas-plateau-themes-label",
					text: "Temas recorrentes: ",
				});
				for (const t of c.repeatedThemes) {
					themesRow.createEl("span", { cls: "atlas-plateau-theme-chip", text: t });
				}
			}

			if (c.verdict === "plateau") {
				card.createDiv({
					cls: "atlas-plateau-card-tip",
					text:
						"💡 Sugestão: troque de framework (GROW → CLEAR ou OSKAR), pergunte 'O que você acha que está te impedindo?', ou proponha pausa de 1 mês com tarefa concreta.",
				});
			} else if (c.verdict === "watch") {
				card.createDiv({
					cls: "atlas-plateau-card-tip",
					text: "💡 Monitorar próxima sessão. Se tema persistir, mude abordagem.",
				});
			}
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

// ──────────────────────────────────────────────────────────
// 3. Inconsistency Detector

interface InconsistencyPair {
	noteA: string;
	noteB: string;
	dateA: string;
	dateB: string;
	contradiction: string;
}

export class InconsistencyDetectorModal extends Modal {
	constructor(app: App, private readonly plugin: AtlasPlugin) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		applyResponsiveModal(contentEl, { preferredWidth: 720 });
		contentEl.addClass("atlas-inconsist-modal");

		contentEl.createEl("h3", { cls: "atlas-inconsist-title", text: "⚖️ Inconsistency Detector" });
		contentEl.createEl("div", {
			cls: "atlas-inconsist-subtitle",
			text: "Atlas analisa pares de notas próximas no tempo (1:1 + meeting do mesmo dia/semana) procurando contradições. Útil pra ver onde você fala diferente em contextos diferentes.",
		});

		const intro = contentEl.createDiv({ cls: "atlas-inconsist-warning" });
		intro.createEl("strong", { text: "⚠️ Análise LLM custosa. " });
		intro.createSpan({
			text: "Roda em até 8 pares próximos. Pode levar 30-60s. Use com sparingly.",
		});

		const runBtn = contentEl.createEl("button", {
			cls: "atlas-inconsist-run-btn mod-cta",
			text: "▶️ Rodar análise",
		});

		const resultEl = contentEl.createDiv({ cls: "atlas-inconsist-result" });

		runBtn.addEventListener("click", () => void this.run(resultEl, runBtn));
	}

	private async run(resultEl: HTMLElement, button: HTMLButtonElement): Promise<void> {
		button.disabled = true;
		button.setText("⏳ Analisando...");
		resultEl.empty();
		resultEl.createDiv({ cls: "atlas-inconsist-loading", text: "Buscando pares de notas próximas..." });

		try {
			const pairs = await this.findCloseNotePairs();
			resultEl.empty();

			if (pairs.length === 0) {
				resultEl.createDiv({
					cls: "atlas-inconsist-empty",
					text: "Nenhum par de notas próximas encontrado.",
				});
				button.disabled = false;
				button.setText("▶️ Rodar análise");
				return;
			}

			resultEl.createDiv({
				cls: "atlas-inconsist-progress",
				text: `Analisando ${pairs.length} pares com LLM...`,
			});

			const inconsistencies: InconsistencyPair[] = [];
			for (let i = 0; i < pairs.length; i++) {
				const p = pairs[i];
				button.setText(`⏳ ${i + 1}/${pairs.length}`);
				const result = await this.checkPair(p);
				if (result) inconsistencies.push(result);
			}

			resultEl.empty();

			if (inconsistencies.length === 0) {
				resultEl.createDiv({
					cls: "atlas-inconsist-empty",
					text: "✅ Nenhuma inconsistência clara detectada nos pares analisados.",
				});
			} else {
				resultEl.createDiv({
					cls: "atlas-inconsist-found-count",
					text: `⚠️ ${inconsistencies.length} potencial(is) inconsistência(s) detectada(s):`,
				});
				for (const inc of inconsistencies) {
					const card = resultEl.createDiv({ cls: "atlas-inconsist-card" });
					card.createDiv({
						cls: "atlas-inconsist-card-pair",
						text: `📅 ${inc.dateA} ↔ ${inc.dateB}`,
					});
					card.createEl("div", {
						cls: "atlas-inconsist-card-notes",
						text: `${inc.noteA} ↔ ${inc.noteB}`,
					});
					card.createEl("div", {
						cls: "atlas-inconsist-card-contradiction",
						text: inc.contradiction,
					});
				}
			}

			button.disabled = false;
			button.setText("▶️ Rodar de novo");
		} catch (e) {
			logger.error("inconsistency: failed", { error: String(e) });
			resultEl.empty();
			resultEl.createDiv({
				cls: "atlas-inconsist-error",
				text: `Erro: ${String(e)}`,
			});
			button.disabled = false;
			button.setText("▶️ Rodar de novo");
		}
	}

	private async findCloseNotePairs(): Promise<{ a: TFile; b: TFile; dateA: string; dateB: string }[]> {
		const folder = this.plugin.settings.folders.meetings;
		const files = this.plugin.app.vault.getMarkdownFiles().filter((f) => {
			const cache = this.plugin.app.metadataCache.getFileCache(f);
			const type = cache?.frontmatter?.type as string | undefined;
			return type === "1on1" || type === "meeting";
		});

		// Group by week
		const byWeek = new Map<string, TFile[]>();
		for (const f of files) {
			const cache = this.plugin.app.metadataCache.getFileCache(f);
			const dateStr = (cache?.frontmatter?.date as string) ?? f.basename.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
			if (!dateStr) continue;
			const date = new Date(dateStr);
			if (isNaN(date.getTime())) continue;
			const weekKey = `${date.getFullYear()}-W${Math.floor(date.getDate() / 7)}`;
			if (!byWeek.has(weekKey)) byWeek.set(weekKey, []);
			byWeek.get(weekKey)!.push(f);
		}

		const pairs: { a: TFile; b: TFile; dateA: string; dateB: string }[] = [];
		for (const weekFiles of byWeek.values()) {
			if (weekFiles.length < 2) continue;
			for (let i = 0; i < weekFiles.length; i++) {
				for (let j = i + 1; j < weekFiles.length; j++) {
					const a = weekFiles[i];
					const b = weekFiles[j];
					const cacheA = this.plugin.app.metadataCache.getFileCache(a);
					const cacheB = this.plugin.app.metadataCache.getFileCache(b);
					pairs.push({
						a,
						b,
						dateA: (cacheA?.frontmatter?.date as string) ?? a.basename,
						dateB: (cacheB?.frontmatter?.date as string) ?? b.basename,
					});
				}
			}
			if (pairs.length >= 8) break; // limit to 8 pairs
		}
		return pairs.slice(0, 8);
	}

	private async checkPair(p: {
		a: TFile;
		b: TFile;
		dateA: string;
		dateB: string;
	}): Promise<InconsistencyPair | null> {
		const contentA = (await this.plugin.app.vault.cachedRead(p.a)).substring(0, 3000);
		const contentB = (await this.plugin.app.vault.cachedRead(p.b)).substring(0, 3000);

		const prompt = `Você é um analista que detecta INCONSISTÊNCIAS entre 2 notas (mesma pessoa, contextos diferentes).

NOTA A (${p.dateA}):
${contentA}

---

NOTA B (${p.dateB}):
${contentB}

---

Tarefa: identifique se há contradição clara entre as duas (mesma pessoa diz coisas opostas).
Critério: ignore diferenças de tom ou ênfase. Foque em FATOS ou DECISÕES contraditórias.

Responda APENAS no formato:
SEM_INCONSISTENCIA
ou
INCONSISTENCIA: [descrição em 1-2 frases do que contradiz]

Resposta:`;

		try {
			const result = await this.plugin.ollama.generate(prompt, {
				model: this.plugin.settings.ollama.generationModel,
				temperature: 0.2,
				max_tokens: 200,
			});
			const trimmed = result.trim();
			if (trimmed.startsWith("INCONSISTENCIA")) {
				return {
					noteA: p.a.path.split("/").pop() ?? p.a.path,
					noteB: p.b.path.split("/").pop() ?? p.b.path,
					dateA: p.dateA,
					dateB: p.dateB,
					contradiction: trimmed.replace(/^INCONSISTENCIA:\s*/i, ""),
				};
			}
			return null;
		} catch {
			return null;
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

// ──────────────────────────────────────────────────────────
// 4. Stale OKR Alert

interface StaleOkr {
	notePath: string;
	title: string;
	daysSinceUpdate: number;
}

export async function detectStaleOkrs(plugin: AtlasPlugin, staleDays = 14): Promise<StaleOkr[]> {
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - staleDays);

	const files = plugin.app.vault.getMarkdownFiles().filter((f) => {
		const cache = plugin.app.metadataCache.getFileCache(f);
		const type = cache?.frontmatter?.type as string | undefined;
		const tags = cache?.tags?.map((t) => t.tag) ?? [];
		const isOkr =
			type === "okr" ||
			type === "goal" ||
			tags.includes("#okr") ||
			tags.includes("#goal") ||
			f.basename.toLowerCase().includes("okr") ||
			f.basename.toLowerCase().includes("goal");
		return isOkr && f.stat.mtime < cutoff.getTime();
	});

	return files.map((f) => ({
		notePath: f.path,
		title: f.basename,
		daysSinceUpdate: Math.floor((Date.now() - f.stat.mtime) / 86_400_000),
	}));
}

export class StaleOkrAlertModal extends Modal {
	constructor(app: App, private readonly plugin: AtlasPlugin) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		applyResponsiveModal(contentEl, { preferredWidth: 600 });
		contentEl.addClass("atlas-stale-okr-modal");

		contentEl.createEl("h3", { cls: "atlas-stale-okr-title", text: "🎯 Stale OKR Alert" });
		contentEl.createEl("div", {
			cls: "atlas-stale-okr-subtitle",
			text: "OKRs/goals sem update há 14+ dias. KRs precisam de check-in semanal pra serem úteis.",
		});

		const stale = await detectStaleOkrs(this.plugin, 14);

		if (stale.length === 0) {
			contentEl.createDiv({
				cls: "atlas-stale-okr-empty",
				text: "✅ Todos OKRs atualizados nos últimos 14 dias.",
			});
			return;
		}

		stale.sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);

		for (const o of stale) {
			const card = contentEl.createDiv({
				cls:
					o.daysSinceUpdate > 30
						? "atlas-stale-okr-card is-critical"
						: "atlas-stale-okr-card is-warning",
			});
			card.createEl("div", {
				cls: "atlas-stale-okr-card-title",
				text: `🎯 ${o.title}`,
			});
			card.createEl("div", {
				cls: "atlas-stale-okr-card-days",
				text: `📅 sem update há ${o.daysSinceUpdate} dias`,
			});
			card.createEl("div", {
				cls: "atlas-stale-okr-card-path",
				text: o.notePath,
			});

			card.addEventListener("click", async () => {
				const f = this.plugin.app.vault.getAbstractFileByPath(o.notePath);
				if (f instanceof TFile) {
					await this.plugin.app.workspace.getLeaf(false).openFile(f);
					this.close();
				}
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
