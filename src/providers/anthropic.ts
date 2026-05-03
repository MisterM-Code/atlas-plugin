/**
 * Atlas v0.17 — Anthropic provider.
 *
 * Implements Messages API (Claude Opus 4.7, Sonnet 4.6, Haiku 4.5) with streaming + tool calling.
 */

import {
	AIProviderError,
	type AIProvider,
	type ChatRequest,
	type ChatResponse,
	type ChatStreamChunk,
	type EmbedRequest,
	type EmbedResponse,
	type ProviderModel,
	type VisionRequest,
} from "./types";
import { modelsByProvider } from "./registry";
import { logger } from "../utils/logger";

export interface AnthropicProviderConfig {
	apiKey: string;
	baseUrl?: string;
	defaultModel?: string;
}

export class AnthropicProvider implements AIProvider {
	readonly id = "anthropic" as const;
	readonly name = "Anthropic";
	readonly capabilities = {
		chat: true,
		embed: false,
		vision: true,
		streaming: true,
		toolCalling: true,
	};

	private readonly baseUrl: string;

	constructor(private readonly config: AnthropicProviderConfig) {
		this.baseUrl = (config.baseUrl ?? "https://api.anthropic.com/v1").replace(/\/$/, "");
	}

	async isAvailable(): Promise<boolean> {
		return Boolean(this.config.apiKey);
	}

	async listModels(): Promise<ProviderModel[]> {
		return modelsByProvider("anthropic");
	}

	async chat(req: ChatRequest): Promise<ChatResponse> {
		this.requireKey();
		const body = this.buildChatBody(req, false);
		const r = await fetch(`${this.baseUrl}/messages`, {
			method: "POST",
			headers: this.buildHeaders(),
			body: JSON.stringify(body),
		});
		if (!r.ok) throw await this.parseError(r);
		const data = (await r.json()) as AnthropicChatResponse;
		const content = (data.content ?? [])
			.filter((b) => b.type === "text")
			.map((b) => b.text ?? "")
			.join("");
		const toolCalls = (data.content ?? [])
			.filter((b) => b.type === "tool_use")
			.map((b) => ({ id: b.id ?? "", name: b.name ?? "", arguments: JSON.stringify(b.input ?? {}) }));
		return {
			content,
			usage: {
				promptTokens: data.usage?.input_tokens ?? 0,
				completionTokens: data.usage?.output_tokens ?? 0,
				totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
			},
			toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
			finishReason: this.mapFinishReason(data.stop_reason),
		};
	}

