/**
 * Atlas Model Catalog — modelos curados e seus requisitos.
 *
 * Usado por:
 *   - Onboarding Tela 6 (recomendar stack baseado em RAM detectada)
 *   - Status tab → Model Catalog sub-view (browse + pull manual)
 *   - Settings → Ollama → dropdown de modelos pré-validados
 *
 * Cada modelo: nome (Ollama tag), tamanho RAM estimado, tipo, qualidade PT-BR.
 */

export type ModelCategory =
	| "tiny" // ≤ 2 GB RAM
	| "light" // 4-6 GB RAM
	| "balanced" // 6-8 GB RAM
	| "quality" // 12-16 GB RAM
	| "pro"; // 24+ GB RAM

export type ModelKind =
	| "generation" // chat, summarization
	| "small" // auto-tag, classification (faster)
	| "reasoning" // chain-of-thought, RCA
	| "vision" // multimodal
	| "embeddings"
	| "reranker";

export interface CatalogModel {
	/** Ollama tag exato (ex: "qwen2.5:7b-instruct") */
	tag: string;
	/** Display name */
	name: string;
	/** Categoria por consumo de RAM */
	category: ModelCategory;
	/** Tipo */
	kind: ModelKind;
	/** RAM estimada quando carregado em GB */
	ramGB: number;
	/** Tamanho de download em GB */
	downloadGB: number;
	/** Janela de contexto (tokens) */
	contextK: number;
	/** Suporte a function calling / structured output */
	supportsTools: boolean;
	/** Qualidade PT-BR: 1-5 */
	ptBrQuality: 1 | 2 | 3 | 4 | 5;
	/** Recomendado por padrão pra esta categoria? */
	recommended?: boolean;
	/** Descrição curta do uso ideal */
	description: string;
}

