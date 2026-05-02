/**
 * Atlas v0.17 — OpenAI provider.
 *
 * Implements ChatCompletions API + Embeddings API + streaming via SSE.
 * Compatible with OpenAI-compatible servers (Azure OpenAI, vLLM, LM Studio) via baseUrl override.
 */

import { logger } from "../utils/logger";
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

export interface OpenAIProviderConfig {
	apiKey: string;
	baseUrl?: string; // default https://api.openai.com/v1
	organization?: string;
	defaultModel?: string;
}

export class OpenAIProvider implements AIProvider {
	readonly id: import("./types").ProviderId = "openai";
	readonly name: string = "OpenAI";
	readonly capabilities = {
		chat: true,
		embed: true,
		vision: true,
		streaming: true,
		toolCalling: true,
	};

	protected readonly baseUrl: string;

	constructor(private readonly config: OpenAIProviderConfig) {
		this.baseUrl = (config.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
	}

	async isAvailable(): Promise<boolean> {
		return Boolean(this.config.apiKey);
	}

	async listModels(): Promise<ProviderModel[]> {
		return modelsByProvider("openai");
	}

	async chat(req: ChatRequest): Promise<ChatResponse> {
		this.requireKey();
		const body = this.buildChatBody(req, false);
		const r = await fetch(`${this.baseUrl}/chat/completions`, {
			method: "POST",
			headers: this.buildHeaders(),
			body: JSON.stringify(body),
		});
		if (!r.ok) throw await this.parseError(r);
		const data = (await r.json()) as OpenAIChatResponse;
		const choice = data.choices?.[0];
		const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
		return {
			content: choice?.message?.content ?? "",
			usage: {
				promptTokens: usage.prompt_tokens,
				completionTokens: usage.completion_tokens,
				totalTokens: usage.total_tokens,
			},
			toolCalls: choice?.message?.tool_calls?.map((tc) => ({
				id: tc.id,
				name: tc.function.name,
				arguments: tc.function.arguments,
			})),
			finishReason: this.mapFinishReason(choice?.finish_reason),
		};
	}

	async *chatStream(req: ChatRequest): AsyncIterable<ChatStreamChunk> {
		this.requireKey();
		const body = this.buildChatBody(req, true);
		const r = await fetch(`${this.baseUrl}/chat/completions`, {
			method: "POST",
			headers: this.buildHeaders(),
			body: JSON.stringify(body),
		});
		if (!r.ok) throw await this.parseError(r);
		if (!r.body) {
			throw new AIProviderError("OpenAI stream sem body", "openai", "network");
		}
		const reader = r.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let nl = buffer.indexOf("\n");
			while (nl >= 0) {
				const line = buffer.slice(0, nl).trim();
				buffer = buffer.slice(nl + 1);
				nl = buffer.indexOf("\n");
				if (!line || !line.startsWith("data:")) continue;
				const payload = line.slice(5).trim();
				if (payload === "[DONE]") {
					yield { delta: "", done: true };
					return;
				}
				try {
					const j = JSON.parse(payload) as OpenAIStreamChunk;
					const delta = j.choices?.[0]?.delta;
					if (delta?.content) {
						yield { delta: delta.content };
					}
					if (delta?.tool_calls) {
						for (const tc of delta.tool_calls) {
							yield {
								delta: "",
								toolCallDelta: {
									id: tc.id,
									name: tc.function?.name,
									arguments: tc.function?.arguments,
								},
							};
						}
					}
					if (j.usage) {
						yield {
							delta: "",
							usage: {
								promptTokens: j.usage.prompt_tokens,
								completionTokens: j.usage.completion_tokens,
								totalTokens: j.usage.total_tokens,
							},
						};
					}
				} catch (e) {
					logger.warn("openai: stream parse error", { line: payload.slice(0, 80) });
				}
			}
		}
	}

