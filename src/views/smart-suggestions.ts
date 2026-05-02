import { ItemView, WorkspaceLeaf, MarkdownView, Notice, TFile, Editor } from "obsidian";
import type AtlasPlugin from "../../main";

export const ATLAS_SUGGESTIONS_VIEW = "atlas-smart-suggestions";

interface Suggestion {
	kind: "person" | "theme" | "project";
	label: string;
	subtitle: string;
	insertText: string;
	score: number;
}

/**
 * Sidebar que mostra entidades do KG relevantes ao bloco/parágrafo onde o cursor está.
 * Atualiza com debounce a cada 1.2s. Click insere [[Nome]] ou #theme/x na nota ativa.
 */
export class SmartSuggestionsView extends ItemView {
	private listEl!: HTMLDivElement;
	private statusEl!: HTMLSpanElement;
	private currentText = "";
	private debouncer: ReturnType<typeof setTimeout> | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: AtlasPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return ATLAS_SUGGESTIONS_VIEW;
	}

	getDisplayText(): string {
		return "Atlas Suggestions";
	}

	getIcon(): string {
		return "link";
	}

	async onOpen(): Promise<void> {
		const c = this.containerEl.children[1];
		c.empty();
		(c as HTMLElement).style.padding = "12px";

		const header = c.createEl("h3", { text: "🔗 Smart Suggestions" });
		header.style.margin = "0 0 4px 0";
		const sub = c.createEl("div", {
			text: "Atlas sugere [[pessoas]], #temas, [[projetos]] do KG relevantes ao bloco atual.",
		});
		sub.style.fontSize = "11px";
		sub.style.opacity = "0.6";
		sub.style.marginBottom = "8px";

		this.statusEl = c.createEl("span") as HTMLSpanElement;
		this.statusEl.style.fontSize = "10px";
		this.statusEl.style.opacity = "0.5";
		this.statusEl.style.marginBottom = "8px";
		this.statusEl.setText("Cursor sem contexto…");

		this.listEl = c.createDiv() as HTMLDivElement;
		this.listEl.style.maxHeight = "calc(100% - 80px)";
		this.listEl.style.overflowY = "auto";

		// Listen to editor changes
		this.registerEvent(
			this.app.workspace.on("editor-change", (editor: Editor) => {
				this.scheduleUpdate(editor);
			})
		);
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view?.editor) this.scheduleUpdate(view.editor);
			})
		);

		// Initial render
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view?.editor) this.scheduleUpdate(view.editor);
	}

	async onClose(): Promise<void> {
		if (this.debouncer !== null) clearTimeout(this.debouncer);
	}

	private scheduleUpdate(editor: Editor): void {
		if (this.debouncer !== null) clearTimeout(this.debouncer);
		this.debouncer = setTimeout(() => {
			this.debouncer = null;
			this.updateFromEditor(editor);
		}, 1200);
	}

	private updateFromEditor(editor: Editor): void {
		const cur = editor.getCursor();
		const lineCount = editor.lineCount();

		// Pick current paragraph (between empty lines)
		let start = cur.line;
		while (start > 0 && editor.getLine(start - 1).trim() !== "") start--;
		let end = cur.line;
		while (end < lineCount - 1 && editor.getLine(end + 1).trim() !== "") end++;

		const lines: string[] = [];
		for (let i = start; i <= end; i++) lines.push(editor.getLine(i));
		const blockText = lines.join("\n").trim();

		if (!blockText || blockText === this.currentText) return;
		this.currentText = blockText;

		this.statusEl.setText(`Análise: ${blockText.length} chars`);
		this.renderSuggestions(blockText, editor);
	}

	private renderSuggestions(text: string, editor: Editor): void {
		this.listEl.empty();

		const candidates = this.computeCandidates(text);
		if (candidates.length === 0) {
			const empty = this.listEl.createEl("div", {
				text: "Nada relevante no KG. Digite mais ou indexe vault.",
			});
			empty.style.fontSize = "11px";
			empty.style.opacity = "0.5";
			empty.style.padding = "8px 0";
			return;
		}

		for (const s of candidates.slice(0, 12)) {
			const card = this.listEl.createDiv();
			card.style.padding = "6px 8px";
			card.style.marginBottom = "4px";
			card.style.background = "var(--background-secondary)";
			card.style.borderRadius = "4px";
			card.style.cursor = "pointer";
			card.style.display = "flex";
			card.style.alignItems = "flex-start";
			card.style.gap = "8px";

			const icon = card.createEl("span", { text: iconFor(s.kind) });
			icon.style.fontSize = "14px";

			const wrap = card.createDiv();
			wrap.style.flexGrow = "1";
			const lbl = wrap.createEl("div", { text: s.label });
			lbl.style.fontSize = "12px";
			lbl.style.fontWeight = "bold";
			const sub = wrap.createEl("div", { text: s.subtitle });
			sub.style.fontSize = "10px";
			sub.style.opacity = "0.6";

			const insertBtn = card.createEl("button", { text: "+" });
			insertBtn.title = `Inserir ${s.insertText}`;
			insertBtn.style.fontSize = "12px";
			insertBtn.style.padding = "2px 8px";
			insertBtn.style.cursor = "pointer";
			insertBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.insertAtCursor(editor, s.insertText);
			});

			card.addEventListener("click", () => {
				this.openOrInsert(s);
			});
		}
	}

	private computeCandidates(text: string): Suggestion[] {
		const out: Suggestion[] = [];
		const tokens = tokenize(text);
		const lowerText = text.toLowerCase();

		// Already mentioned in text — skip
		const alreadyLinked = new Set<string>();
		const wikilinkRe = /\[\[([^\]|#]+)/g;
		let m: RegExpExecArray | null;
		while ((m = wikilinkRe.exec(text)) !== null) {
			alreadyLinked.add(m[1].trim().toLowerCase());
		}

		// People — match name/aliases/initials
		for (const p of this.plugin.kg.listPeople()) {
			if (alreadyLinked.has(p.name.toLowerCase())) continue;
			const nameLower = p.name.toLowerCase();
			let score = 0;

			// Direct name mention
			if (lowerText.includes(nameLower)) score += 80;
			// First-name only
			const firstName = p.name.split(/\s+/)[0]?.toLowerCase();
			if (firstName && firstName.length > 3 && lowerText.includes(firstName)) {
				score += 40;
			}
			// Alias match
			for (const a of p.aliases) {
				if (lowerText.includes(a.toLowerCase())) score += 60;
			}
			// Token overlap with role/team
			if (p.role && tokens.includes(normalizeToken(p.role))) score += 10;
			// Initials
			const initials = p.name
				.split(/\s+/)
				.map((w) => w[0]?.toLowerCase() ?? "")
				.join("");
			if (initials.length >= 2 && lowerText.includes(initials)) score += 30;

			if (score > 0) {
				out.push({
					kind: "person",
					label: p.name,
					subtitle: subtitleForPerson(p),
					insertText: `[[${p.name}]]`,
					score,
				});
			}
		}

		// Themes — name overlap
		for (const t of this.plugin.kg.data.themes) {
			if (alreadyLinked.has(t.name.toLowerCase())) continue;
			const nameTokens = t.name.split(/[-_]/).filter((s) => s.length > 2);
			let score = 0;
			for (const nt of nameTokens) {
				if (tokens.includes(normalizeToken(nt))) score += 30;
			}
			if (score > 0) {
				out.push({
					kind: "theme",
					label: `#theme/${t.name}`,
					subtitle: `${t.frequency}× · ${t.sentiment}`,
					insertText: `#theme/${t.name}`,
					score: score + Math.min(t.frequency / 5, 5),
				});
			}
		}

		// Projects
		for (const proj of this.plugin.kg.data.projects) {
			if (alreadyLinked.has(proj.name.toLowerCase())) continue;
			const lower = proj.name.toLowerCase();
			if (lowerText.includes(lower)) {
				out.push({
					kind: "project",
					label: proj.name,
					subtitle: `Project · ${proj.rag}`,
					insertText: `[[${proj.name}]]`,
					score: 50,
				});
			}
		}

		return out.sort((a, b) => b.score - a.score);
	}

	private insertAtCursor(editor: Editor, text: string): void {
		const cur = editor.getCursor();
		// Insert with leading space if not at start of line and previous char isn't whitespace
		const lineText = editor.getLine(cur.line);
		const prevChar = cur.ch > 0 ? lineText[cur.ch - 1] : "";
		const prefix = prevChar && !/\s/.test(prevChar) ? " " : "";
		const inserted = prefix + text + " ";
		editor.replaceRange(inserted, cur);
		editor.setCursor({ line: cur.line, ch: cur.ch + inserted.length });
		new Notice(`Atlas: inserido ${text}`);
	}

	private openOrInsert(s: Suggestion): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const editor = view?.editor;
		if (!editor) {
			new Notice("Atlas: abra uma nota.");
			return;
		}
		this.insertAtCursor(editor, s.insertText);
	}
}

function iconFor(kind: Suggestion["kind"]): string {
	switch (kind) {
		case "person":
			return "👤";
		case "theme":
			return "🏷️";
		case "project":
			return "🚀";
	}
}

function subtitleForPerson(p: { role?: string; type?: string }): string {
	const parts: string[] = [];
	if (p.role) parts.push(p.role);
	if (p.type && p.type !== "other") parts.push(p.type);
	return parts.join(" · ") || "Person";
}

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9\s]/g, " ")
		.split(/\s+/)
		.filter((t) => t.length > 2);
}

function normalizeToken(s: string): string {
	return s
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "");
}
