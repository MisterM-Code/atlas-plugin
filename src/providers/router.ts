/**
 * Atlas v0.17 — Provider Router.
 *
 * Central dispatch for AI calls. Resolves task → (provider, model) per user routing config.
 * Wraps every call in cost tracking + budget enforcement + failover.
 *
 * Default task → provider mapping (user-configurable in Settings):
 *  - chat        → Anthropic Claude Sonnet 4.6 (or Ollama qwen2.5:7b if no API key)
 *  - extraction  → Anthropic Haiku 4.5 (faster) (or Ollama)
 *  - embedding   → OpenAI text-embedding-3-small (or Ollama bge-m3)
 *  - vision      → OpenAI GPT-4o (or Anthropic if no OpenAI)
 *  - reasoning   → DeepSeek R1 (or Anthropic Opus, or local CoT)
 *  - summarization → Cheap model: Haiku / GPT-4o-mini / Mistral Small
 */

import type { App } from "obsidian";
import { logger } from "../utils/logger";
import {
	AIProviderError,
	type AIProvider,
	type ChatRequest,
	type ChatResponse,
	type ChatStreamChunk,
	type EmbedRequest,
	type EmbedResponse,
	type ProviderId,
	type TaskKind,
	type VisionRequest,
} from "./types";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { GoogleProvider } from "./google";
import { OpenRouterProvider, GroqProvider, DeepSeekProvider, XAIProvider, MistralProvider } from "./openai-compat";
import { OllamaAdapter } from "./ollama-adapter";
import type { OllamaClient } from "../ollama/client";
import { CostTracker, estimateTokens } from "./cost-tracker";
import { findModel } from "./registry";

export interface ProviderApiKeys {
	openai?: string;
	anthropic?: string;
	google?: string;
	mistral?: string;
	xai?: string;
	openrouter?: string;
	groq?: string;
	deepseek?: string;
	cohere?: string;
}

export interface TaskRouting {
	chat?: { provider: ProviderId; model: string };
	extraction?: { provider: ProviderId; model: string };
	embedding?: { provider: ProviderId; model: string };
	vision?: { provider: ProviderId; model: string };
	reasoning?: { provider: ProviderId; model: string };
	summarization?: { provider: ProviderId; model: string };
	"tool-calling"?: { provider: ProviderId; model: string };
}

export interface RouterConfig {
	apiKeys: ProviderApiKeys;
	routing: TaskRouting;
	failoverChain?: ProviderId[]; // order to try if primary fails
	preferLocalForCheap?: boolean; // if true, route summarization/extraction to Ollama
	dryRun?: boolean; // if true, don't actually call APIs (for testing budget UI)
}

export class ProviderRouter {
	private readonly providers = new Map<ProviderId, AIProvider>();
	private readonly cost: CostTracker;
	private cfg: RouterConfig;
	private ollamaClient: OllamaClient | null = null;

	constructor(
		private readonly app: App,
		cfg: RouterConfig,
		costTracker?: CostTracker
	) {
		this.cfg = cfg;
		this.cost = costTracker ?? new CostTracker(app);
		this.rebuildProviders();
	}

	/** Wire local Ollama as a provider (called by main.ts after OllamaClient init). */
	attachOllama(client: OllamaClient): void {
		this.ollamaClient = client;
		this.providers.set("ollama", new OllamaAdapter(client));
	}

	updateConfig(cfg: Partial<RouterConfig>): void {
		this.cfg = { ...this.cfg, ...cfg, apiKeys: { ...this.cfg.apiKeys, ...cfg.apiKeys }, routing: { ...this.cfg.routing, ...cfg.routing } };
		this.rebuildProviders();
	}

	getCostTracker(): CostTracker {
		return this.cost;
	}

