/**
 * Atlas v0.17 — Provider model registry with pricing.
 *
 * Pricing in USD per 1M tokens. Updated 2026-05.
 * Keep in sync with provider websites. Cost tracker uses these to compute spend.
 */

import type { ProviderModel } from "./types";

export const PROVIDER_MODELS: ProviderModel[] = [
	// ─── OpenAI ─────────────────────────────────────────────
	{
		id: "gpt-4o",
		name: "GPT-4o",
		provider: "openai",
		capabilities: { chat: true, embed: false, vision: true, streaming: true, toolCalling: true, maxContextTokens: 128_000 },
		pricePer1M: { input: 2.5, output: 10.0, cachedInput: 1.25 },
		contextWindow: 128_000,
		tier: "premium",
	},
	{
		id: "gpt-4o-mini",
		name: "GPT-4o mini",
		provider: "openai",
		capabilities: { chat: true, embed: false, vision: true, streaming: true, toolCalling: true, maxContextTokens: 128_000 },
		pricePer1M: { input: 0.15, output: 0.6, cachedInput: 0.075 },
		contextWindow: 128_000,
		tier: "balanced",
	},
	{
		id: "gpt-4-turbo",
		name: "GPT-4 Turbo",
		provider: "openai",
		capabilities: { chat: true, embed: false, vision: true, streaming: true, toolCalling: true, maxContextTokens: 128_000 },
		pricePer1M: { input: 10.0, output: 30.0 },
		contextWindow: 128_000,
		tier: "premium",
	},
	{
		id: "o1-preview",
		name: "OpenAI o1 (reasoning)",
		provider: "openai",
		capabilities: { chat: true, embed: false, vision: false, streaming: false, toolCalling: false, maxContextTokens: 128_000 },
		pricePer1M: { input: 15.0, output: 60.0 },
		contextWindow: 128_000,
		tier: "premium",
	},
	{
		id: "o1-mini",
		name: "OpenAI o1-mini",
		provider: "openai",
		capabilities: { chat: true, embed: false, vision: false, streaming: false, toolCalling: false, maxContextTokens: 128_000 },
		pricePer1M: { input: 3.0, output: 12.0 },
		contextWindow: 128_000,
		tier: "balanced",
	},
	{
		id: "text-embedding-3-large",
		name: "OpenAI Embedding 3 Large",
		provider: "openai",
		capabilities: { chat: false, embed: true, vision: false, streaming: false, toolCalling: false },
		pricePer1M: { input: 0.13, output: 0 },
		contextWindow: 8_192,
		tier: "premium",
	},
	{
		id: "text-embedding-3-small",
		name: "OpenAI Embedding 3 Small",
		provider: "openai",
		capabilities: { chat: false, embed: true, vision: false, streaming: false, toolCalling: false },
		pricePer1M: { input: 0.02, output: 0 },
		contextWindow: 8_192,
		tier: "balanced",
	},

	// ─── Anthropic ───────────────────────────────────────────
	{
		id: "claude-opus-4-7",
		name: "Claude Opus 4.7 (1M context)",
		provider: "anthropic",
		capabilities: { chat: true, embed: false, vision: true, streaming: true, toolCalling: true, maxContextTokens: 1_000_000 },
		pricePer1M: { input: 15.0, output: 75.0, cachedInput: 1.5 },
		contextWindow: 1_000_000,
		tier: "premium",
	},
	{
		id: "claude-sonnet-4-6",
		name: "Claude Sonnet 4.6",
		provider: "anthropic",
		capabilities: { chat: true, embed: false, vision: true, streaming: true, toolCalling: true, maxContextTokens: 200_000 },
		pricePer1M: { input: 3.0, output: 15.0, cachedInput: 0.3 },
		contextWindow: 200_000,
		tier: "premium",
	},
	{
		id: "claude-haiku-4-5-20251001",
		name: "Claude Haiku 4.5 (fast)",
		provider: "anthropic",
		capabilities: { chat: true, embed: false, vision: true, streaming: true, toolCalling: true, maxContextTokens: 200_000 },
		pricePer1M: { input: 1.0, output: 5.0, cachedInput: 0.1 },
		contextWindow: 200_000,
		tier: "balanced",
	},

	// ─── Google Gemini ───────────────────────────────────────
	{
		id: "gemini-2.0-flash",
		name: "Gemini 2.0 Flash",
		provider: "google",
		capabilities: { chat: true, embed: false, vision: true, streaming: true, toolCalling: true, maxContextTokens: 1_000_000 },
		pricePer1M: { input: 0.075, output: 0.3 },
		contextWindow: 1_000_000,
		tier: "balanced",
	},
	{
		id: "gemini-1.5-pro",
		name: "Gemini 1.5 Pro",
		provider: "google",
		capabilities: { chat: true, embed: false, vision: true, streaming: true, toolCalling: true, maxContextTokens: 2_000_000 },
		pricePer1M: { input: 1.25, output: 5.0 },
		contextWindow: 2_000_000,
		tier: "premium",
	},
	{
		id: "text-embedding-004",
		name: "Google Embedding 004",
		provider: "google",
		capabilities: { chat: false, embed: true, vision: false, streaming: false, toolCalling: false },
		pricePer1M: { input: 0.025, output: 0 },
		contextWindow: 2_048,
		tier: "balanced",
	},

	// ─── Mistral ──────────────────────────────────────────────
	{
		id: "mistral-large-latest",
		name: "Mistral Large",
		provider: "mistral",
		capabilities: { chat: true, embed: false, vision: false, streaming: true, toolCalling: true, maxContextTokens: 128_000 },
		pricePer1M: { input: 2.0, output: 6.0 },
		contextWindow: 128_000,
		tier: "premium",
	},
	{
		id: "mistral-small-latest",
		name: "Mistral Small",
		provider: "mistral",
		capabilities: { chat: true, embed: false, vision: false, streaming: true, toolCalling: true, maxContextTokens: 32_000 },
		pricePer1M: { input: 0.2, output: 0.6 },
		contextWindow: 32_000,
		tier: "balanced",
	},
	{
		id: "mistral-embed",
		name: "Mistral Embed",
		provider: "mistral",
		capabilities: { chat: false, embed: true, vision: false, streaming: false, toolCalling: false },
		pricePer1M: { input: 0.1, output: 0 },
		contextWindow: 8_000,
		tier: "balanced",
	},

	// ─── xAI Grok ─────────────────────────────────────────────
	{
		id: "grok-2-1212",
		name: "Grok 2",
		provider: "xai",
		capabilities: { chat: true, embed: false, vision: true, streaming: true, toolCalling: true, maxContextTokens: 131_072 },
		pricePer1M: { input: 2.0, output: 10.0 },
		contextWindow: 131_072,
		tier: "premium",
	},

	// ─── Groq (fast inference) ───────────────────────────────
	{
		id: "llama-3.3-70b-versatile",
		name: "Llama 3.3 70B (Groq)",
		provider: "groq",
		capabilities: { chat: true, embed: false, vision: false, streaming: true, toolCalling: true, maxContextTokens: 128_000 },
		pricePer1M: { input: 0.59, output: 0.79 },
		contextWindow: 128_000,
		tier: "balanced",
	},
	{
		id: "mixtral-8x7b-32768",
		name: "Mixtral 8x7B (Groq)",
		provider: "groq",
		capabilities: { chat: true, embed: false, vision: false, streaming: true, toolCalling: true, maxContextTokens: 32_768 },
		pricePer1M: { input: 0.24, output: 0.24 },
		contextWindow: 32_768,
		tier: "balanced",
	},

	// ─── DeepSeek (reasoning specialist) ─────────────────────
	{
		id: "deepseek-reasoner",
		name: "DeepSeek R1 (reasoning)",
		provider: "deepseek",
		capabilities: { chat: true, embed: false, vision: false, streaming: true, toolCalling: false, maxContextTokens: 64_000 },
		pricePer1M: { input: 0.55, output: 2.19, cachedInput: 0.14 },
		contextWindow: 64_000,
		tier: "premium",
	},
	{
		id: "deepseek-chat",
		name: "DeepSeek V3",
		provider: "deepseek",
		capabilities: { chat: true, embed: false, vision: false, streaming: true, toolCalling: true, maxContextTokens: 64_000 },
		pricePer1M: { input: 0.27, output: 1.1, cachedInput: 0.07 },
		contextWindow: 64_000,
		tier: "balanced",
	},

	// ─── Cohere ──────────────────────────────────────────────
	{
		id: "command-r-plus",
		name: "Cohere Command R+",
		provider: "cohere",
		capabilities: { chat: true, embed: false, vision: false, streaming: true, toolCalling: true, maxContextTokens: 128_000 },
		pricePer1M: { input: 2.5, output: 10.0 },
		contextWindow: 128_000,
		tier: "premium",
	},
	{
		id: "embed-multilingual-v3.0",
		name: "Cohere Embed v3 (multilingual)",
		provider: "cohere",
		capabilities: { chat: false, embed: true, vision: false, streaming: false, toolCalling: false },
		pricePer1M: { input: 0.1, output: 0 },
		contextWindow: 512,
		tier: "balanced",
	},

	// ─── OpenRouter (gateway — pricing is pass-through) ──────
	// User-provided routes via OpenRouter id format "provider/model"; price varies.
	// We ship a curated list of popular ones with approx pricing.
	{
		id: "anthropic/claude-3.5-sonnet",
		name: "Claude 3.5 Sonnet (via OpenRouter)",
		provider: "openrouter",
		capabilities: { chat: true, embed: false, vision: true, streaming: true, toolCalling: true, maxContextTokens: 200_000 },
		pricePer1M: { input: 3.0, output: 15.0 },
		contextWindow: 200_000,
		tier: "premium",
	},
	{
		id: "openai/gpt-4o",
		name: "GPT-4o (via OpenRouter)",
		provider: "openrouter",
		capabilities: { chat: true, embed: false, vision: true, streaming: true, toolCalling: true, maxContextTokens: 128_000 },
		pricePer1M: { input: 2.5, output: 10.0 },
		contextWindow: 128_000,
		tier: "premium",
	},
	{
		id: "meta-llama/llama-3.3-70b-instruct",
		name: "Llama 3.3 70B (via OpenRouter)",
		provider: "openrouter",
		capabilities: { chat: true, embed: false, vision: false, streaming: true, toolCalling: true, maxContextTokens: 128_000 },
		pricePer1M: { input: 0.13, output: 0.4 },
		contextWindow: 128_000,
		tier: "balanced",
	},

	// ─── Ollama (local — zero cost) ──────────────────────────
	{
		id: "qwen2.5:7b-instruct",
		name: "Qwen 2.5 7B (local)",
		provider: "ollama",
		capabilities: { chat: true, embed: false, vision: false, streaming: true, toolCalling: true, maxContextTokens: 32_768 },
		pricePer1M: { input: 0, output: 0 },
		contextWindow: 32_768,
		tier: "balanced",
	},
	{
		id: "bge-m3",
		name: "BGE-M3 (local embed)",
		provider: "ollama",
		capabilities: { chat: false, embed: true, vision: false, streaming: false, toolCalling: false },
		pricePer1M: { input: 0, output: 0 },
		contextWindow: 8_192,
		tier: "balanced",
	},
];

