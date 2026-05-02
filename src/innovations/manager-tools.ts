import { App, normalizePath, TFile, Notice, Modal, Setting } from "obsidian";
import type AtlasPlugin from "../../main";
import { Indexer } from "../retrieval/indexer";
import { isCoachPath } from "../coach/scope";
import { applyResponsiveModal } from "../ui/modal-helpers";

// ──────────────────────────────────────────────────────────────────
// MANAGER README — gera "Manager README" (estilo Lara Hogan) com base no histórico
// ──────────────────────────────────────────────────────────────────

const MGR_README_PROMPT = `Você é Atlas. Está gerando um **Manager README** (formato Lara Hogan / Camille Fournier) para o coordenador, baseado em padrões observados no histórico dele.

Manager README é um documento de transparência: como o gestor lidera, o que valoriza, como dá feedback, como prefere ser contatado, o que é deal-breaker. **Para o time ler.**

Princípios:
1. Use APENAS padrões observáveis nas notas. NÃO invente valores aspiracionais.
2. Destaque **estilos**, não generalizações ("dou feedback direto e imediato" > "valorizo comunicação").
3. Linguagem em primeira pessoa do gestor, PT-BR, formato markdown bem estruturado.
4. Inclua: como me contatar · meu estilo de comunicação · como conduzo 1:1s · como dou feedback · como tomo decisões · o que me incomoda · o que valorizo profundamente · como lidamos com erros · o que espero do time.

Sem lugares-comuns ("trabalho em equipe é importante"). Seja específico baseado nas notas.`;

// v0.18 PREMIUM — Cloud Manager README com mais seções (Lara Hogan + Camille Fournier + Pat Kua frameworks)
const MGR_README_PROMPT_PREMIUM = `Você é Atlas em modo deep analysis. Está gerando um Manager README enterprise-grade combinando frameworks de Lara Hogan, Camille Fournier, Pat Kua e Will Larson. Use a profundidade total do modelo cloud.

ESTRUTURA OBRIGATÓRIA (PT-BR, primeira pessoa, markdown):

# Manager README — <nome>

## 🎯 Mode of Operation
Como eu opero no dia-a-dia: horários produtivos, deep work blocks, contexto de trabalho remoto/escritório, ritmo preferido.

## 💬 Comunicação
- **Síncrono vs Assíncrono**: o que prefiro pra cada tipo de assunto
- **Slack/Email/Reunião**: SLA esperado de resposta para cada
- **Quiet hours**: quando NÃO me incomodar (a menos que P0)
- **Channels**: canais que monitoro de verdade

## 🤝 1:1s — meu estilo
- Cadência (semanal/quinzenal)
- Quem dirige a agenda (você ou eu)
- O que ESPERO que você traga (top 3, blockers, careers, feedback pra mim)
- Estrutura típica: GROW / CLEAR / freestyle

## 📣 Feedback — como dou e como recebo
- **Como dou**: timing (imediato vs 1:1), formato (SBI/COIN), contexto público vs privado
- **Como recebo**: prefiro que você seja direto comigo, sem rodeios. Confirme entendimento depois.
- **Frequência**: feedback contínuo (não só em review formal)

## 🧭 Decision-making
- Decisões reversíveis (one-way vs two-way doors — Bezos)
- DACI: como atribuo Driver/Approver/Contributor/Informed
- Quando uso voto vs decisão executiva
- Tolerância a risco

## 🚨 O que me incomoda (deal-breakers)
3-5 specifics observados nas notas. Tom: factual, não punitivo.

## 🌟 O que valorizo profundamente
3-5 specifics. Comportamentos que noto e amplifico.

## 🛠️ Como lidamos com erros
- Postmortems blameless
- Quando promover bug pra incident
- "Move fast and document" vs "measure twice"

## 🎓 Carreira & Crescimento
- Como discuto promoções
- Como ajudo crescimento técnico vs gerencial
- IDP — quem dirige (você)

## 🤝 O que espero do time
- Direto na semana 1
- Comportamentos não-negociáveis

## 📅 Como me usar bem
- Quando me trazer X vs resolver Y sozinho
- Como preparar pra escalations
- Quando puxar autoridade vs deixar a decisão pra você

## 💡 Misc — quirks pessoais (humor)
2-3 traços leves observados (não-críticos profissionais — café preto, prefere reuniões em pé, etc).

PRINCÍPIOS:
- TUDO baseado em padrões REAIS do histórico (notas) — não inventar
- 1ª pessoa, PT-BR
- Honesto e específico (não "dou feedback construtivo" — "dou feedback dentro de 24h após observar, sempre 1:1, em formato SBI")
- Use exemplos concretos quando possível ("nas últimas 5 1:1s comecei pelo X")
- Sem lugares-comuns / corporate-speak

Tom: humano, direto, transparente. Como Lara Hogan escreveria.`;

