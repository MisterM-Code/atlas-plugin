import * as os from "os";
import { OllamaClient } from "../ollama/client";
import { logger } from "../utils/logger";

export interface ModelInfo {
	name: string;
	size: number; // bytes
	parameterSize: string;
	quantization: string;
	estimatedRamGB: number; // estimado pra carregar
}

export interface SystemHealth {
	timestamp: string;
	ollamaUp: boolean;
	ollamaError?: string;
	pingMs?: number;
	models: ModelInfo[];
	configuredModel: string;
	configuredModelAvailable: boolean;
	configuredModelFitsRam: boolean | null;
	totalRamGB: number;
	freeRamGB: number;
	usedRamGB: number;
	cpuModel: string;
	cpuCount: number;
	platform: string;
	recommendations: string[];
	lastError?: { code: string; message: string; at: string };
}

const MODEL_RAM_MULTIPLIER = 1.15; // ~15% overhead vs raw size

export class HealthCheck {
	private lastHealth: SystemHealth | null = null;
	public lastError: { code: string; message: string; at: string } | null = null;

	constructor(private ollama: OllamaClient) {}

	recordError(code: string, message: string): void {
		this.lastError = {
			code,
			message,
			at: new Date().toISOString(),
		};
	}

	async run(configuredModel: string): Promise<SystemHealth> {
		const start = Date.now();
		const totalRamBytes = os.totalmem();
		const freeRamBytes = os.freemem();
		const totalRamGB = +(totalRamBytes / 1_073_741_824).toFixed(1);
		const freeRamGB = +(freeRamBytes / 1_073_741_824).toFixed(1);
		const usedRamGB = +((totalRamBytes - freeRamBytes) / 1_073_741_824).toFixed(1);

		let ollamaUp = false;
		let ollamaError: string | undefined;
		let pingMs: number | undefined;
		let models: ModelInfo[] = [];

		try {
			const t0 = Date.now();
			ollamaUp = await this.ollama.ping();
			pingMs = Date.now() - t0;
			if (ollamaUp) {
				const list = await this.fetchModelDetails();
				models = list;
			}
		} catch (e) {
			ollamaError = String(e);
		}

		const configuredModelInfo = models.find(
			(m) => m.name === configuredModel || m.name.startsWith(configuredModel.split(":")[0] + ":")
		);
		const configuredModelAvailable = !!configuredModelInfo;
		const configuredModelFitsRam =
			configuredModelInfo === undefined
				? null
				: configuredModelInfo.estimatedRamGB <= freeRamGB;

		const recommendations = this.computeRecommendations({
			ollamaUp,
			models,
			configuredModel,
			configuredModelInfo,
			freeRamGB,
			totalRamGB,
		});

		const health: SystemHealth = {
			timestamp: new Date().toISOString(),
			ollamaUp,
			ollamaError,
			pingMs,
			models,
			configuredModel,
			configuredModelAvailable,
			configuredModelFitsRam,
			totalRamGB,
			freeRamGB,
			usedRamGB,
			cpuModel: os.cpus()[0]?.model ?? "—",
			cpuCount: os.cpus().length,
			platform: process.platform,
			recommendations,
			lastError: this.lastError ?? undefined,
		};

		this.lastHealth = health;
		logger.info("health-check", {
			ollamaUp,
			models: models.length,
			pingMs,
			freeRamGB,
		});
		void start;
		return health;
	}

	getLast(): SystemHealth | null {
		return this.lastHealth;
	}

	private async fetchModelDetails(): Promise<ModelInfo[]> {
		// Ollama exposes /api/tags com size + details
		try {
			const { requestUrl } = await import("obsidian");
			const r = await requestUrl({ url: `http://localhost:11434/api/tags`, throw: false });
			if (r.status !== 200) return [];
			const data = r.json as { models?: RawModel[] };
			const models = data.models ?? [];
			return models.map((m) => {
				const sizeBytes = m.size ?? 0;
				const sizeGB = sizeBytes / 1_073_741_824;
				const estimatedRamGB = +(sizeGB * MODEL_RAM_MULTIPLIER).toFixed(1);
				return {
					name: m.name,
					size: sizeBytes,
					parameterSize: m.details?.parameter_size ?? "—",
					quantization: m.details?.quantization_level ?? "—",
					estimatedRamGB,
				};
			});
		} catch {
			return [];
		}
	}

	private computeRecommendations(input: {
		ollamaUp: boolean;
		models: ModelInfo[];
		configuredModel: string;
		configuredModelInfo: ModelInfo | undefined;
		freeRamGB: number;
		totalRamGB: number;
	}): string[] {
		const recs: string[] = [];

		if (!input.ollamaUp) {
			recs.push("Ollama está offline. Inicie o app Ollama.");
			return recs;
		}

		if (!input.configuredModelInfo) {
			recs.push(
				`Modelo configurado "${input.configuredModel}" não baixado. Pull agora.`
			);
		} else if (input.configuredModelInfo.estimatedRamGB > input.freeRamGB) {
			recs.push(
				`Modelo "${input.configuredModelInfo.name}" precisa ~${input.configuredModelInfo.estimatedRamGB} GB mas você só tem ${input.freeRamGB} GB livres. Risco de OOM.`
			);
			// Suggest smaller available model
			const smaller = input.models
				.filter((m) => m.estimatedRamGB <= input.freeRamGB - 0.5)
				.filter((m) => !/embed|reranker/i.test(m.name))
				.sort((a, b) => b.estimatedRamGB - a.estimatedRamGB)[0];
			if (smaller) {
				recs.push(
					`Sugestão: trocar para "${smaller.name}" (~${smaller.estimatedRamGB} GB).`
				);
			} else {
				recs.push("Nenhum modelo menor disponível. Pull qwen2.5:7b (~5.5 GB)?");
			}
		}

		if (input.totalRamGB < 16) {
			recs.push(
				`Sistema com ${input.totalRamGB} GB RAM. Recomendamos modelos ≤7B em Q4 quantization.`
			);
		}

		const hasEmbedder = input.models.some((m) => /bge-m3|embed/i.test(m.name));
		if (!hasEmbedder) {
			recs.push("Embedder (bge-m3) não detectado. Search semântica não funcionará.");
		}

		return recs;
	}
}

interface RawModel {
	name: string;
	size?: number;
	details?: {
		parameter_size?: string;
		quantization_level?: string;
	};
}
