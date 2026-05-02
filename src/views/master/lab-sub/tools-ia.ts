import { Notice, TFile } from "obsidian";
import type AtlasPlugin from "../../../../main";
import { ReasoningModal } from "../../reasoning-modal";
import { ContextCollapseTool } from "../../../innovations/context-collapse";
import {
	ManagerReadmeTool,
	PreMortemModal,
	DecisionDiaryTool,
} from "../../../innovations/manager-tools";
import { YearInReviewTool } from "../../../tools/year-in-review";
import { PodcastGeneratorTool } from "../../../innovations/podcast-generator";
import {
	ArchitectureDiagramModal,
	AdrGeneratorModal,
	TechDebtScannerTool,
	RunbookGeneratorModal,
	PostmortemBuilderModal,
	FlowChartTool,
	ApiDocExtractorTool,
	CapacityPlannerTool,
} from "../../../innovations/ti-tools";
import { mergeProfiles } from "../../../profiles/registry";

interface ToolDef {
	id: string;
	icon: string;
	title: string;
	tagline: string;
	description: string;
	category: "thinking" | "writing" | "synthesis" | "ti-architecture" | "ti-docs" | "ti-analysis";
	run: () => Promise<void> | void;
}

/**
 * Tools IA sub-view — cards click-to-run para todas ferramentas inteligentes.
 *
 * Substitui o "preciso lembrar do Cmd+P" — cada ferramenta vira card visual.
 */
const ALL_TOOLS_DEFS = (plugin: AtlasPlugin): ToolDef[] => [
	// ─── THINKING ───
	{
		id: "reasoning",
		icon: "🧠",
		title: "Pense comigo (CoT)",
		tagline: "Raciocínio passo-a-passo visível",
		description: "Decisões complexas, RCA, planning. Modelo mostra a cadeia de pensamento em tempo real.",
		category: "thinking",
		run: () => new ReasoningModal(plugin.app, plugin).open(),
	},
	{
		id: "pre-mortem",
		icon: "⚰️",
		title: "Pre-mortem Oracle",
		tagline: "Imagine que o projeto falhou. Por quê?",
		description: "IA gera 8-10 modos de falha plausíveis baseados no histórico do KG + descrição do projeto.",
		category: "thinking",
		run: () => new PreMortemModal(plugin.app, plugin).open(),
	},

	// ─── SYNTHESIS ───
	{
		id: "context-collapse",
		icon: "🔮",
		title: "Context Collapse",
		tagline: "Insight unificador sobre uma pessoa",
		description: "Pessoa com 50+ menções no KG → insight em 3 frases que captura o padrão central.",
		category: "synthesis",
		run: () => void runContextCollapse(plugin),
	},
	{
		id: "decision-diary",
		icon: "📔",
		title: "Decision Diary",
		tagline: "Decisões do mês compiladas",
		description: "Atlas escaneia notas do mês, extrai decisões tomadas + outcomes, gera diário.",
		category: "synthesis",
		run: () => void runDecisionDiary(plugin),
	},
	{
		id: "year-in-review",
		icon: "🎉",
		title: "Year in Review",
		tagline: "Atlas Wrapped do seu ano",
		description: "Compila pessoas, projetos, temas, conquistas em formato Spotify Wrapped.",
		category: "synthesis",
		run: () => void runYearInReview(plugin),
	},

	// ─── WRITING ───
	{
		id: "manager-readme",
		icon: "📋",
		title: "Manager README",
		tagline: "Auto-gera o seu Manager README",
		description: "A partir do histórico de 1:1s + commitments + estilo, Atlas escreve draft do README.",
		category: "writing",
		run: () => void runManagerReadme(plugin),
	},
	{
		id: "podcast",
		icon: "🎙️",
		title: "Podcast NPR-style",
		tagline: "Áudio do weekly ativo",
		description: "Pega o weekly report aberto, gera script no estilo NPR + áudio TTS Piper.",
		category: "writing",
		run: () => void runPodcast(plugin),
	},

	// ─── TI-ARCHITECTURE (v0.7 Sprint 18) ───
	{
		id: "architecture-diagram",
		icon: "🏗️",
		title: "Architecture Diagram (C4)",
		tagline: "Mermaid C4 a partir de descrição livre",
		description: "Descreva o sistema → Atlas gera diagrama Mermaid C4 (Context/Container/Component).",
		category: "ti-architecture",
		run: () => new ArchitectureDiagramModal(plugin.app, plugin).open(),
	},
	{
		id: "flow-chart-gen",
		icon: "📊",
		title: "Flow Chart Generator",
		tagline: "Mermaid flowchart de processo",
		description: "Descreva o fluxo → Atlas gera flowchart Mermaid (Process / Decision / Start / End).",
		category: "ti-architecture",
		run: () => void runFlowChart(plugin),
	},

	// ─── TI-DOCS ───
	{
		id: "adr-generator",
		icon: "📜",
		title: "ADR Generator",
		tagline: "Architecture Decision Record completo",
		description: "Atlas preenche ADR (Status/Context/Decision/Consequences/Alternatives) formato Nygard.",
		category: "ti-docs",
		run: () => new AdrGeneratorModal(plugin.app, plugin).open(),
	},
	{
		id: "runbook-generator",
		icon: "🚑",
		title: "Runbook Generator",
		tagline: "Runbook SRE completo",
		description: "Cenário → Detection / Triage / Mitigation / Rollback / Prevention.",
		category: "ti-docs",
		run: () => new RunbookGeneratorModal(plugin.app, plugin).open(),
	},
	{
		id: "postmortem-builder",
		icon: "🚨",
		title: "Postmortem Builder",
		tagline: "Blameless postmortem com RCA 5-whys",
		description: "Sumário + timeline → Postmortem completo (Timeline/RCA/Impact/Action items/Learnings).",
		category: "ti-docs",
		run: () => new PostmortemBuilderModal(plugin.app, plugin).open(),
	},
	{
		id: "api-doc-extractor",
		icon: "📘",
		title: "API Doc Extractor",
		tagline: "Extrai docs API de código TS/JS/Python",
		description: "Cole código → Atlas gera Markdown com endpoints/params/examples.",
		category: "ti-docs",
		run: () => void runApiDocExtractor(plugin),
	},

	// ─── TI-ANALYSIS ───
	{
		id: "tech-debt-scanner",
		icon: "💸",
		title: "Tech Debt Scanner",
		tagline: "Escaneia vault e prioriza débitos",
		description: "Detecta TODO/FIXME/HACK + tags #debt → categoriza severidade + esforço.",
		category: "ti-analysis",
		run: () => void runTechDebtScanner(plugin),
	},
	{
		id: "capacity-planner",
		icon: "👥",
		title: "Capacity Planner",
		tagline: "Análise de carga do time",
		description: "Detecta sobrecargas + subutilização baseado em action items abertos no KG.",
		category: "ti-analysis",
		run: () => void runCapacityPlanner(plugin),
	},
];

