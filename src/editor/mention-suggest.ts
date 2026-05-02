import { App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from "obsidian";
import type AtlasPlugin from "../../main";
import { PersonT } from "../kg/schemas";

interface MentionEntry {
	kind: "person" | "theme" | "project";
	id: string;
	display: string;
	subtitle?: string;
	score: number;
	// for selectSuggestion
	insertText: string;
}

/**
 * Trigger `@` followed by 0-N word chars suggests entities from KG ranqueadas.
 * Inserts as wikilink format `[[Name]]`.
 */
export class MentionSuggest extends EditorSuggest<MentionEntry> {
	constructor(app: App, private plugin: AtlasPlugin) {
		super(app);
	}

	onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
		const line = editor.getLine(cursor.line);
		const before = line.substring(0, cursor.ch);

		// Match @ followed by 0-30 word characters at start of word boundary
		// Avoid email addresses (preceded by alphanumeric)
		const m = before.match(/(?:^|\s)(@[\p{L}\p{N}-]{0,30})$/u);
		if (!m) return null;

		const trigger = m[1];
		const startCh = cursor.ch - trigger.length;

		return {
			start: { line: cursor.line, ch: startCh },
			end: cursor,
			query: trigger.substring(1).toLowerCase(),
		};
	}

	getSuggestions(context: EditorSuggestContext): MentionEntry[] {
		const q = context.query.toLowerCase();
		const entries: MentionEntry[] = [];

		// People
		const people = this.plugin.kg.listPeople();
		for (const p of people) {
			const score = scoreEntity(p, q);
			if (score <= 0) continue;
			entries.push({
				kind: "person",
				id: p.id,
				display: p.name,
				subtitle: subtitleForPerson(p),
				score: score + recencyBonus(this.plugin, p.id),
				insertText: `[[${p.name}]]`,
			});
		}

		// Themes (top 30)
		const themes = this.plugin.kg.data.themes
			.sort((a, b) => b.frequency - a.frequency)
			.slice(0, 30);
		for (const t of themes) {
			const nameMatch = q ? scoreText(t.name, q) : 1;
			if (nameMatch <= 0) continue;
			entries.push({
				kind: "theme",
				id: t.id,
				display: `#theme/${t.name}`,
				subtitle: `${t.frequency}× · ${t.sentiment}`,
				score: nameMatch + Math.min(t.frequency / 10, 2),
				insertText: `#theme/${t.name}`,
			});
		}

		// Projects
		const projects = this.plugin.kg.data.projects;
		for (const proj of projects) {
			const score = scoreText(proj.name, q);
			if (score <= 0) continue;
			entries.push({
				kind: "project",
				id: proj.id,
				display: proj.name,
				subtitle: `Project · RAG ${proj.rag}`,
				score,
				insertText: `[[${proj.name}]]`,
			});
		}

		return entries.sort((a, b) => b.score - a.score).slice(0, 10);
	}

	renderSuggestion(entry: MentionEntry, el: HTMLElement): void {
		el.style.display = "flex";
		el.style.alignItems = "center";
		el.style.gap = "10px";
		el.style.padding = "6px 4px";

		const icon = el.createEl("span");
		icon.style.fontSize = "14px";
		icon.style.width = "20px";
		icon.style.textAlign = "center";
		icon.setText(iconFor(entry.kind));

		const wrap = el.createDiv();
		wrap.style.flexGrow = "1";

		const title = wrap.createEl("div", { text: entry.display });
		title.style.fontWeight = "bold";
		title.style.fontSize = "13px";

		if (entry.subtitle) {
			const sub = wrap.createEl("div", { text: entry.subtitle });
			sub.style.fontSize = "10px";
			sub.style.opacity = "0.6";
		}

		const kindBadge = el.createEl("span", { text: entry.kind });
		kindBadge.style.fontSize = "9px";
		kindBadge.style.opacity = "0.5";
		kindBadge.style.padding = "1px 5px";
		kindBadge.style.background = "var(--background-modifier-hover)";
		kindBadge.style.borderRadius = "3px";
	}

	selectSuggestion(entry: MentionEntry, _evt: MouseEvent | KeyboardEvent): void {
		const ctx = this.context;
		if (!ctx) return;
		const editor = ctx.editor;
		// Replace `@query` with `[[Name]]` (or `#theme/X`)
		editor.replaceRange(entry.insertText, ctx.start, ctx.end);
		// Move cursor after insertion
		editor.setCursor({
			line: ctx.start.line,
			ch: ctx.start.ch + entry.insertText.length,
		});
	}
}

// ─── helpers ───

function scoreEntity(p: PersonT, q: string): number {
	if (!q) return 1; // empty query → all match (show top by recency)
	const name = p.name.toLowerCase();
	const tokens = q.split(/\s+/).filter(Boolean);
	let score = 0;

	for (const t of tokens) {
		if (name.startsWith(t)) score += 100;
		else if (name.includes(t)) score += 50;
		// alias match
		for (const a of p.aliases) {
			const al = a.toLowerCase();
			if (al.startsWith(t)) score += 80;
			else if (al.includes(t)) score += 30;
		}
		// initials match: "JS" matches "João Silva"
		const initials = p.name
			.split(/\s+/)
			.map((w) => w[0]?.toLowerCase() ?? "")
			.join("");
		if (initials.startsWith(t)) score += 40;
	}
	return score;
}

function scoreText(text: string, q: string): number {
	if (!q) return 1;
	const lower = text.toLowerCase();
	if (lower.startsWith(q)) return 100;
	if (lower.includes(q)) return 50;
	return 0;
}

function recencyBonus(plugin: AtlasPlugin, personId: string): number {
	const sessions = plugin.kg.listSessionsByPerson(personId);
	if (sessions.length === 0) return 0;
	// Mais recente → maior bonus
	const last = new Date(sessions[0].date).getTime();
	const days = Math.max(1, (Date.now() - last) / 86_400_000);
	return Math.max(0, 30 - days); // até +30 se hoje, decai linear
}

function subtitleForPerson(p: PersonT): string {
	const parts: string[] = [];
	if (p.role) parts.push(p.role);
	if (p.type && p.type !== "other") parts.push(p.type);
	if (p.aliases.length > 0) parts.push(`aliases: ${p.aliases.slice(0, 2).join(", ")}`);
	return parts.join(" · ");
}

function iconFor(kind: MentionEntry["kind"]): string {
	switch (kind) {
		case "person":
			return "👤";
		case "theme":
			return "🏷️";
		case "project":
			return "🚀";
	}
}