export class ManagerReadmeTool {
	constructor(private app: App, private plugin: AtlasPlugin) {}

	async generate(): Promise<{ notePath: string } | null> {
		const ok = await this.plugin.ollama.ping();
		if (!ok) {
			new Notice("Atlas: Ollama offline.");
			return null;
		}

		// Sample: últimos 6 meses de daily logs + 1:1s
		const indexer = new Indexer(this.app);
		const sixMonthsAgo = Date.now() - 180 * 86_400_000;
		const allFiles = this.app.vault.getMarkdownFiles().filter((f) => {
			if (isCoachPath(f.path)) return false;
			if (f.stat.mtime < sixMonthsAgo) return false;
			return (
				f.path.startsWith(this.plugin.settings.folders.daily) ||
				f.path.startsWith(this.plugin.settings.folders.meetings)
			);
		});

		if (allFiles.length < 5) {
			new Notice(
				"Atlas: poucas notas de gestão (mín 5). Use mais o sistema antes de gerar Manager README."
			);
			return null;
		}

		const sampled = allFiles.slice(0, 30);
		const excerpts: string[] = [];
		for (const f of sampled) {
			const indexed = await indexer.indexFile(f);
			if (!indexed) continue;
			excerpts.push(`[${f.path}]\n${indexed.body.substring(0, 1500)}`);
		}

		const userPrompt = `Histórico do coordenador (últimas ${sampled.length} notas):

${excerpts.join("\n\n---\n\n")}

Gere o Manager README dele.`;

		const notice = new Notice("Atlas: gerando Manager README...", 0);
		try {
			// v0.18: route through LLMService — premium prompt when cloud (deep frameworks)
			const llm = this.plugin.llm;
			const isCloud = llm?.willUseCloud("chat") ?? false;
			const sysPrompt = isCloud ? MGR_README_PROMPT_PREMIUM : MGR_README_PROMPT;
			const raw = llm
				? await llm.chat(
						[
							{ role: "system", content: sysPrompt },
							{ role: "user", content: userPrompt },
						],
						{
							feature: "innovation.manager-readme",
							taskKind: "chat",
							temperature: 0.5,
							maxTokens: isCloud ? 6000 : 3000,
						}
				  )
				: await this.plugin.ollama.chat(
						[
							{ role: "system", content: MGR_README_PROMPT },
							{ role: "user", content: userPrompt },
						],
						{
							model: this.plugin.settings.ollama.generationModel,
							temperature: 0.5,
							max_tokens: 3000,
						}
				  );
			notice.hide();

			const userName = this.plugin.settings.user.displayName || "Coordenador";
			const md = `---
type: manager-readme
generated_by: atlas
generated_at: ${new Date().toISOString()}
period: 180-days
based_on_notes: ${sampled.length}
draft: true
---

# 📋 Manager README — ${userName}

> ⚠️ **DRAFT** gerado pelo Atlas a partir de ${sampled.length} notas dos últimos 6 meses.
> Revise antes de compartilhar com o time. Edite o que não soa como você.

${raw.trim()}

---

_Atlas usou IA local para inferir padrões a partir das suas próprias notas. Você é a fonte. Atlas só destila._`;

			const path = normalizePath(
				`${this.plugin.settings.folders.knowledge}/manager-readme.md`
			);
			const dir = path.split("/").slice(0, -1).join("/");
			if (!this.app.vault.getAbstractFileByPath(dir)) {
				await this.app.vault.createFolder(dir);
			}
			const existing = this.app.vault.getAbstractFileByPath(path);
			if (existing instanceof TFile) {
				await this.app.vault.modify(existing, md);
			} else {
				await this.app.vault.create(path, md);
			}
			return { notePath: path };
		} catch (e) {
			notice.hide();
			new Notice(`Atlas: erro — ${String(e)}`, 8000);
			return null;
		}
	}
}

