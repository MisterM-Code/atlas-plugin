/**
 * Atlas v0.17 — AIProvider abstraction.
 *
 * Unified interface across local (Ollama) and cloud providers (OpenAI, Anthropic, Google, …).
 * Allows per-task routing, failover, cost tracking, streaming, tool calling.
 */

export type ProviderId =
	| "ollama"
	| "openai"
	| "anthropic"
	| "google"
	| "mistral"
	| "xai"
	| "openrouter"
	| "groq"
	| "deepseek"
	| "cohere";

export type TaskKind =
	| "chat"
	| "extraction"
	| "embedding"
	| "vision"
	| "reasoning"
	| "tool-calling"
	| "summarization";

export interface AIProviderCapabilities {
	chat: boolean;
	embed: boolean;
	vision: boolean;
	streaming: boolean;
	toolCalling: boolean;
	maxContextTokens?: number;
}

export interface ChatMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string;
	name?: string; // for tool messages
	toolCallId?: string;
}

export interface ToolDefinition {
	name: string;
	description: string;
	parameters: Record<string, unknown>; // JSON Schema
}

export interface ToolCallDelta {
	id?: string;
	name?: string;
	arguments?: string;
}

export interface ChatRequest {
	messages: ChatMessage[];
	model: string;
	temperature?: number;
	maxTokens?: number;
	tools?: ToolDefinition[];
	taskKind?: TaskKind;
	feature?: string; // human-readable origin: "chat-tab", "weekly-report", etc
}

export interface ChatResponse {
	content: string;
	usage: TokenUsage;
	toolCalls?: { id: string; name: string; arguments: string }[];
	finishReason?: "stop" | "length" | "tool-calls" | "error";
	cached?: boolean;
}

export interface ChatStreamChunk {
	delta: string;
	toolCallDelta?: ToolCallDelta;
	usage?: TokenUsage; // emitted at end if available
	done?: boolean;
}

export interface EmbedRequest {
	texts: string[];
	model: string;
	feature?: string;
}

export interface EmbedResponse {
	embeddings: number[][];
	usage: TokenUsage;
}

export interface VisionRequest {
	prompt: string;
	imageBase64: string; // raw base64 (no data: prefix)
	mimeType?: string; // image/png | image/jpeg
	model: string;
	feature?: string;
}

export interface TokenUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
}

export interface AIProvider {
	id: ProviderId;
	name: string;
	capabilities: AIProviderCapabilities;
	/** Returns true if provider is configured & ready (api key present, etc). */
	isAvailable(): Promise<boolean>;
	chat?(req: ChatRequest): Promise<ChatResponse>;
	chatStream?(req: ChatRequest): AsyncIterable<ChatStreamChunk>;
	embed?(req: EmbedRequest): Promise<EmbedResponse>;
	vision?(req: VisionRequest): Promise<ChatResponse>;
	/** List models available on this provider (cached). */
	listModels(): Promise<ProviderModel[]>;
}

export interface ProviderModel {
	id: string;
	name: string;
	provider: ProviderId;
	capabilities: AIProviderCapabilities;
	/** USD per 1M tokens. */
	pricePer1M: { input: number; output: number; cachedInput?: number };
	contextWindow: number;
	/** "tiny" | "balanced" | "premium" — guidance for routing. */
	tier: "tiny" | "balanced" | "premium";
}

export interface ProviderError extends Error {
	provider: ProviderId;
	code: "missing-key" | "rate-limit" | "auth" | "network" | "model-not-found" | "context-length" | "budget-exceeded" | "unknown";
	retriable: boolean;
}

export class AIProviderError extends Error implements ProviderError {
	constructor(
		message: string,
		public provider: ProviderId,
		public code: ProviderError["code"],
		public retriable = false
	) {
		super(message);
		this.name = "AIProviderError";
	}
}
