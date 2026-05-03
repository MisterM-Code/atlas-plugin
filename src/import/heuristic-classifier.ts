/**
 * v0.63.0 — Heuristic note classifier (zero-LLM).
 *
 * Aplica 16 regras ordenadas pra detectar `noteType` + confidence (0-1).
 * Primeiro match decide. Se confidence < 0.7 → caller dispara LLM extraction.
 */

export type NoteType =
	| "daily"
	| "1on1"
	| "meeting"
	| "weekly-status"
	| "project"
	| "person"
	| "raid"
	| "incident"
	| "adr"
	| "paper"
	| "course"
	| "theme"
	| "knowledge"
	| "inbox"
	| "other";

export interface ClassifyInput {
	path: string;
	body: string;
	frontmatter: Record<string, unknown>;
	tags: string[]; // both inline + frontmatter, normalized lowercase without #
	systemMatchCount?: number; // pre-computed via SystemDetector (optional)
}

export interface ClassifyResult {
	noteType: NoteType;
	confidence: number; // 0..1
	matchedRule: number; // 1..16
	reason: string; // human-readable explanation
}

const KNOWN_TYPES: ReadonlySet<NoteType> = new Set<NoteType>([
	"daily", "1on1", "meeting", "weekly-status", "project", "person",
	"raid", "incident", "adr", "paper", "course", "theme", "knowledge",
	"inbox", "other",
]);

function normalizeType(raw: unknown): NoteType | null {
	if (typeof raw !== "string") return null;
	const lower = raw.toLowerCase().trim();
	const aliases: Record<string, NoteType> = {
		"diary": "daily",
		"journal": "daily",
		"one-on-one": "1on1",
		"oneonone": "1on1",
		"weekly": "weekly-status",
		"status": "weekly-status",
		"postmortem": "incident",
		"rca": "incident",
		"decision": "adr",
		"research": "paper",
	};
	if (KNOWN_TYPES.has(lower as NoteType)) return lower as NoteType;
	if (aliases[lower]) return aliases[lower];
	return null;
}

function hasTag(tags: string[], pattern: string[]): boolean {
	const set = new Set(tags.map((t) => t.toLowerCase().replace(/^#/, "")));
	return pattern.some((p) => set.has(p.toLowerCase().replace(/^#/, "")));
}

export function classify(input: ClassifyInput): ClassifyResult {
	const { path, body, frontmatter, tags } = input;
	const fmType = normalizeType(frontmatter.type);
	const filename = path.split("/").pop() ?? path;

	// Rule 1 — frontmatter.type known
	if (fmType) {
		return { noteType: fmType, confidence: 1.0, matchedRule: 1, reason: `frontmatter.type=${fmType}` };
	}

	// Rule 2 — coachee or framework=GROW/CLEAR
	const fw = String(frontmatter.framework ?? "").toUpperCase();
	if (frontmatter.coachee || fw === "GROW" || fw === "CLEAR") {
		return { noteType: "1on1", confidence: 0.95, matchedRule: 2, reason: `framework=${fw} or coachee field present` };
	}

	// Rule 3 — path matches 1on1 patterns
	if (/1on1|one[-_]?on[-_]?one|1[-_]on[-_]1/i.test(path)) {
		return { noteType: "1on1", confidence: 0.9, matchedRule: 3, reason: "path matches 1on1 pattern" };
	}

	// Rule 4 — filename starts YYYY-MM-DD
	if (/^\d{4}-\d{2}-\d{2}/.test(filename)) {
		return { noteType: "daily", confidence: 0.9, matchedRule: 4, reason: "filename starts with date" };
	}

	// Rule 5 — path daily/journal/diary
	if (/(daily|journal|diary)/i.test(path)) {
		return { noteType: "daily", confidence: 0.85, matchedRule: 5, reason: "path mentions daily/journal/diary" };
	}

	// Rule 6 — path weekly/status-report
	if (/(weekly|status[-_]?report)/i.test(path)) {
		return { noteType: "weekly-status", confidence: 0.85, matchedRule: 6, reason: "path mentions weekly/status" };
	}

	// Rule 7 — path meeting/all-hands/standup
	if (/(meeting|all[-_]?hands|standup)/i.test(path)) {
		return { noteType: "meeting", confidence: 0.8, matchedRule: 7, reason: "path mentions meeting/standup" };
	}

	// Rule 8 — tags daily/journal
	if (hasTag(tags, ["daily", "journal"])) {
		return { noteType: "daily", confidence: 0.85, matchedRule: 8, reason: "tag #daily or #journal" };
	}

	// Rule 9 — tags 1on1/one-on-one
	if (hasTag(tags, ["1on1", "one-on-one", "oneonone"])) {
		return { noteType: "1on1", confidence: 0.85, matchedRule: 9, reason: "tag #1on1" };
	}

	// Rule 10 — tags paper/research
	if (hasTag(tags, ["paper", "research"])) {
		return { noteType: "paper", confidence: 0.8, matchedRule: 10, reason: "tag #paper or #research" };
	}

	// Rule 11 — tags project/proj
	if (hasTag(tags, ["project", "proj"])) {
		return { noteType: "project", confidence: 0.8, matchedRule: 11, reason: "tag #project" };
	}

	// Rule 12 — tags adr/decision
	if (hasTag(tags, ["adr", "decision"])) {
		return { noteType: "adr", confidence: 0.85, matchedRule: 12, reason: "tag #adr or #decision" };
	}

	// Rule 13 — tags postmortem/incident/rca
	if (hasTag(tags, ["postmortem", "incident", "rca"])) {
		return { noteType: "incident", confidence: 0.85, matchedRule: 13, reason: "tag #postmortem/#incident/#rca" };
	}

	// Rule 14 — body very short + frontmatter empty → inbox
	const fmKeyCount = Object.keys(frontmatter).length;
	if (body.trim().length < 200 && fmKeyCount === 0) {
		return { noteType: "inbox", confidence: 0.7, matchedRule: 14, reason: "short body + no frontmatter" };
	}

	// Rule 15 — has system mentions
	if ((input.systemMatchCount ?? 0) > 0) {
		return { noteType: "knowledge", confidence: 0.65, matchedRule: 15, reason: "contains system mentions" };
	}

	// Rule 16 — fallback
	return { noteType: "other", confidence: 0.0, matchedRule: 16, reason: "no rule matched" };
}

/** Map noteType → folder default (espelha setupVaultStructure). */
export function targetFolderFor(noteType: NoteType): string {
	const map: Record<NoteType, string> = {
		"daily": "02_Daily",
		"1on1": "03_Meetings/1on1",
		"meeting": "03_Meetings",
		"weekly-status": "04_Reports/weekly",
		"project": "05_Projects",
		"person": "06_People",
		"raid": "07_RAID",
		"incident": "08_Incidents",
		"adr": "09_Knowledge/adrs",
		"paper": "12_Studies/papers",
		"course": "12_Studies/courses",
		"theme": "13_Themes",
		"knowledge": "09_Knowledge",
		"inbox": "01_Inbox",
		"other": "01_Inbox",
	};
	return map[noteType];
}
