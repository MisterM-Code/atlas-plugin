/**
 * Atlas TI Tools (v0.7 Sprint 18) — 8 ferramentas IA focadas em TI/Eng. Software.
 *
 *  1. Architecture Diagram (Mermaid C4)
 *  2. ADR Generator
 *  3. Tech Debt Scanner
 *  4. Runbook Generator
 *  5. Postmortem Builder
 *  6. Flow Chart Generator (Mermaid flowchart)
 *  7. API Doc Extractor
 *  8. Capacity Planner
 *
 * Cada tool: classe com .run() que dispara LLM via Ollama + persiste nota.
 */

import { App, Modal, Notice, Setting, TFile, normalizePath } from "obsidian";
import type AtlasPlugin from "../../main";
import { applyResponsiveModal } from "../ui/modal-helpers";
import { Indexer } from "../retrieval/indexer";
import { logger } from "../utils/logger";

// ──────────────────────────────────────────────────────────────────
// Helper: salva markdown como nota em pasta + abre
// ──────────────────────────────────────────────────────────────────

async function saveNote(
	plugin: AtlasPlugin,
	folder: string,
	fileName: string,
	markdown: string
): Promise<TFile | null> {
	const fullFolder = folder;
	if (!plugin.app.vault.getAbstractFileByPath(fullFolder)) {
		await plugin.app.vault.createFolder(fullFolder).catch(() => undefined);
	}
	const path = normalizePath(`${fullFolder}/${fileName}`);
	try {
		const existing = plugin.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await plugin.app.vault.modify(existing, markdown);
			return existing;
		}
		const f = await plugin.app.vault.create(path, markdown);
		return f;
	} catch (e) {
		logger.warn("ti-tools: falha ao salvar", { error: String(e), path });
		return null;
	}
}

function slugify(s: string): string {
	return s
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.substring(0, 60);
}

// ──────────────────────────────────────────────────────────────────
// v0.18 helper: route via LLMService with cloud-aware prompt selection
// ──────────────────────────────────────────────────────────────────

interface TIToolCallParams {
	plugin: AtlasPlugin;
	systemStandard: string;
	systemPremium: string;
	userMessage: string;
	feature: string;
	taskKind?: "chat" | "extraction" | "summarization" | "reasoning";
	temperature?: number;
	maxTokensStandard?: number;
	maxTokensPremium?: number;
}

async function runTITool(p: TIToolCallParams): Promise<string> {
	const llm = p.plugin.llm;
	const isCloud = llm?.willUseCloud(p.taskKind ?? "chat") ?? false;
	const systemPrompt = isCloud ? p.systemPremium : p.systemStandard;
	const maxTokens = isCloud ? (p.maxTokensPremium ?? 4500) : (p.maxTokensStandard ?? 1500);

	const messages = [
		{ role: "system" as const, content: systemPrompt },
		{ role: "user" as const, content: p.userMessage },
	];

	if (llm) {
		return llm.chat(messages, {
			feature: p.feature,
			taskKind: p.taskKind ?? "chat",
			temperature: p.temperature ?? 0.4,
			maxTokens,
		});
	}
	// Fallback (shouldn't happen post-init)
	return p.plugin.ollama.chat(messages, {
		model: p.plugin.settings.ollama.generationModel,
		temperature: p.temperature ?? 0.4,
		max_tokens: maxTokens,
	});
}

// ──────────────────────────────────────────────────────────────────
// 1. ARCHITECTURE DIAGRAM (Mermaid C4)
// ──────────────────────────────────────────────────────────────────

const C4_SYSTEM_PROMPT = `Você é um arquiteto de software sênior. Dado a descrição livre de um sistema, gere um diagrama Mermaid no estilo C4.

REGRAS ESTRITAS:
- Use SOMENTE sintaxe Mermaid válida. Comece com \`\`\`mermaid e termine com \`\`\`.
- Para nível CONTEXT: use \`graph TD\` com nodes representando sistemas externos + sistema central.
- Para nível CONTAINER: use \`graph TD\` com containers (apps, dbs, queues) dentro do sistema.
- Para nível COMPONENT: use \`graph TD\` com componentes internos de UM container.
- Use IDs curtos (ex: User, API, DB), labels claros.
- Indique tecnologias entre colchetes: \`API[API REST<br/>Node.js]\`.
- Use --> para chamadas síncronas, --o-->| | para assíncronas.

NÃO use C4-PlantUML ou syntax inválida no Mermaid.

Responda APENAS com o bloco mermaid + 3 frases de explicação abaixo. Nada mais.`;

// v0.18 PREMIUM — usado quando cloud (Claude Opus / GPT-4o) está configurado
const C4_SYSTEM_PROMPT_PREMIUM = `Você é um arquiteto de software sênior produzindo documentação enterprise-grade C4 (Simon Brown). Use o máximo da capacidade do modelo cloud (Claude Opus 4.7 / GPT-4o).

ENTREGUE 4 ARTEFATOS na resposta (markdown):

## 1. Diagrama C4 (level solicitado)
Mermaid \`graph TD\` válido, com:
- IDs curtos + labels descritivos
- Tecnologias entre colchetes: \`API[API REST<br/>Node.js<br/>Express + Zod]\`
- Trust boundaries indicadas com subgraph (ex: \`subgraph "DMZ"\` / \`subgraph "VPC privada"\`)
- Estilos por tipo: classe \`:::ext\` para externos, \`:::db\` para databases, \`:::queue\` para filas
- Definir classes ao final: \`classDef ext fill:#fff4e6,stroke:#ff9933\`, etc.

## 2. Tabela de Relacionamentos
Markdown table com colunas: | Source | Target | Protocol | Sync/Async | Auth | Notas |

## 3. Stack Tecnológico
Lista por container: linguagem, framework, banco/persistência, mensageria, observabilidade.

## 4. Deployment View
Onde cada container roda: cloud provider (AWS/GCP/Azure), região, tipo (Lambda/ECS/K8s/EC2), HA strategy.

PRINCÍPIOS:
- Tom: técnico, factual, sem buzzword bingo
- Indique pontos de atenção (single point of failure, latência, custos)
- PT-BR mas mantenha termos técnicos (sync, queue, idempotency)
- Cite trade-offs explícitos quando há escolhas arquiteturais

Responda apenas com o markdown estruturado, sem preâmbulo.`;

export class ArchitectureDiagramTool {
	constructor(private app: App, private plugin: AtlasPlugin) {}

