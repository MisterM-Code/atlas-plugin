import { App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, MarkdownView, Notice, TFile } from "obsidian";
import type AtlasPlugin from "../../main";
import { openOrCreateDailyLog } from "../commands/daily-log";
import { generateFlashcardsFromActiveNote, SocraticModal } from "../commands/study";
import { Prepare1on1Modal } from "../commands/prepare-1on1";
import { SummarizePersonModal } from "../commands/summarize-person";
import { generateWeeklyReportCommand, sendCurrentWeeklyCommand } from "../commands/weekly-report";

export interface SlashCommand {
	id: string;
	label: string;
	description: string;
	icon: string;
	category: "atlas" | "study" | "ai" | "structure" | "view";
	run?: (plugin: AtlasPlugin, editor: Editor) => void | Promise<void>;
	insertSnippet?: (now: Date) => string; // alternative: insert text directly
}

const COMMANDS: SlashCommand[] = [
	// ─── Atlas core ───
	{
		id: "daily",
		label: "/daily",
		description: "Criar/abrir daily log de hoje",
		icon: "📓",
		category: "atlas",
		run: (p) => openOrCreateDailyLog(p),
	},
	{
		id: "1on1",
		label: "/1on1",
		description: "Inserir estrutura GROW de 1:1",
		icon: "🤝",
		category: "structure",
		insertSnippet: () => `## 🎯 Goal\n- \n\n## 🔍 Reality\n- \n\n## 💡 Options\n- \n\n## 🏃 Will\n- \n\n## ✅ Action Items\n- [ ] \n\n## 🏷️ Themes\n#theme/\n`,
	},
	{
		id: "prepare-1on1",
		label: "/prepare",
		description: "Brief automático com últimas sessões + commitments",
		icon: "🤖",
		category: "atlas",
		run: (p) => new Prepare1on1Modal(p.app, p).open(),
	},
	{
		id: "summarize-person",
		label: "/summarize-person",
		description: "Gerar resumo executivo de uma pessoa",
		icon: "📝",
		category: "atlas",
		run: (p) => new SummarizePersonModal(p.app, p).open(),
	},
	{
		id: "weekly",
		label: "/weekly",
		description: "Gerar weekly report agora",
		icon: "📊",
		category: "atlas",
		run: (p) => generateWeeklyReportCommand(p),
	},
	{
		id: "send-weekly",
		label: "/send-weekly",
		description: "Enviar weekly report da nota ativa por email",
		icon: "📧",
		category: "atlas",
		run: (p) => sendCurrentWeeklyCommand(p),
	},

	// ─── Study ───
	{
		id: "flashcard",
		label: "/flashcard",
		description: "Inserir bloco de flashcard Q::A",
		icon: "🃏",
		category: "study",
		insertSnippet: () => `#flashcard\nQ:: \nA:: \n`,
	},
	{
		id: "gen-flashcards",
		label: "/gen-flashcards",
		description: "Atlas gera flashcards desta nota via LLM",
		icon: "🤖",
		category: "study",
		run: (p) => generateFlashcardsFromActiveNote(p),
	},
	{
		id: "feynman",
		label: "/feynman",
		description: "Feynman check: perguntas socráticas para esta explicação",
		icon: "🎓",
		category: "study",
		run: (p) => new SocraticModal(p.app, p).open(),
	},

	// ─── Structure templates ───
	{
		id: "decision",
		label: "/decision",
		description: "Matriz de decisão Eisenhower",
		icon: "⚖️",
		category: "structure",
		insertSnippet: () => `## ⚖️ Decisão\n\n**Contexto:**\n- \n\n**Opções consideradas:**\n| Opção | Prós | Contras | Custo |\n|---|---|---|---|\n| A |  |  |  |\n| B |  |  |  |\n| C (status quo) |  |  |  |\n\n**Decisão:** \n\n**Rationale:**\n- \n\n**Reavaliar em:** (@_)\n`,
	},
	{
		id: "5whys",
		label: "/5-whys",
		description: "5 Whys para Root Cause Analysis",
		icon: "🔎",
		category: "structure",
		insertSnippet: () => `## 🔎 5 Whys\n\n**Problema observado:**\n- \n\n1. **Por quê?** \n2. **Por quê?** \n3. **Por quê?** \n4. **Por quê?** \n5. **Por quê?** \n\n**Causa raiz:**\n- \n\n**Action items:**\n- [ ] \n`,
	},
	{
		id: "swot",
		label: "/swot",
		description: "Matriz SWOT (Strengths/Weaknesses/Opportunities/Threats)",
		icon: "🧭",
		category: "structure",
		insertSnippet: () => `## 🧭 SWOT\n\n| ✅ Strengths | 🔻 Weaknesses |\n|---|---|\n|  |  |\n|  |  |\n\n| 🌱 Opportunities | ⚠️ Threats |\n|---|---|\n|  |  |\n|  |  |\n`,
	},
	{
		id: "raid",
		label: "/raid",
		description: "Entrada de RAID log (Risk/Issue/Decision)",
		icon: "🛡️",
		category: "structure",
		insertSnippet: () => `## 🛡️ RAID Entry\n\n**Type:** Risk / Issue / Decision\n**Probability (1-5):** \n**Impact (1-5):** \n**Owner:** \n**Status:** open\n\n**Descrição:**\n- \n\n**Mitigação:**\n- \n\n**Próximo review:** (@_)\n`,
	},
	{
		id: "okr",
		label: "/okr",
		description: "Estrutura de OKR (Objective + Key Results)",
		icon: "🎯",
		category: "structure",
		insertSnippet: () => `## 🎯 Objective\n> \n\n### Key Results\n- **KR1:** _métrica_ — Baseline: _ → Target: _ — Confidence: __% — Score: 0/1.0\n- **KR2:** _métrica_ — Baseline: _ → Target: _ — Confidence: __% — Score: 0/1.0\n- **KR3:** _métrica_ — Baseline: _ → Target: _ — Confidence: __% — Score: 0/1.0\n`,
	},
	{
		id: "premortem",
		label: "/premortem",
		description: "Pre-mortem: imagine que o projeto falhou — por quê?",
		icon: "🪦",
		category: "structure",
		insertSnippet: () => `## 🪦 Pre-Mortem\n\n> Imagine que estamos 6 meses no futuro e o projeto **falhou completamente**. Liste 5-10 razões.\n\n**Razões da falha:**\n1. \n2. \n3. \n4. \n5. \n\n**Riscos detectados pra mitigar AGORA:**\n- \n`,
	},

	// ─── AI inline ───
	{
		id: "ai-rewrite",
		label: "/rewrite",
		description: "Reescrever bloco selecionado (mais executivo)",
		icon: "✏️",
		category: "ai",
		run: (p, editor) => runInlineAi(p, editor, "rewrite"),
	},
	{
		id: "ai-summarize",
		label: "/summarize",
		description: "Resumir bloco/seleção em 3 bullets",
		icon: "📝",
		category: "ai",
		run: (p, editor) => runInlineAi(p, editor, "summarize"),
	},
	{
		id: "ai-explain",
		label: "/explain",
		description: "Explicar como se eu fosse iniciante",
		icon: "💡",
		category: "ai",
		run: (p, editor) => runInlineAi(p, editor, "explain"),
	},
	{
		id: "ai-translate-en",
		label: "/translate-en",
		description: "Traduzir seleção para inglês",
		icon: "🌐",
		category: "ai",
		run: (p, editor) => runInlineAi(p, editor, "translate-en"),
	},

	// ─── Quick utilities ───
	{
		id: "today-date",
		label: "/today",
		description: "Inserir data de hoje (YYYY-MM-DD)",
		icon: "📅",
		category: "structure",
		insertSnippet: (now) => now.toISOString().split("T")[0],
	},
	{
		id: "now-time",
		label: "/now",
		description: "Inserir data + hora atuais",
		icon: "🕐",
		category: "structure",
		insertSnippet: (now) => {
			const d = now.toISOString().split("T")[0];
			const t = now.toTimeString().split(" ")[0].substring(0, 5);
			return `${d} ${t}`;
		},
	},
	{
		id: "reminder",
		label: "/reminder",
		description: "Inserir reminder com data parseada (próximo `(@_)`)",
		icon: "⏰",
		category: "structure",
		insertSnippet: (now) => {
			const tomorrow = new Date(now.getTime() + 86_400_000);
			const dt = tomorrow.toISOString().split("T")[0];
			return `(@${dt} 09:00)`;
		},
	},
];

