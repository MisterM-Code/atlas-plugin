/**
 * Atlas v0.18 — LLMService façade.
 *
 * Single entry point for ALL LLM calls in the plugin. Routes through
 * `plugin.providerRouter` (cloud) when configured, falls back to direct
 * `OllamaClient` (local). Auto-tags every call with `feature: "..."` for
 * cost tracking + budget enforcement.
 *
 * Migration path: replace `plugin.ollama.chat(...)` → `plugin.llm.chat({...})`.
 * Replace `plugin.ollama.generate(...)` → `plugin.llm.generate({...})`.
 *
 * willUseCloud(taskKind) lets call-sites enrich prompts when cloud detected.
 */

import type AtlasPlugin from "../../main";
import type { OllamaClient, ChatMessage as OllamaChatMessage, ToolSpec, ChatWithToolsResult } from "../ollama/client";
import type { TaskKind, ChatMessage as ProviderChatMessage } from "./types";
import { logger } from "../utils/logger";

export interface LLMChatOpts {
	feature: string; // for cost tracking — e.g. "agent.chat", "ti-tools.adr", "innovation.ghost-mentor"
	taskKind?: TaskKind; // default "chat"
	temperature?: number;
	maxTokens?: number;
	/** Override model (skip routing). */
	overrideModel?: { provider: string; model: string };
	/** Force JSON output (Ollama only currently — cloud TBD). */
	jsonFormat?: boolean;
}

export interface LLMService {
	willUseCloud(taskKind?: TaskKind): boolean;
	willUseCloudForFeature(feature: string): boolean;

	chat(messages: OllamaChatMessage[], opts: LLMChatOpts): Promise<string>;
	chatStream(
		messages: OllamaChatMessage[],
		opts: LLMChatOpts,
		onToken: (chunk: string) => void
	): Promise<string>;
	chatWithTools(
		messages: OllamaChatMessage[],
		tools: ToolSpec[],
		opts: LLMChatOpts
	): Promise<ChatWithToolsResult>;
	generate(prompt: string, opts: LLMChatOpts): Promise<string>;
	embed(texts: string[], opts: { feature: string; overrideModel?: string }): Promise<number[][]>;
	vision(prompt: string, imageBase64: string, opts: { feature: string; mimeType?: string }): Promise<string>;
}

class LLMServiceImpl implements LLMService {
	constructor(private readonly plugin: AtlasPlugin) {}

	willUseCloud(taskKind: TaskKind = "chat"): boolean {
		const router = this.plugin.providerRouter;
		if (!router) return false;
		const route = router.resolveTask(taskKind);
		return Boolean(route && route.provider !== "ollama");
	}

	willUseCloudForFeature(_feature: string): boolean {
		// MVP: feature → taskKind not implemented. Default to chat.
		return this.willUseCloud("chat");
	}

	async chat(messages: OllamaChatMessage[], opts: LLMChatOpts): Promise<string> {
		const taskKind = opts.taskKind ?? "chat";
		const router = this.plugin.providerRouter;
		const route = opts.overrideModel ?? router?.resolveTask(taskKind);

		if (router && route && route.provider !== "ollama") {
			try {
				const r = await router.chat({
					messages: this.toProviderMessages(messages),
					model: route.model,
					temperature: opts.temperature,
					maxTokens: opts.maxTokens,
					feature: opts.feature,
					taskKind,
				});
				return r.content;
			} catch (e) {
				if (this.shouldFallback(e)) {
					logger.warn("llm: cloud failed, falling back to ollama", { feature: opts.feature, error: String(e) });
					return this.fallbackOllamaChat(messages, opts);
				}
				throw e;
			}
		}
		return this.fallbackOllamaChat(messages, opts);
	}

	async chatStream(
		messages: OllamaChatMessage[],
		opts: LLMChatOpts,
		onToken: (chunk: string) => void
	): Promise<string> {
		const taskKind = opts.taskKind ?? "chat";
		const router = this.plugin.providerRouter;
		const route = opts.overrideModel ?? router?.resolveTask(taskKind);

		if (router && route && route.provider !== "ollama") {
			try {
				let acc = "";
				for await (const chunk of router.chatStream({
					messages: this.toProviderMessages(messages),
					model: route.model,
					temperature: opts.temperature,
					maxTokens: opts.maxTokens,
					feature: opts.feature,
					taskKind,
				})) {
					if (chunk.delta) {
						acc += chunk.delta;
						onToken(chunk.delta);
					}
					if (chunk.done) break;
				}
				return acc;
			} catch (e) {
				if (this.shouldFallback(e)) {
					logger.warn("llm: cloud stream failed, falling back", { feature: opts.feature, error: String(e) });
					return this.plugin.ollama.chatStream(messages, this.toOllamaOpts(opts), onToken);
				}
				throw e;
			}
		}
		return this.plugin.ollama.chatStream(messages, this.toOllamaOpts(opts), onToken);
	}

