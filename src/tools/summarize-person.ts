import { App, normalizePath, TFile } from "obsidian";
import { KGStore } from "../kg/store";
import { Indexer } from "../retrieval/indexer";
import { MapReduceSummarizer } from "../summarizer/map-reduce";
import { ChainOfDensity } from "../summarizer/chain-of-density";
import { OllamaClient } from "../ollama/client";
import { logger } from "../utils/logger";

export interface SummarizePersonInput {
	personName: string;
	periodMonths?: number; // default 12
}

export class SummarizePersonTool {
	constructor(
		private app: App,
		private kg: KGStore,
		private indexer: Indexer,
		private ollama: OllamaClient,
		private model: string,
		private reportsFolder: string
	) {}

	async run(input: SummarizePersonInput): Promise<{ notePath: string; markdown: string }> {
		const person = this.kg.findPersonByName(input.personName);
		if (!person) {
			throw new Error(`Pessoa não encontrada no KG: ${input.personName}`);
		}

		const months = input.periodMonths ?? 12;
		const since = new Date();
		since.setMonth(since.getMonth() - months);

		// 1. Coletar sessões da pessoa no período
		const sessions = this.kg.listSessionsByPerson(person.id, since);
		logger.info(`summarize_person: ${sessions.length} sessões encontradas`);

		if (sessions.length === 0) {
			return {
				notePath: "",
				markdown: `# Resumo de ${person.name}\n\n_Nenhuma sessão encontrada nos últimos ${months} meses._\n`,
			};
		}

		// 2. Carregar conteúdo de cada nota
		const sessionContents: { date: string; path: string; content: string }[] = [];
		for (const s of sessions.slice(0, 60)) {
			const file = this.app.vault.getAbstractFileByPath(s.sourceNotePath);
			if (file instanceof TFile) {
				try {
					const raw = await this.app.vault.read(file);
					const indexed = await this.indexer.indexFile(file);
					if (indexed) {
						sessionContents.push({
							date: s.date,
							path: s.sourceNotePath,
							content: indexed.body,
						});
					}
				} catch (e) {
					logger.warn(`summarize_person: read ${s.sourceNotePath} falhou`, {
						error: String(e),
					});
				}
			}
		}

		if (sessionContents.length === 0) {
			return {
				notePath: "",
				markdown: `# Resumo de ${person.name}\n\n_Sessões no KG mas notas não acessíveis._\n`,
			};
		}

		// 3. Coletar contexto adicional do KG
		const openCommitments = this.kg.listOpenCommitmentsBetween(person.id, "eu");
		const openActionItems = this.kg.listOpenActionItemsForPerson(person.id);
		const topThemes = this.kg.listTopThemesForPerson(person.id, 8);

		// 4. Map-Reduce: cada nota vira summary curto, depois consolida
		const mapReduce = new MapReduceSummarizer(this.ollama);

		const chunks = sessionContents.map(
			(s) => `Data: ${s.date}\nNota: ${s.path}\n\n${s.content.substring(0, 2500)}`
		);

		const mapPrompt = (chunkText: string) =>
			`Resuma a seguinte nota de 1:1 ou sessão de coaching com ${person.name} em 3-5 bullets focando em:
- Goals discutidos
- Bloqueios / desafios
- Action items / commitments
- Temas / padrões
- Sentiment

Nota:
"""
${chunkText}
"""

Resumo (em PT-BR, factual, sem invenções):`;

		const reducePrompt = (summaries: string[]) =>
			`Você está consolidando ${summaries.length} resumos de sessões com ${person.name} ao longo de ${months} meses.

Crie um relatório executivo em PT-BR com:

# Resumo de ${person.name} (${months} meses)

## 🎯 Goals & evolução
> _Quais goals ela perseguiu, progresso, mudanças_

## 💪 Strengths observadas
> _Padrões positivos consistentes_

## 🌱 Growth areas / desafios
> _O que ela tentou desenvolver, onde teve dificuldade_

## 🧱 Bloqueios recorrentes
> _Padrões negativos / temas blocker_

## 🤝 Padrões de relacionamento
> _Como ela trabalha com pares, stakeholders_

## 📌 Insights-chave
> _3-5 observações de alto valor para coaching/gestão_

## 💡 Recomendações
> _3-5 ações concretas para o coordenador/coach considerar_

Resumos das sessões:
${summaries.map((s, i) => `--- Sessão ${i + 1} ---\n${s}`).join("\n\n")}

Relatório (sem invenções, citando datas/eventos quando relevante):`;

		const summary = await mapReduce.run(chunks, {
			model: this.model,
			mapPrompt,
			reducePrompt,
			mapTemperature: 0.2,
			reduceTemperature: 0.4,
			maxTokensMap: 350,
			maxTokensReduce: 2000,
		});

		// 5. Adicionar contexto do KG no relatório
		const themesBlock =
			topThemes.length > 0
				? `## 🏷️ Temas mais mencionados\n` +
					topThemes
						.map(
							(t) =>
								`- **${t.name}** (${t.frequency}× · ${t.sentiment})`
						)
						.join("\n")
				: "";

		const commitmentsBlock =
			openCommitments.length > 0
				? `\n## 🔁 Commitments abertos\n` +
					openCommitments
						.map(
							(c) =>
								`- "${c.text}" — ${
									c.dueDate ?? "(sem data)"
								} · ${c.weight}`
						)
						.join("\n")
				: "";

		const actionsBlock =
			openActionItems.length > 0
				? `\n## ✅ Action items pendentes (dela)\n` +
					openActionItems
						.slice(0, 10)
						.map(
							(a) =>
								`- ${a.description} — ${a.dueDate ?? "(sem data)"} · ${a.status}`
						)
						.join("\n")
				: "";

		const final = `---
type: person-summary
person: ${person.name}
period_months: ${months}
sessions_analyzed: ${sessionContents.length}
generated_at: ${new Date().toISOString()}
generated_by: atlas
---

${summary}

${themesBlock}
${commitmentsBlock}
${actionsBlock}

---

## 📚 Fontes (${sessionContents.length} sessões)
${sessionContents.map((s) => `- [[${s.path.replace(/\.md$/, "")}|${s.date}]]`).join("\n")}
`;

		// 6. Salvar como nota
		const today = new Date();
		const yyyy = today.getFullYear();
		const filename = `${this.reportsFolder}/people/${person.id}-${yyyy}.md`;
		const dir = filename.split("/").slice(0, -1).join("/");
		if (!this.app.vault.getAbstractFileByPath(dir)) {
			await this.app.vault.createFolder(dir);
		}
		const path = normalizePath(filename);
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, final);
		} else {
			await this.app.vault.create(path, final);
		}

		return { notePath: path, markdown: final };
	}
}