async function runInlineAi(plugin: AtlasPlugin, editor: Editor, kind: "rewrite" | "summarize" | "explain" | "translate-en"): Promise<void> {
	const selection = editor.getSelection();
	const text = selection || pickCurrentBlock(editor);
	if (!text || !text.trim()) {
		new Notice("Atlas: selecione texto ou posicione cursor num parágrafo.");
		return;
	}

	const ok = await plugin.ollama.ping();
	if (!ok) {
		new Notice("Atlas: Ollama offline.");
		return;
	}

	const prompts: Record<typeof kind, string> = {
		rewrite: `Reescreva o texto abaixo de forma mais clara e executiva, em PT-BR. Mantenha o sentido original. Sem invenções.\n\n${text}\n\nReescrita:`,
		summarize: `Resuma o texto abaixo em 3 bullets curtos, em PT-BR, mantendo as informações essenciais.\n\n${text}\n\nResumo:`,
		explain: `Explique o texto abaixo como se eu fosse iniciante no assunto, em PT-BR. Use analogias se ajudar.\n\n${text}\n\nExplicação:`,
		"translate-en": `Translate the following Brazilian Portuguese text to English. Keep the same meaning and tone.\n\n${text}\n\nEnglish translation:`,
	};

	const notice = new Notice(`Atlas: ${kind}...`, 0);
	try {
		// v0.22 Sprint H: wire via LLMService (cloud rewrites > local 7B)
		const temp = kind === "translate-en" ? 0.2 : 0.4;
		const maxOut = Math.max(text.length / 2, 400);
		const out = plugin.llm
			? await plugin.llm.generate(prompts[kind], {
					feature: `editor.slash-suggest.${kind}`,
					taskKind: "chat",
					temperature: temp,
					maxTokens: maxOut,
			  })
			: await plugin.ollama.generate(prompts[kind], {
					model: plugin.settings.ollama.generationModel,
					temperature: temp,
					max_tokens: maxOut,
			  });
		notice.hide();
		const cleaned = out.trim();
		if (selection) {
			editor.replaceSelection(cleaned);
		} else {
			// Append below cursor
			const cur = editor.getCursor();
			editor.replaceRange(`\n\n${cleaned}\n`, cur);
		}
		new Notice(`Atlas: ${kind} aplicado.`);
	} catch (e) {
		notice.hide();
		new Notice(`Atlas: erro — ${String(e)}`, 8000);
	}
}