const CATEGORY_LABELS: Record<ToolDef["category"], { label: string; emoji: string }> = {
	thinking: { label: "Reasoning", emoji: "🧠" },
	synthesis: { label: "Síntese", emoji: "🔮" },
	writing: { label: "Escrita", emoji: "✍️" },
	"ti-architecture": { label: "TI · Arquitetura", emoji: "🏗️" },
	"ti-docs": { label: "TI · Documentação", emoji: "📚" },
	"ti-analysis": { label: "TI · Análise", emoji: "🔍" },
};

const CATEGORY_ORDER: ToolDef["category"][] = [
	"thinking",
	"ti-architecture",
	"ti-docs",
	"ti-analysis",
	"synthesis",
	"writing",
];

/**
 * Tools IA sub-view — cards click-to-run para todas ferramentas inteligentes.
 *
 * Filtra por perfil ativo (settings.profile.ids). Botão "Ver todos" override.
 */
export function renderLabToolsIa(container: HTMLElement, plugin: AtlasPlugin): void {
	container.empty();

	const intro = container.createDiv();
	intro.style.fontSize = "11px";
	intro.style.opacity = "0.7";
	intro.style.marginBottom = "12px";

	// Profile-aware filter
	const profileIds = plugin.settings.profile?.ids ?? [];
	const showAll = plugin.settings.profile?.showAllToolsOverride ?? false;
	let activeToolIds: string[] = [];

	if (profileIds.length > 0 && !showAll) {
		try {
			const merged = mergeProfiles(profileIds);
			activeToolIds = merged.tools;
		} catch {
			activeToolIds = [];
		}
	}

	intro.setText(
		profileIds.length > 0 && !showAll
			? `Ferramentas IA filtradas pelos seus perfis (${profileIds.length}). ${activeToolIds.length} disponíveis.`
			: "Ferramentas IA do Atlas. KG + LLM local pra artefatos específicos."
	);

	// Toggle "show all" if profile filtering active
	if (profileIds.length > 0) {
		const toggle = container.createDiv();
		toggle.style.marginBottom = "10px";
		const toggleBtn = toggle.createEl("button", {
			text: showAll ? "🎯 Filtrar por perfil" : "📂 Mostrar todas",
		});
		toggleBtn.style.fontSize = "11px";
		toggleBtn.style.padding = "4px 10px";
		toggleBtn.addEventListener("click", async () => {
			if (!plugin.settings.profile) plugin.settings.profile = { ids: [] };
			plugin.settings.profile.showAllToolsOverride = !showAll;
			await plugin.saveSettings();
			renderLabToolsIa(container, plugin);
		});
	}

	// Filter tools
	const allTools = ALL_TOOLS_DEFS(plugin);
	const tools =
		profileIds.length > 0 && !showAll
			? allTools.filter((t) => activeToolIds.includes(t.id))
			: allTools;

	if (tools.length === 0) {
		const empty = container.createDiv();
		empty.style.padding = "32px";
		empty.style.textAlign = "center";
		empty.style.opacity = "0.6";
		empty.setText("Nenhuma ferramenta para o perfil atual. Click 'Mostrar todas' acima.");
		return;
	}

	// Group by category
	const byCategory = new Map<ToolDef["category"], ToolDef[]>();
	for (const t of tools) {
		const arr = byCategory.get(t.category) ?? [];
		arr.push(t);
		byCategory.set(t.category, arr);
	}

	for (const cat of CATEGORY_ORDER) {
		const list = byCategory.get(cat);
		if (!list || list.length === 0) continue;

		const meta = CATEGORY_LABELS[cat];
		const catHead = container.createEl("div", { text: `${meta.emoji} ${meta.label}` });
		catHead.style.fontSize = "10px";
		catHead.style.fontWeight = "bold";
		catHead.style.opacity = "0.7";
		catHead.style.marginTop = "12px";
		catHead.style.marginBottom = "6px";
		catHead.style.letterSpacing = "0.5px";

		const grid = container.createDiv();
		grid.style.display = "grid";
		grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(240px, 1fr))";
		grid.style.gap = "10px";

		for (const t of list) {
			renderToolCard(grid, t);
		}
	}
}