	async embed(req: EmbedRequest): Promise<EmbedResponse> {
		this.requireKey();
		const r = await fetch(`${this.baseUrl}/embeddings`, {
			method: "POST",
			headers: this.buildHeaders(),
			body: JSON.stringify({
				model: req.model,
				input: req.texts,
			}),
		});
		if (!r.ok) throw await this.parseError(r);
		const data = (await r.json()) as OpenAIEmbedResponse;
		return {
			embeddings: data.data.map((d) => d.embedding),
			usage: {
				promptTokens: data.usage.prompt_tokens,
				completionTokens: 0,
				totalTokens: data.usage.total_tokens,
			},
		};
	}

	async vision(req: VisionRequest): Promise<ChatResponse> {
		this.requireKey();
		const mime = req.mimeType ?? "image/png";
		const dataUrl = `data:${mime};base64,${req.imageBase64}`;
		return this.chat({
			model: req.model,
			messages: [
				{
					role: "user",
					content: JSON.stringify([
						{ type: "text", text: req.prompt },
						{ type: "image_url", image_url: { url: dataUrl } },
					]),
				},
			],
			feature: req.feature,
		});
	}

	private buildChatBody(req: ChatRequest, stream: boolean): Record<string, unknown> {
		const body: Record<string, unknown> = {
			model: req.model,
			messages: req.messages.map((m) => {
				const out: Record<string, unknown> = { role: m.role, content: m.content };
				if (m.name) out.name = m.name;
				if (m.toolCallId) out.tool_call_id = m.toolCallId;
				return out;
			}),
			stream,
		};
		if (stream) body.stream_options = { include_usage: true };
		if (req.temperature !== undefined) body.temperature = req.temperature;
		if (req.maxTokens) body.max_tokens = req.maxTokens;
		if (req.tools && req.tools.length > 0) {
			body.tools = req.tools.map((t) => ({
				type: "function",
				function: { name: t.name, description: t.description, parameters: t.parameters },
			}));
		}
		return body;
	}

	private buildHeaders(): Record<string, string> {
		const h: Record<string, string> = {
			"Content-Type": "application/json",
			Authorization: `Bearer ${this.config.apiKey}`,
		};
		if (this.config.organization) h["OpenAI-Organization"] = this.config.organization;
		return h;
	}

	private requireKey(): void {
		if (!this.config.apiKey) {
			throw new AIProviderError("OpenAI API key não configurada", "openai", "missing-key");
		}
	}

	private async parseError(r: Response): Promise<AIProviderError> {
		let msg = `OpenAI HTTP ${r.status}`;
		let code: AIProviderError["code"] = "unknown";
		try {
			const j = (await r.json()) as { error?: { message?: string; code?: string; type?: string } };
			if (j.error?.message) msg = `OpenAI: ${j.error.message}`;
			if (r.status === 401) code = "auth";
			else if (r.status === 429) code = "rate-limit";
			else if (r.status === 404) code = "model-not-found";
			else if (j.error?.code === "context_length_exceeded") code = "context-length";
		} catch {
			// keep default msg
		}
		const err = new AIProviderError(msg, "openai", code, code === "rate-limit");
		return err;
	}

	private mapFinishReason(r?: string): ChatResponse["finishReason"] {
		switch (r) {
			case "stop":
				return "stop";
			case "length":
				return "length";
			case "tool_calls":
				return "tool-calls";
			default:
				return undefined;
		}
	}
}

interface OpenAIChatResponse {
	choices: {
		message: {
			content: string;
			tool_calls?: { id: string; function: { name: string; arguments: string } }[];
		};
		finish_reason?: string;
	}[];
	usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface OpenAIStreamChunk {
	choices?: {
		delta?: {
			content?: string;
			tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
		};
	}[];
	usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface OpenAIEmbedResponse {
	data: { embedding: number[]; index: number }[];
	usage: { prompt_tokens: number; total_tokens: number };
}
