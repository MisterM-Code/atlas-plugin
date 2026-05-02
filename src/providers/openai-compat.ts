/**
 * Atlas v0.17 — Generic OpenAI-compatible provider adapter.
 *
 * Used by: OpenRouter, Groq, DeepSeek, xAI, Mistral (chat), Together.ai, Fireworks, etc.
 * They all speak the OpenAI ChatCompletions wire format.
 *
 * Subclass OpenAIProvider with custom baseUrl + provider id for each.
 */

import { OpenAIProvider } from "./openai";
import type { AIProvider, ProviderId, ProviderModel } from "./types";
import { modelsByProvider } from "./registry";

export interface CompatProviderConfig {
	apiKey: string;
	baseUrl: string;
	defaultModel?: string;
}

abstract class OpenAICompatProvider extends OpenAIProvider implements AIProvider {
	override readonly id: ProviderId;
	override readonly name: string;

	protected constructor(cfg: CompatProviderConfig & { id: ProviderId; name: string }) {
		super({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, defaultModel: cfg.defaultModel });
		this.id = cfg.id;
		this.name = cfg.name;
	}

	override async listModels(): Promise<ProviderModel[]> {
		return modelsByProvider(this.id);
	}
}

// ─── OpenRouter ──────────────────────────────────────────────
export class OpenRouterProvider extends OpenAICompatProvider {
	override readonly capabilities = {
		chat: true, embed: false, vision: true, streaming: true, toolCalling: true,
	};
	constructor(apiKey: string) {
		super({ apiKey, baseUrl: "https://openrouter.ai/api/v1", id: "openrouter", name: "OpenRouter (gateway 300+ models)" });
	}
}

// ─── Groq (super fast inference) ─────────────────────────────
export class GroqProvider extends OpenAICompatProvider {
	override readonly capabilities = {
		chat: true, embed: false, vision: false, streaming: true, toolCalling: true,
	};
	constructor(apiKey: string) {
		super({ apiKey, baseUrl: "https://api.groq.com/openai/v1", id: "groq", name: "Groq (LPU inference)" });
	}
}

// ─── DeepSeek (reasoning specialist) ─────────────────────────
export class DeepSeekProvider extends OpenAICompatProvider {
	override readonly capabilities = {
		chat: true, embed: false, vision: false, streaming: true, toolCalling: true,
	};
	constructor(apiKey: string) {
		super({ apiKey, baseUrl: "https://api.deepseek.com/v1", id: "deepseek", name: "DeepSeek" });
	}
}

// ─── xAI Grok ─────────────────────────────────────────────────
export class XAIProvider extends OpenAICompatProvider {
	override readonly capabilities = {
		chat: true, embed: false, vision: true, streaming: true, toolCalling: true,
	};
	constructor(apiKey: string) {
		super({ apiKey, baseUrl: "https://api.x.ai/v1", id: "xai", name: "xAI Grok" });
	}
}

// ─── Mistral ──────────────────────────────────────────────────
export class MistralProvider extends OpenAICompatProvider {
	override readonly capabilities = {
		chat: true, embed: true, vision: false, streaming: true, toolCalling: true,
	};
	constructor(apiKey: string) {
		super({ apiKey, baseUrl: "https://api.mistral.ai/v1", id: "mistral", name: "Mistral" });
	}
}

// ─── Cohere (REST format slightly different — wraps via baseUrl) ─────
// Cohere has its own non-OpenAI format; for v0.17 we expose chat via their
// /v1/chat endpoint which is incompatible. Skip for now or add full impl later.
