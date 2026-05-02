import { App, normalizePath, TFile, Notice } from "obsidian";
import type AtlasPlugin from "../../main";
import { Indexer } from "../retrieval/indexer";
import { isCoachPath } from "../coach/scope";

/**
 * Context Collapse AI — Atlas v0.3 differentiator.
 *
 * Pessoa com 30+ backlinks no vault → "qual é o insight unificador?"
 * Lê todas as menções da pessoa, agrega evidências, e usa LLM para destilar
 * 1 insight central + 3-5 sub-padrões. Algo que o cérebro humano NÃO consegue
 * fazer porque há informação demais.
 *
 * Inspirado em "Context Collapse" da Sociology of Online Identity.
 * Único do Atlas: requer KG denso + LLM local + privacy total.
 */

export interface CollapseInput {
	personName: string;
	maxMentions?: number;
}

export interface CollapseOutput {
	personName: string;
	totalMentions: number;
	mainInsight: string;
	subPatterns: { title: string; description: string; evidence: string[] }[];
	mostFrequentContext: string;
	temporalArc: string;
	recommendation: string;
	notePath: string;
}

const SYSTEM_PROMPT = `Você é Atlas em modo "Context Collapse" — uma técnica de análise profunda de pessoas via PKM.

Recebe múltiplas menções (em diferentes notas, ao longo do tempo) de uma pessoa específica. Sua tarefa: destilar **o insight central unificador** sobre esta pessoa que emerge dos dados.

Princípios:
1. **NÃO seja descritivo** ("falaram sobre X em 5 notas"). **Seja interpretativo** ("o tema central é tensão entre ambição e exaustão").
2. **Insight central**: 1 frase poderosa que capture a essência. Algo que faria a pessoa pensar "uau, é isso mesmo".
3. **Sub-padrões (3-5)**: facetas que sustentam o insight central, com evidências.
4. **Temporal arc**: como evoluiu ao longo do período observado?
5. **Recomendação**: 1 ação concreta para o gestor/coach.
6. PT-BR. Factual + interpretativo. Sem lugares-comuns ("pessoa dedicada"). Sem invenções.

Retorne JSON puro:
{
  "main_insight": "string",
  "sub_patterns": [
    {"title": "string", "description": "string", "evidence": ["citação 1", "citação 2"]}
  ],
  "most_frequent_context": "string (em que tipo de situação ela mais aparece)",
  "temporal_arc": "string (como evoluiu)",
  "recommendation": "string"
}

Sem markdown. Sem explicações.`;

export class ContextCollapseTool {
	constructor(private app: App, private plugin: AtlasPlugin) {}