	async run(description: string, level: "context" | "container" | "component" = "container"): Promise<{ notePath: string } | null> {
		const notice = new Notice("Atlas: gerando diagrama...", 0);
		try {
			const out = await runTITool({
				plugin: this.plugin,
				systemStandard: C4_SYSTEM_PROMPT,
				systemPremium: C4_SYSTEM_PROMPT_PREMIUM,
				userMessage: `Nível: ${level}\n\nDescrição:\n${description}\n\nGere o Mermaid C4 ${level} agora:`,
				feature: "ti-tools.architecture-c4",
				temperature: 0.3,
				maxTokensStandard: 1500,
				maxTokensPremium: 4500,
			});

			const date = new Date().toISOString().split("T")[0];
			const titleMatch = description.match(/^[\w\sÀ-ú]+/);
			const title = titleMatch ? titleMatch[0].trim().substring(0, 60) : "Sistema";
			const slug = slugify(title);
			const folder = `${this.plugin.settings.folders.knowledge}/architecture`;
			const fileName = `${date}-${level}-${slug}.md`;

			const md = `---
type: architecture-diagram
level: ${level}
generated_at: ${new Date().toISOString()}
generated_by: atlas
---

# 🏗️ ${title} — ${level.toUpperCase()}

## Descrição

${description}

## Diagrama

${out}

## Notas

- Gerado por Atlas v0.7
- Nível: ${level}
- Modelo: ${this.plugin.settings.ollama.generationModel}
`;

			const f = await saveNote(this.plugin, folder, fileName, md);
			notice.hide();
			if (f) {
				new Notice(`Atlas: diagrama ${level} criado.`);
				return { notePath: f.path };
			}
			return null;
		} catch (e) {
			notice.hide();
			this.plugin.presentError(e);
			return null;
		}
	}
}

export class ArchitectureDiagramModal extends Modal {
	private description = "";
	private level: "context" | "container" | "component" = "container";