export const CATALOG: CatalogModel[] = [
	// ─── TINY (≤ 2 GB) — funciona em qualquer máquina ───
	{
		tag: "qwen2.5:0.5b",
		name: "Qwen 2.5 — 0.5B",
		category: "tiny",
		kind: "small",
		ramGB: 1.5,
		downloadGB: 0.4,
		contextK: 32,
		supportsTools: true,
		ptBrQuality: 3,
		description: "Ultra-leve. Boa pra auto-tag e classificação rápida.",
	},
	{
		tag: "llama3.2:1b",
		name: "Llama 3.2 — 1B",
		category: "tiny",
		kind: "small",
		ramGB: 1.8,
		downloadGB: 0.7,
		contextK: 128,
		supportsTools: true,
		ptBrQuality: 3,
		recommended: true,
		description: "Meta. Contexto 128k em 1B — espantosamente bom pro tamanho.",
	},
	{
		tag: "gemma2:2b",
		name: "Gemma 2 — 2B",
		category: "tiny",
		kind: "small",
		ramGB: 2.2,
		downloadGB: 1.6,
		contextK: 8,
		supportsTools: false,
		ptBrQuality: 3,
		description: "Google. PT-BR razoável. Sem tool calling.",
	},

	// ─── LIGHT (4-6 GB) — perfil 8 GB RAM (amigo do user) ───
	{
		tag: "qwen2.5:1.5b",
		name: "Qwen 2.5 — 1.5B",
		category: "light",
		kind: "small",
		ramGB: 2.5,
		downloadGB: 0.9,
		contextK: 32,
		supportsTools: true,
		ptBrQuality: 3,
		recommended: true,
		description: "Sweet spot pra tarefas leves: auto-tag, classificação intent.",
	},
	{
		tag: "llama3.2:3b",
		name: "Llama 3.2 — 3B",
		category: "light",
		kind: "generation",
		ramGB: 3.5,
		downloadGB: 2.0,
		contextK: 128,
		supportsTools: true,
		ptBrQuality: 4,
		description: "Geração balanceada com contexto longo. Boa pra chat curto.",
	},
	{
		tag: "phi4-mini",
		name: "Phi-4 Mini — 3.8B",
		category: "light",
		kind: "generation",
		ramGB: 4.5,
		downloadGB: 2.4,
		contextK: 128,
		supportsTools: true,
		ptBrQuality: 4,
		recommended: true,
		description: "Microsoft. Excelente raciocínio pro tamanho. CoT viável.",
	},

	// ─── BALANCED (6-8 GB) — sweet spot 16 GB RAM ───
	{
		tag: "qwen2.5:7b-instruct",
		name: "Qwen 2.5 — 7B",
		category: "balanced",
		kind: "generation",
		ramGB: 5.0,
		downloadGB: 4.4,
		contextK: 128,
		supportsTools: true,
		ptBrQuality: 5,
		recommended: true,
		description: "Melhor PT-BR <10B. Default Atlas em 16+ GB RAM.",
	},
	{
		tag: "llama3.1:8b-instruct-q4_K_M",
		name: "Llama 3.1 — 8B",
		category: "balanced",
		kind: "generation",
		ramGB: 5.5,
		downloadGB: 4.7,
		contextK: 128,
		supportsTools: true,
		ptBrQuality: 4,
		description: "Meta flagship pequeno. Tool calling robusto.",
	},

	// ─── QUALITY (12-16 GB) — 32 GB RAM ───
	{
		tag: "qwen2.5:14b",
		name: "Qwen 2.5 — 14B",
		category: "quality",
		kind: "generation",
		ramGB: 9.0,
		downloadGB: 8.2,
		contextK: 128,
		supportsTools: true,
		ptBrQuality: 5,
		recommended: true,
		description: "Geração premium PT-BR. Recomendado em 32+ GB RAM.",
	},
	{
		tag: "qwen2.5-coder:14b",
		name: "Qwen 2.5 Coder — 14B",
		category: "quality",
		kind: "generation",
		ramGB: 9.0,
		downloadGB: 8.2,
		contextK: 128,
		supportsTools: true,
		ptBrQuality: 4,
		description: "Especialista em código. Para Architecture diagrams + ADRs (perfil TI).",
	},
	{
		tag: "phi4",
		name: "Phi-4 — 14B",
		category: "quality",
		kind: "reasoning",
		ramGB: 9.5,
		downloadGB: 8.4,
		contextK: 16,
		supportsTools: true,
		ptBrQuality: 4,
		description: "Microsoft. Reasoning forte (rivaliza R1). Use Pre-mortem e RCA.",
	},

	// ─── PRO (24+ GB) — workstations / server ───
	{
		tag: "qwen2.5:32b",
		name: "Qwen 2.5 — 32B",
		category: "pro",
		kind: "generation",
		ramGB: 20,
		downloadGB: 19,
		contextK: 128,
		supportsTools: true,
		ptBrQuality: 5,
		description: "Top tier geração. Apenas máquinas 32+ GB RAM com folga.",
	},
	{
		tag: "qwen2.5-coder:32b",
		name: "Qwen 2.5 Coder — 32B",
		category: "pro",
		kind: "generation",
		ramGB: 20,
		downloadGB: 19,
		contextK: 128,
		supportsTools: true,
		ptBrQuality: 4,
		description: "Top tier código. Para análise técnica profunda em projetos grandes.",
	},

	// ─── EMBEDDINGS ───
	{
		tag: "bge-m3",
		name: "BGE-M3 (PT-BR)",
		category: "light",
		kind: "embeddings",
		ramGB: 2.3,
		downloadGB: 1.2,
		contextK: 8,
		supportsTools: false,
		ptBrQuality: 5,
		recommended: true,
		description: "Embeddings multi-língua, melhor PT-BR open. Default Atlas.",
	},
	{
		tag: "snowflake-arctic-embed:l",
		name: "Snowflake Arctic Embed L",
		category: "light",
		kind: "embeddings",
		ramGB: 1.8,
		downloadGB: 0.7,
		contextK: 8,
		supportsTools: false,
		ptBrQuality: 4,
		description: "Alternativa leve. Melhor pra inglês.",
	},

	// ─── RERANKER ───
	{
		tag: "linux6200/bge-reranker-v2-m3",
		name: "BGE Reranker v2 M3",
		category: "light",
		kind: "reranker",
		ramGB: 1.5,
		downloadGB: 0.6,
		contextK: 8,
		supportsTools: false,
		ptBrQuality: 5,
		description: "Reranker para top-K precision. Carregado sob demanda.",
	},

	// ─── VISION (opt-in, RAM expensive) ───
	{
		tag: "llama3.2-vision:11b",
		name: "Llama 3.2 Vision — 11B",
		category: "balanced",
		kind: "vision",
		ramGB: 8.0,
		downloadGB: 7.8,
		contextK: 128,
		supportsTools: false,
		ptBrQuality: 3,
		description: "Multimodal. Whiteboard OCR, screenshots → markdown. Opt-in.",
	},
];

