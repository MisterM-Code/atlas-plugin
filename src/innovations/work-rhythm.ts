/**
 * Atlas v0.12 — Work Rhythm Detector.
 *
 * 3 features de detecção comportamental:
 *
 * 1. **Anti-procrastination buddy** — detecta task deferida 3+ vezes e
 *    sugere quebrar em 3 micro-ações de 5 min.
 *
 * 2. **Smart pause** — tracker de tempo contínuo sem pause; após 90 min
 *    sugere pausa de 10 min com sugestão de alongamento.
 *
 * 3. **Habit streaks auto-detect** — analisa daily logs dos últimos 30 dias
 *    e identifica padrões repetitivos (meditação 5x/sem, pomodoro,
 *    leitura) com gamification de streak.
 *
 * Usado pela ProactiveDetector (já existente) + commands manuais.
 */

import { App, Modal, Notice, TFile } from "obsidian";
import type AtlasPlugin from "../../main";
import { applyResponsiveModal } from "../ui/modal-helpers";

// ──────────────────────────────────────────────────────────
// 1. Anti-procrastination buddy

interface DeferredTask {
	taskText: string;
	notePath: string;
	deferCount: number;
	originalDate: string;
	currentDate: string;
}

export async function detectProcrastination(plugin: AtlasPlugin): Promise<DeferredTask[]> {
	const deferred: DeferredTask[] = [];
	const files = plugin.app.vault.getMarkdownFiles();

	// Heuristic: tasks com `(@DATE)` que mudaram de data 3+ vezes
	// Detectamos via git history seria ideal, mas sem isso usamos:
	// - tasks com tag `#deferred` ou `#snoozed`
	// - tasks com data já 3+ dias depois da data original mencionada nas notas
	for (const f of files) {
		if (f.path.startsWith(".atlas") || f.path.startsWith("99_Archive")) continue;
		const content = await plugin.app.vault.cachedRead(f);
		const lines = content.split("\n");
		for (const line of lines) {
			const taskMatch = line.match(/^\s*-\s*\[\s*\]\s*(.+?)\s*\(@(\d{4}-\d{2}-\d{2})/);
			if (!taskMatch) continue;
			const text = taskMatch[1];
			const dueDate = taskMatch[2];
			// Check tags
			const deferCount = (line.match(/#defer/g)?.length ?? 0) + (line.match(/#snooz/g)?.length ?? 0);
			if (deferCount >= 1) {
				deferred.push({
					taskText: text,
					notePath: f.path,
					deferCount: deferCount + 2, // tags imply 2+ defers
					originalDate: dueDate,
					currentDate: dueDate,
				});
			}
		}
	}
	return deferred.slice(0, 10);
}

export class AntiProcrastinationModal extends Modal {
	constructor(app: App, private readonly plugin: AtlasPlugin) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		applyResponsiveModal(contentEl, { preferredWidth: 640 });
		contentEl.addClass("atlas-procrast-modal");

		contentEl.createEl("h3", { cls: "atlas-procrast-title", text: "🛑 Anti-Procrastination" });
		contentEl.createEl("div", {
			cls: "atlas-procrast-subtitle",
			text: "Tasks adiadas múltiplas vezes. Atlas oferece quebrar em micro-ações de 5min.",
		});

		const loading = contentEl.createDiv({ cls: "atlas-procrast-loading", text: "Scanning…" });
		const deferred = await detectProcrastination(this.plugin);
		loading.remove();

		if (deferred.length === 0) {
			contentEl.createDiv({
				cls: "atlas-procrast-empty",
				text: "🎉 Nenhuma task em procrastinação detectada. Você está em dia.",
			});
			return;
		}

		for (const d of deferred) {
			const card = contentEl.createDiv({ cls: "atlas-procrast-card" });
			card.createEl("div", {
				cls: "atlas-procrast-task",
				text: `📌 ${d.taskText}`,
			});
			card.createEl("div", {
				cls: "atlas-procrast-meta",
				text: `${d.notePath} · adiada ${d.deferCount}× · vence ${d.currentDate}`,
			});

			const actions = card.createDiv({ cls: "atlas-procrast-actions" });
			const breakBtn = actions.createEl("button", {
				cls: "atlas-procrast-break-btn mod-cta",
				text: "🔨 Quebrar em micro-ações",
			});
			breakBtn.addEventListener("click", () => void this.breakTask(d));
		}
	}

	private async breakTask(d: DeferredTask): Promise<void> {
		const prompt = `Tarefa que o usuário está procrastinando há ${d.deferCount} vezes:
"${d.taskText}"

Quebre em EXATAMENTE 3 micro-ações de 5 minutos cada. Cada uma deve ser:
- Concreta (verbo de ação clara)
- Pequena (5min real, não fictício)
- Ordenada (uma puxa a próxima)
- Resolver fricção (a 1ª deve ser absurdamente fácil pra vencer inércia)

Formato: lista numerada com bullets, cada item em 1 linha. PT-BR.`;
		try {
			// v0.18: route through LLMService
			const llm = this.plugin.llm;
			const result = llm
				? await llm.generate(prompt, {
						feature: "innovation.work-rhythm",
						taskKind: "chat",
						temperature: 0.5,
						maxTokens: 400,
				  })
				: await this.plugin.ollama.generate(prompt, {
						model: this.plugin.settings.ollama.generationModel,
						temperature: 0.5,
						max_tokens: 400,
				  });
			new Notice(`Atlas: ${result}`, 16000);
			// Append micro-actions to source note
			const f = this.plugin.app.vault.getAbstractFileByPath(d.notePath);
			if (f instanceof TFile) {
				const content = await this.plugin.app.vault.read(f);
				const append = `\n\n## 🔨 Micro-ações (Atlas)\n${result}\n`;
				await this.plugin.app.vault.modify(f, content + append);
				new Notice(`Atlas: micro-ações adicionadas em ${d.notePath}.`);
			}
		} catch (e) {
			new Notice(`Atlas: erro — ${String(e)}`, 6000);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

// ──────────────────────────────────────────────────────────
// 2. Smart Pause Detector

export class SmartPauseTimer {
	private startTime = 0;
	private interval: number | null = null;
	private notified = false;

	constructor(private readonly plugin: AtlasPlugin) {}

	/** Start tracking from now. Resets on user interaction. */
	start(): void {
		this.startTime = Date.now();
		this.notified = false;
		if (this.interval !== null) window.clearInterval(this.interval);
		this.interval = window.setInterval(() => this.check(), 60_000); // check every minute
	}

	stop(): void {
		if (this.interval !== null) {
			window.clearInterval(this.interval);
			this.interval = null;
		}
	}

	reset(): void {
		this.startTime = Date.now();
		this.notified = false;
	}

	private check(): void {
		const elapsedMin = (Date.now() - this.startTime) / 60_000;
		// 90 min threshold
		if (elapsedMin >= 90 && !this.notified) {
			this.notified = true;
			this.suggestPause(Math.round(elapsedMin));
		}
		// Reset after 4h (assume user took a break we missed)
		if (elapsedMin >= 240) {
			this.reset();
		}
	}

	private suggestPause(minutes: number): void {
		const stretches = [
			"🤸 Levante e estique braços + tronco por 30s",
			"💧 Beba 1 copo d'água",
			"👀 Olhe pra fora da janela 20s (regra 20-20-20)",
			"🚶 Caminhe 2-5 min, mesmo dentro de casa",
			"🧘 Respiração 4-7-8: inspire 4s, segure 7s, expire 8s · 3 ciclos",
			"☕ Pausa pra café/chá quente",
		];
		const tip = stretches[Math.floor(Math.random() * stretches.length)];
		new Notice(
			`⏸️ Atlas: ${minutes} min sem pausa. Sugiro pausa de 10 min.\n\n${tip}`,
			12000
		);
	}
}

// ──────────────────────────────────────────────────────────
// 3. Habit Streaks Auto-Detect

interface DetectedHabit {
	pattern: string;
	occurrences: number;
	streakDays: number;
	confidence: number; // 0-1
}

export async function detectHabits(plugin: AtlasPlugin, daysBack = 30): Promise<DetectedHabit[]> {
	const folder = plugin.settings.folders.daily;
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - daysBack);

	const files = plugin.app.vault.getMarkdownFiles().filter((f) => {
		if (!f.path.startsWith(folder)) return false;
		return f.stat.mtime >= cutoff.getTime();
	});

	if (files.length < 3) return [];

	// Patterns to look for (regex per habit)
	const HABIT_PATTERNS: { pattern: string; regex: RegExp }[] = [
		{ pattern: "Meditação", regex: /\b(medit|mindful|presence|breath)/i },
		{ pattern: "Pomodoro", regex: /\bpomodoro|focus session|deep work\b/i },
		{ pattern: "Leitura", regex: /\bleitur|read|livro|book\b/i },
		{ pattern: "Exercício físico", regex: /\b(exerc|treino|gym|run|corrida|caminhada|yoga|pilates|workout)\b/i },
		{ pattern: "Daily log", regex: /^(date|^# Daily Log|## )/im },
		{ pattern: "Journaling", regex: /\b(journal|reflex|gratid|aprend.*hoje|aprendi)\b/i },
		{ pattern: "Estudo / curso", regex: /\b(curso|study|estud|aula|class)\b/i },
		{ pattern: "Sleep tracking", regex: /\b(dormi|sleep|sono|horas dormidas|hours slept)\b/i },
	];

	const counts: Record<string, { occurrences: number; dates: Set<string> }> = {};
	for (const p of HABIT_PATTERNS) {
		counts[p.pattern] = { occurrences: 0, dates: new Set() };
	}

	for (const f of files) {
		const content = await plugin.app.vault.cachedRead(f);
		const dateMatch = f.basename.match(/(\d{4}-\d{2}-\d{2})/);
		const date = dateMatch ? dateMatch[1] : f.basename;
		for (const p of HABIT_PATTERNS) {
			if (p.regex.test(content)) {
				counts[p.pattern].occurrences++;
				counts[p.pattern].dates.add(date);
			}
		}
	}

	const habits: DetectedHabit[] = [];
	for (const p of HABIT_PATTERNS) {
		const c = counts[p.pattern];
		if (c.occurrences < 5) continue; // need 5+ occurrences
		const streakDays = c.dates.size;
		const confidence = Math.min(1, c.occurrences / daysBack);
		habits.push({
			pattern: p.pattern,
			occurrences: c.occurrences,
			streakDays,
			confidence,
		});
	}
	habits.sort((a, b) => b.streakDays - a.streakDays);
	return habits;
}

export class HabitStreaksModal extends Modal {
	constructor(app: App, private readonly plugin: AtlasPlugin) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		applyResponsiveModal(contentEl, { preferredWidth: 600 });
		contentEl.addClass("atlas-streaks-modal");

		contentEl.createEl("h3", { cls: "atlas-streaks-title", text: "🔥 Habit Streaks" });
		contentEl.createEl("div", {
			cls: "atlas-streaks-subtitle",
			text: "Atlas analisou suas daily logs dos últimos 30 dias e detectou estes hábitos:",
		});

		const loading = contentEl.createDiv({ cls: "atlas-streaks-loading", text: "Analisando…" });
		const habits = await detectHabits(this.plugin, 30);
		loading.remove();

		if (habits.length === 0) {
			contentEl.createDiv({
				cls: "atlas-streaks-empty",
				text: "🌱 Nenhum hábito detectado ainda. Mantenha daily logs por 5+ dias e Atlas começa a ver padrões.",
			});
			return;
		}

		for (const h of habits) {
			const card = contentEl.createDiv({ cls: "atlas-streaks-card" });

			const header = card.createDiv({ cls: "atlas-streaks-card-header" });
			header.createEl("span", { cls: "atlas-streaks-card-emoji", text: "🔥" });
			header.createEl("span", { cls: "atlas-streaks-card-name", text: h.pattern });

			const streak = card.createDiv({ cls: "atlas-streaks-card-streak" });
			streak.createEl("span", {
				cls: "atlas-streaks-card-days",
				text: String(h.streakDays),
			});
			streak.createEl("span", { cls: "atlas-streaks-card-days-label", text: " dias" });

			const meta = card.createDiv({ cls: "atlas-streaks-card-meta" });
			meta.setText(
				`${h.occurrences} menções nos últimos 30 dias · confiança ${(h.confidence * 100).toFixed(0)}%`
			);

			// Progress bar (visual)
			const bar = card.createDiv({ cls: "atlas-streaks-card-bar" });
			const fill = bar.createDiv({ cls: "atlas-streaks-card-bar-fill" });
			fill.style.setProperty("width", `${h.confidence * 100}%`);
		}

		// XP bonus for streak detection
		this.plugin.gainXp("habit-detected", habits.length * 5);
		new Notice(`Atlas: +${habits.length * 5} XP por hábitos detectados!`);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
