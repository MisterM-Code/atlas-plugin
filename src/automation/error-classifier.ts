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
