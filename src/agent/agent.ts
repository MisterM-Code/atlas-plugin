import { App } from "obsidian";
import { OllamaClient, ChatMessage } from "../ollama/client";
import { Memory } from "./memory";
import { KGStore } from "../kg/store";
import { Indexer } from "../retrieval/indexer";
import { HybridSearcher, SearchResult } from "../retrieval/search";
import { Embedder } from "../retrieval/embedder";
import { Prepare1on1Tool } from "../tools/prepare-1on1";
import { logger } from "../utils/logger";

export interface AgentResponse {
	answer: string;
	citations: { notePath: string; snippet: string }[];
	toolsUsed: string[];
}

export interface AgentInput {
	query: string;
	streamCallback?: (token: string) => void;
}

const SYSTEM_PROMPT = `Você é o Atlas, assistente pessoal de um coordenador de TI bancário que também é coach e estudante.

Sua personalidade:
- Direto, factual, sem floreios
- Usa apenas informações das notas dele (com citações)
- Português Brasil
- Honesto quando não sabe
- Proativo: se vê padrão, menciona

Contexto: você tem acesso ao Knowledge Graph dele (pessoas, sessões, action items, commitments, temas) e às notas (markdown).

Quando responder:
1. Use as informações fornecidas no contexto (chunks recuperados)
2. Sempre cite as notas-fonte usando [Nota: caminho/da/nota.md]
3. Se a pergunta exigir agregar dados (resumir pessoa, listar pendências), peça pra ele rodar o comando específico
4. Se não souber, diga "não tenho essa informação no vault"
5. Nunca invente fatos, datas, ou citações

Formato: parágrafos curtos. Listas quando faz sentido. Citações inline.`;

export class Agent {
	constructor(
		private app: App,
		private ollama: OllamaClient,
		private memory: Memory,
		private kg: KGStore,
		private embedder: Embedder,
		private model: string
	) {}

	async run(input: AgentInput): Promise<AgentResponse> {
		const { query } = input;
		logger.info("agent: query", { query: query.substring(0, 80) });

		// Track tools used for transparency
		const toolsUsed: string[] = [];
		const allCitations: { notePath: string; snippet: string }[] = [];

		// Detect intent: simple keyword routing
		const intent = this.classifyIntent(query);
		logger.info("agent: intent", { intent });

		let contextBlock = "";

		if (intent === "summarize_person" || intent === "person_query") {
			const person = this.extractPersonFromQuery(query);
			if (person) {
				const personData = this.kg.findPersonByName(person);
				if (personData) {
					toolsUsed.push("query_kg");
					const sessions = this.kg.listSessionsByPerson(personData.id).slice(0, 5);
					const themes = this.kg.listTopThemesForPerson(personData.id, 5);
					const commits = this.kg.listOpenCommitmentsBetween(personData.id, "eu");
					contextBlock += `\n\n## Contexto KG sobre ${personData.name}\n`;
					contextBlock += `- Últimas ${sessions.length} sessões: ${sessions.map((s) => s.date).join(", ")}\n`;
					contextBlock += `- Temas top: ${themes.map((t) => `${t.name} (${t.frequency}×)`).join(", ") || "nenhum"}\n`;
					contextBlock += `- Commitments abertos: ${commits.length}\n`;
				}
			}
		}

		if (intent === "pending_query") {
			toolsUsed.push("list_pending");
			const today = new Date().toISOString().split("T")[0];
			const overdue = this.kg.data.actionItems.filter(
				(a) => a.status !== "completed" && a.status !== "cancelled" && a.dueDate && a.dueDate < today
			);
			const dueToday = this.kg.data.actionItems.filter(
				(a) => a.status !== "completed" && a.status !== "cancelled" && a.dueDate?.startsWith(today)
			);
			contextBlock += `\n\n## Action items\n`;
			contextBlock += `- Atrasadas: ${overdue.length}\n`;
			contextBlock += `- Vencendo hoje: ${dueToday.length}\n`;
			if (overdue.length > 0) {
				contextBlock += "Top atrasadas:\n";
				for (const a of overdue.slice(0, 5)) {
					contextBlock += `  - "${a.description}" (${a.dueDate})\n`;
				}
			}
		}

		// RAG: search vault
		try {
			toolsUsed.push("search_vault");
			const indexer = new Indexer(this.app);
			const notes = await indexer.indexVault();
			const allChunks = notes.flatMap((n) => indexer.chunk(n));
			const searcher = new HybridSearcher(this.embedder);
			searcher.indexChunks(allChunks);

			const results = await searcher.search(query, 5);
			if (results.length > 0) {
				contextBlock += this.formatSearchResults(results);
				for (const r of results) {
					allCitations.push({ notePath: r.notePath, snippet: r.snippet });
				}
			}
		} catch (e) {
			logger.warn("agent: search falhou", { error: String(e) });
		}

		// Relevant memory facts
		const relevantFacts = this.memory.getRelevantFacts(query, 3);
		if (relevantFacts.length > 0) {
			contextBlock += `\n\n## Fatos lembrados sobre você\n`;
			for (const f of relevantFacts) {
				contextBlock += `- (${f.type}) ${f.text}\n`;
				this.memory.updateFactUsage(f.id);
			}
		}

		// Recent conversation
		const recentTurns = this.memory.getRecentTurns(4);
		const messages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];

