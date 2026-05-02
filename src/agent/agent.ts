import { App } from "obsidian";
import { OllamaClient, ChatMessage } from "../ollama/client";
import { Memory } from "./memory";
import { KGStore } from "../kg/store";
import { Indexer } from "../retrieval/indexer";
import { HybridSearcher, SearchResult } from "../retrieval/search";
import { Embedder } from "../retrieval/embedder";
import { Prepare1on1Tool } from "../tools/prepare-1on1";
import { executeTool, getOllamaToolsSpec } from "./tool-registry";
import { logger } from "../utils/logger";
import type AtlasPlugin from "../../main";

export interface AgentResponse {
	answer: string;
	citations: { notePath: string; snippet: string }[];
	toolsUsed: string[];
	toolCalls?: { name: string; ok: boolean; message: string }[];
}

export interface AgentInput {
	query: string;
	streamCallback?: (token: string) => void;
	enableTools?: boolean;
}

const SYSTEM_PROMPT = `Você é o Atlas, assistente pessoal de um coordenador de TI bancário que também é coach e estudante.

Sua personalidade:
- Direto, factual, sem floreios
- Usa apenas informações das notas dele (com citações)
- Português Brasil
- Honesto quando não sabe
- Proativo: se vê padrão, menciona

Você TAMBÉM tem permissão para EXECUTAR ações no vault dele via tools (function calling):
- create_person / create_system / create_product / create_role / create_course
- create_action_item / create_reminder / schedule_meeting
- compose_email (abre modal, não envia direto)
- switch_profile / index_vault / forget_person
Se ele pedir pra criar/cadastrar/agendar/lembrar/mandar email — CHAME a tool apropriada (não simule). Se a tool tiver sucesso, confirme em 1 frase. forget_person é destrutiva e exige confirmação UI automática.

Contexto: você tem acesso ao Knowledge Graph dele (pessoas, sessões, action items, commitments, temas) e às notas (markdown).

Quando responder:
1. Use as informações fornecidas no contexto (chunks recuperados)
2. Sempre cite as notas-fonte usando [Nota: caminho/da/nota.md]
3. Se a pergunta exigir agregar dados (resumir pessoa, listar pendências), peça pra ele rodar o comando específico
4. Se não souber, diga "não tenho essa informação no vault"
5. Nunca invente fatos, datas, ou citações

Formato: parágrafos curtos. Listas quando faz sentido. Citações inline.`;

export class Agent {
	private plugin: AtlasPlugin | null = null;

	constructor(
		private app: App,
		private ollama: OllamaClient,
		private memory: Memory,
		private kg: KGStore,
		private embedder: Embedder,
		private model: string
	) {}

	/** v0.9: registra plugin pra permitir tool calls (mutações no KG/vault). */
	setPlugin(plugin: AtlasPlugin): void {
		this.plugin = plugin;
	}

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

		// v0.9 Sprint 28.2: function calling — LLM decide se chama tool
		const toolCallsExecuted: { name: string; ok: boolean; message: string }[] = [];
		const toolsEnabled = (input.enableTools ?? true) && this.plugin !== null;
		if (toolsEnabled && this.plugin && this.intentSuggestsMutation(query)) {
			try {
				const toolsSpec = getOllamaToolsSpec();
				// v0.18: route through LLMService (cloud or ollama auto)
				const llm = this.plugin.llm;
				const tcRes = llm
					? await llm.chatWithTools(messages, toolsSpec, {
							feature: "agent.tool-calling",
							taskKind: "tool-calling",
							temperature: 0.2,
							maxTokens: 800,
					  })
					: await this.ollama.chatWithTools(messages, toolsSpec, {
							model: this.model,
							temperature: 0.2,
							max_tokens: 800,
					  });
				if (tcRes.toolCalls.length > 0) {
					for (const call of tcRes.toolCalls) {
						const name = call.function?.name;
						let args = call.function?.arguments ?? {};
						if (typeof args === "string") {
							try {
								args = JSON.parse(args);
							} catch {
								args = {};
							}
						}
						const result = await executeTool(name, args as Record<string, unknown>, this.plugin);
						toolsUsed.push(`tool:${name}`);
						toolCallsExecuted.push({ name, ok: result.ok, message: result.message });
						messages.push({
							role: "assistant",
							content: tcRes.content || "",
							tool_calls: [call],
						});
						messages.push({
							role: "tool",
							content: JSON.stringify(result),
						});
					}
					// Pede LLM compor resposta final usando resultados das tools
					messages.push({
						role: "user",
						content:
							"Componha resposta final em PT-BR usando os resultados acima. Seja conciso (1-3 frases). Confirme o que foi feito.",
					});
				}
			} catch (e) {
				logger.warn("agent: tool calling falhou", { error: String(e) });
			}
		}

		// v0.7.1: streaming se streamCallback fornecido
		// v0.18: route through LLMService (cloud or ollama auto + cost tracking)
		const llm = this.plugin?.llm;
		let answer: string;
		if (input.streamCallback) {
			answer = llm
				? await llm.chatStream(
						messages,
						{ feature: "agent.chat", taskKind: "chat", temperature: 0.4, maxTokens: 1500 },
						input.streamCallback
				  )
				: await this.ollama.chatStream(
						messages,
						{ model: this.model, temperature: 0.4, max_tokens: 1500 },
						input.streamCallback
				  );
		} else {
			answer = llm
				? await llm.chat(messages, {
						feature: "agent.chat",
						taskKind: "chat",
						temperature: 0.4,
						maxTokens: 1500,
				  })
				: await this.ollama.chat(messages, { model: this.model, temperature: 0.4, max_tokens: 1500 });
		}

		// Persist turn
		this.memory.addTurn({ role: "user", content: query });
		this.memory.addTurn({
			role: "assistant",
			content: answer,
			citations: allCitations.map((c) => c.notePath),
		});

		return {
			answer,
			citations: allCitations,
			toolsUsed,
			toolCalls: toolCallsExecuted.length > 0 ? toolCallsExecuted : undefined,
		};
	}

	/** v0.9: heurística rápida — query sugere uma ação mutadora (criar/agendar/lembrar/etc)? */
	private intentSuggestsMutation(query: string): boolean {
		const q = query.toLowerCase();
		return /\b(cria(r)?|cadastr(a|e|ar)|adicion(a|e|ar)|agend(a|e|ar)|lembr(a|e|ar|ete)|marc(a|e|ar)|mand(a|e|ar)|envi(a|e|ar)|delet(a|e|ar)|apag(a|e|ar)|esquec|forget|trocar perfil|switch profile|index|reindex|nova pessoa|novo sistema|novo produto|novo cargo|novo curso|nova reunião|email para|tarefa)\b/.test(q);
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