/**
 * Recomenda 3 modelos (small + generation + embeddings) baseado em RAM livre.
 */
export function recommendStack(freeRamGB: number): {
	small: CatalogModel;
	generation: CatalogModel;
	embeddings: CatalogModel;
	totalRamGB: number;
	totalDownloadGB: number;
} {
	const fallbackSmall = findByTag("qwen2.5:0.5b") ?? CATALOG[0];
	const small = pickByConstraints(freeRamGB, "small") ?? fallbackSmall;
	const generation = pickByConstraints(freeRamGB, "generation") ?? small;
	const embeddings =
		findByTag("bge-m3") ??
		CATALOG.find((m) => m.kind === "embeddings");

	if (!embeddings) {
		throw new Error("Atlas: nenhum modelo de embeddings disponível no catálogo.");
	}

	return {
		small,
		generation,
		embeddings,
		totalRamGB: Math.max(small.ramGB, generation.ramGB, embeddings.ramGB),
		totalDownloadGB: small.downloadGB + generation.downloadGB + embeddings.downloadGB,
	};
}

function pickByConstraints(freeRamGB: number, kind: ModelKind): CatalogModel | undefined {
	// Buffer 30% pra OS + outros apps
	const usableRam = freeRamGB * 0.7;
	const candidates = CATALOG.filter(
		(m) => m.kind === kind && m.ramGB <= usableRam
	);
	// Pega o melhor (maior) que cabe + recommended priority
	candidates.sort((a, b) => {
		if (a.recommended && !b.recommended) return -1;
		if (!a.recommended && b.recommended) return 1;
		return b.ramGB - a.ramGB;
	});
	return candidates[0];
}

export function findByTag(tag: string): CatalogModel | undefined {
	return CATALOG.find((m) => m.tag === tag);
}

export function listByCategory(category: ModelCategory): CatalogModel[] {
	return CATALOG.filter((m) => m.category === category);
}

export function listByKind(kind: ModelKind): CatalogModel[] {
	return CATALOG.filter((m) => m.kind === kind);
}

export const CATEGORY_META: Record<ModelCategory, { label: string; icon: string; ramRange: string }> = {
	tiny: { label: "Tiny", icon: "🐝", ramRange: "≤ 2 GB RAM" },
	light: { label: "Light", icon: "🪶", ramRange: "4-6 GB RAM" },
	balanced: { label: "Balanced", icon: "⚖️", ramRange: "6-8 GB RAM" },
	quality: { label: "Quality", icon: "💎", ramRange: "12-16 GB RAM" },
	pro: { label: "Pro", icon: "🚀", ramRange: "24+ GB RAM" },
};

export const KIND_META: Record<ModelKind, { label: string; icon: string }> = {
	generation: { label: "Geração", icon: "✨" },
	small: { label: "Leve / Classificação", icon: "🏷️" },
	reasoning: { label: "Reasoning / CoT", icon: "🧠" },
	vision: { label: "Visão / OCR", icon: "👁️" },
	embeddings: { label: "Embeddings", icon: "🔢" },
	reranker: { label: "Reranker", icon: "🎯" },
};