	async *chatStream(req: ChatRequest): AsyncIterable<ChatStreamChunk> {
		this.requireKey();
		const body = this.buildChatBody(req, true);
		const r = await fetch(`${this.baseUrl}/messages`, {
			method: "POST",
			headers: this.buildHeaders(),
			body: JSON.stringify(body),
		});
		if (!r.ok) throw await this.parseError(r);
		if (!r.body) throw new AIProviderError("Anthropic stream sem body", "anthropic", "network");

		const reader = r.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		let inputTokens = 0;
		let outputTokens = 0;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let nl = buffer.indexOf("\n");
			while (nl >= 0) {
				const line = buffer.slice(0, nl).trim();
				buffer = buffer.slice(nl + 1);
				nl = buffer.indexOf("\n");
				if (!line.startsWith("data:")) continue;
				const payload = line.slice(5).trim();
				if (!payload) continue;
				try {
					const j = JSON.parse(payload) as AnthropicStreamEvent;
					if (j.type === "content_block_delta" && j.delta?.type === "text_delta") {
						yield { delta: j.delta.text ?? "" };
					}
					if (j.type === "content_block_start" && j.content_block?.type === "tool_use") {
						yield {
							delta: "",
							toolCallDelta: {
								id: j.content_block.id,
								name: j.content_block.name,
							},
						};
					}
					if (j.type === "content_block_delta" && j.delta?.type === "input_json_delta") {
						yield {
							delta: "",
							toolCallDelta: { arguments: j.delta.partial_json ?? "" },
						};
					}
					if (j.type === "message_start" && j.message?.usage) {
						inputTokens = j.message.usage.input_tokens ?? 0;
					}
					if (j.type === "message_delta" && j.usage) {
						outputTokens = j.usage.output_tokens ?? 0;
					}
					if (j.type === "message_stop") {
						yield {
							delta: "",
							usage: {
								promptTokens: inputTokens,
								completionTokens: outputTokens,
								totalTokens: inputTokens + outputTokens,
							},
							done: true,
						};
						return;
					}
				} catch (e) {
					logger.warn("anthropic: stream parse error", { line: payload.slice(0, 80) });
				}
			}
		}
	}

	async embed(_req: EmbedRequest): Promise<EmbedResponse> {
		throw new AIProviderError(
			"Anthropic não oferece embeddings. Use OpenAI, Google, Mistral, Cohere ou Ollama (bge-m3).",
			"anthropic",
			"unknown"
		);
	}

	async vision(req: VisionRequest): Promise<ChatResponse> {
		this.requireKey();
		// Anthropic vision = use a content block with type image
		const body = {
			model: req.model,
			max_tokens: 4096,
			messages: [
				{
					role: "user",
					content: [
						{
							type: "image",
							source: {
								type: "base64",
								media_type: req.mimeType ?? "image/png",
								data: req.imageBase64,
							},
						},
						{ type: "text", text: req.prompt },
					],
				},
			],
		};
		const r = await fetch(`${this.baseUrl}/messages`, {
			method: "POST",
			headers: this.buildHeaders(),
			body: JSON.stringify(body),
		});
		if (!r.ok) throw await this.parseError(r);
		const data = (await r.json()) as AnthropicChatResponse;
		const content = (data.content ?? [])
			.filter((b) => b.type === "text")
			.map((b) => b.text ?? "")
			.join("");
		return {
			content,
			usage: {
				promptTokens: data.usage?.input_tokens ?? 0,
				completionTokens: data.usage?.output_tokens ?? 0,
				totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
			},
			finishReason: this.mapFinishReason(data.stop_reason),
		};
	}

	private buildChatBody(req: ChatRequest, stream: boolean): Record<string, unknown> {
		// Anthropic separates system from messages
		const sys = req.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
		const msgs = req.messages
			.filter((m) => m.role !== "system")
			.map((m) => ({ role: m.role === "tool" ? "user" : m.role, content: m.content }));

		const body: Record<string, unknown> = {
			model: req.model,
			messages: msgs,
			max_tokens: req.maxTokens ?? 4096,
			stream,
		};
		if (sys) body.system = sys;
		if (req.temperature !== undefined) body.temperature = req.temperature;
		if (req.tools && req.tools.length > 0) {
			body.tools = req.tools.map((t) => ({
				name: t.name,
				description: t.description,
				input_schema: t.parameters,
			}));
		}
		return body;
	}

	private buildHeaders(): Record<string, string> {
		return {
			"Content-Type": "application/json",
			"x-api-key": this.config.apiKey,
			"anthropic-version": "2023-06-01",
			// v0.52.5: required pra fetch direto do browser/Electron renderer.
			// Sem esse header, Anthropic API rejeita preflight → TypeError: Failed to fetch.
			"anthropic-dangerous-direct-browser-access": "true",
		};
	}

	private requireKey(): void {
		if (!this.config.apiKey) {
			throw new AIProviderError("Anthropic API key não configurada", "anthropic", "missing-key");
		}
	}

	private async parseError(r: Response): Promise<AIProviderError> {
		let msg = `Anthropic HTTP ${r.status}`;
		let code: AIProviderError["code"] = "unknown";
		try {
			const j = (await r.json()) as { error?: { message?: string; type?: string } };
			if (j.error?.message) msg = `Anthropic: ${j.error.message}`;
			if (r.status === 401) code = "auth";
			else if (r.status === 429) code = "rate-limit";
			else if (r.status === 404) code = "model-not-found";
			if (j.error?.type === "invalid_request_error" && msg.toLowerCase().includes("context")) {
				code = "context-length";
			}
		} catch {
			// keep default
		}
		return new AIProviderError(msg, "anthropic", code, code === "rate-limit");
	}

	private mapFinishReason(r?: string): ChatResponse["finishReason"] {
		switch (r) {
			case "end_turn":
				return "stop";
			case "max_tokens":
				return "length";
			case "tool_use":
				return "tool-calls";
			default:
				return undefined;
		}
	}
}

interface AnthropicChatResponse {
	content: { type: string; text?: string; id?: string; name?: string; input?: unknown }[];
	usage?: { input_tokens: number; output_tokens: number };
	stop_reason?: string;
}

interface AnthropicStreamEvent {
	type: string;
	delta?: { type?: string; text?: string; partial_json?: string };
	content_block?: { type: string; id?: string; name?: string };
	message?: { usage?: { input_tokens?: number } };
	usage?: { output_tokens?: number };
}