	private rebuildProviders(): void {
		// Preserve Ollama if attached
		const ollama = this.providers.get("ollama");
		this.providers.clear();
		if (ollama) this.providers.set("ollama", ollama);
		else if (this.ollamaClient) this.providers.set("ollama", new OllamaAdapter(this.ollamaClient));

		const keys = this.cfg.apiKeys;
		if (keys.openai) this.providers.set("openai", new OpenAIProvider({ apiKey: keys.openai }));
		if (keys.anthropic) this.providers.set("anthropic", new AnthropicProvider({ apiKey: keys.anthropic }));
		if (keys.google) this.providers.set("google", new GoogleProvider({ apiKey: keys.google }));
		if (keys.mistral) this.providers.set("mistral", new MistralProvider(keys.mistral));
		if (keys.xai) this.providers.set("xai", new XAIProvider(keys.xai));
		if (keys.openrouter) this.providers.set("openrouter", new OpenRouterProvider(keys.openrouter));
		if (keys.groq) this.providers.set("groq", new GroqProvider(keys.groq));
		if (keys.deepseek) this.providers.set("deepseek", new DeepSeekProvider(keys.deepseek));
	}

	getProvider(id: ProviderId): AIProvider | null {
		return this.providers.get(id) ?? null;
	}

	listConfiguredProviders(): ProviderId[] {
		return Array.from(this.providers.keys());
	}

	resolveTask(task: TaskKind): { provider: ProviderId; model: string } | null {
		// User explicit routing first
		const user = (this.cfg.routing as Record<string, { provider: ProviderId; model: string } | undefined>)[task];
		if (user) return user;
		// Fall back to chat routing for chat-like tasks
		if (task === "extraction" || task === "summarization" || task === "tool-calling") {
			return this.cfg.routing.chat ?? null;
		}
		if (task === "reasoning") return this.cfg.routing.reasoning ?? this.cfg.routing.chat ?? null;
		if (task === "vision") return this.cfg.routing.vision ?? null;
		if (task === "embedding") return this.cfg.routing.embedding ?? null;
		return this.cfg.routing.chat ?? null;
	}

	async chat(req: ChatRequest): Promise<ChatResponse> {
		const route = this.resolveTask(req.taskKind ?? "chat");
		if (!route) throw new AIProviderError("Nenhum provider configurado para chat", "ollama", "missing-key");
		// v0.51.4: pre-compute promptTokens for failure logging (provider may charge on 5xx)
		const promptTokens = estimateTokens(req.messages.map((m) => m.content).join("\n"));
		try {
			return await this.callWithFailover<ChatResponse>(route, req.taskKind ?? "chat", req.feature, async (p, model) => {
				if (!p.chat) throw new AIProviderError(`${p.id} não suporta chat`, p.id, "unknown");
				await this.preflightBudget(p.id, model, promptTokens, req.maxTokens ?? 1024, req.feature);
				const r = await p.chat({ ...req, model });
				await this.cost.log({
					provider: p.id,
					model,
					usage: r.usage,
					taskKind: req.taskKind,
					feature: req.feature,
					success: true,
				});
				return r;
			});
		} catch (e) {
			// v0.51.4: ALL failures registered (provider may have charged in 5xx). Skip pure auth/budget pre-flight (didn't reach provider).
			const code = (e as AIProviderError)?.code;
			if (code !== "missing-key" && code !== "budget-exceeded") {
				await this.cost.log({
					provider: route.provider,
					model: route.model,
					usage: { promptTokens, completionTokens: 0, totalTokens: promptTokens },
					taskKind: req.taskKind,
					feature: req.feature,
					success: false,
					errorCode: code ?? "unknown",
				});
			}
			throw e;
		}
	}

