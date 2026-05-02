/**
 * Atlas v0.4 — Error classifier para Ollama.
 *
 * Substitui erros axios técnicos (status 500 stack trace) por tipos
 * de erro humanizados com sugestão de ação concreta.
 */

export type AtlasErrorCode =
	| "ollama-oom"
	| "ollama-model-missing"
	| "ollama-daemon-down"
	| "ollama-timeout"
	| "ollama-invalid-json"
	| "ollama-unknown"
	| "ollama-bad-request"
	| "ollama-500"
	| "ollama-server-error"
	// v0.44 E3: cloud provider errors
	| "cloud-auth"
	| "cloud-ratelimit"
	| "cloud-quota"
	| "cloud-context-too-long"
	| "cloud-invalid-model"
	| "cloud-server-error"
	| "cloud-network"
	| "vault-unavailable"
	| "user-cancelled"
	| "unknown";

export interface AtlasErrorAction {
	label: string;
	commandId?: string; // Atlas command id para executar
	url?: string; // ou link externo
}

export class AtlasError extends Error {
	constructor(
		public code: AtlasErrorCode,
		message: string,
		public humanMessage: string,
		public actions: AtlasErrorAction[] = [],
		public original?: unknown
	) {
		super(message);
		this.name = "AtlasError";
	}
}

interface AxiosLikeError {
	response?: {
		status?: number;
		data?: { error?: string; message?: string };
	};
	message?: string;
	code?: string;
}

/**
 * v0.44 E3: Classifica erro de cloud providers (OpenAI/Anthropic/Google/etc).
 *
 * Detecta provider via URL e mapeia HTTP status pra AtlasError descritivo.
 * Retorna null se não for cloud (caller deve tentar classifyOllamaError em seguida).
 */
