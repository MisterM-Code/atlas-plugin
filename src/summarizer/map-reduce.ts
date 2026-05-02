import { OllamaClient } from "../ollama/client";
import { logger } from "../utils/logger";

export interface MapReduceOptions {
	model: string;
	mapPrompt: (chunkText: string) => string;
	reducePrompt: (mapSummaries: string[]) => string;
	mapTemperature?: number;
	reduceTemperature?: number;
	maxTokensMap?: number;
	maxTokensReduce?: number;
}

export class MapReduceSummarizer {
	private llm: import("../providers/llm-service").LLMService | null = null;

	constructor(private ollama: OllamaClient) {}

	setLLMService(llm: import("../providers/llm-service").LLMService): void {
		this.llm = llm;
	}

	async run(chunks: string[], opts: MapReduceOptions): Promise<string> {
		if (chunks.length === 0) return "";

		// MAP: summarize each chunk
		logger.info(`MapReduce: mapping ${chunks.length} chunks...`);
		const mapResults: string[] = [];
		for (let i = 0; i < chunks.length; i++) {
			try {
				const prompt = opts.mapPrompt(chunks[i]);
				const summary = this.llm
					? await this.llm.generate(prompt, {
							feature: "summarizer.map-reduce.map",
							taskKind: "summarization",
							temperature: opts.mapTemperature ?? 0.2,
							maxTokens: opts.maxTokensMap ?? 400,
					  })
					: await this.ollama.generate(prompt, {
							model: opts.model,
							temperature: opts.mapTemperature ?? 0.2,
							max_tokens: opts.maxTokensMap ?? 400,
					  });
				mapResults.push(summary.trim());
			} catch (e) {
				logger.warn(`MapReduce: map ${i} falhou`, { error: String(e) });
			}
		}

		if (mapResults.length === 0) return "";

		// REDUCE: combine summaries
		logger.info("MapReduce: reducing...");
		try {
			const reducePrompt = opts.reducePrompt(mapResults);
			const final = this.llm
				? await this.llm.generate(reducePrompt, {
						feature: "summarizer.map-reduce.reduce",
						taskKind: "summarization",
						temperature: opts.reduceTemperature ?? 0.3,
						maxTokens: opts.maxTokensReduce ?? 1500,
				  })
				: await this.ollama.generate(reducePrompt, {
						model: opts.model,
						temperature: opts.reduceTemperature ?? 0.3,
						max_tokens: opts.maxTokensReduce ?? 1500,
				  });
			return final.trim();
		} catch (e) {
			logger.error("MapReduce: reduce falhou", { error: String(e) });
			return mapResults.join("\n\n");
		}
	}
}