// ──────────────────────────────────────────────────────────────────
// PRE-MORTEM ORACLE — usa KG histórico pra prever o que pode dar errado
// ──────────────────────────────────────────────────────────────────

const PREMORTEM_PROMPT = `Você é Atlas em modo "Pre-mortem Oracle". O usuário descreve um projeto/decisão. Você deve PREVER como ele pode falhar, baseado em:

1. Padrões históricos no KG dele (incidents passados, riscos materializados, projetos cancelados)
2. Princípios universais de Murphy / pre-mortem (Kahneman / Klein)
3. Riscos específicos do contexto (banco TI, equipe N, tech stack X)

Estrutura:
1. **Cenário pessimista realista**: 1 parágrafo "Imagine 6 meses no futuro: X falhou completamente."
2. **Top 7 razões da falha** (priorizadas por probabilidade × impacto, baseadas em histórico)
3. **Sinais precoces** que ele deve monitorar pra detectar cada risco antes de virar problema
4. **Mitigações concretas** (1 por risco)

PT-BR. Direto. Sem invenções. Use evidências do histórico quando relevante.`;

// v0.18 PREMIUM — 8-perspective pre-mortem (Kahneman/Klein + Murphy + multi-stakeholder)
const PREMORTEM_PROMPT_PREMIUM = `Você é Atlas em modo "Pre-mortem Oracle Deep". Use a profundidade total do modelo cloud.

Aplique pre-mortem de Gary Klein + reasoning de Kahneman + 8 perspectivas independentes de risco.

ESTRUTURA OBRIGATÓRIA:

## 🎬 Cenário-zero: 6 meses no futuro
Parágrafo vívido (5-7 linhas) descrevendo o pior cenário realista. Não exagerado, mas honestamente catastrófico. Cite consequências concretas (KPIs, pessoas, regulatório).

## 🔮 Análise por 8 perspectivas
Para CADA perspectiva, identifique 3 modos de falha + 1 sinal precoce + 1 mitigação:

### 1. **Technical** (arquitetura, infra, code)
- 3 modos de falha
- Sinal precoce (métrica/alarme/comportamento)
- Mitigação concreta com owner

### 2. **Market** (concorrência, demanda, timing)
### 3. **Regulatory / Compliance** (LGPD, BACEN, SOX, ANPD)
### 4. **Team** (skills, capacity, churn, ownership)
### 5. **Customer** (UX, satisfação, churn rate)
### 6. **Financial** (orçamento, ROI, cost overrun)
### 7. **Security** (data breach, attack vectors, audit)
### 8. **Operational** (ops/SRE, monitoring, on-call burden)

## 📊 Risk Matrix (priorização)
Tabela:
| # | Risco | Perspectiva | Probabilidade | Impacto | Reversível? | Score | Owner |

Score = Prob (1-5) × Impact (1-5). Top 5 com prioridade explícita.

## 🚨 Top 5 Earliest Warning Signs
Sinais que aparecerão ANTES do problema escalar. Ordem cronológica esperada.

## 🛡️ Mitigation Plan (priorizado)
- **Pre-launch** (antes de começar): 3 ações com owner + prazo
- **In-flight monitoring**: KPIs + thresholds que disparam revisão
- **Bail-out criteria**: condições que indicam descontinuar/pivotar

## 🧪 Stress Test das suas premissas
Liste as 3 premissas centrais do projeto. Para cada, descreva o que aconteceria se ela for falsa. Recomende validação ANTES de comprometer recursos.

## 🎯 Recomendação Final
- Go / No-Go / Go-with-conditions
- Confidence level (low/medium/high) + justificativa
- Top 3 ações ANTES de comprometer recursos

PRINCÍPIOS:
- Use evidências do histórico do KG quando aparecerem
- Sem floreio. Tom factual, levemente cético
- Honesto sobre incerteza ("não sei se X — recomendo descobrir")
- PT-BR mas mantenha termos técnicos
- Cite analogias REAIS (incidents passados na mesma indústria)`;

export class PreMortemOracle {
	constructor(private app: App, private plugin: AtlasPlugin) {}

