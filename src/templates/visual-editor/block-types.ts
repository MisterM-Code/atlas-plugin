/**
 * Atlas v0.5 Sprint 9 — Block schema for visual template editor.
 *
 * Cada bloco é um objeto JSON serializável. Renderer transforma em markdown.
 */

export type BlockKind =
	| "heading"
	| "text"
	| "list"
	| "frontmatter"
	| "atlas-brief"
	| "tasks-placeholder"
	| "tags"
	| "callout"
	| "code"
	| "separator";

export interface BaseBlock {
	id: string; // unique within template
	kind: BlockKind;
}

export interface HeadingBlock extends BaseBlock {
	kind: "heading";
	level: 1 | 2 | 3 | 4;
	icon?: string;
	text: string;
}

export interface TextBlock extends BaseBlock {
	kind: "text";
	text: string;
}

export interface ListBlock extends BaseBlock {
	kind: "list";
	style: "bullet" | "numbered" | "checkbox";
	items: string[]; // each item is a placeholder line
}

export interface FrontmatterBlock extends BaseBlock {
	kind: "frontmatter";
	fields: Record<string, string>; // key → value or template `{{var}}`
}

export interface AtlasBriefBlock extends BaseBlock {
	kind: "atlas-brief";
	hint?: string; // visible comment
}

export interface TasksPlaceholderBlock extends BaseBlock {
	kind: "tasks-placeholder";
	owner?: string; // placeholder ou pessoa específica
	dueDateOffset?: number; // dias a partir de hoje
	prefix?: string; // ex: "#followup"
}

export interface TagsBlock extends BaseBlock {
	kind: "tags";
	tags: string[]; // ex: ["theme/", "1on1"]
}

export interface CalloutBlock extends BaseBlock {
	kind: "callout";
	type: "note" | "tip" | "warning" | "info" | "danger" | "important";
	title?: string;
	text: string;
}

export interface CodeBlock extends BaseBlock {
	kind: "code";
	lang?: string;
	code: string; // ex: dataview query
}

export interface SeparatorBlock extends BaseBlock {
	kind: "separator";
}

export type Block =
	| HeadingBlock
	| TextBlock
	| ListBlock
	| FrontmatterBlock
	| AtlasBriefBlock
	| TasksPlaceholderBlock
	| TagsBlock
	| CalloutBlock
	| CodeBlock
	| SeparatorBlock;

export interface AtlasTemplate {
	id: string;
	name: string;
	icon: string;
	description: string;
	category: "daily" | "meeting" | "coaching" | "review" | "report" | "other";
	variables: { key: string; label: string; required: boolean; promptOnUse?: boolean }[];
	blocks: Block[];
	createdAt: string;
	updatedAt: string;
}

export interface TemplateRenderContext {
	pessoa?: string;
	coachee?: string;
	data?: string; // YYYY-MM-DD
	dataPretty?: string; // formato pt-BR
	semana?: string; // WW-YYYY
	mes?: string;
	ano?: string;
	hora?: string;
	framework?: string;
	[key: string]: string | undefined;
}

export function buildDefaultContext(): TemplateRenderContext {
	const now = new Date();
	const yyyy = now.getFullYear();
	const mm = String(now.getMonth() + 1).padStart(2, "0");
	const dd = String(now.getDate()).padStart(2, "0");
	return {
		data: `${yyyy}-${mm}-${dd}`,
		dataPretty: now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }),
		hora: now.toTimeString().substring(0, 5),
		semana: `${getWeekNumber(now)}-${yyyy}`,
		mes: mm,
		ano: String(yyyy),
	};
}

function getWeekNumber(d: Date): number {
	const target = new Date(d.valueOf());
	const dayNr = (d.getDay() + 6) % 7;
	target.setDate(target.getDate() - dayNr + 3);
	const firstThursday = target.valueOf();
	target.setMonth(0, 1);
	if (target.getDay() !== 4) {
		target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
	}
	return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}