	async run(input: CollapseInput): Promise<CollapseOutput | null> {
		const person = this.plugin.kg.findPersonByName(input.personName);
		if (!person) {
			new Notice(`Atlas: pessoa "${input.personName}" não encontrada no KG.`);
			return null;
		}
		if (person.encrypted && !isCoachPath(person.notePath ?? "")) {
			new Notice("Atlas: pessoa em vault encrypted. Operação não permitida em Work Mode.");
			return null;
		}

		const ok = await this.plugin.ollama.ping();
		if (!ok) {
			new Notice("Atlas: Ollama offline.");
			return null;
		}

		// Collect all mentions
		const indexer = new Indexer(this.app);
		const allFiles = this.app.vault.getMarkdownFiles();
		const max = input.maxMentions ?? 50;

		const mentions: { path: string; date: string; excerpt: string }[] = [];
		const aliases = [person.name, ...person.aliases];
		const aliasRegex = new RegExp(
			aliases.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
			"i"
		);

		for (const f of allFiles) {
			if (mentions.length >= max) break;
			if (isCoachPath(f.path) && !person.encrypted) continue;
			if (f.path.startsWith(".atlas") || f.path.startsWith("99_Archive")) continue;

			let raw: string;
			try {
				raw = await this.app.vault.read(f);
			} catch {
				continue;
			}

			if (!aliasRegex.test(raw) && !raw.includes(`[[${person.name}]]`)) continue;

			const indexed = await indexer.indexFile(f);
			if (!indexed) continue;

			// Find paragraphs containing the mention
			const paragraphs = indexed.body.split(/\n\n+/);
			for (const p of paragraphs) {
				if (!aliasRegex.test(p) && !p.includes(`[[${person.name}]]`)) continue;
				if (p.length < 30) continue;
				mentions.push({
					path: f.path,
					date: (indexed.frontmatter.date as string) ?? f.path.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? "",
					excerpt: p.substring(0, 600),
				});
				if (mentions.length >= max) break;
			}
		}

		if (mentions.length < 3) {
			new Notice(`Atlas: poucas menções de ${person.name} (${mentions.length}). Mínimo 3.`);
			return null;
		}

		// Sort by date for temporal arc
		mentions.sort((a, b) => a.date.localeCompare(b.date));

		const userPrompt = `Pessoa: ${person.name}
Aliases: ${person.aliases.join(", ") || "(nenhum)"}
Cargo/relação: ${[person.role, person.type].filter(Boolean).join(" · ") || "—"}
Total de menções neste corpus: ${mentions.length}

Menções (ordenadas por data):
${mentions
	.map(
		(m, i) =>
			`[${i + 1}] (${m.date || "—"}) [${m.path}]\n${m.excerpt.replace(/\n/g, " ")}`
	)
	.join("\n\n")}

Aplique o método Context Collapse — destile o insight central + sub-padrões.`;

		try {
			// v0.18: route through LLMService (cloud handles 1M context for many sessions)
			const llm = this.plugin.llm;
			const raw = llm
				? await llm.chat(
						[
							{ role: "system", content: SYSTEM_PROMPT },
							{ role: "user", content: userPrompt },
						],
						{
							feature: "innovation.context-collapse",
							taskKind: "summarization",
							temperature: 0.5,
							maxTokens: llm.willUseCloud("summarization") ? 4000 : 2000,
							jsonFormat: true,
						}
				  )
				: await this.plugin.ollama.chat(
						[
							{ role: "system", content: SYSTEM_PROMPT },
							{ role: "user", content: userPrompt },
						],
						{
							model: this.plugin.settings.ollama.generationModel,
							temperature: 0.5,
							format: "json",
							max_tokens: 2000,
						}
				  );

			const cleaned = cleanJson(raw);
			const parsed = JSON.parse(cleaned);

			const result: CollapseOutput = {
				personName: person.name,
				totalMentions: mentions.length,
				mainInsight: String(parsed.main_insight ?? "—"),
				subPatterns: Array.isArray(parsed.sub_patterns)
					? parsed.sub_patterns.map((p: Record<string, unknown>) => ({
							title: String(p.title ?? ""),
							description: String(p.description ?? ""),
							evidence: Array.isArray(p.evidence)
								? (p.evidence as unknown[]).map(String)
								: [],
					  }))
					: [],
				mostFrequentContext: String(parsed.most_frequent_context ?? "—"),
				temporalArc: String(parsed.temporal_arc ?? "—"),
				recommendation: String(parsed.recommendation ?? "—"),
				notePath: "",
			};

			// Save as note
			const date = new Date().toISOString().split("T")[0];
			const slug = person.id;
			const path = normalizePath(
				`${this.plugin.settings.folders.reports}/insights/${slug}-context-collapse-${date}.md`
			);
			const dir = path.split("/").slice(0, -1).join("/");
			if (!this.app.vault.getAbstractFileByPath(dir)) {
				await this.app.vault.createFolder(dir);
			}

			const md = renderMarkdown(result, person.name, mentions.length);
			const existing = this.app.vault.getAbstractFileByPath(path);
			if (existing instanceof TFile) {
				await this.app.vault.modify(existing, md);
			} else {
				await this.app.vault.create(path, md);
			}
			result.notePath = path;
			return result;
		} catch (e) {
			new Notice(`Atlas: Context Collapse falhou — ${String(e)}`, 8000);
			return null;
		}
	}
}

function cleanJson(raw: string): string {
	let s = raw.trim();
	const fence = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
	if (fence) s = fence[1].trim();
	const first = s.indexOf("{");
	const last = s.lastIndexOf("}");
	if (first >= 0 && last > first) s = s.substring(first, last + 1);
	return s;
}

function renderMarkdown(r: CollapseOutput, name: string, total: number): string {
	return `---
type: context-collapse
person: "${name}"
total_mentions: ${total}
generated_at: ${new Date().toISOString()}
generated_by: atlas
tags: [insight, context-collapse]
---

# 🔮 Context Collapse — ${name}

> Atlas analisou **${total} menções** ao longo do seu vault e destilou o insight central.

## 💡 Insight central

> ${r.mainInsight}

---

## 🧬 Sub-padrões (${r.subPatterns.length})

${r.subPatterns
	.map(
		(p, i) =>
			`### ${i + 1}. ${p.title}\n\n${p.description}\n\n${p.evidence.length > 0 ? `**Evidências:**\n${p.evidence.map((e) => `> ${e}`).join("\n>\n")}` : ""}`
	)
	.join("\n\n")}

---

## 📌 Contexto mais frequente

${r.mostFrequentContext}

## 🕰️ Arco temporal

${r.temporalArc}

## 🎯 Recomendação

${r.recommendation}

---

_Gerado pelo Atlas via Context Collapse AI · ${new Date().toLocaleDateString("pt-BR")}_

> ⚠️ Esta é uma INTERPRETAÇÃO algorítmica das suas notas. Use como ponto de partida pra reflexão, não como verdade absoluta.
`;
}