function renderToolCard(parent: HTMLElement, t: ToolDef): void {
	const card = parent.createDiv();
	card.style.background = "var(--background-secondary)";
	card.style.border = "1px solid var(--background-modifier-border)";
	card.style.borderRadius = "8px";
	card.style.padding = "12px";
	card.style.display = "flex";
	card.style.flexDirection = "column";
	card.style.gap = "6px";
	card.style.transition = "transform 120ms, border-color 120ms";

	card.addEventListener("mouseenter", () => {
		card.style.borderColor = "var(--interactive-accent)";
		card.style.transform = "translateY(-1px)";
	});
	card.addEventListener("mouseleave", () => {
		card.style.borderColor = "var(--background-modifier-border)";
		card.style.transform = "none";
	});

	const top = card.createDiv();
	top.style.display = "flex";
	top.style.alignItems = "center";
	top.style.gap = "10px";

	const iconEl = top.createEl("span", { text: t.icon });
	iconEl.style.fontSize = "24px";
	iconEl.style.lineHeight = "1";

	const wrap = top.createDiv();
	wrap.style.flexGrow = "1";
	const titleEl = wrap.createEl("div", { text: t.title });
	titleEl.style.fontSize = "13px";
	titleEl.style.fontWeight = "bold";
	const tagEl = wrap.createEl("div", { text: t.tagline });
	tagEl.style.fontSize = "11px";
	tagEl.style.opacity = "0.65";
	tagEl.style.marginTop = "1px";

	const cat = card.createEl("span", { text: t.category });
	cat.style.fontSize = "9px";
	cat.style.padding = "2px 6px";
	cat.style.borderRadius = "3px";
	cat.style.alignSelf = "flex-start";
	cat.style.background = categoryColor(t.category);
	cat.style.color = "white";
	cat.style.fontWeight = "bold";
	cat.style.letterSpacing = "0.5px";
	cat.style.textTransform = "uppercase";

	const desc = card.createEl("div", { text: t.description });
	desc.style.fontSize = "11px";
	desc.style.opacity = "0.75";
	desc.style.lineHeight = "1.4";
	desc.style.minHeight = "44px";

	const runBtn = card.createEl("button", { text: "▶️ Executar" });
	runBtn.style.fontSize = "11px";
	runBtn.style.padding = "6px";
	runBtn.style.marginTop = "auto";
	runBtn.addClass("mod-cta");
	runBtn.addEventListener("click", () => void t.run());
}

