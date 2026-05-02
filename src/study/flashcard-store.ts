import { App, normalizePath, TFile } from "obsidian";
import { FSRSCard, newCard, review as fsrsReview, Rating, isDue } from "./fsrs";
import { logger } from "../utils/logger";

export interface Flashcard {
	id: string;
	question: string;
	answer: string;
	sourceNotePath: string;
	tags: string[];
	deck: string;
	createdAt: string;
	updatedAt: string;
	fsrs: FSRSCard;
}

interface FlashcardState {
	version: 1;
	cards: Flashcard[];
}

export class FlashcardStore {
	private state: FlashcardState = { version: 1, cards: [] };
	private dirty = false;
	private flushTimer: number | null = null;

	constructor(private app: App, private folder: string) {}

	private get path(): string {
		return normalizePath(`${this.folder}/flashcards.json`);
	}

	async load(): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(this.path);
		if (!(file instanceof TFile)) return;
		try {
			const raw = await this.app.vault.read(file);
			const parsed = JSON.parse(raw);
			if (parsed.version === 1) {
				this.state = parsed;
				logger.info(`flashcards: ${parsed.cards.length} cards carregados`);
			}
		} catch (e) {
			logger.warn("flashcards: load falhou", { error: String(e) });
		}
	}

	async save(): Promise<void> {
		try {
			const json = JSON.stringify(this.state, null, 2);
			const file = this.app.vault.getAbstractFileByPath(this.path);
			if (file instanceof TFile) {
				await this.app.vault.modify(file, json);
			} else {
				if (!this.app.vault.getAbstractFileByPath(this.folder)) {
					await this.app.vault.createFolder(this.folder);
				}
				await this.app.vault.create(this.path, json);
			}
			this.dirty = false;
		} catch (e) {
			logger.error("flashcards: save falhou", { error: String(e) });
		}
	}

	private touch(): void {
		this.dirty = true;
		if (this.flushTimer !== null) window.clearTimeout(this.flushTimer);
		this.flushTimer = window.setTimeout(() => void this.save(), 1500);
	}

	add(input: { question: string; answer: string; sourceNotePath: string; tags?: string[]; deck?: string; }): Flashcard {
		const id = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
		const now = new Date().toISOString();
		const card: Flashcard = {
			id,
			question: input.question.trim(),
			answer: input.answer.trim(),
			sourceNotePath: input.sourceNotePath,
			tags: input.tags ?? [],
			deck: input.deck ?? "default",
			createdAt: now,
			updatedAt: now,
			fsrs: newCard(),
		};
		this.state.cards.push(card);
		this.touch();
		return card;
	}

	addBatch(items: { question: string; answer: string; sourceNotePath: string; tags?: string[]; deck?: string; }[]): number {
		let added = 0;
		for (const it of items) {
			// Dedupe by Q+source
			if (this.state.cards.some(
				(c) => c.question === it.question.trim() && c.sourceNotePath === it.sourceNotePath
			)) {
				continue;
			}
			this.add(it);
			added++;
		}
		return added;
	}

	review(id: string, rating: Rating): Flashcard | null {
		const card = this.state.cards.find((c) => c.id === id);
		if (!card) return null;
		card.fsrs = fsrsReview(card.fsrs, rating);
		card.updatedAt = new Date().toISOString();
		this.touch();
		return card;
	}

	delete(id: string): boolean {
		const idx = this.state.cards.findIndex((c) => c.id === id);
		if (idx >= 0) {
			this.state.cards.splice(idx, 1);
			this.touch();
			return true;
		}
		return false;
	}

	dueToday(now = new Date()): Flashcard[] {
		return this.state.cards
			.filter((c) => isDue(c.fsrs, now))
			.sort((a, b) => a.fsrs.due.localeCompare(b.fsrs.due));
	}

	allCards(): Flashcard[] {
		return [...this.state.cards];
	}

	stats(): { total: number; due: number; new: number; learning: number; review: number } {
		const total = this.state.cards.length;
		const due = this.dueToday().length;
		let nw = 0,
			learning = 0,
			rev = 0;
		for (const c of this.state.cards) {
			if (c.fsrs.state === "new") nw++;
			else if (c.fsrs.state === "review") rev++;
			else learning++;
		}
		return { total, due, new: nw, learning, review: rev };
	}

	bySource(notePath: string): Flashcard[] {
		return this.state.cards.filter((c) => c.sourceNotePath === notePath);
	}
}