export function classifyCloudError(e: unknown): AtlasError | null {
	const ax = e as AxiosLikeError & { config?: { url?: string; baseURL?: string } };
	const url = ax.config?.url ?? ax.config?.baseURL ?? "";
	const status = ax.response?.status;

	// Provider detection
	let provider: string;
	if (url.includes("openai.com") || url.includes("/v1/chat/completions")) {
		// Heuristic: OpenAI-compat endpoints could be xAI, Groq, OpenRouter
		if (url.includes("x.ai")) provider = "xAI";
		else if (url.includes("groq.com")) provider = "Groq";
		else if (url.includes("openrouter.ai")) provider = "OpenRouter";
		else if (url.includes("deepseek.com")) provider = "DeepSeek";
		else provider = "OpenAI";
	} else if (url.includes("anthropic.com")) provider = "Anthropic";
	else if (url.includes("googleapis.com") || url.includes("generativelanguage")) provider = "Google";
	else if (url.includes("mistral.ai")) provider = "Mistral";
	else if (url.includes("cohere")) provider = "Cohere";
	else return null; // Not cloud — fallback to ollama classifier

	const dataMsg =
		(ax.response?.data?.error as { message?: string } | string | undefined) ?? "";
	const errMsg =
		typeof dataMsg === "string" ? dataMsg : dataMsg?.message ?? ax.response?.data?.message ?? ax.message ?? "";

	// 401 — auth issue
	if (status === 401 || status === 403) {
		return new AtlasError(
			"cloud-auth",
			`${provider} ${status}: ${errMsg}`,
			`${provider}: API key inválida ou sem permissão. Verifique sua key em Settings → ☁️ Cloud Providers.`,
			[
				{ label: "Abrir Settings → Atlas", commandId: "app:open-settings" },
				{ label: "Trocar pra Ollama (local)", commandId: "atlas:switch-to-ollama" },
			],
			e
		);
	}

	// 429 — rate limit / quota
	if (status === 429) {
		const isQuota = /quota|exceeded|insufficient/i.test(errMsg);
		if (isQuota) {
			return new AtlasError(
				"cloud-quota",
				`${provider} 429: quota exceeded`,
				`${provider}: Quota mensal excedida. Revise budget em Settings ou aguarde reset do mês.`,
				[
					{ label: "Atlas Status → Spend", commandId: "atlas:status-panel" },
					{ label: "Trocar pra Ollama", commandId: "atlas:switch-to-ollama" },
				],
				e
			);
		}
		return new AtlasError(
			"cloud-ratelimit",
			`${provider} 429: rate limit`,
			`${provider}: Limite de requests/min atingido. Aguarde ~1 min e tente de novo.`,
			[
				{ label: "Tentar de novo em 1 min" },
				{ label: "Trocar pra Ollama", commandId: "atlas:switch-to-ollama" },
			],
			e
		);
	}

	// 400 — context_length / invalid params
	if (status === 400) {
		if (/context.*length|too.*many.*tokens|maximum.*context|too.*long/i.test(errMsg)) {
			return new AtlasError(
				"cloud-context-too-long",
				`${provider} 400: context too long`,
				`${provider}: Contexto excede limite do modelo. Reduza histórico do chat ou troque pra modelo de context maior.`,
				[
					{ label: "Limpar memory do chat" },
					{ label: "Trocar modelo (Sonnet 200K context)" },
				],
				e
			);
		}
		if (/model.*not.*found|invalid.*model|unknown.*model/i.test(errMsg)) {
			return new AtlasError(
				"cloud-invalid-model",
				`${provider} 400: model invalid`,
				`${provider}: Modelo configurado não existe ou foi descontinuado. Atualize routing em Settings.`,
				[{ label: "Abrir Settings", commandId: "app:open-settings" }],
				e
			);
		}
		return new AtlasError(
			"cloud-server-error",
			`${provider} 400: ${errMsg}`,
			`${provider}: Request inválida — ${errMsg}`,
			[{ label: "Reportar bug" }],
			e
		);
	}

	// 5xx — provider server-side
	if (status && status >= 500 && status < 600) {
		return new AtlasError(
			"cloud-server-error",
			`${provider} ${status}: ${errMsg ?? "server error"}`,
			`${provider} retornou ${status}. Pode ser instabilidade do provider — tente outro provider ou Ollama.`,
			[
				{ label: "Tentar de novo" },
				{ label: "Trocar provider em Settings" },
				{ label: "Trocar pra Ollama", commandId: "atlas:switch-to-ollama" },
			],
			e
		);
	}

	// Network errors
	if (ax.code === "ECONNREFUSED" || ax.code === "ENOTFOUND" || ax.code === "ETIMEDOUT") {
		return new AtlasError(
			"cloud-network",
			`${provider} network: ${ax.code}`,
			`${provider}: Sem conexão. Verifique internet ou troque pra Ollama (local, sem internet).`,
			[
				{ label: "Trocar pra Ollama", commandId: "atlas:switch-to-ollama" },
			],
			e
		);
	}

	return null; // unknown — let other classifiers try
}

/**
 * Classifica erro qualquer (geralmente axios) em AtlasError tipado.
 */