	constructor(app: App, private plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		applyResponsiveModal(contentEl, { preferredWidth: 640 });
		contentEl.addClass("atlas-ti-modal", "atlas-ti-architecture");

		const header = contentEl.createDiv({ cls: "atlas-ti-header" });
		header.createEl("span", { cls: "atlas-ti-icon", text: "🏗️" });
		const wrap = header.createDiv({ cls: "atlas-ti-header-wrap" });
		wrap.createEl("h3", { cls: "atlas-ti-title", text: "Architecture Diagram (C4)" });
		wrap.createEl("div", {
			cls: "atlas-ti-subtitle",
			text: "Descreva o sistema. Atlas gera diagrama Mermaid C4 nível Context/Container/Component.",
		});

		new Setting(contentEl)
			.setName("Nível")
			.addDropdown((d) => {
				d.addOption("context", "Context (sistema + externos)");
				d.addOption("container", "Container (apps, dbs, queues)");
				d.addOption("component", "Component (interno de 1 container)");
				d.setValue("container");
				d.onChange((v) => (this.level = v as typeof this.level));
			});

		const ta = contentEl.createEl("textarea", { cls: "atlas-ti-textarea" });
		ta.placeholder =
			"Ex: Sistema de pagamentos: API REST em Node.js + fila Kafka, banco Postgres pra transactions e Redis pra cache. Integra com PIX (BCB) e Stripe. Fronend React consome via API Gateway.";
		ta.addEventListener("input", () => (this.description = ta.value));

		new Setting(contentEl)
			.addButton((b) => b.setButtonText("Cancelar").onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText("🏗️ Gerar")
					.setCta()
					.onClick(async () => {
						if (!this.description.trim()) {
							new Notice("Atlas: descreva o sistema primeiro.");
							return;
						}
						this.close();
						const tool = new ArchitectureDiagramTool(this.app, this.plugin);
						const r = await tool.run(this.description, this.level);
						if (r) {
							const f = this.app.vault.getAbstractFileByPath(r.notePath);
							if (f instanceof TFile) {
								await this.app.workspace.getLeaf().openFile(f);
							}
						}
					})
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

// ──────────────────────────────────────────────────────────────────
// 2. ADR GENERATOR
// ──────────────────────────────────────────────────────────────────

const ADR_PROMPT = `Você é um arquiteto de software sênior escrevendo um Architecture Decision Record (ADR) no formato Michael Nygard.

REGRAS:
- ADR completo com seções: Status, Context, Decision, Consequences (Positive, Negative, Risks), Alternatives Considered, Related Decisions.
- Tom: técnico, conciso, factual. Sem marketing speak.
- Em PT-BR.
- Indique data atual ${new Date().toISOString().split("T")[0]}.

Responda APENAS com o markdown do ADR, sem preâmbulo. Use ## para seções principais.`;

// v0.18 PREMIUM — Full Nygard + alternatives matrix + stakeholder + compliance + reversal cost
const ADR_PROMPT_PREMIUM = `Você é arquiteto de software sênior produzindo um ADR enterprise-grade no formato Michael Nygard estendido. Use a profundidade total do modelo cloud.

ESTRUTURA OBRIGATÓRIA:

## Status
[Proposed | Accepted | Deprecated | Superseded by ADR-XXXX]

## Context
3 sub-seções:
- **Background histórico**: o que motivou esta decisão? Que decisões anteriores levaram aqui?
- **Forças em jogo** (technical / business / regulatory / team)
- **Constraints**: limitações de tempo, orçamento, skills, compliance

## Decision
Decisão clara em 1-2 parágrafos. Linguagem ativa: "Vamos adotar X porque Y."

## Alternatives Considered (matrix)
Tabela markdown com 3+ alternativas:
| Alternativa | Pros | Cons | Custo (low/med/high) | Reversal cost | Decision criteria | Por que NÃO |

## Consequences
3 sub-seções:
- **Positive** (esperadas)
- **Negative** (esperadas — não esconda)
- **Neutral / future implications**

## Risks & Mitigations
Tabela: | Risco | Probabilidade | Impacto | Mitigação | Owner |

## Stakeholders Impactados
Lista por área (Eng, Product, Ops, Security, Compliance, Customers) — quem precisa ser informado/consultado.

## Compliance Considerations
Indique se decisão tem implicações regulatórias (LGPD, BACEN, SOX, PCI). Se SIM, detalhe.

## Reversal Cost
[Low (revert em horas) | Medium (semanas + migração) | High (re-arquitetura)]
Justifique.

## Related Decisions
Liste ADRs anteriores relacionados (ou diga "nenhum até esta data").

## Implementation Plan (high-level)
3-7 milestones. Inclua signal de sucesso por milestone.

PRINCÍPIOS:
- Honesto sobre trade-offs e ambiguidade
- PT-BR (mas mantenha termos técnicos sem traduzir: "feature flag", "rollback", "idempotency")
- Sem marketing speak. Tom factual.
- Indique data: ${new Date().toISOString().split("T")[0]}

Responda APENAS com o markdown completo, sem preâmbulo.`;

export class AdrGeneratorTool {
	constructor(private app: App, private plugin: AtlasPlugin) {}

	async run(title: string, context: string): Promise<{ notePath: string } | null> {
		const notice = new Notice("Atlas: gerando ADR...", 0);
		try {
			const out = await runTITool({
				plugin: this.plugin,
				systemStandard: ADR_PROMPT,
				systemPremium: ADR_PROMPT_PREMIUM,
				userMessage: `Título da decisão: ${title}\n\nContexto:\n${context}\n\nGere o ADR completo:`,
				feature: "ti-tools.adr",
				temperature: 0.4,
				maxTokensStandard: 2000,
				maxTokensPremium: 6000,
			});

			const date = new Date().toISOString().split("T")[0];
			const slug = slugify(title);
			const folder = `${this.plugin.settings.folders.knowledge}/adr`;

			// ADR numbering: count existing
			const existing = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(folder)).length;
			const adrNum = String(existing + 1).padStart(4, "0");
			const fileName = `ADR-${adrNum}-${slug}.md`;

			const md = `---
type: adr
adr_number: ${adrNum}
title: "${title.replace(/"/g, '\\"')}"
status: proposed
date: ${date}
generated_by: atlas
---

# ADR-${adrNum}: ${title}

${out}

---

_Gerado por Atlas v0.7. Revise e altere status para \`accepted\` quando time aprovar._
`;

			const f = await saveNote(this.plugin, folder, fileName, md);
			notice.hide();
			if (f) {
				new Notice(`Atlas: ADR-${adrNum} criado.`);
				return { notePath: f.path };
			}
			return null;
		} catch (e) {
			notice.hide();
			this.plugin.presentError(e);
			return null;
		}
	}
}

export class AdrGeneratorModal extends Modal {
	private title = "";
	private context = "";

	constructor(app: App, private plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		applyResponsiveModal(contentEl, { preferredWidth: 680 });
		contentEl.addClass("atlas-ti-modal", "atlas-ti-adr");

		const header = contentEl.createDiv({ cls: "atlas-ti-header" });
		header.createEl("span", { cls: "atlas-ti-icon", text: "📜" });
		const wrap = header.createDiv({ cls: "atlas-ti-header-wrap" });
		wrap.createEl("h3", { cls: "atlas-ti-title", text: "ADR Generator" });
		wrap.createEl("div", {
			cls: "atlas-ti-subtitle",
			text: "Architecture Decision Record (formato Michael Nygard). Atlas gera Status/Context/Decision/Consequences/Alternatives.",
		});

		new Setting(contentEl)
			.setName("Título da decisão")
			.addText((t) => {
				t.setPlaceholder("Ex: Adotar Postgres em vez de MongoDB")
					.onChange((v) => (this.title = v));
				t.inputEl.addClass("atlas-ti-input-full");
			});

		contentEl.createEl("div", { cls: "atlas-ti-field-label", text: "Contexto (livre):" });

		const ta = contentEl.createEl("textarea", { cls: "atlas-ti-textarea" });
		ta.placeholder =
			"Por que essa decisão? Quais opções consideramos? Quais constraints? Quais trade-offs?";
		ta.addEventListener("input", () => (this.context = ta.value));

		new Setting(contentEl)
			.addButton((b) => b.setButtonText("Cancelar").onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText("📜 Gerar ADR")
					.setCta()
					.onClick(async () => {
						if (!this.title.trim() || !this.context.trim()) {
							new Notice("Atlas: preencha título e contexto.");
							return;
						}
						this.close();
						const tool = new AdrGeneratorTool(this.app, this.plugin);
						const r = await tool.run(this.title, this.context);
						if (r) {
							const f = this.app.vault.getAbstractFileByPath(r.notePath);
							if (f instanceof TFile) {
								await this.app.workspace.getLeaf().openFile(f);
							}
						}
					})
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

// ──────────────────────────────────────────────────────────────────
// 3. TECH DEBT SCANNER
// ──────────────────────────────────────────────────────────────────

interface DebtItem {
	id: string;
	title: string;
	severity: "low" | "medium" | "high" | "critical";
	estimateHours: number;
	notePath: string;
	excerpt: string;
}

const DEBT_PROMPT = `Você é um arquiteto de software experiente. Receberá um trecho de nota técnica do usuário. Identifique se contém débito técnico (TODO, FIXME, HACK, workaround, limitação conhecida, dívida arquitetural).

Se SIM, retorne JSON estrito:
{
  "is_debt": true,
  "title": "<resumo curto até 80 chars>",
  "severity": "low" | "medium" | "high" | "critical",
  "estimate_hours": <número estimado de horas para resolver>,
  "rationale": "<por que é débito + impacto se não resolver>"
}

Se NÃO for débito (apenas nota normal), retorne:
{ "is_debt": false }

Responda APENAS o JSON, sem texto extra.`;

// v0.18 PREMIUM — Categorização + impact/effort matrix + dependencies + sprint planning
const DEBT_PROMPT_PREMIUM = `Você é arquiteto sênior fazendo classificação rigorosa de débito técnico. Use raciocínio cloud profundo.

Receberá trecho de nota. Se for DÉBITO (TODO/FIXME/HACK/workaround/limitação conhecida/dívida arquitetural), retorne JSON estrito ESTENDIDO:

{
  "is_debt": true,
  "title": "<resumo até 80 chars>",
  "category": "technical" | "design" | "documentation" | "infrastructure" | "security" | "performance",
  "severity": "low" | "medium" | "high" | "critical",
  "impact": <1-5>,
  "effort_story_points": <1, 2, 3, 5, 8, 13, ou 21>,
  "estimate_hours": <horas reais>,
  "risk_score": <1-5> (combinação impact × probability of materializing),
  "reversal_complexity": "trivial" | "easy" | "medium" | "hard" | "epic",
  "dependencies": ["<lista de outros débitos/sistemas/migrations bloqueantes>"],
  "blast_radius": "<qual área/time/cliente é afetado se materializar>",
  "rationale": "<por que é débito + cenários onde quebra + custo de inação>",
  "sprint_priority": "next-sprint" | "this-quarter" | "this-year" | "backlog",
  "tags": ["<2-4 tags pra agrupar com outros débitos similares>"]
}

Se NÃO for débito: { "is_debt": false }

Critérios de severity:
- critical: produção pode cair / dado pode corromper / compliance violado
- high: impacto sério na operação ou velocidade do time, prazo curto
- medium: degrada qualidade/manutenção mas tolerável por meses
- low: melhoria desejável, sem custo direto imediato

Responda APENAS o JSON, sem texto extra.`;

export class TechDebtScannerTool {
	constructor(private app: App, private plugin: AtlasPlugin) {}

	async run(): Promise<{ notePath: string; items: DebtItem[] } | null> {
		const notice = new Notice("Atlas: escaneando vault em busca de débitos técnicos...", 0);
		const items: DebtItem[] = [];
		try {
			const indexer = new Indexer(this.app);
			const allFiles = this.app.vault
				.getMarkdownFiles()
				.filter((f) =>
					!f.path.startsWith(this.plugin.settings.folders.atlas) &&
					!f.path.startsWith("99_Archive")
				);

			let processed = 0;
			for (const file of allFiles) {
				processed++;
				if (processed % 10 === 0) {
					notice.setMessage(`Atlas: ${processed}/${allFiles.length} notas...`);
				}
				try {
					const indexed = await indexer.indexFile(file);
					if (!indexed) continue;
					const body = indexed.body;
					// Heurísticas: tem #debt ou TODO/FIXME/HACK
					const hasDebtMarkers =
						/#debt|#tech-debt|TODO|FIXME|HACK|XXX/.test(body) ||
						(indexed.tags ?? []).some((t: string) =>
							t.includes("debt") || t.includes("tech-debt")
						);
					if (!hasDebtMarkers) continue;

					// LLM classifies — v0.18: route through LLMService
					const llm = this.plugin.llm;
					const isCloud = llm?.willUseCloud("extraction") ?? false;
					const sysPrompt = isCloud ? DEBT_PROMPT_PREMIUM : DEBT_PROMPT;
					const messages = [
						{ role: "system" as const, content: sysPrompt },
						{
							role: "user" as const,
							content: `Note: ${file.basename}\n\nTrecho:\n${body.substring(0, 2000)}`,
						},
					];
					const out = llm
						? await llm.chat(messages, {
								feature: "ti-tools.tech-debt-scan",
								taskKind: "extraction",
								temperature: 0.2,
								maxTokens: isCloud ? 600 : 200,
								jsonFormat: true,
						  })
						: await this.plugin.ollama.chat(messages, {
								model: this.plugin.settings.ollama.smallModel,
								temperature: 0.2,
								max_tokens: 200,
								format: "json",
						  });

					try {
						const parsed = JSON.parse(out);
						if (parsed.is_debt && parsed.title) {
							items.push({
								id: `debt-${items.length + 1}`,
								title: parsed.title,
								severity: parsed.severity ?? "medium",
								estimateHours: parsed.estimate_hours ?? 4,
								notePath: file.path,
								excerpt: parsed.rationale ?? "",
							});
						}
					} catch {
						// skip
					}
				} catch {
					// continue
				}
			}

			notice.hide();

			if (items.length === 0) {
				new Notice("Atlas: nenhum débito técnico claro encontrado. ✅");
				return { notePath: "", items: [] };
			}

			// Build report
			items.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
			const date = new Date().toISOString().split("T")[0];
			const folder = `${this.plugin.settings.folders.knowledge}/tech-debt`;
			const fileName = `tech-debt-scan-${date}.md`;

			const totalHours = items.reduce((sum, it) => sum + it.estimateHours, 0);
			const bySeverity = groupBy(items, (it) => it.severity);

			const md = `---
type: tech-debt-scan
generated_at: ${new Date().toISOString()}
total_items: ${items.length}
total_hours_estimated: ${totalHours}
generated_by: atlas
---

# 💸 Tech Debt Scan — ${date}

## Resumo

- **Total de débitos:** ${items.length}
- **Esforço total estimado:** ${totalHours}h (${(totalHours / 8).toFixed(1)} dias)
- **Por severidade:**
${(["critical", "high", "medium", "low"] as const)
	.map((s) => {
		const arr = bySeverity[s] ?? [];
		const hours = arr.reduce((sum, it) => sum + it.estimateHours, 0);
		return `  - ${severityIcon(s)} **${s}**: ${arr.length} itens (${hours}h)`;
	})
	.join("\n")}

## Lista priorizada

${items
	.map(
		(it, i) =>
			`### ${i + 1}. ${severityIcon(it.severity)} ${it.title}\n\n` +
			`- **Severidade:** ${it.severity}\n` +
			`- **Esforço estimado:** ${it.estimateHours}h\n` +
			`- **Nota fonte:** [[${it.notePath}]]\n` +
			`- **Por quê:** ${it.excerpt}\n`
	)
	.join("\n")}

---

_Gerado por Atlas v0.7. Revise + crie tasks acionáveis._
`;

			const f = await saveNote(this.plugin, folder, fileName, md);
			if (f) {
				new Notice(`Atlas: ${items.length} débitos detectados (${totalHours}h estimadas).`);
				return { notePath: f.path, items };
			}
			return null;
		} catch (e) {
			notice.hide();
			this.plugin.presentError(e);
			return null;
		}
	}
}

function severityRank(s: DebtItem["severity"]): number {
	switch (s) {
		case "critical":
			return 4;
		case "high":
			return 3;
		case "medium":
			return 2;
		case "low":
			return 1;
	}
}

function severityIcon(s: DebtItem["severity"]): string {
	switch (s) {
		case "critical":
			return "🔴";
		case "high":
			return "🟠";
		case "medium":
			return "🟡";
		case "low":
			return "🟢";
	}
}

function groupBy<T, K extends string>(arr: T[], keyFn: (it: T) => K): Record<K, T[]> {
	const out = {} as Record<K, T[]>;
	for (const item of arr) {
		const k = keyFn(item);
		if (!out[k]) out[k] = [];
		out[k].push(item);
	}
	return out;
}

// ──────────────────────────────────────────────────────────────────
// 4. RUNBOOK GENERATOR
// ──────────────────────────────────────────────────────────────────

const RUNBOOK_PROMPT = `Você é um SRE/DevOps experiente. Crie um runbook estruturado a partir do cenário descrito.

ESTRUTURA OBRIGATÓRIA (markdown):
## 🚨 Detection
- Como detectar que o problema está acontecendo (alertas, métricas, logs)

## 🩺 Triage
- Passos de diagnóstico (5-7 passos numerados)
- Comandos/queries específicas (use code blocks)

## 🔧 Mitigation
- Solução imediata (passo a passo)
- Comandos exatos quando aplicável

## 🔄 Rollback
- Como reverter se mitigation der errado

## 📋 Post-incident
- Validação final
- Comunicação a stakeholders
- Logging do incidente

## 🛡️ Prevention
- Como evitar recorrência (3-5 ações)

Em PT-BR. Tom: profissional, factual. Use code blocks para comandos.`;

// v0.18 PREMIUM — Production-grade runbook (severity classification, escalation, SLA, dashboards)
const RUNBOOK_PROMPT_PREMIUM = `Você é Staff SRE produzindo runbook production-grade. Use a profundidade total do modelo cloud para gerar runbook utilizável às 3am pelo oncall.

ESTRUTURA OBRIGATÓRIA:

## 🚨 Detection
- Alerts esperados (nome do alert + canal: PagerDuty/OpsGenie/etc + threshold)
- Symptoms reportáveis (o que user/cliente observa)
- Metrics dashboards (link + métrica chave + valor anormal)
- Logs query (Splunk/Datadog/Cloudwatch query exata em code block)

## 🎯 Severity Classification
Tabela de critérios:
| Severity | Critério | Response time | Escalate to |
|---|---|---|---|
| P1 | <impact crítico> | <SLA> | <pager> |
| P2 | ... | ... | ... |
| P3 | ... | ... | ... |

## 🩺 Triage (decision tree)
Árvore de decisão markdown (use \`\`\`mermaid flowchart\`\`\` se >5 ramos):
1. Se **X** → diagnose com comando \`Y\`
2. Se Y retornar **Z** → vai pra mitigação A
3. Senão → vai pra mitigação B
[etc]

## 🔧 Mitigation Steps
Cada passo numerado com:
- **Comando** exato em code block
- **Expected output** (o que validar)
- **Gate**: critério para passar pro próximo passo
- **Tempo estimado**

## 🔄 Rollback
- **Decisão**: quando rollback é necessário (critério explícito)
- **Sequência exata** com gates
- **Validação pós-rollback** (queries/checks)
- **Communication**: quem notificar

## 📞 Escalation Chain
1. Primary oncall — <role>, response em N min
2. Backup oncall — <role>, escalate se primary não responde em M min
3. SRE Lead — escalate se Sev=P1 e não resolvido em X min
4. Engineering Manager + Director — incident bridge se Sev=P0 e ≥30 min

## 📊 SLA Impact Calculator
- SLA: 99.9% → margem mensal de Z minutos
- Estimativa de impacto: <fórmula simples>
- Quando ativar status page externa

## 🛡️ Prevention (root cause prevention)
- 3-5 actions concretas com **owner** + **deadline** + **success metric**

## 📚 Related Resources
- Dashboards: <link>
- Recent post-mortems: <link>
- Architecture docs: <link>

## 🔗 Keywords for search
[5-8 keywords pra futuras buscas]

Tom: profissional, factual, ZERO floreio. Use code blocks generosos. PT-BR mas mantenha termos técnicos.`;

export class RunbookGeneratorTool {
	constructor(private app: App, private plugin: AtlasPlugin) {}

	async run(scenario: string): Promise<{ notePath: string } | null> {
		const notice = new Notice("Atlas: gerando runbook...", 0);
		try {
			const out = await runTITool({
				plugin: this.plugin,
				systemStandard: RUNBOOK_PROMPT,
				systemPremium: RUNBOOK_PROMPT_PREMIUM,
				userMessage: `Cenário/incidente: ${scenario}\n\nGere o runbook completo:`,
				feature: "ti-tools.runbook",
				temperature: 0.3,
				maxTokensStandard: 2500,
				maxTokensPremium: 6000,
			});

			const date = new Date().toISOString().split("T")[0];
			const slug = slugify(scenario.substring(0, 60));
			const folder = `${this.plugin.settings.folders.knowledge}/runbooks`;
			const fileName = `runbook-${slug}.md`;

			const md = `---
type: runbook
scenario: "${scenario.replace(/"/g, '\\"').substring(0, 200)}"
created_at: ${date}
generated_by: atlas
status: draft
---

# 🚑 Runbook: ${scenario.substring(0, 80)}

${out}

---

_Gerado por Atlas v0.7. Teste o runbook em ambiente staging antes de promover a status: validated._
`;

			const f = await saveNote(this.plugin, folder, fileName, md);
			notice.hide();
			if (f) {
				new Notice("Atlas: runbook criado.");
				return { notePath: f.path };
			}
			return null;
		} catch (e) {
			notice.hide();
			this.plugin.presentError(e);
			return null;
		}
	}
}

export class RunbookGeneratorModal extends Modal {
	private scenario = "";

	constructor(app: App, private plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		applyResponsiveModal(contentEl, { preferredWidth: 640 });
		contentEl.addClass("atlas-ti-modal", "atlas-ti-runbook");

		const header = contentEl.createDiv({ cls: "atlas-ti-header" });
		header.createEl("span", { cls: "atlas-ti-icon", text: "🚑" });
		const wrap = header.createDiv({ cls: "atlas-ti-header-wrap" });
		wrap.createEl("h3", { cls: "atlas-ti-title", text: "Runbook Generator" });
		wrap.createEl("div", {
			cls: "atlas-ti-subtitle",
			text: "Atlas gera runbook completo: Detection / Triage / Mitigation / Rollback / Prevention.",
		});

		const ta = contentEl.createEl("textarea", { cls: "atlas-ti-textarea" });
		ta.placeholder = "Ex: API de pagamentos retornando 503 com latência alta. Banco PostgreSQL parece saturado.";
		ta.addEventListener("input", () => (this.scenario = ta.value));

		new Setting(contentEl)
			.addButton((b) => b.setButtonText("Cancelar").onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText("🚑 Gerar runbook")
					.setCta()
					.onClick(async () => {
						if (!this.scenario.trim()) {
							new Notice("Atlas: descreva o cenário primeiro.");
							return;
						}
						this.close();
						const tool = new RunbookGeneratorTool(this.app, this.plugin);
						const r = await tool.run(this.scenario);
						if (r) {
							const f = this.app.vault.getAbstractFileByPath(r.notePath);
							if (f instanceof TFile) {
								await this.app.workspace.getLeaf().openFile(f);
							}
						}
					})
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

// ──────────────────────────────────────────────────────────────────
// 5. POSTMORTEM BUILDER
// ──────────────────────────────────────────────────────────────────

const POSTMORTEM_PROMPT = `Você é um SRE conduzindo um postmortem blameless. Crie postmortem estruturado.

ESTRUTURA OBRIGATÓRIA:
## 📌 Sumário
- 1-2 frases descrevendo o que aconteceu

## ⏱️ Timeline
- Eventos cronológicos (HH:mm) com horários precisos
- Detection, escalation, mitigation, recovery

## 🎯 Root Cause Analysis (5 Whys)
- Why 1, Why 2, Why 3, Why 4, Why 5
- Causa raiz identificada ao final

## 🔍 Contributing Factors
- O que contribuiu (não causou direto, mas amplificou)

## 💥 Impact
- Usuários afetados, duração, perda financeira/reputacional, SLO breach

## ✅ What Went Well
- Coisas que ajudaram a recuperação

## ⚠️ What Went Wrong
- Coisas que pioraram ou atrasaram

## 🔧 Action Items
- Lista numerada com owner + due date placeholder
- Categorize: prevent / detect / mitigate

## 📚 Learnings
- 3-5 lições para o time

Tom: blameless (sem culpar pessoas). Em PT-BR. Use code blocks pra comandos/queries.`;

// v0.18 PREMIUM — Full SRE incident review (5-whys + ReASON + blast radius + regulatory)
const POSTMORTEM_PROMPT_PREMIUM = `Você é Staff SRE conduzindo postmortem blameless enterprise-grade. Use a profundidade total do modelo cloud.

ESTRUTURA OBRIGATÓRIA:

## 📌 Sumário Executivo
- 2-3 frases (TL;DR para diretoria)
- Severidade: P0/P1/P2/P3
- Status: resolved / monitoring / ongoing

## 📊 Impact Assessment
| Dimensão | Métrica | Valor |
|---|---|---|
| Usuários afetados | # / % do total | … |
| Duração | minutos | … |
| Receita perdida estimada | USD / BRL | … |
| SLO breach | sim/não + qual | … |
| Reputational | low/medium/high | … |
| Regulatório | LGPD/BACEN/SOX afetado? | … |
| Customer support tickets | # | … |

## ⏱️ Timeline (decision points marcados ⚡)
Eventos cronológicos HH:mm com:
- Quem agiu, qual ação, qual sinal observado, qual decisão tomada
- ⚡ marca decision points (poderia ter sido outra coisa)

## 🎯 5 Whys
**Why 1**: <symptom>
**Why 2**: <next layer>
... até **Why 5**: <root cause raiz>

## 🧪 ReASON Analysis
- **Reason** (por que aconteceu): <causa técnica>
- **Anticipation** (poderia ter previsto?): <signs ignorados>
- **Symptom** (como manifestou): <user impact>
- **Origin** (onde nasceu): <componente/PR/decisão prévia>
- **Notification** (como soube): <alerta/cliente reportou/manual)

## 🔍 Contributing Factors
- Technical: <ex: rate limit ausente>
- Process: <ex: PR mergeado sem review on-call>
- Organizational: <ex: knowledge gap>
- Tooling: <ex: dashboard X estava broken>

## 💥 Blast Radius
- Sistemas afetados (lista)
- Downstream effects (cascade)
- Customer segments (B2B / B2C / interno)
- Compliance implications (LGPD breach? Notify ANPD?)

## ✅ What Went Well
- Strong points (uso de detecção automática, comunicação rápida, etc)

## ⚠️ What Went Wrong
- Friction points (alerta tardio, runbook outdated, etc)

## 🔧 Action Items (priorizadas)
| # | Ação | Categoria | Owner | Prazo | Sucesso medido por |
|---|---|---|---|---|---|
| 1 | … | prevent/detect/mitigate | <pessoa> | <ISO date> | <métrica> |

## 📚 Learnings (organizational + technical)
- **Technical**: 3-5 insights
- **Organizational**: 2-4 insights (process, comms, on-call)

## 🔗 Related
- Runbook: <link>
- Monitoring dashboard: <link>
- ADRs relacionados: <link>
- Postmortems anteriores similares: <link>

PRINCÍPIOS:
- BLAMELESS — atacar o sistema, não as pessoas
- Honesto sobre o que NÃO sabemos ainda (vs especulação)
- Quantificar quando possível
- PT-BR mas mantenha termos técnicos
- Sem floreio executivo — fatos`;

export class PostmortemBuilderTool {
	constructor(private app: App, private plugin: AtlasPlugin) {}

	async run(summary: string, timeline: string): Promise<{ notePath: string } | null> {
		const notice = new Notice("Atlas: gerando postmortem...", 0);
		try {
			const out = await runTITool({
				plugin: this.plugin,
				systemStandard: POSTMORTEM_PROMPT,
				systemPremium: POSTMORTEM_PROMPT_PREMIUM,
				userMessage: `Sumário do incidente:\n${summary}\n\nTimeline (livre):\n${timeline}\n\nGere o postmortem completo:`,
				feature: "ti-tools.postmortem",
				temperature: 0.3,
				maxTokensStandard: 3000,
				maxTokensPremium: 7000,
			});

			const date = new Date().toISOString().split("T")[0];
			const slug = slugify(summary.substring(0, 60));
			const folder = `${this.plugin.settings.folders.incidents}`;
			const fileName = `postmortem-${date}-${slug}.md`;

			const md = `---
type: postmortem
incident_date: ${date}
status: draft
generated_by: atlas
---

# 🚨 Postmortem: ${summary.substring(0, 80)}

${out}

---

_Gerado por Atlas v0.7. Revise com o time, convidando blameless culture. Atualize action items com owner/due._
`;

			const f = await saveNote(this.plugin, folder, fileName, md);
			notice.hide();
			if (f) {
				new Notice("Atlas: postmortem criado.");
				return { notePath: f.path };
			}
			return null;
		} catch (e) {
			notice.hide();
			this.plugin.presentError(e);
			return null;
		}
	}
}

export class PostmortemBuilderModal extends Modal {
	private summary = "";
	private timeline = "";

	constructor(app: App, private plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		applyResponsiveModal(contentEl, { preferredWidth: 720 });
		contentEl.addClass("atlas-ti-modal", "atlas-ti-postmortem");

		const header = contentEl.createDiv({ cls: "atlas-ti-header" });
		header.createEl("span", { cls: "atlas-ti-icon", text: "🚨" });
		const wrap = header.createDiv({ cls: "atlas-ti-header-wrap" });
		wrap.createEl("h3", { cls: "atlas-ti-title", text: "Postmortem Builder" });
		wrap.createEl("div", {
			cls: "atlas-ti-subtitle",
			text: "Atlas gera postmortem blameless completo (Timeline, RCA 5-whys, Impact, Action Items, Learnings).",
		});

		new Setting(contentEl)
			.setName("Sumário do incidente")
			.addText((t) => {
				t.setPlaceholder("Ex: API checkout indisponível por 47 min em 2026-04-29")
					.onChange((v) => (this.summary = v));
				t.inputEl.addClass("atlas-ti-input-full");
			});

		contentEl.createEl("div", { cls: "atlas-ti-field-label", text: "Timeline + observações livres:" });

		const ta = contentEl.createEl("textarea", { cls: "atlas-ti-textarea" });
		ta.placeholder = "14:00 alarme de latência\n14:05 SRE conectou\n14:10 identificado lock no banco\n14:30 mitigação aplicada\n14:47 serviço normal";
		ta.addEventListener("input", () => (this.timeline = ta.value));

		new Setting(contentEl)
			.addButton((b) => b.setButtonText("Cancelar").onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText("🚨 Gerar postmortem")
					.setCta()
					.onClick(async () => {
						if (!this.summary.trim() || !this.timeline.trim()) {
							new Notice("Atlas: preencha sumário + timeline.");
							return;
						}
						this.close();
						const tool = new PostmortemBuilderTool(this.app, this.plugin);
						const r = await tool.run(this.summary, this.timeline);
						if (r) {
							const f = this.app.vault.getAbstractFileByPath(r.notePath);
							if (f instanceof TFile) {
								await this.app.workspace.getLeaf().openFile(f);
							}
						}
					})
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

// ──────────────────────────────────────────────────────────────────
// 6. FLOW CHART GENERATOR (Mermaid flowchart)
// ──────────────────────────────────────────────────────────────────

const FLOWCHART_PROMPT = `Você é um analista de processos. Dado a descrição livre de um fluxo, gere um diagrama Mermaid flowchart.

REGRAS:
- Use sintaxe \`flowchart TD\` (top-down) ou \`flowchart LR\` (esquerda-direita) — escolha a melhor.
- Decision points: use \`{}\` (losango). Process: \`[]\` (retangulo). Start/End: \`(())\`.
- Use IDs curtos. Edges com labels: \`A -->|sim| B\`.

Responda APENAS com o bloco mermaid + 2 frases de explicação. Nada mais.`;

// v0.18 PREMIUM — Multi-swimlane + decision criteria + error handling + BPMN-lite
const FLOWCHART_PROMPT_PREMIUM = `Você é analista de processos sênior. Use a profundidade do modelo cloud pra produzir fluxograma rico.

ENTREGUE 3 ARTEFATOS:

## 1. Diagrama Mermaid (use o melhor: flowchart TD/LR ou subgraph swimlanes)
- **Swimlanes** se ≥2 atores (ex: \`subgraph User\` / \`subgraph System\` / \`subgraph External\`)
- **Decision points** com critérios EXPLÍCITOS: \`B{Tem saldo?}\` → label \`B -->|saldo >= valor| C\`
- **Error/exception flows** com nodes vermelhos (\`:::error\`) e classDef ao final
- **Parallel branches** com \`fork/join\` quando aplicável
- **Start/End**: \`((Início))\` / \`((Fim))\`
- **Idempotency markers**: anotação no node se ação tem efeito colateral

## 2. Tabela de Decision Points
| Decision | Critério | Caminho A | Caminho B | Default | Owner |

## 3. Lista de Exception Paths
- Para cada caminho de erro, indique:
  - Quando ocorre
  - User-facing message
  - Recovery: retry / rollback / manual intervention
  - SLA / response time esperado

PRINCÍPIOS:
- ZERO ambiguidade — todo decision point com critério explícito
- Use code blocks markdown para queries/comandos quando aparecem no fluxo
- PT-BR
- Tom: técnico, factual

Responda apenas com markdown estruturado.`;

export class FlowChartTool {
	constructor(private app: App, private plugin: AtlasPlugin) {}

	async run(description: string): Promise<{ notePath: string } | null> {
		const notice = new Notice("Atlas: gerando fluxograma...", 0);
		try {
			const out = await runTITool({
				plugin: this.plugin,
				systemStandard: FLOWCHART_PROMPT,
				systemPremium: FLOWCHART_PROMPT_PREMIUM,
				userMessage: `Fluxo:\n${description}\n\nGere o Mermaid:`,
				feature: "ti-tools.flowchart",
				temperature: 0.3,
				maxTokensStandard: 1200,
				maxTokensPremium: 4000,
			});

			const date = new Date().toISOString().split("T")[0];
			const slug = slugify(description.substring(0, 50));
			const folder = `${this.plugin.settings.folders.knowledge}/flowcharts`;
			const fileName = `${date}-${slug}.md`;

			const md = `---
type: flowchart
generated_at: ${new Date().toISOString()}
generated_by: atlas
---

# 📊 Fluxograma

## Descrição original

${description}

## Diagrama

${out}
`;

			const f = await saveNote(this.plugin, folder, fileName, md);
			notice.hide();
			if (f) {
				new Notice("Atlas: fluxograma criado.");
				return { notePath: f.path };
			}
			return null;
		} catch (e) {
			notice.hide();
			this.plugin.presentError(e);
			return null;
		}
	}
}

// ──────────────────────────────────────────────────────────────────
// 7. API DOC EXTRACTOR
// ──────────────────────────────────────────────────────────────────

const API_DOC_PROMPT = `Você é um technical writer. Receberá código (TS/JS/Python/Go/Java). Extraia documentação API em Markdown.

ESTRUTURA:
## Endpoints

Para cada endpoint:
### \`METHOD /path\`
- **Descrição:** ...
- **Path params:** lista
- **Query params:** lista
- **Body:** schema
- **Response:** códigos + estrutura
- **Exemplo curl:** code block

Se não houver endpoints HTTP, documente as funções públicas como API SDK.

Em PT-BR. Use tabelas onde fizer sentido. Code blocks marcados.`;

// v0.18 PREMIUM — OpenAPI 3.1 + auth schemes + error codes + multi-language examples + breaking changes
const API_DOC_PROMPT_PREMIUM = `Você é Lead Technical Writer + DX engineer produzindo documentação API enterprise-grade. Use a profundidade total do modelo cloud.

ENTREGUE 6 ARTEFATOS em markdown:

## 1. Visão Geral
- Propósito da API
- Ambiente base URL (prod/staging)
- Versionamento strategy (URL path / header)

## 2. Authentication
Tabela de schemes suportados:
| Scheme | How | Example header |
|---|---|---|
| Bearer JWT | … | \`Authorization: Bearer <token>\` |
| API Key | … | \`X-API-Key: <key>\` |
| OAuth2 | … | flow + scopes |

## 3. Endpoints
Para cada:
### \`METHOD /path\`
- **Descrição** + caso de uso típico
- **Path params** (tabela): name | type | required | description | example
- **Query params** (tabela): mesma estrutura
- **Headers** customizados
- **Request body** (JSON schema com exemplo)
- **Response 2xx** (status + JSON exemplo)
- **Errors** (4xx / 5xx com códigos específicos da API + ação user)
- **Rate limit** específico do endpoint
- **Idempotency** (suporta header \`Idempotency-Key\`?)
- **Examples** em 3 linguagens:
  \`\`\`bash
  curl -X METHOD ...
  \`\`\`
  \`\`\`javascript
  fetch(...)
  \`\`\`
  \`\`\`python
  requests.post(...)
  \`\`\`

## 4. OpenAPI 3.1 Snippet
Para os principais endpoints, inclua \`\`\`yaml openapi: 3.1.0\`\`\` válido.

## 5. Error Codes Reference
Tabela exaustiva:
| Code | HTTP | Mensagem | Quando ocorre | Ação user |

## 6. Breaking Changes / Versioning
- Política de deprecation
- Mudanças entre versões (se múltiplas)
- Migration guide (se aplicável)

PRINCÍPIOS:
- Examples REAIS e copy-paste-able
- Indique limitações conhecidas (rate limits, payload size, timeout)
- PT-BR (mas mantenha keywords em inglês)
- Tom: factual, sem floreio

Responda apenas com markdown estruturado.`;

export class ApiDocExtractorTool {
	constructor(private app: App, private plugin: AtlasPlugin) {}

	async run(code: string, language?: string): Promise<{ notePath: string } | null> {
		const notice = new Notice("Atlas: extraindo API docs...", 0);
		try {
			const out = await runTITool({
				plugin: this.plugin,
				systemStandard: API_DOC_PROMPT,
				systemPremium: API_DOC_PROMPT_PREMIUM,
				userMessage: `Linguagem: ${language ?? "auto-detectar"}\n\nCódigo:\n\`\`\`${language ?? ""}\n${code.substring(0, 12000)}\n\`\`\`\n\nGere a documentação API:`,
				feature: "ti-tools.api-doc",
				temperature: 0.3,
				maxTokensStandard: 2500,
				maxTokensPremium: 6500,
			});

			const date = new Date().toISOString().split("T")[0];
			const folder = `${this.plugin.settings.folders.knowledge}/api-docs`;
			const fileName = `api-docs-${date}.md`;

			const md = `---
type: api-doc
generated_at: ${new Date().toISOString()}
language: ${language ?? "auto"}
generated_by: atlas
---

# 📘 API Documentation

${out}

---

_Gerado por Atlas v0.7. Revise antes de publicar._
`;

			const f = await saveNote(this.plugin, folder, fileName, md);
			notice.hide();
			if (f) {
				new Notice("Atlas: API docs criadas.");
				return { notePath: f.path };
			}
			return null;
		} catch (e) {
			notice.hide();
			this.plugin.presentError(e);
			return null;
		}
	}
}

// ──────────────────────────────────────────────────────────────────
// 8. CAPACITY PLANNER
// ──────────────────────────────────────────────────────────────────

export class CapacityPlannerTool {
	constructor(private app: App, private plugin: AtlasPlugin) {}

	async run(): Promise<{ notePath: string } | null> {
		const notice = new Notice("Atlas: analisando capacidade do time...", 0);
		try {
			const people = this.plugin.kg.listPeople().filter((p) =>
				p.type === "direct-report" || p.type === "peer"
			);
			const projects = this.plugin.kg.data.projects.filter((p) => p.status === "active");

			if (people.length === 0) {
				notice.hide();
				new Notice("Atlas: KG vazio. Indexe vault primeiro.");
				return null;
			}

			// Map: pessoa → projetos (via KG mentions)
			const allocation = new Map<string, { person: typeof people[number]; projects: typeof projects }>();
			for (const person of people) {
				allocation.set(person.id, { person, projects: [] });
			}

			// Aproximação: scan all sessions/notes for mentions of person+project
			// Simpler: count action items per person
			const personLoad = new Map<string, number>();
			for (const ai of this.plugin.kg.data.actionItems) {
				if (ai.status === "completed" || ai.status === "cancelled") continue;
				const person = people.find((p) => p.id === ai.ownerId);
				if (!person) continue;
				personLoad.set(person.id, (personLoad.get(person.id) ?? 0) + 1);
			}

			const date = new Date().toISOString().split("T")[0];
			const folder = `${this.plugin.settings.folders.metrics}`;
			const fileName = `capacity-${date}.md`;

			const overloaded = people.filter((p) => (personLoad.get(p.id) ?? 0) > 8);
			const underused = people.filter((p) => (personLoad.get(p.id) ?? 0) < 2);

			const md = `---
type: capacity-plan
generated_at: ${new Date().toISOString()}
team_size: ${people.length}
active_projects: ${projects.length}
generated_by: atlas
---

# 👥 Capacity Plan — ${date}

## Resumo

- **Time:** ${people.length} pessoas
- **Projetos ativos:** ${projects.length}
- **Sobrecarregadas (>8 action items):** ${overloaded.length}
- **Subutilizadas (<2 action items):** ${underused.length}

## Carga por pessoa

| Pessoa | Action items abertos | Status |
|---|---|---|
${people
	.sort((a, b) => (personLoad.get(b.id) ?? 0) - (personLoad.get(a.id) ?? 0))
	.map((p) => {
		const load = personLoad.get(p.id) ?? 0;
		const status = load > 8 ? "🔴 sobrecarga" : load < 2 ? "🟡 subutilizada" : "🟢 ok";
		return `| ${p.name} | ${load} | ${status} |`;
	})
	.join("\n")}

## Projetos ativos

${projects.length === 0 ? "(nenhum projeto ativo no KG)" : projects.map((p) => `- 🚀 **${p.name}** — RAG ${p.rag} · ${p.phase ?? "—"}`).join("\n")}

${
	overloaded.length > 0
		? `## ⚠️ Atenção: pessoas sobrecarregadas\n\n${overloaded.map((p) => `- **${p.name}** com ${personLoad.get(p.id)} actions abertas. Considere redistribuir.`).join("\n")}\n`
		: ""
}

${
	underused.length > 0
		? `## 💡 Pessoas com banda disponível\n\n${underused.map((p) => `- **${p.name}** (${personLoad.get(p.id) ?? 0} actions). Pode pegar mais escopo.`).join("\n")}\n`
		: ""
}

---

_Gerado por Atlas v0.7. Análise baseada em action items abertos no KG._
`;

			const f = await saveNote(this.plugin, folder, fileName, md);
			notice.hide();
			if (f) {
				new Notice(`Atlas: capacity plan criado. ${overloaded.length} sobrecargas detectadas.`);
				return { notePath: f.path };
			}
			return null;
		} catch (e) {
			notice.hide();
			this.plugin.presentError(e);
			return null;
		}
	}
}
