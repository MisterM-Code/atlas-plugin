import { OllamaClient } from "../ollama/client";
import { logger } from "../utils/logger";
import { z } from "zod";

const FlashcardItem = z.object({
	question: z.string(),
	answer: z.string(),
	difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
});

const FlashcardBatch = z.object({
	cards: z.array(FlashcardItem),
});

const SYSTEM_PROMPT = `Você é Atlas, especialista em criar flashcards de alta qualidade para spaced repetition.

Princípios (Wozniak / SuperMemo):
1. **Atomicidade**: 1 card = 1 conceito. Nunca empilhar.
2. **Concretude**: pergunta direta, resposta curta (≤80 palavras).
3. **Encoraje recall ativo**: pergunta deve ser desafiadora, não trivial.
4. **Cloze deletion** quando faz sentido (sublinhe conceito chave).
5. **Sem ambiguidade**: pergunta tem resposta única.
6. **Conexão**: prefira "por quê" sobre "o quê".

Dado um texto (paper, aula, capítulo), gere 5-10 flashcards de qualidade.

Retorne APENAS JSON válido neste schema:
{
  "cards": [
    {"question": "string", "answer": "string", "difficulty": "easy|medium|hard"}
  ]
}

PT-BR. Sem invenções fora do texto. Sem markdown nas respostas.`;

const FEW_SHOT_USER = `Texto:
"""
Título: Distillation in Knowledge Graphs (Smith 2024)

A destilação de conhecimento em grafos transfere informação de um modelo professor maior para um aluno menor. Diferente da destilação clássica em redes neurais, em KGs preserva-se topologia + atributos. Trabalhos recentes mostram que o aluno mantém ~92% da acurácia em link prediction com 1/10 dos parâmetros. A técnica é especialmente útil em ambientes mobile, onde latência importa.
"""

Gere flashcards.`;

const FEW_SHOT_ASSISTANT = `{
  "cards": [
    {"question": "O que é destilação de conhecimento em grafos?", "answer": "Transferência de informação de um modelo professor maior para um aluno menor preservando topologia e atributos do grafo.", "difficulty": "medium"},
    {"question": "Qual a diferença principal entre destilação em KGs e em redes neurais clássicas?", "answer": "Em KGs preserva-se topologia e atributos do grafo; em redes neurais a estrutura é livre.", "difficulty": "medium"},
    {"question": "Que percentual de acurácia o aluno mantém em link prediction segundo Smith 2024?", "answer": "Aproximadamente 92%, usando 1/10 dos parâmetros do professor.", "difficulty": "easy"},
    {"question": "Por que destilação em KGs é especialmente útil em mobile?", "answer": "Reduz parâmetros (1/10) mantendo acurácia, diminuindo latência crítica em dispositivos móveis.", "difficulty": "medium"}
  ]
}`;

export interface FlashcardGenInput {
	notePath: string;
	noteTitle?: string;
	body: string;
	maxCards?: number;
}

export interface GeneratedCard {
	question: string;
	answer: string;
	difficulty: "easy" | "medium" | "hard";
}

export class FlashcardGenerator {
	constructor(private ollama: OllamaClient, private model: string) {}

	async generate(input: FlashcardGenInput): Promise<GeneratedCard[]> {
		const max = input.maxCards ?? 8;
		const body = input.body.length > 8000 ? input.body.slice(0, 8000) + "\n[...]" : input.body;

		try {
			const raw = await this.ollama.chat(
				[
					{ role: "system", content: SYSTEM_PROMPT },
					{ role: "user", content: FEW_SHOT_USER },
					{ role: "assistant", content: FEW_SHOT_ASSISTANT },
					{
						role: "user",
						content: `Texto:
"""
${input.noteTitle ? `Título: ${input.noteTitle}\n\n` : ""}${body}
"""

Gere até ${max} flashcards.`,
					},
				],
				{
					model: this.model,
					temperature: 0.3,
					format: "json",
					max_tokens: 2500,
				}
			);

			const cleaned = this.cleanJson(raw);
			const parsed = JSON.parse(cleaned);
			const result = FlashcardBatch.safeParse(parsed);
			if (!result.success) {
				logger.warn("flashcard-gen: validação Zod falhou", { issues: result.error.issues });
				return [];
			}
			return result.data.cards.slice(0, max);
		} catch (e) {
			logger.warn("flashcard-gen: falhou", { error: String(e) });
			return [];
		}
	}

	private cleanJson(raw: string): string {
		let s = raw.trim();
		const fence = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
		if (fence) s = fence[1].trim();
		const first = s.indexOf("{");
		const last = s.lastIndexOf("}");
		if (first >= 0 && last > first) s = s.substring(first, last + 1);
		return s;
	}
}
