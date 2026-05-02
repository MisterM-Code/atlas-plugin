import { Flashcard } from "./flashcard-store";

/**
 * Export flashcards to Anki-compatible CSV.
 * Anki File → Import → text/CSV → fields: Question, Answer, Tags, Deck.
 *
 * Format: tab-separated, UTF-8, com cabeçalho "#html:false".
 * Anki desktop importa via File → Import; mobile via AnkiWeb sync.
 */

export function flashcardsToAnkiCsv(cards: Flashcard[], options?: { deckName?: string }): string {
	const deck = options?.deckName ?? "Atlas";
	const lines: string[] = [
		"#separator:tab",
		"#html:false",
		"#columns:Question\tAnswer\tTags\tDeck",
	];

	for (const c of cards) {
		const q = sanitize(c.question);
		const a = sanitize(c.answer);
		const tags = c.tags.length > 0 ? c.tags.map((t) => t.replace(/\s+/g, "_")).join(" ") : "atlas";
		lines.push(`${q}\t${a}\t${tags}\t${deck}`);
	}

	return lines.join("\n");
}

function sanitize(s: string): string {
	return s.replace(/\r?\n/g, "<br>").replace(/\t/g, "    ").trim();
}

/**
 * Markdown-style export: gera arquivo .md no vault com sintaxe do plugin
 * Spaced Repetition (st3v3nmw) — `Q:: A`. Compatível com Anki via plugin.
 */
export function flashcardsToObsidianSrMd(cards: Flashcard[], title = "Atlas Flashcards"): string {
	const lines: string[] = [
		`---`,
		`type: flashcards-export`,
		`generated_at: ${new Date().toISOString()}`,
		`tags: [flashcards]`,
		`---`,
		``,
		`# ${title}`,
		``,
		`> ${cards.length} flashcards · gerados pelo Atlas`,
		``,
	];

	for (const c of cards) {
		lines.push(`#flashcard`);
		lines.push(c.question);
		lines.push("?");
		lines.push(c.answer);
		lines.push(``);
		lines.push(`<small>Fonte: ${c.sourceNotePath} · last-review: ${c.fsrs.lastReview ?? "(nunca)"}</small>`);
		lines.push(``);
		lines.push(`---`);
		lines.push(``);
	}

	return lines.join("\n");
}
