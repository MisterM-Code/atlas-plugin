import { App, TFile } from "obsidian";
import { KGStore } from "../kg/store";
import { OllamaClient } from "../ollama/client";
import { logger } from "../utils/logger";

export interface Prepare1on1Input {
	personName: string;
	maxRecentSessions?: number;
}

export class Prepare1on1Tool {
	private llm: import("../providers/llm-service").LLMService | null = null;

	constructor(
		private app: App,
		private kg: KGStore,
		private ollama: OllamaClient,
		private model: string
	) {}

	setLLMService(llm: import("../providers/llm-service").LLMService): void {
		this.llm = llm;
	}

	async run(input: Prepare1on1Input): Promise<string> {
		const person = this.kg.findPersonByName(input.personName);
		if (!person) {
			return `_Pessoa "${input.personName}" não encontrada. Crie a página dela primeiro._`;
		}

		const maxN = input.maxRecentSessions ?? 3;
		const recent = this.kg.listSessionsByPerson(person.id).slice(0, maxN);
		const openCommitments = this.kg.listOpenCommitmentsBetween(person.id, "eu");
		const openActions = this.kg.listOpenActionItemsForPerson(person.id);
		const topThemes = this.kg.listTopThemesForPerson(person.id, 5);

		// Resumir últimas N sessões em 1 chamada (compacto)
		let recentSummary = "_(sem sessões anteriores)_";
		if (recent.length > 0) {
			const sessionTexts: string[] = [];
			for (const s of recent) {
				const f = this.app.vault.getAbstractFileByPath(s.sourceNotePath);
				if (f instanceof TFile) {
					try {
						const raw = await this.app.vault.read(f);
						sessionTexts.push(`### ${s.date}\n${raw.substring(0, 1500)}`);
					} catch (e) {
						logger.warn("prepare_1on1: read falhou", { error: String(e) });
					}
				}
			}

			if (sessionTexts.length > 0) {
				const prompt = `Você é o Atlas. Resuma estas ${sessionTexts.length} últimas sessões com ${person.name} em 4-6 bullets curtos, focando em:
- Goals atuais
- Última promessa cumprida ou não cumprida
- Tema dominante
- Sinal de sentiment (energia, engajamento)

Sessões:
${sessionTexts.join("\n\n---\n\n")}

Resumo (PT-BR, factual, ≤150 palavras):`;

				try {
					recentSummary = this.llm
						? await this.llm.generate(prompt, {
								feature: "tools.prepare-1on1.summary",
								taskKind: "summarization",
								temperature: 0.3,
								maxTokens: 500,
						  })
						: await this.ollama.generate(prompt, {
								model: this.model,
								temperature: 0.3,
								max_tokens: 500,
						  });
				} catch (e) {
					logger.warn("prepare_1on1: LLM falhou", { error: String(e) });
					recentSummary =
						"_(LLM indisponível — listando datas das últimas sessões)_\n\n" +
						recent.map((s) => `- ${s.date} — [[${s.sourceNotePath.replace(/\.md$/, "")}]]`).join("\n");
				}
			}
		}

		// Sugerir 4 perguntas baseadas no contexto
		let suggestedQuestions = "";
		try {
			const qPrompt = `Como coordenador/coach usando GROW, sugira 4 perguntas poderosas para o próximo 1:1 com ${person.name}, dado este contexto:

Resumo recente: ${recentSummary.substring(0, 600)}
Temas recorrentes: ${topThemes.map((t) => t.name).join(", ") || "(nenhum)"}
Commitments abertos: ${openCommitments.length}
Actions abertos: ${openActions.length}

As 4 perguntas devem ser abertas, não-julgamentais, em PT-BR, prontas para usar.

Formato: numerada de 1 a 4, sem texto extra.`;

			const qOut = this.llm
				? await this.llm.generate(qPrompt, {
						feature: "tools.prepare-1on1.questions",
						taskKind: "chat",
						temperature: 0.6,
						maxTokens: 400,
				  })
				: await this.ollama.generate(qPrompt, {
						model: this.model,
						temperature: 0.6,
						max_tokens: 400,
				  });
			suggestedQuestions = qOut.trim();
		} catch {
			suggestedQuestions =
				"1. O que mudou desde a última vez que conversamos?\n2. Qual é o seu maior bloqueio agora?\n3. O que você precisa de mim?\n4. Onde você quer estar daqui a 3 meses?";
		}

		// Montar markdown final
		return [
			`## 🤖 Atlas Brief — ${person.name}`,
			``,
			`### 📋 Últimas ${recent.length} sessões`,
			recentSummary,
			``,
			`### 🔁 Commitments abertos (${openCommitments.length})`,
			openCommitments.length > 0
				? openCommitments
						.map((c) => `- _${c.madeBy === "eu" ? "Eu" : person.name}_: "${c.text}" — ${c.dueDate ?? "(sem data)"}`)
						.join("\n")
				: "_Nenhum_",
			``,
			`### ✅ Action items dela em aberto (${openActions.length})`,
			openActions.length > 0
				? openActions.slice(0, 5).map((a) => `- ${a.description} — ${a.dueDate ?? "(sem data)"}`).join("\n")
				: "_Nenhum_",
			``,
			`### 🏷️ Temas recorrentes`,
			topThemes.length > 0
				? topThemes.map((t) => `- **${t.name}** (${t.frequency}× · ${t.sentiment})`).join("\n")
				: "_Sem padrão claro ainda_",
			``,
			`### 💡 Perguntas sugeridas`,
			suggestedQuestions,
			``,
		].join("\n");
	}
}