	async *chatStream(req: ChatRequest): AsyncIterable<ChatStreamChunk> {
		const route = this.resolveTask(req.taskKind ?? "chat");
		if (!route) throw new AIProviderError("Nenhum provider configurado para chat", "ollama", "missing-key");
		const p = this.providers.get(route.provider);
		if (!p) throw new AIProviderError(`Provider ${route.provider} não configurado (API key falta?)`, route.provider, "missing-key");
		if (!p.chatStream) throw new AIProviderError(`${p.id} não suporta streaming`, p.id, "unknown");

		const promptTokens = estimateTokens(req.messages.map((m) => m.content).join("\n"));
		await this.preflightBudget(p.id, route.model, promptTokens, req.maxTokens ?? 1024, req.feature);

		let lastUsage: ChatStreamChunk["usage"] = undefined;
		try {
			for await (const chunk of p.chatStream({ ...req, model: route.model })) {
				if (chunk.usage) lastUsage = chunk.usage;
				yield chunk;
			}
			if (lastUsage) {
				await this.cost.log({
					provider: p.id,
					model: route.model,
					usage: lastUsage,
					taskKind: req.taskKind,
					feature: req.feature,
					success: true,
				});
			}
		} catch (e) {
			// v0.51.4: include errorCode pra distinguir auth/rate-limit/server
			const code = (e as AIProviderError)?.code;
			if (code !== "missing-key" && code !== "budget-exceeded") {
				await this.cost.log({
					provider: p.id,
					model: route.model,
					usage: { promptTokens, completionTokens: 0, totalTokens: promptTokens },
					taskKind: req.taskKind,
					feature: req.feature,
					success: false,
					errorCode: code ?? "unknown",
				});
			}
			throw e;
		}
	}

	async embed(req: EmbedRequest, taskKind: TaskKind = "embedding"): Promise<EmbedResponse> {
		const route = this.resolveTask("embedding");
		if (!route) throw new AIProviderError("Nenhum provider configurado para embedding", "ollama", "missing-key");
		// v0.51.4: estimate input tokens for failure logging
		const promptTokens = estimateTokens(req.texts.join("\n"));
		try {
			return await this.callWithFailover<EmbedResponse>(route, taskKind, req.feature, async (p, model) => {
				if (!p.embed) throw new AIProviderError(`${p.id} não suporta embeddings`, p.id, "unknown");
				const r = await p.embed({ ...req, model });
				await this.cost.log({
					provider: p.id,
					model,
					usage: r.usage,
					taskKind,
					feature: req.feature,
					success: true,
				});
				return r;
			});
		} catch (e) {
			const code = (e as AIProviderError)?.code;
			if (code !== "missing-key" && code !== "budget-exceeded") {
				await this.cost.log({
					provider: route.provider,
					model: route.model,
					usage: { promptTokens, completionTokens: 0, totalTokens: promptTokens },
					taskKind,
					feature: req.feature,
					success: false,
					errorCode: code ?? "unknown",
				});
			}
			throw e;
		}
	}

	async vision(req: VisionRequest): Promise<ChatResponse> {
		const route = this.resolveTask("vision");
		if (!route) throw new AIProviderError("Nenhum provider configurado para vision", "openai", "missing-key");
		// v0.51.4: estimate prompt tokens for failure logging (image base64 counts as ~85 tokens conservadora + prompt)
		const promptTokens = estimateTokens(req.prompt) + 85;
		try {
			return await this.callWithFailover<ChatResponse>(route, "vision", req.feature, async (p, model) => {
				if (!p.vision) throw new AIProviderError(`${p.id} não suporta vision`, p.id, "unknown");
				const r = await p.vision({ ...req, model });
				await this.cost.log({
					provider: p.id,
					model,
					usage: r.usage,
					taskKind: "vision",
					feature: req.feature,
					success: true,
				});
				return r;
			});
		} catch (e) {
			const code = (e as AIProviderError)?.code;
			if (code !== "missing-key" && code !== "budget-exceeded") {
				await this.cost.log({
					provider: route.provider,
					model: route.model,
					usage: { promptTokens, completionTokens: 0, totalTokens: promptTokens },
					taskKind: "vision",
					feature: req.feature,
					success: false,
					errorCode: code ?? "unknown",
				});
			}
			throw e;
		}
	}

