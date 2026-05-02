/**
 * Atlas XP / Achievement system.
 *
 * Persistido em localStorage (não vault — é dado pessoal de gamificação,
 * não compartilhável).
 */

import { Notice } from "obsidian";

const STATE_KEY = "atlas-xp-state";

/** Lazy-loads canvas-confetti and fires burst (silent fail). */
async function triggerConfetti(opts: { particles?: number } = {}): Promise<void> {
	try {
		const m = await import("../ui/animations");
		await m.confettiBurst({ particles: opts.particles ?? 80 });
	} catch {
		// canvas-confetti not available — silent
	}
}

export interface AchievementDef {
	id: string;
	icon: string;
	title: string;
	description: string;
	xp: number;
	condition?: (state: XpState) => boolean;
}

export interface XpState {
	totalXp: number;
	level: number;
	events: Record<string, { count: number; firstAt: string; lastAt: string }>;
	unlockedAchievements: string[];
}

const ACHIEVEMENTS: AchievementDef[] = [
	{
		id: "first-day",
		icon: "🌱",
		title: "Primeiro dia",
		description: "Plugin instalado e em uso",
		xp: 10,
		condition: () => true, // unlocked on install
	},
	{
		id: "first-capture",
		icon: "⚡",
		title: "Primeira captura",
		description: "Usou Quick Capture pela primeira vez",
		xp: 20,
		condition: (s) => (s.events["capture"]?.count ?? 0) >= 1,
	},
	{
		id: "first-daily",
		icon: "📓",
		title: "Primeiro daily log",
		description: "Criou seu primeiro daily log",
		xp: 20,
		condition: (s) => (s.events["daily-log-created"]?.count ?? 0) >= 1,
	},
	{
		id: "streak-3",
		icon: "🔥",
		title: "Streak 3 dias",
		description: "3 daily logs consecutivos",
		xp: 30,
		condition: (s) => (s.events["streak-3"]?.count ?? 0) >= 1,
	},
	{
		id: "streak-7",
		icon: "🔥🔥",
		title: "Streak 1 semana",
		description: "7 daily logs consecutivos",
		xp: 70,
		condition: (s) => (s.events["streak-7"]?.count ?? 0) >= 1,
	},
	{
		id: "streak-30",
		icon: "🔥🔥🔥",
		title: "Streak 1 mês",
		description: "30 daily logs consecutivos",
		xp: 300,
		condition: (s) => (s.events["streak-30"]?.count ?? 0) >= 1,
	},
	{
		id: "first-1on1",
		icon: "🤝",
		title: "Primeiro 1:1 estruturado",
		description: "Usou template GROW ou CLEAR",
		xp: 30,
		condition: (s) => (s.events["1on1-created"]?.count ?? 0) >= 1,
	},
	{
		id: "ten-1on1s",
		icon: "🏆",
		title: "10 1:1s",
		description: "10 sessões de 1:1 completadas",
		xp: 100,
		condition: (s) => (s.events["1on1-created"]?.count ?? 0) >= 10,
	},
	{
		id: "first-weekly",
		icon: "📊",
		title: "Primeiro Weekly Report",
		description: "Gerou weekly report automático",
		xp: 50,
		condition: (s) => (s.events["weekly-generated"]?.count ?? 0) >= 1,
	},
	{
		id: "weekly-streak-4",
		icon: "📈",
		title: "Cadência: 4 weekly reports",
		description: "4 weekly reports gerados",
		xp: 100,
		condition: (s) => (s.events["weekly-generated"]?.count ?? 0) >= 4,
	},
	{
		id: "first-flashcard",
		icon: "🃏",
		title: "Primeiro flashcard",
		description: "Criou seu primeiro flashcard",
		xp: 20,
		condition: (s) => (s.events["flashcard-created"]?.count ?? 0) >= 1,
	},
	{
		id: "flashcards-100",
		icon: "🧠",
		title: "Centena de flashcards",
		description: "100+ flashcards criados",
		xp: 200,
		condition: (s) => (s.events["flashcard-created"]?.count ?? 0) >= 100,
	},
	{
		id: "first-paper",
		icon: "📄",
		title: "Primeiro paper estudado",
		description: "Indexou primeiro paper acadêmico",
		xp: 30,
		condition: (s) => (s.events["paper-indexed"]?.count ?? 0) >= 1,
	},
	{
		id: "kg-explorer",
		icon: "🌐",
		title: "Explorador do KG",
		description: "Indexou vault pela 1ª vez",
		xp: 50,
		condition: (s) => (s.events["kg-indexed"]?.count ?? 0) >= 1,
	},
	{
		id: "first-context-collapse",
		icon: "🔮",
		title: "Insight destilado",
		description: "Primeiro Context Collapse executado",
		xp: 50,
		condition: (s) => (s.events["context-collapse"]?.count ?? 0) >= 1,
	},
	{
		id: "first-time-capsule",
		icon: "🕰️",
		title: "Cápsula selada",
		description: "Primeira time capsule criada",
		xp: 30,
		condition: (s) => (s.events["time-capsule-sealed"]?.count ?? 0) >= 1,
	},
	{
		id: "year-in-review",
		icon: "🎉",
		title: "Atlas Wrapped",
		description: "Year in Review gerado",
		xp: 100,
		condition: (s) => (s.events["year-in-review"]?.count ?? 0) >= 1,
	},
	{
		id: "tutorial-complete",
		icon: "🎓",
		title: "Aprendiz aplicado",
		description: "Completou todos os 5 tours iniciais",
		xp: 150,
		condition: (s) =>
			["first_steps_completed", "one_on_one_tour", "weekly_tour", "flashcards_tour", "kg_tour"].every(
				(e) => (s.events[e]?.count ?? 0) >= 1
			),
	},
];

