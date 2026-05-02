/**
 * Atlas v0.17 — Google Gemini provider.
 *
 * Uses generativelanguage.googleapis.com REST API.
 * Different wire format than OpenAI; messages translated.
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

export interface GoogleProviderConfig {
	apiKey: string;
	baseUrl?: string;
}

export class GoogleProvider implements AIProvider {
	readonly id = "google" as const;
	readonly name = "Google Gemini";
	readonly capabilities = {
		chat: true,
		embed: true,
		vision: true,
		streaming: true,
		toolCalling: true,
		maxContextTokens: 2_000_000,
	};

	private readonly baseUrl: string;

	constructor(private readonly config: GoogleProviderConfig) {
		this.baseUrl = (config.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
	}

	async isAvailable(): Promise<boolean> {
		return Boolean(this.config.apiKey);
	}

	async listModels(): Promise<ProviderModel[]> {
		return modelsByProvider("google");
	}

	async chat(req: ChatRequest): Promise<ChatResponse> {
		this.requireKey();
		const body = this.buildBody(req);
		const url = `${this.baseUrl}/models/${encodeURIComponent(req.model)}:generateContent?key=${this.config.apiKey}`;
		const r = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		if (!r.ok) throw await this.parseError(r);
		const data = (await r.json()) as GoogleResponse;
		const candidate = data.candidates?.[0];
		const content = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
		return {
			content,
			usage: {
				promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
				completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
				totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
			},
			finishReason: this.mapFinish(candidate?.finishReason),
		};
	}

	async *chatStream(req: ChatRequest): AsyncIterable<ChatStreamChunk> {
		this.requireKey();
		const body = this.buildBody(req);
		const url = `${this.baseUrl}/models/${encodeURIComponent(req.model)}:streamGenerateContent?alt=sse&key=${this.config.apiKey}`;
		const r = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		if (!r.ok) throw await this.parseError(r);
		if (!r.body) throw new AIProviderError("Google stream sem body", "google", "network");

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
				if (!line.startsWith("data:")) continue;
				const payload = line.slice(5).trim();
				if (!payload) continue;
				try {
					const j = JSON.parse(payload) as GoogleResponse;
					const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
					if (text) yield { delta: text };
					if (j.usageMetadata) {
						yield {
							delta: "",
							usage: {
								promptTokens: j.usageMetadata.promptTokenCount ?? 0,
								completionTokens: j.usageMetadata.candidatesTokenCount ?? 0,
								totalTokens: j.usageMetadata.totalTokenCount ?? 0,
							},
						};
					}
				} catch {
					// skip
				}
			}
		}
		yield { delta: "", done: true };
	}

	async embed(req: EmbedRequest): Promise<EmbedResponse> {
		this.requireKey();
		const out: number[][] = [];
		let totalTokens = 0;
		for (const text of req.texts) {
			const url = `${this.baseUrl}/models/${encodeURIComponent(req.model)}:embedContent?key=${this.config.apiKey}`;
			const r = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					content: { parts: [{ text }] },
				}),
			});
			if (!r.ok) throw await this.parseError(r);
			const data = (await r.json()) as { embedding?: { values: number[] } };
			out.push(data.embedding?.values ?? []);
			totalTokens += Math.ceil(text.length / 4);
		}
		return {
			embeddings: out,
			usage: { promptTokens: totalTokens, completionTokens: 0, totalTokens },
		};
	}

	async vision(req: VisionRequest): Promise<ChatResponse> {
		this.requireKey();
		const body = {
			contents: [
				{
					role: "user",
					parts: [
						{ text: req.prompt },
						{
							inline_data: {
								mime_type: req.mimeType ?? "image/png",
								data: req.imageBase64,
							},
						},
					],
				},
			],
		};
		const url = `${this.baseUrl}/models/${encodeURIComponent(req.model)}:generateContent?key=${this.config.apiKey}`;
		const r = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		if (!r.ok) throw await this.parseError(r);
		const data = (await r.json()) as GoogleResponse;
		const candidate = data.candidates?.[0];
		const content = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
		return {
			content,
			usage: {
				promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
				completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
				totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
			},
		};
	}

	private buildBody(req: ChatRequest): Record<string, unknown> {
		const sys = req.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
		const contents = req.messages
			.filter((m) => m.role !== "system")
			.map((m) => ({
				role: m.role === "assistant" ? "model" : "user",
				parts: [{ text: m.content }],
			}));
		const body: Record<string, unknown> = { contents };
		if (sys) body.systemInstruction = { parts: [{ text: sys }] };
		const generationConfig: Record<string, unknown> = {};
		if (req.temperature !== undefined) generationConfig.temperature = req.temperature;
		if (req.maxTokens) generationConfig.maxOutputTokens = req.maxTokens;
		if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;
		return body;
	}

	private requireKey(): void {
		if (!this.config.apiKey) {
			throw new AIProviderError("Google API key não configurada", "google", "missing-key");
		}
	}

	private async parseError(r: Response): Promise<AIProviderError> {
		let msg = `Google HTTP ${r.status}`;
		let code: AIProviderError["code"] = "unknown";
		try {
			const j = (await r.json()) as { error?: { message?: string; status?: string } };
			if (j.error?.message) msg = `Google: ${j.error.message}`;
			if (r.status === 401 || r.status === 403) code = "auth";
			else if (r.status === 429) code = "rate-limit";
			else if (r.status === 404) code = "model-not-found";
		} catch {
			// keep
		}
		return new AIProviderError(msg, "google", code, code === "rate-limit");
	}

	private mapFinish(r?: string): ChatResponse["finishReason"] {
		switch (r) {
			case "STOP":
				return "stop";
			case "MAX_TOKENS":
				return "length";
			default:
				return undefined;
		}
	}
}

interface GoogleResponse {
	candidates?: {
		content?: { parts?: { text?: string }[] };
		finishReason?: string;
	}[];
	usageMetadata?: {
		promptTokenCount?: number;
		candidatesTokenCount?: number;
		totalTokenCount?: number;
	};
}