export function classifyOllamaError(e: unknown): AtlasError {
	const ax = e as AxiosLikeError;

	// Network: ECONNREFUSED → daemon offline
	if (ax.code === "ECONNREFUSED" || ax.message?.includes("ECONNREFUSED")) {
		return new AtlasError(
			"ollama-daemon-down",
			"Ollama daemon offline",
			"Ollama não está rodando. Inicie o app Ollama (ou rode `ollama serve` no terminal).",
			[
				{ label: "Como instalar", url: "https://ollama.com" },
				{ label: "Atlas Status Panel", commandId: "atlas:status-panel" },
			],
			e
		);
	}

	// Timeout
	if (ax.code === "ECONNABORTED" || ax.message?.toLowerCase().includes("timeout")) {
		return new AtlasError(
			"ollama-timeout",
			"Ollama timeout",
			"Demorou demais. Modelo grande pode levar tempo no primeiro uso. Pode ser cold-start.",
			[
				{ label: "Tentar novamente" },
				{ label: "Trocar modelo (mais leve)", commandId: "atlas:status-panel" },
			],
			e
		);
	}

	// Ollama 500 com error string
	if (ax.response?.status === 500) {
		const errStr = (ax.response.data?.error ?? ax.response.data?.message ?? "").toLowerCase();

		// OOM (out of memory)
		if (
			errStr.includes("llama runner process has terminated") ||
			errStr.includes("out of memory") ||
			errStr.includes("oom") ||
			errStr.includes("cannot allocate")
		) {
			return new AtlasError(
				"ollama-oom",
				`Ollama OOM: ${errStr}`,
				"Modelo grande não cabe na sua RAM disponível. Vamos trocar para um modelo menor?",
				[
					{ label: "Pull qwen2.5:7b (recomendado)", commandId: "atlas:pull-recommended-model" },
					{ label: "Atlas Status Panel", commandId: "atlas:status-panel" },
					{ label: "Fechar apps pesados e tentar de novo" },
				],
				e
			);
		}

		// Model not found
		if (errStr.includes("model") && (errStr.includes("not found") || errStr.includes("does not exist"))) {
			return new AtlasError(
				"ollama-model-missing",
				`Ollama model missing: ${errStr}`,
				"Modelo não baixado. Vamos baixar agora?",
				[
					{ label: "Pull modelo", commandId: "atlas:pull-recommended-model" },
					{ label: "Settings → trocar modelo" },
				],
				e
			);
		}

		// Generic 500
		return new AtlasError(
			"ollama-unknown",
			`Ollama 500: ${errStr}`,
			`Ollama retornou erro inesperado: "${errStr}". Pode ser modelo corrompido ou daemon instável.`,
			[
				{ label: "Atlas Status Panel", commandId: "atlas:status-panel" },
				{ label: "Reiniciar Ollama", commandId: "atlas:restart-ollama" },
			],
			e
		);
	}

	// 400-499 — bad request
	if (ax.response?.status && ax.response.status >= 400 && ax.response.status < 500) {
		return new AtlasError(
			"ollama-bad-request",
			`Ollama ${ax.response.status}: ${ax.message ?? "bad request"}`,
			"Atlas enviou request inválida ao Ollama. Reporte como bug.",
			[{ label: "Atlas Status Panel", commandId: "atlas:status-panel" }],
			e
		);
	}

	// 500 — server-side error (often timeout, OOM, model crash)
	if (ax.response?.status === 500) {
		return new AtlasError(
			"ollama-500",
			"HTTP 500 do servidor Ollama",
			"Servidor Ollama retornou 500 — pode ser timeout, falta de memória ou erro interno do modelo. Verifique o Atlas Status Panel para detalhes do daemon e RAM.",
			[
				{ label: "Tentar novamente" },
				{ label: "Atlas Status Panel", commandId: "atlas:status-panel" },
				{ label: "Reiniciar Ollama", commandId: "atlas:restart-ollama" },
			],
			e
		);
	}

	// 502/503/504 — gateway/unavailable
	if (ax.response?.status && ax.response.status >= 500 && ax.response.status < 600) {
		return new AtlasError(
			"ollama-server-error",
			`Ollama HTTP ${ax.response.status}`,
			`Servidor Ollama indisponível (${ax.response.status}). Daemon pode estar reiniciando ou ocupado.`,
			[
				{ label: "Atlas Status Panel", commandId: "atlas:status-panel" },
				{ label: "Reiniciar Ollama", commandId: "atlas:restart-ollama" },
			],
			e
		);
	}

	// JSON parse fail
	if (ax.message?.toLowerCase().includes("json") || ax.message?.toLowerCase().includes("parse")) {
		return new AtlasError(
			"ollama-invalid-json",
			"Ollama returned invalid JSON",
			"Modelo retornou resposta inválida. Pode ser prompt longo ou modelo confuso.",
			[{ label: "Tentar com prompt mais curto" }],
			e
		);
	}

	// Default
	return new AtlasError(
		"unknown",
		ax.message ?? String(e),
		`Erro inesperado: ${ax.message ?? String(e)}`,
		[{ label: "Atlas Status Panel", commandId: "atlas:status-panel" }],
		e
	);
}

/**
 * Helper: dá um Notice + opções no Obsidian.
 */
export function describeError(err: AtlasError): string {
	const parts = [`⚠️ ${err.humanMessage}`];
	if (err.actions.length > 0) {
		parts.push(`Ações: ${err.actions.map((a) => a.label).join(" · ")}`);
	}
	return parts.join("\n");
}