function pickCurrentBlock(editor: Editor): string {
	const cur = editor.getCursor();
	const lineCount = editor.lineCount();

	// Find start of paragraph (line above empty)
	let start = cur.line;
	while (start > 0 && editor.getLine(start - 1).trim() !== "") start--;

	// Find end of paragraph
	let end = cur.line;
	while (end < lineCount - 1 && editor.getLine(end + 1).trim() !== "") end++;

	const lines: string[] = [];
	for (let i = start; i <= end; i++) lines.push(editor.getLine(i));
	return lines.join("\n");
}

export class SlashCommandSuggest extends EditorSuggest<SlashCommand> {
	constructor(app: App, private plugin: AtlasPlugin) {
		super(app);
	}

	onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
		const line = editor.getLine(cursor.line);
		const prefix = line.substring(0, cursor.ch);

		// Match /word at start of line OR after whitespace
		const m = prefix.match(/(?:^|\s)(\/[a-z][a-z0-9-]*)$/i);
		if (!m) return null;

		const trigger = m[1];
		const startCh = cursor.ch - trigger.length;

		return {
			start: { line: cursor.line, ch: startCh },
			end: cursor,
			query: trigger.substring(1).toLowerCase(),
		};
	}

	getSuggestions(context: EditorSuggestContext): SlashCommand[] {
		const q = context.query.toLowerCase();
		if (!q) return COMMANDS.slice(0, 12);

		// Score by prefix match > substring > category
		const scored = COMMANDS.map((cmd) => {
			const id = cmd.id.toLowerCase();
			const label = cmd.label.toLowerCase().substring(1); // strip /
			let score = 0;
			if (id.startsWith(q) || label.startsWith(q)) score += 100;
			else if (id.includes(q) || label.includes(q)) score += 50;
			if (cmd.description.toLowerCase().includes(q)) score += 10;
			return { cmd, score };
		})
			.filter((s) => s.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, 10);
		return scored.map((s) => s.cmd);
	}

	renderSuggestion(cmd: SlashCommand, el: HTMLElement): void {
		el.addClass("atlas-slash-suggest");
		el.style.display = "flex";
		el.style.alignItems = "center";
		el.style.gap = "10px";
		el.style.padding = "6px 4px";

		const icon = el.createEl("span", { text: cmd.icon });
		icon.style.fontSize = "18px";
		icon.style.width = "24px";
		icon.style.textAlign = "center";

		const textWrap = el.createDiv();
		textWrap.style.flexGrow = "1";

		const label = textWrap.createEl("div", { text: cmd.label });
		label.style.fontWeight = "bold";
		label.style.fontSize = "13px";

		const desc = textWrap.createEl("div", { text: cmd.description });
		desc.style.fontSize = "11px";
		desc.style.opacity = "0.7";

		const cat = el.createEl("span", { text: cmd.category });
		cat.style.fontSize = "10px";
		cat.style.opacity = "0.5";
		cat.style.padding = "2px 6px";
		cat.style.background = "var(--background-modifier-hover)";
		cat.style.borderRadius = "4px";
	}

	selectSuggestion(cmd: SlashCommand, _evt: MouseEvent | KeyboardEvent): void {
		const ctx = this.context;
		if (!ctx) return;

		const editor = ctx.editor;

		// Replace `/query` text first
		editor.replaceRange("", ctx.start, ctx.end);

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const activeEditor = view?.editor ?? editor;

		if (cmd.insertSnippet) {
			const snippet = cmd.insertSnippet(new Date());
			activeEditor.replaceRange(snippet, ctx.start);
			// Move cursor to end of inserted snippet
			const lines = snippet.split("\n");
			const finalLine = ctx.start.line + lines.length - 1;
			const finalCh = lines.length === 1 ? ctx.start.ch + lines[0].length : lines[lines.length - 1].length;
			activeEditor.setCursor({ line: finalLine, ch: finalCh });
		} else if (cmd.run) {
			void cmd.run(this.plugin, activeEditor);
		}
	}
}
