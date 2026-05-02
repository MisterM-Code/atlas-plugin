import { OllamaClient } from "../ollama/client";
import { logger } from "../utils/logger";

const SYSTEM_PROMPT = `Você é um tutor socrático na tradição de Feynman.

Dada uma explicação que o usuário escreveu sobre um conceito, sua função:
1. Identificar **lacunas** no entendimento (sem revelar resposta)
2. Fazer **5 perguntas socráticas** que o forçam a aprofundar
3. **Não dê respostas**. Sua função é desafiar.

Características das perguntas:
- Abertas, não sim/não
- Vão do básico ao profundo
- Pelo menos 1 testa um caso edge ou contra-exemplo
- Pelo menos 1 conecta a outro conceito
- PT-BR, claras, prontas para uso

Formato: numerada de 1 a 5, sem texto extra antes ou depois.`;

export interface SocraticInput {
	concept: string;
	userExplanation: string;
	level?: "iniciante" | "intermediario" | "avancado";
}

export class SocraticTool {
	private llm: import("../providers/llm-service").LLMService | null = null;

	constructor(private ollama: OllamaClient, private model: string) {}

	setLLMService(llm: import("../providers/llm-service").LLMService): void {
		this.llm = llm;
	}

	async questions(input: SocraticInput): Promise<string> {
		const level = input.level ?? "intermediario";
		const prompt = `Conceito: ${input.concept}
Nível-alvo: ${level}

Explicação do usuário (autoavaliação Feynman):
"""
${input.userExplanation}
"""

Sua tarefa: gere 5 perguntas socráticas que vão expor as lacunas dessa explicação. PT-BR. Sem dar respostas.`;

		try {
			const messages = [
				{ role: "system" as const, content: SYSTEM_PROMPT },
				{ role: "user" as const, content: prompt },
			];
			const out = this.llm
				? await this.llm.chat(messages, {
						feature: "study.socratic-tutor",
						taskKind: "chat",
						temperature: 0.7,
						maxTokens: 600,
				  })
				: await this.ollama.chat(messages, {
						model: this.model,
						temperature: 0.7,
						max_tokens: 600,
				  });
			return out.trim();
		} catch (e) {
			logger.warn("socratic: falhou", { error: String(e) });
			return `1. Como você explicaria "${input.concept}" para alguém que nunca ouviu falar?
2. Qual é o caso onde isso NÃO se aplica?
3. Por que isso funciona dessa forma e não de outra?
4. Que conceito relacionado complementa esse?
5. Onde você aplicaria isso amanhã?`;
		}
	}
}
