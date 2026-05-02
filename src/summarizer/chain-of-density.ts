import { OllamaClient } from "../ollama/client";
import { logger } from "../utils/logger";

const COD_PROMPT_PT = `Você é um especialista em produzir resumos densos em informação para um coordenador/coach.

Vou te dar um texto longo e você vai produzir um resumo final através de iterações de "Chain of Density":

Iteração 1: resumo inicial breve (3-4 frases), genérico.
Iteração 2: identifique 1-3 entidades faltantes (pessoas, datas, decisões, números). Reescreva mantendo o MESMO tamanho mas incorporando essas entidades. Permita estilo mais denso.
Iteração 3: idem.
Iteração 4: idem — agora cada palavra carrega informação. Se algo não agrega, corte.

Retorne APENAS o resumo final (iteração 4), sem explicar o processo.

REGRAS:
- Tamanho fixo (mesma quantidade de palavras das iterações).
- Sem invenções.
- Foque em fatos, decisões, datas, pessoas, padrões.
- Português Brasil.

`;

export class ChainOfDensity {
	constructor(private ollama: OllamaClient, private model: string) {}

	async densify(text: string, targetLength = 200): Promise<string> {
		const prompt = `${COD_PROMPT_PT}

Tamanho-alvo: ${targetLength} palavras.

Texto:
"""
${text}
"""

Resumo final (iteração 4):`;

		try {
			const out = await this.ollama.generate(prompt, {
				model: this.model,
				temperature: 0.3,
				max_tokens: 800,
			});
			return out.trim();
		} catch (e) {
			logger.warn("CoD: falhou", { error: String(e) });
			return text.substring(0, targetLength * 6); // fallback
		}
	}
}