	async run(projectDescription: string): Promise<string | null> {
		const ok = await this.plugin.ollama.ping();
		if (!ok) {
			new Notice("Atlas: Ollama offline.");
			return null;
		}

		// Pull historical incidents + materialized risks from KG
		const incidents = this.plugin.kg.data.risks.filter((r) => r.status === "realized");
		const materializedRisks = this.plugin.kg.data.risks.filter(
			(r) => r.status === "realized" || r.status === "mitigated"
		);

		const historyExcerpts: string[] = [];
		const sampled = materializedRisks.slice(0, 10);
		for (const r of sampled) {
			historyExcerpts.push(
				`Risco histórico (${r.priority}): ${r.description}${r.mitigationPlan ? ` · Mitigação: ${r.mitigationPlan}` : ""}`
			);
		}

		const incidentNotes = this.app.vault
			.getMarkdownFiles()
			.filter((f) => f.path.startsWith(this.plugin.settings.folders.incidents))
			.slice(0, 5);
		for (const f of incidentNotes) {
			try {
				const raw = await this.app.vault.read(f);
				historyExcerpts.push(`Incident [${f.basename}]: ${raw.substring(0, 400)}`);
			} catch {
				// continue
			}
		}

		const historyBlock =
			historyExcerpts.length > 0
				? `Histórico relevante do KG:\n${historyExcerpts.join("\n\n")}`
				: "(KG ainda sem histórico de riscos materializados — use princípios gerais)";

		const userPrompt = `Projeto/decisão a analisar:
"""
${projectDescription}
"""

${historyBlock}

Aplique o método Pre-mortem Oracle.`;

		const notice = new Notice("Atlas: rodando pre-mortem...", 0);
		try {
			// v0.18: route through LLMService — premium 8-perspective when cloud
			const llm = this.plugin.llm;
			const isCloud = llm?.willUseCloud("reasoning") ?? false;
			const sysPrompt = isCloud ? PREMORTEM_PROMPT_PREMIUM : PREMORTEM_PROMPT;
			const raw = llm
				? await llm.chat(
						[
							{ role: "system", content: sysPrompt },
							{ role: "user", content: userPrompt },
						],
						{
							feature: "innovation.pre-mortem",
							taskKind: "reasoning",
							temperature: 0.6,
							maxTokens: isCloud ? 6000 : 2500,
						}
				  )
				: await this.plugin.ollama.chat(
						[
							{ role: "system", content: PREMORTEM_PROMPT },
							{ role: "user", content: userPrompt },
						],
						{
							model: this.plugin.settings.ollama.generationModel,
							temperature: 0.6,
							max_tokens: 2500,
						}
				  );
			notice.hide();
			return raw.trim();
		} catch (e) {
			notice.hide();
			new Notice(`Atlas: erro — ${String(e)}`, 8000);
			return null;
		}
	}
}

export class PreMortemModal extends Modal {
	private projectDesc = "";

