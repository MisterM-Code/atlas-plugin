import * as chrono from "chrono-node";

export interface ParsedDateResult {
	date: Date | null;
	hasTime: boolean;
	originalText: string;
	residualText: string; // text minus the date expression
}

const ptBR = chrono.pt.casual.clone();

export function parseNaturalDate(input: string, ref: Date = new Date()): ParsedDateResult {
	const results = ptBR.parse(input, ref, { forwardDate: true });
	if (results.length === 0) {
		return { date: null, hasTime: false, originalText: input, residualText: input };
	}

	const first = results[0];
	const dt = first.start.date();
	const hasTime = first.start.isCertain("hour");

	const residualText = (
		input.substring(0, first.index) + input.substring(first.index + first.text.length)
	)
		.replace(/\s{2,}/g, " ")
		.trim();

	return {
		date: dt,
		hasTime,
		originalText: first.text,
		residualText,
	};
}

export function formatObsidianReminder(date: Date, hasTime: boolean): string {
	const yyyy = date.getFullYear();
	const mm = String(date.getMonth() + 1).padStart(2, "0");
	const dd = String(date.getDate()).padStart(2, "0");
	if (!hasTime) return `(@${yyyy}-${mm}-${dd})`;
	const hh = String(date.getHours()).padStart(2, "0");
	const mn = String(date.getMinutes()).padStart(2, "0");
	return `(@${yyyy}-${mm}-${dd} ${hh}:${mn})`;
}