		for (const t of recentTurns) {
			messages.push({ role: t.role, content: t.content });
		}

		messages.push({
			role: "user",
			content: contextBlock
				? `${query}\n\n----- Contexto fornecido pelo Atlas:\n${contextBlock}\n----- Fim do contexto.\n\nResponda à pergunta acima usando o contexto. Cite as notas com [Nota: caminho.md].`
				: query,
		});

		// Generate — propaga AtlasError pra UI mostrar Modal humanizado
		const answer = await this.ollama.chat(messages, {
			model: this.model,
			temperature: 0.4,
			max_tokens: 1500,
		});

		// Persist turn
		this.memory.addTurn({ role: "user", content: query });
		this.memory.addTurn({
			role: "assistant",
			content: answer,
			citations: allCitations.map((c) => c.notePath),
		});

		return { answer, citations: allCitations, toolsUsed };
	}

	private classifyIntent(query: string): string {
		const q = query.toLowerCase();
		if (/(resum[ie]r?|sintetiz|consolid)/.test(q) && /pessoa|com\s+\w+/.test(q)) {
			return "summarize_person";
		}
		if (/(prepar|brief)/.test(q) && /1[:\s]?1|one[\s-]?on[\s-]?one|reuni/.test(q)) {
			return "prepare_1on1";
		}
		if (/(pendente|aberto|atrasad|vencen|due|overdue|fazer|falta|tarefa)/.test(q)) {
			return "pending_query";
		}
		if (/(sobre|com|do|da)\s+[A-Z][a-záàâãéèêíïóôõöúçñ]+/.test(query)) {
			return "person_query";
		}
		return "general";
	}

	private extractPersonFromQuery(query: string): string | null {
		// Extract first capitalized word(s) — likely a person name
		const matches = query.match(/[A-Z][a-záàâãéèêíïóôõöúçñ]+(?:\s+[A-Z][a-záàâãéèêíïóôõöúçñ]+)*/);
		if (!matches) return null;
		const candidate = matches[0];
		// Skip common words at start of sentence
		const ignored = ["O", "A", "Os", "As", "Como", "Quando", "Onde", "Por", "Sobre", "Para", "Com"];
		if (ignored.includes(candidate.split(" ")[0])) return null;
		return candidate;
	}

	private formatSearchResults(results: SearchResult[]): string {
		const lines = ["\n\n## Notas relevantes (com snippets)"];
		for (const r of results) {
			lines.push(`- **${r.notePath}** (${r.context})`);
			lines.push(`  > ${r.snippet}`);
		}
		return lines.join("\n");
	}

	addUserPreference(text: string): void {
		this.memory.addFact({ type: "preference", text });
	}
}
