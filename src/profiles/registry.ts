/**
 * Atlas Profile Registry — 15 perfis profissionais.
 *
 * Cada perfil define:
 *   - Templates priorizados (subset do TemplateStore)
 *   - Tools IA disponíveis (filtra Lab → Tools IA)
 *   - Frameworks sugeridos (mostrados em chat suggestions)
 *   - Métricas relevantes (para Analytics tab)
 *   - Defaults (briefing time, color theme, etc)
 *
 * User pode escolher 1+ perfis no onboarding (multi-select).
 * Híbrido = combinação de tools/templates de múltiplos perfis.
 */

export type ProfileId =
	| "ti-eng"           // TI / Engenharia de Software
	| "ti-coord"         // Coordenador TI
	| "produto"          // Produto / PM
	| "design"           // Design / UX
	| "marketing"
	| "vendas"
	| "coach"
	| "rh"               // RH / People
	| "financeiro"       // Financeiro / Controller
	| "juridico"         // Jurídico / Compliance
	| "saude"
	| "educacao"
	| "pesquisa"         // Pesquisa / Acadêmico
	| "estudante"
	| "personal";        // Pessoal / autodidata genérico

export interface ProfileMetric {
	id: string;
	label: string;
	type: "count" | "percent" | "duration" | "rag" | "currency";
	source: string; // de onde vem (KG, frontmatter, etc)
}

export interface ProfileDefaults {
	briefingTime: string;     // "07:00"
	weeklyDay: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
	weeklyTime: string;       // "16:00"
	eveningReviewTime: string;
	notificationSeverity: "low" | "medium" | "high";
	colorAccent: string;      // CSS color name or hex
	folderPrefix?: string;    // ex: "TI/" — prefixa folders Atlas
}

export interface Profile {
	id: ProfileId;
	name: string;
	emoji: string;
	tagline: string;
	description: string;
	templates: string[];       // template IDs (existentes ou planejados)
	tools: string[];           // tool IDs disponíveis na Lab tab Tools IA
	frameworks: string[];      // mostrados como sugestões
	metrics: ProfileMetric[];
	defaults: ProfileDefaults;
}