function categoryColor(cat: ToolDef["category"]): string {
	switch (cat) {
		case "thinking":
			return "var(--color-purple)";
		case "writing":
			return "var(--color-blue)";
		case "synthesis":
			return "var(--color-green)";
		case "ti-architecture":
			return "var(--color-cyan)";
		case "ti-docs":
			return "var(--color-orange)";
		case "ti-analysis":
			return "var(--color-red)";
	}
}

// ──────────────────────────────────────────────────────────────────
// TI Tools runners (Sprint 18)

async function runTechDebtScanner(plugin: AtlasPlugin): Promise<void> {
	const tool = new TechDebtScannerTool(plugin.app, plugin);
	const r = await tool.run();
	if (r && r.notePath) {
		const f = plugin.app.vault.getAbstractFileByPath(r.notePath);
		if (f instanceof TFile) await plugin.app.workspace.getLeaf().openFile(f);
	}
}

async function runFlowChart(plugin: AtlasPlugin): Promise<void> {
	const desc = await promptText(plugin, "Descreva o fluxo:");
	if (!desc) return;
	const tool = new FlowChartTool(plugin.app, plugin);
	const r = await tool.run(desc);
	if (r) {
		const f = plugin.app.vault.getAbstractFileByPath(r.notePath);
		if (f instanceof TFile) await plugin.app.workspace.getLeaf().openFile(f);
	}
}

async function runApiDocExtractor(plugin: AtlasPlugin): Promise<void> {
	// Usa nota ativa se houver código, senão pede paste
	const file = plugin.app.workspace.getActiveFile();
	let code = "";
	let lang: string | undefined;
	if (file instanceof TFile) {
		try {
			code = await plugin.app.vault.read(file);
			const ext = file.extension;
			if (ext) lang = ext;
		} catch {
			// fallback prompt
		}
	}
	if (!code.trim()) {
		const pasted = await promptText(plugin, "Cole código (TS/JS/Python/Go/Java):");
		if (!pasted) return;
		code = pasted;
	}
	const tool = new ApiDocExtractorTool(plugin.app, plugin);
	const r = await tool.run(code, lang);
	if (r) {
		const f = plugin.app.vault.getAbstractFileByPath(r.notePath);
		if (f instanceof TFile) await plugin.app.workspace.getLeaf().openFile(f);
	}
}

async function runCapacityPlanner(plugin: AtlasPlugin): Promise<void> {
	const tool = new CapacityPlannerTool(plugin.app, plugin);
	const r = await tool.run();
	if (r) {
		const f = plugin.app.vault.getAbstractFileByPath(r.notePath);
		if (f instanceof TFile) await plugin.app.workspace.getLeaf().openFile(f);
	}
}

async function promptText(plugin: AtlasPlugin, label: string): Promise<string | null> {
	const { Modal: M, Setting: S } = await import("obsidian");
	return new Promise((resolve) => {
		class P extends M {
			value = "";
			onOpen(): void {
				const { contentEl } = this;
				contentEl.createEl("h4", { text: label });
				const ta = contentEl.createEl("textarea");
				ta.style.width = "100%";
				ta.style.minHeight = "180px";
				ta.style.padding = "8px";
				ta.addEventListener("input", () => (this.value = ta.value));
				new S(contentEl)
					.addButton((b) =>
						b.setButtonText("Cancelar").onClick(() => {
							resolve(null);
							this.close();
						})
					)
					.addButton((b) =>
						b
							.setButtonText("OK")
							.setCta()
							.onClick(() => {
								resolve(this.value || null);
								this.close();
							})
					);
			}
			onClose(): void {
				this.contentEl.empty();
			}
		}
		new P(plugin.app).open();
	});
}

