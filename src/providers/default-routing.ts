/**
 * Atlas v0.21 — Default routing recommendations per provider.
 *
 * Quando user cola uma API key e quer ativar IA paga, Atlas sugere routing
 * "balanceado" (equilíbrio custo×qualidade) por provider. User confirma + aplica.
 */

import type { TaskRouting } from "./router";

export interface DefaultRoutingPreset {
	provider: string;
	displayName: string;
	tagline: string;
	routing: TaskRouting;
	estimatedMonthlyUSD: { low: number; high: number; assumption: string };
}

/** Routing default por provider — usado quando user cola key e clica "Ativar IA paga" */
export const DEFAULT_ROUTING_BY_PROVIDER: Record<string, DefaultRoutingPreset> = {
	openai: {
		provider: "openai",
		displayName: "OpenAI",
		tagline: "Balanceado: GPT-4o-mini para chat (cheap), GPT-4o pra vision (premium), o1-mini pra reasoning",
		routing: {
			chat: { provider: "openai", model: "gpt-4o-mini" },
			extraction: { provider: "openai", model: "gpt-4o-mini" },
			summarization: { provider: "openai", model: "gpt-4o-mini" },
			vision: { provider: "openai", model: "gpt-4o" },
			reasoning: { provider: "openai", model: "o1-mini" },
			embedding: { provider: "openai", model: "text-embedding-3-small" },
		},
		estimatedMonthlyUSD: {
			low: 1,
			high: 8,
			assumption: "Uso moderado: 50 chats/dia + 500 embeddings/mês",
		},
	},

	anthropic: {
		provider: "anthropic",
		displayName: "Anthropic Claude",
		tagline: "Balanceado: Sonnet 4.6 para chat, Opus 4.7 pra reasoning profundo, Haiku 4.5 pra summarization",
		routing: {
			chat: { provider: "anthropic", model: "claude-sonnet-4-6" },
			extraction: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
			summarization: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
			vision: { provider: "anthropic", model: "claude-sonnet-4-6" },
			reasoning: { provider: "anthropic", model: "claude-opus-4-7" },
			// Anthropic não tem embeddings — fallback Ollama
			embedding: { provider: "ollama", model: "bge-m3" },
		},
		estimatedMonthlyUSD: {
			low: 3,
			high: 15,
			assumption: "Uso moderado: 30 chats Sonnet/dia + 5 reasonings Opus/semana",
		},
	},

	google: {
		provider: "google",
		displayName: "Google Gemini",
		tagline: "Balanceado: Gemini 2.0 Flash pra chat (super barato), 1.5 Pro pra contexts >200k tokens",
		routing: {
			chat: { provider: "google", model: "gemini-2.0-flash" },
			extraction: { provider: "google", model: "gemini-2.0-flash" },
			summarization: { provider: "google", model: "gemini-2.0-flash" },
			vision: { provider: "google", model: "gemini-1.5-pro" },
			reasoning: { provider: "google", model: "gemini-1.5-pro" },
			embedding: { provider: "google", model: "text-embedding-004" },
		},
		estimatedMonthlyUSD: {
			low: 0.5,
			high: 4,
			assumption: "Gemini Flash é mais barato — 50 chats/dia ≈ $1-2/mês",
		},
	},

	mistral: {
		provider: "mistral",
		displayName: "Mistral",
		tagline: "Balanceado: Mistral Small pra chat (eficiente), Mistral Large pra reasoning",
		routing: {
			chat: { provider: "mistral", model: "mistral-small-latest" },
			extraction: { provider: "mistral", model: "mistral-small-latest" },
			summarization: { provider: "mistral", model: "mistral-small-latest" },
			reasoning: { provider: "mistral", model: "mistral-large-latest" },
			embedding: { provider: "mistral", model: "mistral-embed" },
			// Vision — Mistral não tem, mantém Ollama
			vision: { provider: "ollama", model: "llama3.2-vision:11b" },
		},
		estimatedMonthlyUSD: {
			low: 0.5,
			high: 5,
			assumption: "Mistral Small é cheap — uso médio gera ~$1-3/mês",
		},
	},

	xai: {
		provider: "xai",
		displayName: "xAI Grok",
		tagline: "Grok 2 pra chat e reasoning, com vision integrada",
		routing: {
			chat: { provider: "xai", model: "grok-2-1212" },
			extraction: { provider: "xai", model: "grok-2-1212" },
			summarization: { provider: "xai", model: "grok-2-1212" },
			vision: { provider: "xai", model: "grok-2-1212" },
			reasoning: { provider: "xai", model: "grok-2-1212" },
			embedding: { provider: "ollama", model: "bge-m3" },
		},
		estimatedMonthlyUSD: {
			low: 2,
			high: 10,
			assumption: "Grok 2: $2 input / $10 output — uso médio gera $3-7/mês",
		},
	},

	openrouter: {
		provider: "openrouter",
		displayName: "OpenRouter (gateway 300+ models)",
		tagline: "Routing flexível: usa Claude 3.5 Sonnet via OpenRouter (1 key = 300+ models)",
		routing: {
			chat: { provider: "openrouter", model: "anthropic/claude-3.5-sonnet" },
			extraction: { provider: "openrouter", model: "anthropic/claude-3.5-sonnet" },
			summarization: { provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct" },
			vision: { provider: "openrouter", model: "anthropic/claude-3.5-sonnet" },
			reasoning: { provider: "openrouter", model: "anthropic/claude-3.5-sonnet" },
			embedding: { provider: "ollama", model: "bge-m3" },
		},
		estimatedMonthlyUSD: {
			low: 2,
			high: 12,
			assumption: "Sonnet via OpenRouter mesmo preço Anthropic direto",
		},
	},

	groq: {
		provider: "groq",
		displayName: "Groq (LPU inference)",
		tagline: "Llama 3.3 70B com inferência super rápida (LPU custom hardware)",
		routing: {
			chat: { provider: "groq", model: "llama-3.3-70b-versatile" },
			extraction: { provider: "groq", model: "llama-3.3-70b-versatile" },
			summarization: { provider: "groq", model: "mixtral-8x7b-32768" },
			reasoning: { provider: "groq", model: "llama-3.3-70b-versatile" },
			embedding: { provider: "ollama", model: "bge-m3" },
			vision: { provider: "ollama", model: "llama3.2-vision:11b" },
		},
		estimatedMonthlyUSD: {
			low: 1,
			high: 6,
			assumption: "Groq tem free tier generoso + paid muito barato",
		},
	},

	deepseek: {
		provider: "deepseek",
		displayName: "DeepSeek",
		tagline: "DeepSeek V3 pra chat (barato), R1 pra reasoning (state-of-art reasoning local)",
		routing: {
			chat: { provider: "deepseek", model: "deepseek-chat" },
			extraction: { provider: "deepseek", model: "deepseek-chat" },
			summarization: { provider: "deepseek", model: "deepseek-chat" },
			reasoning: { provider: "deepseek", model: "deepseek-reasoner" },
			embedding: { provider: "ollama", model: "bge-m3" },
			vision: { provider: "ollama", model: "llama3.2-vision:11b" },
		},
		estimatedMonthlyUSD: {
			low: 0.3,
			high: 3,
			assumption: "DeepSeek é o mais barato do mercado: $0.27 input / $1.1 output",
		},
	},
};

/** Map field name (e.g. "openaiEncrypted") → provider id ("openai") */
export const FIELD_TO_PROVIDER: Record<string, string> = {
	openaiEncrypted: "openai",
	anthropicEncrypted: "anthropic",
	googleEncrypted: "google",
	mistralEncrypted: "mistral",
	xaiEncrypted: "xai",
	openrouterEncrypted: "openrouter",
	groqEncrypted: "groq",
	deepseekEncrypted: "deepseek",
	cohereEncrypted: "cohere",
};