export const PROFILES: Profile[] = [
	{
		id: "ti-eng",
		name: "TI / Eng. Software",
		emoji: "💻",
		tagline: "Dev, arquiteto, SRE, eng. de plataforma",
		description: "Análise técnica, ADR, runbooks, postmortems, code reviews, arquitetura.",
		templates: [
			"adr",
			"rfc",
			"runbook",
			"postmortem",
			"sprint-planning",
			"team-retro",
			"team-standup",
			"incident-bridge",
		],
		tools: [
			"reasoning",
			"architecture-diagram",
			"adr-generator",
			"tech-debt-scanner",
			"flow-chart-gen",
			"api-doc-extractor",
			"runbook-generator",
			"postmortem-builder",
			"context-collapse",
			"pre-mortem",
			"capacity-planner",
		],
		frameworks: ["Scrum", "Kanban", "DDD", "C4 Model", "12-Factor App", "SRE", "DORA"],
		metrics: [
			{ id: "velocity", label: "Velocity (story points/sprint)", type: "count", source: "kg.actions" },
			{ id: "lead-time", label: "Lead time", type: "duration", source: "kg.commitments" },
			{ id: "mttr", label: "MTTR", type: "duration", source: "incidents" },
			{ id: "deploy-freq", label: "Deploy frequency", type: "count", source: "frontmatter:deploy" },
		],
		defaults: {
			briefingTime: "08:00",
			weeklyDay: "friday",
			weeklyTime: "17:00",
			eveningReviewTime: "18:00",
			notificationSeverity: "medium",
			colorAccent: "#7c3aed", // purple
		},
	},
	{
		id: "ti-coord",
		name: "Coordenador TI",
		emoji: "🎯",
		tagline: "Gerente de equipe TI, portfolio, stakeholders",
		description: "Gerência time + portfolio + compliance (BACEN/LGPD/SOX). Weekly reports executivos.",
		templates: [
			"weekly-status",
			"executive-1pager",
			"capacity-plan",
			"raid-entry",
			"adr",
			"vendor-review",
			"qbr",
			"stakeholder-update",
			"1on1-grow",
			"team-retro",
			"decision-meeting",
		],
		tools: [
			"reasoning",
			"manager-readme",
			"context-collapse",
			"pre-mortem",
			"decision-diary",
			"year-in-review",
			"capacity-planner",
			"architecture-diagram",
			"runbook-generator",
			"postmortem-builder",
			"podcast",
		],
		frameworks: ["OKRs", "RAID", "DORA", "BACEN", "ITIL", "9-Box", "Eisenhower"],
		metrics: [
			{ id: "rag-status", label: "RAG status portfolio", type: "rag", source: "kg.projects" },
			{ id: "okr-pace", label: "OKR pace", type: "percent", source: "kg.okrs" },
			{ id: "team-capacity", label: "Team capacity", type: "percent", source: "kg.people" },
			{ id: "open-risks", label: "Open risks", type: "count", source: "raid" },
		],
		defaults: {
			briefingTime: "07:00",
			weeklyDay: "friday",
			weeklyTime: "16:00",
			eveningReviewTime: "18:00",
			notificationSeverity: "medium",
			colorAccent: "#0ea5e9", // sky blue
		},
	},
	{
		id: "produto",
		name: "Produto / PM",
		emoji: "🎨",
		tagline: "Product Manager, Product Owner, PMM",
		description: "PRDs, OKRs, customer interviews, A/B tests, roadmap. North Star + JTBD.",
		templates: [
			"prd",
			"okr",
			"customer-interview",
			"feature-retro",
			"roadmap",
			"discovery-summary",
			"weekly-status",
		],
		tools: [
			"reasoning",
			"context-collapse",
			"user-story-gen",
			"north-star-analyzer",
			"ab-test-designer",
			"pre-mortem",
			"decision-diary",
		],
		frameworks: ["Continuous Discovery", "JTBD", "RICE", "ICE", "North Star Framework", "Lean Canvas"],
		metrics: [
			{ id: "nps", label: "NPS", type: "count", source: "frontmatter:nps" },
			{ id: "retention", label: "Retention", type: "percent", source: "frontmatter:retention" },
			{ id: "activation", label: "Activation rate", type: "percent", source: "frontmatter:activation" },
		],
		defaults: {
			briefingTime: "09:00",
			weeklyDay: "friday",
			weeklyTime: "15:00",
			eveningReviewTime: "18:00",
			notificationSeverity: "medium",
			colorAccent: "#f97316", // orange
		},
	},
	{
		id: "design",
		name: "Design / UX",
		emoji: "🎭",
		tagline: "UX, UI, Product Designer, Researcher",
		description: "Design briefs, usability tests, personas, design systems, A11y audits.",
		templates: [
			"design-brief",
			"usability-test",
			"design-review",
			"persona",
			"customer-interview",
			"feature-retro",
		],
		tools: [
			"persona-gen",
			"usability-heuristic",
			"a11y-audit",
			"reasoning",
			"context-collapse",
		],
		frameworks: ["Double Diamond", "JTBD", "Heurísticas Nielsen", "WCAG", "Atomic Design"],
		metrics: [
			{ id: "task-success", label: "Task success rate", type: "percent", source: "frontmatter:task_success" },
			{ id: "sus", label: "SUS score", type: "count", source: "frontmatter:sus" },
		],
		defaults: {
			briefingTime: "09:00",
			weeklyDay: "friday",
			weeklyTime: "16:00",
			eveningReviewTime: "18:00",
			notificationSeverity: "low",
			colorAccent: "#ec4899", // pink
		},
	},
	{
		id: "marketing",
		name: "Marketing",
		emoji: "📢",
		tagline: "Growth, content, brand, performance, demand",
		description: "Campanhas, brand book, content calendar, SEO, performance.",
		templates: [
			"campaign-brief",
			"brand-book",
			"content-calendar",
			"campaign-retro",
			"weekly-status",
			"customer-interview",
		],
		tools: [
			"audience-segmentation",
			"content-gap-analyzer",
			"seo-outline-gen",
			"reasoning",
			"context-collapse",
			"year-in-review",
		],
		frameworks: ["AIDA", "RACE", "Content Marketing Funnel", "STDC", "Jobs to be Done"],
		metrics: [
			{ id: "cpa", label: "CPA", type: "currency", source: "frontmatter:cpa" },
			{ id: "ltv", label: "LTV", type: "currency", source: "frontmatter:ltv" },
			{ id: "ctr", label: "CTR", type: "percent", source: "frontmatter:ctr" },
			{ id: "engagement", label: "Engagement rate", type: "percent", source: "frontmatter:engagement" },
		],
		defaults: {
			briefingTime: "09:00",
			weeklyDay: "monday",
			weeklyTime: "10:00",
			eveningReviewTime: "18:00",
			notificationSeverity: "low",
			colorAccent: "#ef4444", // red
		},
	},
	{
		id: "vendas",
		name: "Vendas / Sales",
		emoji: "💼",
		tagline: "Account exec, BDR, sales manager, KAM",
		description: "Pipeline, deal review, account plans, QBRs com clientes.",
		templates: [
			"account-plan",
			"deal-review",
			"pipeline-review",
			"qbr",
			"client-call",
			"weekly-status",
		],
		tools: [
			"pipeline-analyzer",
			"deal-risk-scorer",
			"email-followup-gen",
			"reasoning",
			"context-collapse",
		],
		frameworks: ["MEDDIC", "BANT", "Challenger", "SPIN", "Sandler"],
		metrics: [
			{ id: "pipeline-coverage", label: "Pipeline coverage", type: "percent", source: "frontmatter:coverage" },
			{ id: "win-rate", label: "Win rate", type: "percent", source: "frontmatter:win_rate" },
			{ id: "acv", label: "ACV", type: "currency", source: "frontmatter:acv" },
		],
		defaults: {
			briefingTime: "07:30",
			weeklyDay: "friday",
			weeklyTime: "17:00",
			eveningReviewTime: "18:00",
			notificationSeverity: "high",
			colorAccent: "#10b981", // emerald
		},
	},
	{
		id: "coach",
		name: "Coach Profissional",
		emoji: "🌱",
		tagline: "Executive coach, life coach, ICF practitioner",
		description: "1:1 com coachees, GROW/CLEAR, padrões temáticos, progresso.",
		templates: [
			"coaching-session",
			"1on1-grow",
			"1on1-clear",
			"coachee-progress",
			"theme-recap",
		],
		tools: [
			"theme-detector",
			"grow-flow-guide",
			"socratic-questions",
			"context-collapse",
			"reasoning",
			"year-in-review",
		],
		frameworks: ["GROW", "CLEAR", "ICF Core Competencies", "Co-Active", "Solution-Focused"],
		metrics: [
			{ id: "session-frequency", label: "Sessões / coachee", type: "count", source: "kg.sessions" },
			{ id: "goal-achievement", label: "Goals achieved", type: "percent", source: "kg.goals" },
			{ id: "themes-active", label: "Temas ativos", type: "count", source: "kg.themes" },
		],
		defaults: {
			briefingTime: "08:00",
			weeklyDay: "sunday",
			weeklyTime: "20:00",
			eveningReviewTime: "21:00",
			notificationSeverity: "low",
			colorAccent: "#84cc16", // lime
		},
	},
	{
		id: "rh",
		name: "RH / People",
		emoji: "🤝",
		tagline: "HRBP, recruiting, people ops, L&D",
		description: "1:1 manager, performance review, hiring, engagement, talent map.",
		templates: [
			"1on1-manager",
			"performance-review",
			"hiring-brief",
			"interview",
			"exit-interview",
			"engagement-survey-recap",
		],
		tools: [
			"talent-map-gen",
			"comp-framework",
			"engagement-analyzer",
			"reasoning",
			"context-collapse",
		],
		frameworks: ["9-Box", "OKR pessoal", "STAR (entrevista)", "DEI"],
		metrics: [
			{ id: "retention", label: "Retention", type: "percent", source: "frontmatter:retention" },
			{ id: "engagement", label: "Engagement score", type: "count", source: "frontmatter:engagement" },
			{ id: "time-to-hire", label: "Time-to-hire", type: "duration", source: "frontmatter:tth" },
		],
		defaults: {
			briefingTime: "09:00",
			weeklyDay: "friday",
			weeklyTime: "16:00",
			eveningReviewTime: "18:00",
			notificationSeverity: "medium",
			colorAccent: "#06b6d4", // cyan
		},
	},
	{
		id: "financeiro",
		name: "Financeiro / Controller",
		emoji: "📊",
		tagline: "FP&A, Controller, CFO, Treasurer",
		description: "Monthly close, budget, forecast, audit, fluxo de caixa.",
		templates: [
			"monthly-close",
			"budget-review",
			"forecast",
			"audit-prep",
			"variance-analysis",
			"cash-flow-projection",
		],
		tools: [
			"variance-analyzer",
			"cashflow-projection",
			"audit-trail-builder",
			"reasoning",
			"pre-mortem",
		],
		frameworks: ["DRE", "Fluxo de caixa", "KPI Tree", "13-week Forecast"],
		metrics: [
			{ id: "budget-variance", label: "Budget variance", type: "percent", source: "frontmatter:variance" },
			{ id: "runway", label: "Runway", type: "duration", source: "frontmatter:runway" },
			{ id: "gross-margin", label: "Gross margin", type: "percent", source: "frontmatter:gm" },
		],
		defaults: {
			briefingTime: "07:30",
			weeklyDay: "friday",
			weeklyTime: "16:00",
			eveningReviewTime: "18:00",
			notificationSeverity: "high",
			colorAccent: "#22c55e", // green
		},
	},
	{
		id: "juridico",
		name: "Jurídico / Compliance",
		emoji: "⚖️",
		tagline: "Lawyer, legal counsel, compliance officer, DPO",
		description: "Contract review, compliance LGPD/BACEN/SOX, risk register.",
		templates: [
			"contract-review",
			"compliance-checklist",
			"case-brief",
			"bacen-evidence",
			"risk-register",
			"dpo-report",
		],
		tools: [
			"clause-comparator",
			"compliance-gap-analyzer",
			"risk-register-builder",
			"reasoning",
			"context-collapse",
		],
		frameworks: ["LGPD", "BACEN 4.893", "SOX", "ISO27001", "GDPR"],
		metrics: [
			{ id: "open-findings", label: "Findings abertos", type: "count", source: "frontmatter:findings" },
			{ id: "time-to-close", label: "Time-to-close", type: "duration", source: "frontmatter:ttc" },
		],
		defaults: {
			briefingTime: "09:00",
			weeklyDay: "friday",
			weeklyTime: "17:00",
			eveningReviewTime: "18:00",
			notificationSeverity: "high",
			colorAccent: "#475569", // slate
		},
	},
	{
		id: "saude",
		name: "Saúde",
		emoji: "🩺",
		tagline: "Médico, psicólogo, terapeuta, profissional de saúde",
		description: "SOAP, paciente followup, care plan, sessão clínica.",
		templates: [
			"soap",
			"patient-followup",
			"care-plan",
			"clinical-session",
			"intake-form",
		],
		tools: [
			"symptom-tracker",
			"differential-helper",
			"reasoning",
			"context-collapse",
		],
		frameworks: ["SOAP", "ICF (saúde)", "Evidence-Based Practice"],
		metrics: [
			{ id: "adherence", label: "Adherence", type: "percent", source: "frontmatter:adherence" },
			{ id: "outcome", label: "Outcome metrics", type: "count", source: "frontmatter:outcome" },
		],
		defaults: {
			briefingTime: "07:00",
			weeklyDay: "friday",
			weeklyTime: "17:00",
			eveningReviewTime: "18:00",
			notificationSeverity: "medium",
			colorAccent: "#dc2626", // red-600
		},
	},
	{
		id: "educacao",
		name: "Educação",
		emoji: "📚",
		tagline: "Professor, instructional designer, mentor",
		description: "Lesson plan, student progress, parent meeting, rubrics.",
		templates: [
			"lesson-plan",
			"student-progress",
			"parent-meeting",
			"grading-rubric",
			"course-syllabus",
		],
		tools: [
			"lesson-designer",
			"misconception-detector",
			"rubric-generator",
			"reasoning",
		],
		frameworks: ["Bloom's Taxonomy", "ZPD (Vygotsky)", "Backwards Design", "UDL"],
		metrics: [
			{ id: "mastery", label: "Mastery %", type: "percent", source: "frontmatter:mastery" },
			{ id: "engagement-edu", label: "Engagement", type: "percent", source: "frontmatter:engagement" },
		],
		defaults: {
			briefingTime: "06:30",
			weeklyDay: "friday",
			weeklyTime: "16:00",
			eveningReviewTime: "18:00",
			notificationSeverity: "low",
			colorAccent: "#a855f7", // purple-500
		},
	},
	{
		id: "pesquisa",
		name: "Pesquisa / Acadêmico",
		emoji: "🔬",
		tagline: "Pesquisador, mestrando, doutorando, cientista",
		description: "Paper notes, lit review, hipóteses, experimentos.",
		templates: [
			"paper-note",
			"literature-review",
			"hypothesis-log",
			"experiment-plan",
			"thesis-chapter",
		],
		tools: [
			"lit-gap-finder",
			"citation-network",
			"hypothesis-tracker",
			"reasoning",
			"context-collapse",
		],
		frameworks: ["Scientific Method", "IMRaD", "PRISMA", "Cornell notes"],
		metrics: [
			{ id: "citations", label: "Citações", type: "count", source: "kg.citations" },
			{ id: "papers-read", label: "Papers lidos", type: "count", source: "kg.papers" },
		],
		defaults: {
			briefingTime: "09:00",
			weeklyDay: "monday",
			weeklyTime: "10:00",
			eveningReviewTime: "20:00",
			notificationSeverity: "low",
			colorAccent: "#0891b2", // cyan-600
		},
	},
	{
		id: "estudante",
		name: "Estudante",
		emoji: "🎓",
		tagline: "MBA, certificações, autodidata, vestibular",
		description: "Class notes, exam prep, papers, projetos, flashcards FSRS.",
		templates: [
			"class-note",
			"exam-prep",
			"paper-note",
			"project-plan",
			"course-overview",
		],
		tools: [
			"active-recall-gen",
			"spaced-rep",
			"concept-mapper",
			"socratic-questions",
			"reasoning",
		],
		frameworks: ["Pomodoro", "Cornell", "Feynman Technique", "Active Recall", "Spaced Repetition"],
		metrics: [
			{ id: "retention-rate", label: "Retention rate", type: "percent", source: "flashcards" },
			{ id: "study-streak", label: "Study streak", type: "count", source: "daily-logs" },
			{ id: "courses-active", label: "Cursos ativos", type: "count", source: "kg.courses" },
		],
		defaults: {
			briefingTime: "08:00",
			weeklyDay: "sunday",
			weeklyTime: "20:00",
			eveningReviewTime: "21:00",
			notificationSeverity: "low",
			colorAccent: "#14b8a6", // teal
		},
	},
	{
		id: "personal",
		name: "Pessoal",
		emoji: "🌿",
		tagline: "Uso pessoal, organização, hábitos, journaling",
		description: "Journaling, hábitos, projetos pessoais, finanças domésticas.",
		templates: [
			"daily-log",
			"habit-tracker",
			"weekly-review",
			"project-plan",
		],
		tools: [
			"reasoning",
			"context-collapse",
			"year-in-review",
			"theme-detector",
		],
		frameworks: ["GTD", "Bullet Journal", "Atomic Habits", "Pomodoro"],
		metrics: [
			{ id: "habit-streak", label: "Habit streaks", type: "count", source: "frontmatter:habit" },
			{ id: "journal-streak", label: "Journal streak", type: "count", source: "daily-logs" },
		],
		defaults: {
			briefingTime: "08:00",
			weeklyDay: "sunday",
			weeklyTime: "10:00",
			eveningReviewTime: "21:00",
			notificationSeverity: "low",
			colorAccent: "#fbbf24", // amber
		},
	},
];