async function runContextCollapse(plugin: AtlasPlugin): Promise<void> {
	const people = plugin.kg.listPeople();
	if (people.length === 0) {
		new Notice("Atlas: KG vazio. Indexe o vault primeiro.");
		return;
	}
	const person = await pickFromList(
		plugin,
		"Pessoa para Context Collapse:",
		people.map((p) => p.name)
	);
	if (!person) return;
	const tool = new ContextCollapseTool(plugin.app, plugin);
	const result = await tool.run({ personName: person });
	if (result) {
		const f = plugin.app.vault.getAbstractFileByPath(result.notePath);
		if (f && "stat" in f) {
			await plugin.app.workspace.getLeaf().openFile(f as never);
		}
		new Notice("Atlas: Context Collapse pronto.");
	}
}

async function runDecisionDiary(plugin: AtlasPlugin): Promise<void> {
	const now = new Date();
	const tool = new DecisionDiaryTool(plugin.app, plugin);
	const path = await tool.generateForMonth(now.getFullYear(), now.getMonth() + 1);
	const f = plugin.app.vault.getAbstractFileByPath(path);
	if (f && "stat" in f) {
		await plugin.app.workspace.getLeaf().openFile(f as never);
	}
	new Notice("Atlas: Decision Diary gerado.");
}

async function runManagerReadme(plugin: AtlasPlugin): Promise<void> {
	const tool = new ManagerReadmeTool(plugin.app, plugin);
	const r = await tool.generate();
	if (r) {
		const f = plugin.app.vault.getAbstractFileByPath(r.notePath);
		if (f && "stat" in f) {
			await plugin.app.workspace.getLeaf().openFile(f as never);
		}
		new Notice("Atlas: Manager README gerado. Revise antes de compartilhar.");
	}
}

async function runYearInReview(plugin: AtlasPlugin): Promise<void> {
	const notice = new Notice("Atlas: gerando Year in Review...", 0);
	try {
		const tool = new YearInReviewTool(plugin.app, plugin);
		const r = await tool.generate();
		notice.hide();
		const f = plugin.app.vault.getAbstractFileByPath(r.notePath);
		if (f && "stat" in f) {
			await plugin.app.workspace.getLeaf().openFile(f as never);
		}
		new Notice("Atlas: Year in Review pronto!");
	} catch (e) {
		notice.hide();
		new Notice(`Atlas: erro — ${String(e)}`, 8000);
	}
}

async function runPodcast(plugin: AtlasPlugin): Promise<void> {
	const file = plugin.app.workspace.getActiveFile();
	if (!file) {
		new Notice("Atlas: abra um weekly report primeiro.");
		return;
	}
	const tool = new PodcastGeneratorTool(plugin.app, plugin);
	const r = await tool.generateFromWeekly(file.path);
	if (r) {
		const f = plugin.app.vault.getAbstractFileByPath(r.scriptPath);
		if (f && "stat" in f) {
			await plugin.app.workspace.getLeaf().openFile(f as never);
		}
	}
}

async function pickFromList(
	plugin: AtlasPlugin,
	title: string,
	items: string[]
): Promise<string | null> {
	const { Modal: M, Setting: S } = await import("obsidian");
	return new Promise((resolve) => {
		class Picker extends M {
			selected: string | null = null;
			onOpen(): void {
				const { contentEl } = this;
				contentEl.empty();
				contentEl.createEl("h3", { text: title });
				const select = contentEl.createEl("select") as HTMLSelectElement;
				select.style.width = "100%";
				select.style.padding = "8px";
				select.style.fontSize = "13px";
				const placeholder = select.createEl("option", { text: "— escolha —", value: "" });
				placeholder.disabled = true;
				placeholder.selected = true;
				for (const it of items) {
					select.createEl("option", { text: it, value: it });
				}
				new S(contentEl)
					.addButton((b) =>
						b.setButtonText("Cancelar").onClick(() => {
							resolve(null);
							this.close();
						})
					)
					.addButton((b) =>
						b
							.setButtonText("OK")
							.setCta()
							.onClick(() => {
								this.selected = select.value || null;
								resolve(this.selected);
								this.close();
							})
					);
			}
			onClose(): void {
				this.contentEl.empty();
			}
		}
		new Picker(plugin.app).open();
	});
}
