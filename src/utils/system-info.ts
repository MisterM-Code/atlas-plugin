import * as os from "os";

export type RamProfile = "light" | "balanced" | "power" | "unknown";

export interface SystemInfo {
	totalRamGB: number;
	freeRamGB: number;
	platform: NodeJS.Platform;
	cpuCount: number;
	cpuModel: string;
	profile: RamProfile;
}

export function detectSystemInfo(): SystemInfo {
	let totalRamGB = 0;
	let freeRamGB = 0;
	try {
		totalRamGB = Math.round(os.totalmem() / 1_073_741_824);
		freeRamGB = Math.round(os.freemem() / 1_073_741_824);
	} catch {
		// Electron/Obsidian sandbox limitations could fall here
	}

	const platform = process.platform;
	let cpuCount = 0;
	let cpuModel = "unknown";
	try {
		const cpus = os.cpus();
		cpuCount = cpus.length;
		cpuModel = cpus[0]?.model ?? "unknown";
	} catch {
		// noop
	}

	const profile = ramToProfile(totalRamGB);
	return { totalRamGB, freeRamGB, platform, cpuCount, cpuModel, profile };
}

export function ramToProfile(totalRamGB: number): RamProfile {
	if (totalRamGB >= 32) return "power";
	if (totalRamGB >= 16) return "balanced";
	if (totalRamGB >= 8) return "light";
	if (totalRamGB > 0) return "light"; // sub-8 still gets light, with warnings
	return "unknown";
}

export interface ProfileRecommendation {
	profile: RamProfile;
	generationModel: string;
	smallModel: string;
	embeddingModel: string;
	rerankerModel: string;
	visionAvailable: boolean;
	reasoningModelHeavy: boolean; // true if can run R1 14B
	notes: string[];
}

export function recommendationForProfile(profile: RamProfile): ProfileRecommendation {
	switch (profile) {
		case "power":
			return {
				profile,
				generationModel: "qwen2.5-coder:32b",
				smallModel: "phi4-mini",
				embeddingModel: "bge-m3",
				rerankerModel: "bge-reranker-v2-m3",
				visionAvailable: true,
				reasoningModelHeavy: true,
				notes: [
					"32 GB+ permite stack premium",
					"Qwen 32B (~21 GB Q4_K_M) + DeepSeek R1 14B reasoning + vision",
					"Pode pull `deepseek-r1:14b` para reasoning visível",
					"Pode pull `llama3.2-vision:11b` para multimodal",
				],
			};
		case "balanced":
			return {
				profile,
				generationModel: "qwen2.5:14b",
				smallModel: "phi4-mini",
				embeddingModel: "bge-m3",
				rerankerModel: "bge-reranker-v2-m3",
				visionAvailable: false,
				reasoningModelHeavy: false,
				notes: [
					"16 GB stack médio: qwen2.5:14b principal",
					"Reranker carregável on-demand",
					"Vision disponível mas opt-in (consumo temporário 8 GB)",
					"Reasoning via phi-4-mini (DeepSeek R1 14B fica apertado)",
				],
			};
		case "light":
		default:
			return {
				profile: "light",
				generationModel: "qwen2.5:7b-instruct",
				smallModel: "phi4-mini",
				embeddingModel: "bge-m3",
				rerankerModel: "bge-reranker-v2-m3",
				visionAvailable: false,
				reasoningModelHeavy: false,
				notes: [
					"8 GB stack leve: qwen2.5:7b principal (~4.5 GB) + phi-4-mini (auto-tag/classify)",
					"Reranker carrega/descarrega POR query (overhead +200ms)",
					"Vision/Reasoning 14B NÃO disponíveis por padrão",
					"Eviction agressiva entre tasks",
					"Recomenda fechar apps pesados durante indexação inicial",
				],
			};
	}
}