	constructor(app: App, private plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		applyResponsiveModal(contentEl, { preferredWidth: 640 });
		contentEl.addClass("atlas-premortem-modal");

		const header = contentEl.createDiv({ cls: "atlas-premortem-header" });
		header.createEl("span", { cls: "atlas-premortem-icon", text: "🔮" });
		const wrap = header.createDiv({ cls: "atlas-premortem-header-wrap" });
		wrap.createEl("h3", { cls: "atlas-premortem-title", text: "Pre-mortem Oracle" });
		wrap.createEl("div", {
			cls: "atlas-premortem-subtitle",
			text: "Descreva um projeto/decisão. Atlas vai prever como pode falhar, usando seu histórico do KG.",
		});

		const ta = contentEl.createEl("textarea", { cls: "atlas-premortem-input" });
		ta.placeholder = "Ex: Vamos migrar todo o sistema de pagamentos pra microserviços em 3 meses, com time de 8 pessoas, mantendo legacy rodando em paralelo...";
		ta.addEventListener("input", () => (this.projectDesc = ta.value));

		new Setting(contentEl)
			.addButton((b) => b.setButtonText("Cancelar").onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText("🔮 Prever falhas")
					.setCta()
					.onClick(async () => {
						if (!this.projectDesc.trim()) {
							new Notice("Atlas: descreva o projeto primeiro.");
							return;
						}
						this.close();
						const oracle = new PreMortemOracle(this.app, this.plugin);
						const result = await oracle.run(this.projectDesc);
						if (result) {
							new PreMortemResultModal(this.app, this.projectDesc, result).open();
						}
					})
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

class PreMortemResultModal extends Modal {
	constructor(app: App, private question: string, private result: string) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		applyResponsiveModal(contentEl, { preferredWidth: 800 });
		contentEl.addClass("atlas-premortem-result-modal");
		contentEl.createEl("h3", {
			cls: "atlas-premortem-result-title",
			text: "🔮 Pre-mortem — Atlas Oracle",
		});

		const q = contentEl.createEl("blockquote", {
			cls: "atlas-premortem-question",
			text: this.question,
		});
		void q;

		const pre = contentEl.createDiv({ cls: "atlas-premortem-result" });
		pre.textContent = this.result;

		new Setting(contentEl)
			.addButton((b) =>
				b.setButtonText("Copiar").onClick(async () => {
					await navigator.clipboard.writeText(this.result);
					new Notice("Atlas: copiado.");
				})
			)
			.addButton((b) =>
				b.setButtonText("Fechar").setCta().onClick(() => this.close())
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

// ──────────────────────────────────────────────────────────────────
// DECISION DIARY — compila decisões + outcomes do mês
// ──────────────────────────────────────────────────────────────────

export class DecisionDiaryTool {
	constructor(private app: App, private plugin: AtlasPlugin) {}

	async generateForMonth(year: number, month: number): Promise<string> {
		const start = new Date(year, month - 1, 1);
		const end = new Date(year, month, 0, 23, 59, 59);
		const startMs = start.getTime();
		const endMs = end.getTime();

		// Coleta decisões do KG (sessions.decisions + ADRs em 09_Knowledge/adrs)
		const decisions: { date: string; text: string; source: string; rationale?: string }[] = [];

		// From KG sessions
		for (const s of this.plugin.kg.data.sessions) {
			const d = new Date(s.date).getTime();
			if (d < startMs || d > endMs) continue;
			for (const dec of s.decisions) {
				decisions.push({ date: s.date, text: dec, source: s.sourceNotePath });
			}
		}

		// From ADRs
		const adrFolder = `${this.plugin.settings.folders.knowledge}/adrs`;
		const adrFiles = this.app.vault
			.getMarkdownFiles()
			.filter((f) => f.path.startsWith(adrFolder));
		for (const f of adrFiles) {
			const cache = this.app.metadataCache.getFileCache(f);
			const fmDate = cache?.frontmatter?.date as string | undefined;
			if (!fmDate) continue;
			const t = new Date(fmDate).getTime();
			if (t < startMs || t > endMs) continue;
			const title = (cache?.frontmatter?.title as string | undefined) ?? f.basename;
			decisions.push({
				date: fmDate.substring(0, 10),
				text: title,
				source: f.path,
				rationale: "ADR — ver nota completa",
			});
		}

		decisions.sort((a, b) => a.date.localeCompare(b.date));

		const monthLabel = start.toLocaleDateString("pt-BR", {
			month: "long",
			year: "numeric",
		});

		const md = `---
type: decision-diary
month: ${year}-${String(month).padStart(2, "0")}
generated_by: atlas
generated_at: ${new Date().toISOString()}
total_decisions: ${decisions.length}
---

# 📔 Decision Diary — ${monthLabel}

> Atlas compilou todas as decisões registradas no seu vault em ${monthLabel}.

## 📊 Total: ${decisions.length} decisões

${
	decisions.length === 0
		? "_Nenhuma decisão registrada. Use templates ADR / 1:1 framework GROW pra capturar decisões explicitamente._"
		: ""
}

${decisions
	.map(
		(d, i) =>
			`### ${i + 1}. ${d.date} — ${d.text}\n\n**Fonte:** [[${d.source.replace(/\.md$/, "")}]]${d.rationale ? `\n\n**Rationale:** ${d.rationale}` : ""}`
	)
	.join("\n\n")}

---

## 🎯 Para revisão (próximo mês)

> Pergunte-se: dessas ${decisions.length} decisões, quais ainda fazem sentido? Quais você reverteria? Quais foram acertadas?

- [ ] Decisões a revisar:
- [ ] Outcomes a documentar:
- [ ] Lessons learned:

---

_Compilado pelo Atlas. Use isso pra retrospectiva pessoal._`;

		const path = normalizePath(
			`${this.plugin.settings.folders.reports}/decisions/${year}-${String(month).padStart(2, "0")}.md`
		);
		const dir = path.split("/").slice(0, -1).join("/");
		if (!this.app.vault.getAbstractFileByPath(dir)) {
			await this.app.vault.createFolder(dir);
		}
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, md);
		} else {
			await this.app.vault.create(path, md);
		}
		return path;
	}
}
