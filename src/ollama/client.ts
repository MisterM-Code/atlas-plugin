import axios, { AxiosInstance } from "axios";
import { logger } from "../utils/logger";
import { classifyOllamaError } from "../automation/error-classifier";

/** Hook que permite OllamaClient pedir um modelo menor quando OOM. */
export interface OOMFallbackHook {
	/** Retorna nome de modelo menor recomendado, ou null se já está no menor. */
	recommendSmaller(currentModel: string): string | null;
	/** Callback quando troca de modelo ocorre (UX feedback). */
	onSwitch?: (from: string, to: string) => void;
}

export interface OllamaConfig {
	baseUrl: string;
	timeout_ms: number;
}

export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface GenerateOptions {
	model: string;
	temperature?: number;
	max_tokens?: number;
	format?: "json" | undefined;
	stream?: boolean;
}

export class OllamaClient {
	private http: AxiosInstance;
	private oomFallback: OOMFallbackHook | null = null;

	/** Setter usado pelo plugin pra registrar hook de auto-fallback OOM. */
	setOOMFallback(hook: OOMFallbackHook | null): void {
		this.oomFallback = hook;
	}

	constructor(private config: OllamaConfig) {
		this.http = axios.create({
			baseURL: config.baseUrl,
			timeout: config.timeout_ms,
			headers: { "Content-Type": "application/json" },
		});
	}

	async ping(): Promise<boolean> {
		try {
			const r = await this.http.get("/api/tags", { timeout: 3000 });
			return r.status === 200;
		} catch (e) {
			logger.warn("Ollama not reachable", { error: String(e) });
			return false;
		}
	}

	async listModels(): Promise<string[]> {
		try {
			const r = await this.http.get("/api/tags");
			const models: { name: string }[] = r.data?.models ?? [];
			return models.map((m) => m.name);
		} catch (e) {
			logger.warn("listModels failed", { error: String(e) });
			return [];
		}
	}

	async hasModel(model: string): Promise<boolean> {
		const models = await this.listModels();
		return models.some((m) => m === model || m.startsWith(model + ":"));
	}

