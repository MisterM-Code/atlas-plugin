import { z } from "zod";

// ──────────────────────────────────────────────────────────────────────
// Enums

export const PersonType = z.enum([
	"direct-report",
	"peer",
	"manager",
	"stakeholder",
	"coachee",
	"skip-level",
	"other",
]);

export const SessionType = z.enum([
	"1on1",
	"coaching",
	"all-hands",
	"skip-level",
	"stakeholder",
	"retrospective",
	"planning",
	"other",
]);

export const Framework = z.enum(["GROW", "CLEAR", "BICEPS", "OSKAR", "adhoc"]);

export const ActionItemStatus = z.enum([
	"open",
	"in-progress",
	"completed",
	"blocked",
	"deferred",
	"cancelled",
]);

export const CommitmentStatus = z.enum([
	"open",
	"fulfilled",
	"missed",
	"renegotiated",
]);

export const ThemeSentiment = z.enum([
	"blocker",
	"strength",
	"growth",
	"neutral",
]);

export const ThemeScope = z.enum(["pessoa", "time", "cross-team"]);

export const RagStatus = z.enum(["green", "amber", "red"]);

export const Priority = z.enum(["P1", "P2", "P3", "P4"]);

// ──────────────────────────────────────────────────────────────────────
// Core entities

export const Person = z.object({
	id: z.string(), // slug do nome
	name: z.string(),
	aliases: z.array(z.string()).default([]),
	role: z.string().optional(),
	team: z.string().optional(),
	type: PersonType.default("other"),
	manager: z.string().optional(),
	startDate: z.string().optional(),
	email: z.string().email().optional(), // v0.9: email pra integration
	encrypted: z.boolean().default(false),
	notePath: z.string().optional(), // 06_People/[name]/_person.md
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const Session = z.object({
	id: z.string(),
	date: z.string(), // ISO date
	type: SessionType,
	personId: z.string().optional(), // para 1:1, coaching
	participantIds: z.array(z.string()).default([]),
	framework: Framework.default("adhoc"),
	durationMin: z.number().optional(),
	topics: z.array(z.string()).default([]),
	decisions: z.array(z.string()).default([]),
	sourceNotePath: z.string(),
	confidential: z.boolean().default(false),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const ActionItem = z.object({
	id: z.string(),
	description: z.string(),
	ownerId: z.string().optional(), // person.id
	dueDate: z.string().optional(), // ISO
	status: ActionItemStatus.default("open"),
	priority: Priority.optional(),
	sessionId: z.string().optional(),
	projectId: z.string().optional(),
	sourceNotePath: z.string(),
	completedDate: z.string().optional(),
	notes: z.string().optional(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const Commitment = z.object({
	id: z.string(),
	text: z.string(),
	madeBy: z.string(), // person.id
	madeTo: z.string(), // person.id
	dueDate: z.string().optional(),
	status: CommitmentStatus.default("open"),
	weight: z.enum(["low", "medium", "high"]).default("medium"),
	sessionId: z.string().optional(),
	fulfilledInSessionId: z.string().optional(),
	sourceNotePath: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const Theme = z.object({
	id: z.string(), // slug
	name: z.string(),
	sentiment: ThemeSentiment.default("neutral"),
	scope: ThemeScope.default("pessoa"),
	personIds: z.array(z.string()).default([]),
	sessionIds: z.array(z.string()).default([]),
	firstSeen: z.string(),
	lastSeen: z.string(),
	frequency: z.number().default(1),
	notePath: z.string().optional(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const Goal = z.object({
	id: z.string(),
	personId: z.string().optional(),
	description: z.string(),
	deadline: z.string().optional(),
	smartMetrics: z.string().optional(),
	progress: z.number().min(0).max(1).default(0),
	confidence: z.number().min(0).max(1).default(0.5),
	status: z.enum(["active", "achieved", "paused", "abandoned"]).default("active"),
	linkedThemeIds: z.array(z.string()).default([]),
	sourceNotePath: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const Project = z.object({
	id: z.string(),
	name: z.string(),
	type: z.enum(["delivery", "platform", "migration", "compliance", "tech-debt", "rd", "other"]).default("other"),
	status: z.enum(["proposed", "active", "on-hold", "completed", "cancelled"]).default("active"),
	rag: RagStatus.default("green"),
	phase: z.string().optional(),
	ownerId: z.string().optional(),
	teamMemberIds: z.array(z.string()).default([]),
	startDate: z.string().optional(),
	targetDate: z.string().optional(),
	notePath: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const Risk = z.object({
	id: z.string(),
	description: z.string(),
	probability: z.number().min(1).max(5).default(3),
	impact: z.number().min(1).max(5).default(3),
	priority: Priority.default("P3"),
	ownerId: z.string().optional(),
	mitigationPlan: z.string().optional(),
	contingencyPlan: z.string().optional(),
	status: z.enum(["open", "mitigated", "realized", "closed"]).default("open"),
	projectId: z.string().optional(),
	sourceNotePath: z.string(),
	identifiedDate: z.string(),
	dueDate: z.string().optional(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

// ──────────────────────────────────────────────────────────────────────
// v0.5 — entidades novas: System, Product, Role

export const SystemType = z.enum([
	"payment",
	"core",
	"internal-tool",
	"vendor",
	"platform",
	"data",
	"security",
	"other",
]);

export const SystemStatus = z.enum([
	"healthy",
	"degraded",
	"down",
	"deprecated",
	"deprecated-soon",
]);

export const System = z.object({
	id: z.string(),
	name: z.string(),
	aliases: z.array(z.string()).default([]),
	type: SystemType.default("other"),
	vendor: z.string().optional(),
	ownerPersonId: z.string().optional(),
	status: SystemStatus.default("healthy"),
	sla: z.string().optional(),
	description: z.string().optional(),
	tags: z.array(z.string()).default([]),
	notePath: z.string().optional(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const ProductStatus = z.enum(["discovery", "active", "sunset", "killed"]);

export const Product = z.object({
	id: z.string(),
	name: z.string(),
	category: z.string().optional(),
	ownerPersonId: z.string().optional(),
	systemIds: z.array(z.string()).default([]),
	status: ProductStatus.default("active"),
	description: z.string().optional(),
	notePath: z.string().optional(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const Role = z.object({
	id: z.string(),
	title: z.string(),
	level: z.string().optional(),
	responsibilities: z.array(z.string()).default([]),
	reportsToRoleId: z.string().optional(),
	notePath: z.string().optional(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export type SystemT = z.infer<typeof System>;
export type ProductT = z.infer<typeof Product>;
export type RoleT = z.infer<typeof Role>;

// ──────────────────────────────────────────────────────────────────────
// COURSE — gestão de cursos (v0.7 Sprint 19)

export const CourseStatus = z.enum([
	"planning",
	"active",
	"paused",
	"completed",
	"dropped",
]);

export const ModuleStatus = z.enum(["todo", "in-progress", "done"]);

export const CourseModule = z.object({
	id: z.string(),
	title: z.string(),
	status: ModuleStatus.default("todo"),
	completedAt: z.string().optional(),
	notePath: z.string().optional(),
	estimateHours: z.number().optional(),
});

export const Course = z.object({
	id: z.string(),
	name: z.string(),
	provider: z.string().optional(), // "Coursera", "Domestika", "interno", "livro"
	url: z.string().optional(),
	startDate: z.string().optional(),
	targetEndDate: z.string().optional(),
	status: CourseStatus.default("active"),
	modules: z.array(CourseModule).default([]),
	totalHoursEstimated: z.number().optional(),
	hoursLogged: z.number().default(0),
	certificateNotePath: z.string().optional(),
	notes: z.array(z.string()).default([]), // notePaths relacionadas
	flashcardDeckId: z.string().optional(),
	rating: z.number().min(1).max(5).optional(),
	takeaways: z.array(z.string()).default([]),
	tags: z.array(z.string()).default([]),
	notePath: z.string().optional(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export type CourseModuleT = z.infer<typeof CourseModule>;
export type CourseT = z.infer<typeof Course>;

// ──────────────────────────────────────────────────────────────────────
// Extraction schema (output of Ollama LLM call)
// This is what the LLM returns when we pass a note for extraction.

export const ExtractedActionItem = z.object({
	description: z.string(),
	ownerName: z.string().optional(),
	dueDateText: z.string().optional(), // "sexta", "amanhã 14h", "2026-05-15"
	priority: Priority.optional(),
});

export const ExtractedCommitment = z.object({
	text: z.string(),
	madeByName: z.string(),
	madeToName: z.string(),
	dueDateText: z.string().optional(),
	weight: z.enum(["low", "medium", "high"]).default("medium"),
});

export const ExtractedTheme = z.object({
	name: z.string(),
	sentiment: ThemeSentiment,
});

export const ExtractedDecision = z.object({
	text: z.string(),
	rationale: z.string().optional(),
});

export const ExtractionResult = z.object({
	people: z.array(z.string()).default([]), // names mentioned
	actionItems: z.array(ExtractedActionItem).default([]),
	commitments: z.array(ExtractedCommitment).default([]),
	themes: z.array(ExtractedTheme).default([]),
	decisions: z.array(ExtractedDecision).default([]),
	noteType: z
		.enum([
			"daily",
			"1on1",
			"coaching",
			"meeting",
			"weekly-status",
			"raid",
			"incident",
			"adr",
			"paper",
			"course",
			"person",
			"project",
			"theme",
			"other",
		])
		.default("other"),
	summary: z.string().optional(), // 1-line summary
});

export type ExtractionResultT = z.infer<typeof ExtractionResult>;

// ──────────────────────────────────────────────────────────────────────
// Knowledge Graph (the JSON we persist)

export const KnowledgeGraph = z.object({
	version: z.literal(1).default(1),
	updatedAt: z.string(),
	people: z.array(Person).default([]),
	sessions: z.array(Session).default([]),
	actionItems: z.array(ActionItem).default([]),
	commitments: z.array(Commitment).default([]),
	themes: z.array(Theme).default([]),
	goals: z.array(Goal).default([]),
	projects: z.array(Project).default([]),
	risks: z.array(Risk).default([]),
	// v0.5
	systems: z.array(System).default([]),
	products: z.array(Product).default([]),
	roles: z.array(Role).default([]),
	// v0.7 Sprint 19
	courses: z.array(Course).default([]),
});

export type KnowledgeGraphT = z.infer<typeof KnowledgeGraph>;
export type PersonT = z.infer<typeof Person>;
export type SessionT = z.infer<typeof Session>;
export type ActionItemT = z.infer<typeof ActionItem>;
export type CommitmentT = z.infer<typeof Commitment>;
export type ThemeT = z.infer<typeof Theme>;
export type GoalT = z.infer<typeof Goal>;
export type ProjectT = z.infer<typeof Project>;
export type RiskT = z.infer<typeof Risk>;

export function emptyGraph(): KnowledgeGraphT {
	return {
		version: 1,
		updatedAt: new Date().toISOString(),
		people: [],
		sessions: [],
		actionItems: [],
		commitments: [],
		themes: [],
		goals: [],
		projects: [],
		risks: [],
		systems: [],
		products: [],
		roles: [],
		courses: [],
	};
}

export function slugify(name: string): string {
	return name
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}