const LEVEL_THRESHOLDS = [
	0, 50, 150, 300, 500, 750, 1100, 1500, 2000, 2700, 3500, 4500, 5800, 7500,
	10000, 13000, 17000, 22000, 28000, 35000,
];

function levelFromXp(xp: number): number {
	for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
		if (xp >= LEVEL_THRESHOLDS[i]) return i + 1;
	}
	return 1;
}

function xpToNextLevel(xp: number): { current: number; next: number; pct: number } {
	const lvl = levelFromXp(xp);
	const cur = LEVEL_THRESHOLDS[lvl - 1] ?? 0;
	const next = LEVEL_THRESHOLDS[lvl] ?? cur + 5000;
	const pct = Math.min(1, (xp - cur) / Math.max(1, next - cur));
	return { current: cur, next, pct };
}

export class AchievementSystem {
	private state: XpState = {
		totalXp: 0,
		level: 1,
		events: {},
		unlockedAchievements: [],
	};

	constructor() {
		this.load();
	}

	private load(): void {
		try {
			const raw = window.localStorage.getItem(STATE_KEY);
			if (raw) this.state = JSON.parse(raw);
		} catch {
			// noop
		}
	}

	private save(): void {
		try {
			window.localStorage.setItem(STATE_KEY, JSON.stringify(this.state));
		} catch {
			// noop
		}
	}

	gain(eventId: string, xp: number): void {
		const now = new Date().toISOString();
		const ev = this.state.events[eventId] ?? { count: 0, firstAt: now, lastAt: now };
		ev.count += 1;
		ev.lastAt = now;
		this.state.events[eventId] = ev;

		this.state.totalXp += xp;
		const newLevel = levelFromXp(this.state.totalXp);
		const leveledUp = newLevel > this.state.level;
		this.state.level = newLevel;

		// Check achievements
		const newAchievements: AchievementDef[] = [];
		for (const a of ACHIEVEMENTS) {
			if (this.state.unlockedAchievements.includes(a.id)) continue;
			if (a.condition && a.condition(this.state)) {
				this.state.unlockedAchievements.push(a.id);
				this.state.totalXp += a.xp;
				newAchievements.push(a);
			}
		}

		this.save();

		// Notify
		if (leveledUp) {
			new Notice(`🎉 Atlas: você subiu para nível ${newLevel}!`, 6000);
			void triggerConfetti({ particles: 120 });
		}
		for (const a of newAchievements) {
			new Notice(`🏆 Achievement desbloqueado: ${a.icon} ${a.title} (+${a.xp} XP)`, 8000);
			void triggerConfetti({ particles: 80 });
		}
	}

	getState(): XpState {
		return { ...this.state };
	}

	getProgress(): { level: number; xp: number; nextLevelXp: number; pct: number } {
		const { current, next, pct } = xpToNextLevel(this.state.totalXp);
		void current;
		return { level: this.state.level, xp: this.state.totalXp, nextLevelXp: next, pct };
	}

	getAllAchievements(): { def: AchievementDef; unlocked: boolean }[] {
		return ACHIEVEMENTS.map((a) => ({
			def: a,
			unlocked: this.state.unlockedAchievements.includes(a.id),
		}));
	}

	reset(): void {
		this.state = {
			totalXp: 0,
			level: 1,
			events: {},
			unlockedAchievements: [],
		};
		this.save();
	}
}
