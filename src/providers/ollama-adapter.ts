/**
 * Atlas v0.17 — OllamaAdapter.
 *
 * Wraps the existing OllamaClient as an AIProvider so the router can
 * mix local + cloud uniformly.
 */

import type { OllamaClient } from "../ollama/client";
import {
	AIProviderError,
	type AIProvider,
	type ChatRequest,
	type ChatResponse,
	type ChatStreamChunk,
	type EmbedRequest,
	type EmbedResponse,
	type ProviderModel,
} from "./types";
import { modelsByProvider } from "./registry";
import { estimateTokens } from "./cost-tracker";

export class OllamaAdapter implements AIProvider {
	readonly id = "ollama" as const;
	readonly name = "Ollama (local)";
	readonly capabilities = {
		chat: true,
		embed: true,
		vision: false,
		streaming: true,
		toolCalling: true,
	};

	constructor(private readonly client: OllamaClient) {}

	async isAvailable(): Promise<boolean> {
		try {
			await this.client.listModels();
			return true;
		} catch {
			return false;
		}
	}

	async listModels(): Promise<ProviderModel[]> {
		// Combine curated registry list with what Ollama actually has installed
		return modelsByProvider("ollama");
	}

	async chat(req: ChatRequest): Promise<ChatResponse> {
		const text = await this.client.chat(
			req.messages.map((m) => ({ role: m.role === "tool" ? "user" : (m.role as "user" | "assistant" | "system"), content: m.content })),
			{ model: req.model, temperature: req.temperature, max_tokens: req.maxTokens }
		);
		// Ollama doesn't return token counts → estimate
		const promptTokens = estimateTokens(req.messages.map((m) => m.content).join("\n"));
		const completionTokens = estimateTokens(text);
		return {
			content: text,
			usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
			finishReason: "stop",
		};
	}

	async *chatStream(req: ChatRequest): AsyncIterable<ChatStreamChunk> {
		const tokens: string[] = [];
		const text = await this.client.chatStream(
			req.messages.map((m) => ({ role: m.role === "tool" ? "user" : (m.role as "user" | "assistant" | "system"), content: m.content })),
			{ model: req.model, temperature: req.temperature, max_tokens: req.maxTokens },
			(t) => tokens.push(t)
		);
		// chatStream blocks until done — we replay tokens here
		for (const t of tokens) yield { delta: t };
		const promptTokens = estimateTokens(req.messages.map((m) => m.content).join("\n"));
		const completionTokens = estimateTokens(text);
		yield {
			delta: "",
			usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
			done: true,
		};
	}

	async embed(req: EmbedRequest): Promise<EmbedResponse> {
		const embeddings = await this.client.embed(req.texts, req.model);
		const totalTokens = req.texts.reduce((sum, t) => sum + estimateTokens(t), 0);
		return {
			embeddings,
			usage: { promptTokens: totalTokens, completionTokens: 0, totalTokens },
		};
	}

	async vision(): Promise<ChatResponse> {
		throw new AIProviderError(
			"Vision via Ollama precisa de modelo multimodal (llama3.2-vision). Use OpenAI/Google/Anthropic ou pull o modelo manualmente.",
			"ollama",
			"unknown"
		);
	}
}