export function findModel(provider: string, modelId: string): ProviderModel | null {
	return PROVIDER_MODELS.find((m) => m.provider === provider && m.id === modelId) ?? null;
}

export function modelsByProvider(provider: string): ProviderModel[] {
	return PROVIDER_MODELS.filter((m) => m.provider === provider);
}

export function modelsForTask(
	taskKind: "chat" | "embed" | "vision",
	tier?: "tiny" | "balanced" | "premium"
): ProviderModel[] {
	return PROVIDER_MODELS.filter((m) => {
		if (taskKind === "chat" && !m.capabilities.chat) return false;
		if (taskKind === "embed" && !m.capabilities.embed) return false;
		if (taskKind === "vision" && !m.capabilities.vision) return false;
		if (tier && m.tier !== tier) return false;
		return true;
	});
}

/** Compute USD spent for a given usage. */
export function computeCost(model: ProviderModel, usage: { promptTokens: number; completionTokens: number; cachedTokens?: number }): number {
	const inputCost = (usage.promptTokens / 1_000_000) * model.pricePer1M.input;
	const outputCost = (usage.completionTokens / 1_000_000) * model.pricePer1M.output;
	const cachedCost = usage.cachedTokens && model.pricePer1M.cachedInput
		? (usage.cachedTokens / 1_000_000) * model.pricePer1M.cachedInput
		: 0;
	return inputCost + outputCost + cachedCost;
}