	private async preflightBudget(
		provider: ProviderId,
		model: string,
		promptTokens: number,
		maxOutputTokens: number,
		feature?: string
	): Promise<void> {
		const m = findModel(provider, model);
		if (!m) return; // unknown model — can't estimate
		const estimated = this.cost.estimateCost(m, promptTokens, maxOutputTokens);
		if (estimated <= 0) return; // free model (Ollama)
		const check = await this.cost.checkBudget(estimated, feature);
		if (!check.allowed) {
			throw new AIProviderError(
				check.reason ?? "Budget excedido",
				provider,
				"budget-exceeded"
			);
		}
	}

	private async callWithFailover<T>(
		primary: { provider: ProviderId; model: string },
		taskKind: TaskKind,
		feature: string | undefined,
		fn: (p: AIProvider, model: string) => Promise<T>
	): Promise<T> {
		const tried: ProviderId[] = [];
		const chain = [primary.provider, ...(this.cfg.failoverChain ?? [])].filter((id, i, arr) => arr.indexOf(id) === i);
		let lastErr: unknown = null;

		for (const providerId of chain) {
			const p = this.providers.get(providerId);
			if (!p) continue;
			tried.push(providerId);
			try {
				return await fn(p, providerId === primary.provider ? primary.model : this.fallbackModelFor(providerId, taskKind));
			} catch (e) {
				lastErr = e;
				if (e instanceof AIProviderError && (e.code === "missing-key" || e.code === "budget-exceeded")) {
					throw e; // not retriable through failover
				}
				logger.warn("router: provider failed, trying failover", { provider: providerId, error: String(e) });
				continue;
			}
		}

		throw lastErr ?? new AIProviderError(`Sem provider disponível (tentou: ${tried.join(", ")})`, primary.provider, "missing-key");
	}

	private fallbackModelFor(providerId: ProviderId, taskKind: TaskKind): string {
		// Sensible defaults per provider for failover
		const defaults: Record<ProviderId, Partial<Record<TaskKind, string>>> = {
			openai: { chat: "gpt-4o-mini", embedding: "text-embedding-3-small", vision: "gpt-4o" },
			anthropic: { chat: "claude-haiku-4-5-20251001", vision: "claude-sonnet-4-6", reasoning: "claude-opus-4-7" },
			google: { chat: "gemini-2.0-flash", embedding: "text-embedding-004", vision: "gemini-1.5-pro" },
			mistral: { chat: "mistral-small-latest", embedding: "mistral-embed" },
			xai: { chat: "grok-2-1212", vision: "grok-2-1212" },
			openrouter: { chat: "anthropic/claude-3.5-sonnet" },
			groq: { chat: "llama-3.3-70b-versatile" },
			deepseek: { chat: "deepseek-chat", reasoning: "deepseek-reasoner" },
			cohere: { chat: "command-r-plus", embedding: "embed-multilingual-v3.0" },
			ollama: { chat: "qwen2.5:7b-instruct", embedding: "bge-m3" },
		};
		return defaults[providerId]?.[taskKind] ?? defaults[providerId]?.chat ?? "";
	}
}

/** Default routing for cost-conscious user (zero cloud). */
export const DEFAULT_ROUTING_LOCAL: TaskRouting = {
	chat: { provider: "ollama", model: "qwen2.5:7b-instruct" },
	embedding: { provider: "ollama", model: "bge-m3" },
};

/** Recommended cloud routing — premium chat + cheap helpers. */
export const DEFAULT_ROUTING_CLOUD: TaskRouting = {
	chat: { provider: "anthropic", model: "claude-sonnet-4-6" },
	extraction: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
	summarization: { provider: "openai", model: "gpt-4o-mini" },
	embedding: { provider: "openai", model: "text-embedding-3-small" },
	vision: { provider: "openai", model: "gpt-4o" },
	reasoning: { provider: "anthropic", model: "claude-opus-4-7" },
};
