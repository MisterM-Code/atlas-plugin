/**
 * FSRS-4.5 (Free Spaced Repetition Scheduler) — algoritmo state-of-the-art
 * para revisão espaçada. Substitui SM-2 do Anki clássico.
 *
 * Implementação simplificada baseada em https://github.com/open-spaced-repetition/
 * Suficiente para uso pessoal. Não cobre fuzzing nem suspensão.
 */

export type Rating = 1 | 2 | 3 | 4; // again, hard, good, easy

export interface FSRSCard {
	stability: number; // dias até recall ~90%
	difficulty: number; // 1-10, default 5
	state: "new" | "learning" | "review" | "relearning";
	reps: number;
	lapses: number;
	lastReview: string | null; // ISO
	due: string; // ISO
}

const W = [
	0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14,
	0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61, 0.5, 0.6,
];

const REQUEST_RETENTION = 0.9;
const FACTOR = 19 / 81;
const DECAY = -0.5;

export function newCard(): FSRSCard {
	return {
		stability: 0,
		difficulty: 5,
		state: "new",
		reps: 0,
		lapses: 0,
		lastReview: null,
		due: new Date().toISOString(),
	};
}

function intervalForDays(stability: number, retention = REQUEST_RETENTION): number {
	if (stability <= 0) return 1;
	const days = (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
	return Math.max(1, Math.round(days));
}

function clampDifficulty(d: number): number {
	return Math.max(1, Math.min(10, d));
}

function initStability(rating: Rating): number {
	return Math.max(W[rating - 1], 0.1);
}

function initDifficulty(rating: Rating): number {
	return clampDifficulty(W[4] - (rating - 3) * W[5]);
}

function nextDifficulty(d: number, rating: Rating): number {
	const next = d - W[6] * (rating - 3);
	const meanRev = W[7] * 5 + (1 - W[7]) * next;
	return clampDifficulty(meanRev);
}

function recallStability(d: number, s: number, retrievability: number, rating: Rating): number {
	const hardPenalty = rating === 2 ? W[15] : 1;
	const easyBonus = rating === 4 ? W[16] : 1;
	const stab = s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp((1 - retrievability) * W[10]) - 1) * hardPenalty * easyBonus);
	return Math.max(0.1, stab);
}

function forgetStability(d: number, s: number, retrievability: number): number {
	const stab =
		W[11] *
		Math.pow(d, -W[12]) *
		(Math.pow(s + 1, W[13]) - 1) *
		Math.exp((1 - retrievability) * W[14]);
	return Math.max(0.1, stab);
}

function retrievability(daysSinceLast: number, stability: number): number {
	if (stability <= 0) return 0;
	return Math.pow(1 + FACTOR * (daysSinceLast / stability), DECAY);
}

export function review(card: FSRSCard, rating: Rating, now = new Date()): FSRSCard {
	const daysSinceLast = card.lastReview
		? Math.max(0, (now.getTime() - new Date(card.lastReview).getTime()) / 86_400_000)
		: 0;

	let s = card.stability;
	let d = card.difficulty;
	let state: FSRSCard["state"] = card.state;
	let lapses = card.lapses;
	const reps = card.reps + 1;

	if (state === "new") {
		s = initStability(rating);
		d = initDifficulty(rating);
		state = rating === 1 ? "learning" : "review";
	} else {
		const r = retrievability(daysSinceLast, s);
		if (rating === 1) {
			s = forgetStability(d, s, r);
			lapses += 1;
			state = "relearning";
		} else {
			s = recallStability(d, s, r, rating);
			state = "review";
		}
		d = nextDifficulty(d, rating);
	}

	const intervalDays = intervalForDays(s);
	const due = new Date(now.getTime() + intervalDays * 86_400_000).toISOString();

	return {
		stability: s,
		difficulty: d,
		state,
		reps,
		lapses,
		lastReview: now.toISOString(),
		due,
	};
}

export function isDue(card: FSRSCard, now = new Date()): boolean {
	return new Date(card.due).getTime() <= now.getTime();
}