	async chatWithTools(
		messages: OllamaChatMessage[],
		tools: ToolSpec[],
		opts: LLMChatOpts
	): Promise<ChatWithToolsResult> {
		const taskKind = opts.taskKind ?? "tool-calling";
		const router = this.plugin.providerRouter;
		const route = opts.overrideModel ?? router?.resolveTask(taskKind);

		if (router && route && route.provider !== "ollama") {
			try {
				const r = await router.chat({
					messages: this.toProviderMessages(messages),
					model: route.model,
					temperature: opts.temperature,
					maxTokens: opts.maxTokens,
					feature: opts.feature,
					taskKind,
					tools: tools.map((t) => ({
						name: t.function.name,
						description: t.function.description,
						parameters: t.function.parameters,
					})),
				});
				return {
					content: r.content,
					toolCalls: (r.toolCalls ?? []).map((tc) => ({
						function: {
							name: tc.name,
							arguments: this.parseJsonSafe(tc.arguments),
						},
					})),
				};
			} catch (e) {
				if (this.shouldFallback(e)) {
					logger.warn("llm: cloud tools failed, fallback ollama", { feature: opts.feature, error: String(e) });
					return this.plugin.ollama.chatWithTools(messages, tools, this.toOllamaOpts(opts));
				}
				throw e;
			}
		}
		return this.plugin.ollama.chatWithTools(messages, tools, this.toOllamaOpts(opts));
	}

	async generate(prompt: string, opts: LLMChatOpts): Promise<string> {
		// Wrap as single-user message chat (cloud doesn't have raw generate)
		if (this.willUseCloud(opts.taskKind ?? "chat")) {
			return this.chat([{ role: "user", content: prompt }], opts);
		}
		return this.plugin.ollama.generate(prompt, this.toOllamaOpts(opts));
	}

	async embed(texts: string[], opts: { feature: string; overrideModel?: string }): Promise<number[][]> {
		const router = this.plugin.providerRouter;
		const route = router?.resolveTask("embedding");

		if (router && route && route.provider !== "ollama") {
			try {
				const r = await router.embed({
					texts,
					model: opts.overrideModel ?? route.model,
					feature: opts.feature,
				});
				return r.embeddings;
			} catch (e) {
				if (this.shouldFallback(e)) {
					logger.warn("llm: cloud embed failed, fallback ollama", { feature: opts.feature, error: String(e) });
					return this.plugin.ollama.embed(texts, this.plugin.settings.ollama.embeddingModel);
				}
				throw e;
			}
		}
		return this.plugin.ollama.embed(texts, opts.overrideModel ?? this.plugin.settings.ollama.embeddingModel);
	}

	async vision(
		prompt: string,
		imageBase64: string,
		opts: { feature: string; mimeType?: string }
	): Promise<string> {
		const router = this.plugin.providerRouter;
		const route = router?.resolveTask("vision");

		if (router && route && route.provider !== "ollama") {
			try {
				const r = await router.vision({
					prompt,
					imageBase64,
					mimeType: opts.mimeType,
					model: route.model,
					feature: opts.feature,
				});
				return r.content;
			} catch (e) {
				if (this.shouldFallback(e)) {
					logger.warn("llm: cloud vision failed, no local fallback", { feature: opts.feature, error: String(e) });
					throw new Error("Vision indisponível (cloud falhou + Ollama não tem modelo vision configurado).");
				}
				throw e;
			}
		}
		// Local fallback: only works if user has llama3.2-vision pulled — we don't implement here
		throw new Error(
			"Vision precisa de um cloud provider (OpenAI GPT-4o, Anthropic Claude Sonnet, Google Gemini). Configure em Settings → ☁️ Cloud AI Providers, ou pull llama3.2-vision via Ollama manualmente."
		);
	}

	// ─── Internals ──────────────────────────────────────────────

	private toProviderMessages(messages: OllamaChatMessage[]): ProviderChatMessage[] {
		return messages.map((m) => ({
			role: m.role,
			content: m.content,
		}));
	}

	private toOllamaOpts(opts: LLMChatOpts): { model: string; temperature?: number; max_tokens?: number; format?: "json" | undefined } {
		const fallbackModel = opts.overrideModel?.model ?? this.plugin.settings.ollama.generationModel;
		return {
			model: fallbackModel,
			temperature: opts.temperature,
			max_tokens: opts.maxTokens,
			format: opts.jsonFormat ? "json" : undefined,
		};
	}

	private async fallbackOllamaChat(messages: OllamaChatMessage[], opts: LLMChatOpts): Promise<string> {
		return this.plugin.ollama.chat(messages, this.toOllamaOpts(opts));
	}

	private shouldFallback(e: unknown): boolean {
		// Only fall back on transient/auth/network — NOT on budget exceeded (user's intent)
		const code = (e as { code?: string })?.code;
		if (code === "budget-exceeded") return false;
		if (code === "rate-limit" || code === "network" || code === "auth" || code === "missing-key" || code === "model-not-found") {
			return true;
		}
		// Default fallback for unknown errors (better UX than crash)
		return true;
	}

	private parseJsonSafe(s: string): Record<string, unknown> {
		try {
			return JSON.parse(s) as Record<string, unknown>;
		} catch {
			return {};
		}
	}
}

export function createLLMService(plugin: AtlasPlugin): LLMService {
	return new LLMServiceImpl(plugin);
}