	/**
	 * v0.7.5: Hot-swap modelo runtime.
	 * Descarrega modelo antigo + carrega novo sem reload do plugin.
	 */
	async swapModel(fromModel: string, toModel: string): Promise<void> {
		try {
			// Unload via /api/generate com keep_alive: 0 (Ollama trick)
			await fetch(`${this.config.baseUrl}/api/generate`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ model: fromModel, prompt: "", keep_alive: 0 }),
			}).catch(() => undefined);
			// Preload toModel com chamada warmup
			await fetch(`${this.config.baseUrl}/api/generate`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: toModel,
					prompt: "ok",
					stream: false,
					options: { num_predict: 1 },
				}),
			});
			logger.info("ollama: swap model", { from: fromModel, to: toModel });
		} catch (e) {
			logger.warn("ollama: swap falhou (não-bloqueante)", { error: String(e) });
		}
	}

	async pullModel(model: string, onProgress?: (status: string, pct: number) => void): Promise<void> {
		// fetch API + ReadableStream — funciona em Electron renderer.
		// Axios com responseType:"stream" NAO funciona aqui (devolve Blob, não Node Readable).
		const response = await fetch(`${this.config.baseUrl}/api/pull`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: model, stream: true }),
		});

		if (!response.ok) {
			throw new Error(
				`Atlas: Ollama retornou ${response.status} ao pull "${model}". Verifique se o daemon está rodando.`
			);
		}

		if (!response.body) {
			throw new Error("Atlas: resposta sem body — não foi possível ler stream.");
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder("utf-8");
		let buf = "";

		try {
			// eslint-disable-next-line no-constant-condition
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				buf += decoder.decode(value, { stream: true });

				const lines = buf.split("\n");
				buf = lines.pop() ?? ""; // mantém parcial pra próxima iteração

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed) continue;
					try {
						const parsed = JSON.parse(trimmed) as {
							status?: string;
							completed?: number;
							total?: number;
							error?: string;
						};
						if (parsed.error) {
							throw new Error(`Ollama: ${parsed.error}`);
						}
						if (onProgress && parsed.status) {
							const pct =
								parsed.completed && parsed.total
									? (parsed.completed / parsed.total) * 100
									: 0;
							onProgress(parsed.status, pct);
						}
					} catch (parseErr) {
						// Re-throw se for o erro do Ollama; ignora se for parse error mid-stream
						if (parseErr instanceof Error && parseErr.message.startsWith("Ollama:")) {
							throw parseErr;
						}
					}
				}
			}

			// Flush final buffer
			if (buf.trim()) {
				try {
					const parsed = JSON.parse(buf);
					if (onProgress && parsed.status) {
						onProgress(parsed.status, 100);
					}
				} catch {
					// ignore
				}
			}
		} finally {
			try {
				reader.releaseLock();
			} catch {
				// already released
			}
		}
	}

	async chat(messages: ChatMessage[], opts: GenerateOptions, _retryCount = 0): Promise<string> {
		try {
			const r = await this.http.post("/api/chat", {
				model: opts.model,
				messages,
				stream: false,
				options: {
					temperature: opts.temperature ?? 0.3,
					num_predict: opts.max_tokens ?? -1,
				},
				format: opts.format,
			});
			// Ollama às vezes retorna 200 mas com erro embedded
			if (r.data?.error) {
				throw classifyOllamaError({
					response: { status: 500, data: { error: r.data.error } },
				});
			}
			return r.data?.message?.content ?? "";
		} catch (e) {
			const classified = classifyOllamaError(e);
			// v0.7.1 P0 fix: OOM auto-switch com 1 retry
			if (
				classified.code === "ollama-oom" &&
				_retryCount === 0 &&
				this.oomFallback
			) {
				const smaller = this.oomFallback.recommendSmaller(opts.model);
				if (smaller && smaller !== opts.model) {
					logger.warn("OOM auto-switch", { from: opts.model, to: smaller });
					this.oomFallback.onSwitch?.(opts.model, smaller);
					return this.chat(messages, { ...opts, model: smaller }, _retryCount + 1);
				}
			}
			throw classified;
		}
	}

	/**
	 * v0.7.1 NEW: Streaming chat token-by-token via fetch + ReadableStream.
	 * onToken é chamado a cada chunk recebido. Retorna texto completo no final.
	 */
	async chatStream(
		messages: ChatMessage[],
		opts: GenerateOptions,
		onToken: (chunk: string) => void,
		signal?: AbortSignal,
		_retryCount = 0
	): Promise<string> {
		try {
			const response = await fetch(`${this.config.baseUrl}/api/chat`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: opts.model,
					messages,
					stream: true,
					options: {
						temperature: opts.temperature ?? 0.3,
						num_predict: opts.max_tokens ?? -1,
					},
					format: opts.format,
				}),
				signal,
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			if (!response.body) {
				throw new Error("Sem response.body");
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder("utf-8");
			let buf = "";
			let fullText = "";

			try {
				// eslint-disable-next-line no-constant-condition
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					buf += decoder.decode(value, { stream: true });
					const lines = buf.split("\n");
					buf = lines.pop() ?? "";

					for (const line of lines) {
						const trimmed = line.trim();
						if (!trimmed) continue;
						try {
							const parsed = JSON.parse(trimmed) as {
								message?: { content?: string };
								done?: boolean;
								error?: string;
							};
							if (parsed.error) {
								throw classifyOllamaError({
									response: { status: 500, data: { error: parsed.error } },
								});
							}
							const token = parsed.message?.content;
							if (token) {
								fullText += token;
								onToken(token);
							}
						} catch (parseErr) {
							if (parseErr && typeof parseErr === "object" && "code" in parseErr) {
								throw parseErr;
							}
							// JSON parse error mid-stream — skip
						}
					}
				}
			} finally {
				try {
					reader.releaseLock();
				} catch {
					// already released
				}
			}

			return fullText;
		} catch (e) {
			const classified = classifyOllamaError(e);
			if (
				classified.code === "ollama-oom" &&
				_retryCount === 0 &&
				this.oomFallback
			) {
				const smaller = this.oomFallback.recommendSmaller(opts.model);
				if (smaller && smaller !== opts.model) {
					logger.warn("OOM auto-switch (stream)", { from: opts.model, to: smaller });
					this.oomFallback.onSwitch?.(opts.model, smaller);
					return this.chatStream(messages, { ...opts, model: smaller }, onToken, signal, _retryCount + 1);
				}
			}
			throw classified;
		}
	}

	async generate(prompt: string, opts: GenerateOptions): Promise<string> {
		try {
			const r = await this.http.post("/api/generate", {
				model: opts.model,
				prompt,
				stream: false,
				options: {
					temperature: opts.temperature ?? 0.3,
					num_predict: opts.max_tokens ?? -1,
				},
				format: opts.format,
			});
			if (r.data?.error) {
				throw classifyOllamaError({
					response: { status: 500, data: { error: r.data.error } },
				});
			}
			return r.data?.response ?? "";
		} catch (e) {
			throw classifyOllamaError(e);
		}
	}

	async embed(input: string | string[], model: string): Promise<number[][]> {
		const arr = Array.isArray(input) ? input : [input];
		try {
			const r = await this.http.post("/api/embed", { model, input: arr });
			if (r.data?.error) {
				throw classifyOllamaError({
					response: { status: 500, data: { error: r.data.error } },
				});
			}
			return r.data?.embeddings ?? [];
		} catch (e) {
			throw classifyOllamaError(e);
		}
	}
}