export function findProfile(id: ProfileId): Profile | undefined {
	return PROFILES.find((p) => p.id === id);
}

/**
 * Combina N perfis num único toolset (uniao de templates/tools/frameworks).
 * Defaults: usa do PRIMEIRO perfil (presumivelmente o principal).
 */
export function mergeProfiles(ids: ProfileId[]): {
	templates: string[];
	tools: string[];
	frameworks: string[];
	defaults: ProfileDefaults;
	metrics: ProfileMetric[];
} {
	const profiles = ids.map((id) => findProfile(id)).filter(Boolean) as Profile[];
	if (profiles.length === 0) {
		throw new Error("Atlas: nenhum perfil válido informado.");
	}

	const templates = Array.from(new Set(profiles.flatMap((p) => p.templates)));
	const tools = Array.from(new Set(profiles.flatMap((p) => p.tools)));
	const frameworks = Array.from(new Set(profiles.flatMap((p) => p.frameworks)));
	const metrics = profiles.flatMap((p) => p.metrics);
	const defaults = profiles[0].defaults; // primary profile defaults

	return { templates, tools, frameworks, defaults, metrics };
}

/**
 * Lista perfis agrupados por categoria semântica (para grid no onboarding).
 */
export const PROFILE_CATEGORIES: { label: string; ids: ProfileId[] }[] = [
	{ label: "Tech", ids: ["ti-eng", "ti-coord"] },
	{ label: "Negócio", ids: ["produto", "marketing", "vendas"] },
	{ label: "Pessoas", ids: ["coach", "rh"] },
	{ label: "Operações", ids: ["financeiro", "juridico"] },
	{ label: "Conhecimento", ids: ["pesquisa", "educacao", "estudante"] },
	{ label: "Outros", ids: ["design", "saude", "personal"] },
];
