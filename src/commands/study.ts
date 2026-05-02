import { App, Modal, Notice, Setting, TFile, MarkdownView, normalizePath } from "obsidian";
import type AtlasPlugin from "../../main";
import { FlashcardGenerator } from "../study/flashcard-gen";
import { SocraticTool } from "../study/socratic";
import { Indexer } from "../retrieval/indexer";
import { flashcardsToAnkiCsv, flashcardsToObsidianSrMd } from "../study/anki-export";
import { Rating } from "../study/fsrs";
import { applyResponsiveModal } from "../ui/modal-helpers";

export async function generateFlashcardsFromActiveNote(plugin: AtlasPlugin): Promise<void> {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	const file = view?.file;
	if (!file) {
		new Notice("Atlas: abra a nota primeiro (paper, course, etc.).");
		return;
	}

	const ok = await plugin.ollama.ping();
	if (!ok) {
		new Notice("Atlas: Ollama offline.");
		return;
	}

	const notice = new Notice("Atlas: gerando flashcards...", 0);

	try {
		const indexer = new Indexer(plugin.app);
		const indexed = await indexer.indexFile(file);
		if (!indexed) {
			notice.hide();
			new Notice("Atlas: não consegui ler a nota.");
			return;
		}

		const gen = new FlashcardGenerator(plugin.ollama, plugin.settings.ollama.generationModel);
		const cards = await gen.generate({
			notePath: file.path,
			noteTitle: indexed.frontmatter.title as string | undefined,
			body: indexed.body,
			maxCards: 8,
		});

		notice.hide();

		if (cards.length === 0) {
			new Notice("Atlas: nenhum flashcard gerado. Texto pode ser muito curto.");
			return;
		}

		const tags = (indexed.frontmatter.tags as string[]) ?? ["atlas"];
		const deck = (indexed.frontmatter.type as string) ?? "default";
		const added = plugin.flashcards.addBatch(
			cards.map((c) => ({
				question: c.question,
				answer: c.answer,
				sourceNotePath: file.path,
				tags: Array.isArray(tags) ? tags : ["atlas"],
				deck,
			}))
		);
		await plugin.flashcards.save();

		await plugin.auditLog({
			action: "flashcards.generated",
			source: file.path,
			generated: cards.length,
			added,
		});

		new Notice(`Atlas: ${added} cards adicionados (${cards.length - added} duplicatas ignoradas).`, 8000);

		// Append cards section to the note for reference
		const existing = await plugin.app.vault.read(file);
		const newSection = renderCardsSection(cards);
		if (!existing.includes("<!-- atlas-cards-start -->")) {
			await plugin.app.vault.modify(file, existing.trimEnd() + "\n\n" + newSection + "\n");
		}
	} catch (e) {
		notice.hide();
		new Notice(`Atlas: erro — ${String(e)}`, 10000);
	}
}

function renderCardsSection(cards: { question: string; answer: string; difficulty: string }[]): string {
	const lines = ["<!-- atlas-cards-start -->", "## 🃏 Flashcards (Atlas-generated)", ""];
	for (const c of cards) {
		lines.push("#flashcard");
		lines.push(`Q:: ${c.question}`);
		lines.push(`A:: ${c.answer}`);
		lines.push("");
	}
	lines.push("<!-- atlas-cards-end -->");
	return lines.join("\n");
}

export class ReviewSessionModal extends Modal {
	private cards: import("../study/flashcard-store").Flashcard[] = [];
	private current = 0;
	private answerVisible = false;

	private cardEl!: HTMLDivElement;
	private answerEl!: HTMLDivElement;
	private actionsEl!: HTMLDivElement;
	private progressEl!: HTMLSpanElement;

	constructor(app: App, private plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		applyResponsiveModal(contentEl, { preferredWidth: 560 });

		this.cards = this.plugin.flashcards.dueToday();

		if (this.cards.length === 0) {
			contentEl.createEl("h3", { text: "🎉 Nenhum card para revisar agora!" });
			contentEl.createEl("p", { text: "Volte mais tarde ou gere novos a partir das suas notas." });
			new Setting(contentEl).addButton((b) =>
				b.setButtonText("Fechar").setCta().onClick(() => this.close())
			);
			return;
		}

		const header = contentEl.createDiv();
		header.style.display = "flex";
		header.style.justifyContent = "space-between";
		header.style.alignItems = "center";
		header.style.marginBottom = "16px";
		header.createEl("h3", { text: "🃏 Spaced Repetition" });
		this.progressEl = header.createEl("span") as HTMLSpanElement;
		this.progressEl.style.fontSize = "12px";
		this.progressEl.style.opacity = "0.7";

		this.cardEl = contentEl.createDiv();
		this.cardEl.style.padding = "20px";
		this.cardEl.style.background = "var(--background-secondary)";
		this.cardEl.style.borderRadius = "8px";
		this.cardEl.style.fontSize = "16px";
		this.cardEl.style.minHeight = "100px";

		this.answerEl = contentEl.createDiv();
		this.answerEl.style.padding = "16px";
		this.answerEl.style.marginTop = "12px";
		this.answerEl.style.background = "var(--background-secondary-alt)";
		this.answerEl.style.borderRadius = "8px";
		this.answerEl.style.fontSize = "15px";
		this.answerEl.style.display = "none";

		this.actionsEl = contentEl.createDiv();
		this.actionsEl.style.marginTop = "16px";
		this.actionsEl.style.display = "flex";
		this.actionsEl.style.gap = "8px";
		this.actionsEl.style.justifyContent = "center";

		this.renderCurrent();

		// Keyboard shortcuts
		this.scope.register([], " ", () => {
			if (!this.answerVisible) this.showAnswer();
		});
		this.scope.register([], "1", () => this.answerVisible && this.rateCurrent(1));
		this.scope.register([], "2", () => this.answerVisible && this.rateCurrent(2));
		this.scope.register([], "3", () => this.answerVisible && this.rateCurrent(3));
		this.scope.register([], "4", () => this.answerVisible && this.rateCurrent(4));
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderCurrent(): void {
		if (this.current >= this.cards.length) {
			this.cardEl.empty();
			this.answerEl.style.display = "none";
			this.actionsEl.empty();
			this.cardEl.createEl("h3", { text: "✅ Sessão completa!" });
			this.cardEl.createEl("p", { text: `${this.cards.length} cards revisados.` });
			this.actionsEl.createEl("button", { text: "Fechar" }).addEventListener("click", () =>
				this.close()
			);
			return;
		}

		const card = this.cards[this.current];
		this.cardEl.empty();
		this.cardEl.createEl("strong", { text: card.question });
		this.answerEl.empty();
		this.answerEl.setText(card.answer);
		this.answerEl.style.display = "none";
		this.answerVisible = false;

		this.actionsEl.empty();
		const showBtn = this.actionsEl.createEl("button", { text: "Mostrar resposta (Espaço)" });
		showBtn.addClass("mod-cta");
		showBtn.addEventListener("click", () => this.showAnswer());

		this.progressEl.setText(`Card ${this.current + 1} / ${this.cards.length}`);
	}

	private showAnswer(): void {
		this.answerEl.style.display = "block";
		this.answerVisible = true;
		this.actionsEl.empty();

		const labels: { rating: Rating; text: string; color: string }[] = [
			{ rating: 1, text: "Errei (1)", color: "#c62828" },
			{ rating: 2, text: "Difícil (2)", color: "#f57c00" },
			{ rating: 3, text: "Bom (3)", color: "#2e7d32" },
			{ rating: 4, text: "Fácil (4)", color: "#1565c0" },
		];

		for (const l of labels) {
			const btn = this.actionsEl.createEl("button", { text: l.text });
			btn.style.background = l.color;
			btn.style.color = "white";
			btn.style.padding = "6px 12px";
			btn.addEventListener("click", () => this.rateCurrent(l.rating));
		}
	}

	private rateCurrent(rating: Rating): void {
		const card = this.cards[this.current];
		this.plugin.flashcards.review(card.id, rating);
		this.current++;
		this.renderCurrent();
	}
}

export async function exportFlashcardsAsCsv(plugin: AtlasPlugin): Promise<void> {
	const cards = plugin.flashcards.allCards();
	if (cards.length === 0) {
		new Notice("Atlas: nenhum flashcard.");
		return;
	}
	const csv = flashcardsToAnkiCsv(cards, { deckName: "Atlas" });
	const date = new Date().toISOString().split("T")[0];
	const path = normalizePath(`${plugin.settings.folders.studies}/exports/anki-${date}.tsv`);
	await ensureFolder(plugin.app, path.split("/").slice(0, -1).join("/"));
	const existing = plugin.app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) {
		await plugin.app.vault.modify(existing, csv);
	} else {
		await plugin.app.vault.create(path, csv);
	}
	new Notice(`Atlas: ${cards.length} cards exportados → ${path}`, 8000);
}

export async function exportFlashcardsAsObsidianSr(plugin: AtlasPlugin): Promise<void> {
	const cards = plugin.flashcards.allCards();
	if (cards.length === 0) {
		new Notice("Atlas: nenhum flashcard.");
		return;
	}
	const md = flashcardsToObsidianSrMd(cards);
	const date = new Date().toISOString().split("T")[0];
	const path = normalizePath(`${plugin.settings.folders.studies}/exports/sr-${date}.md`);
	await ensureFolder(plugin.app, path.split("/").slice(0, -1).join("/"));
	const existing = plugin.app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) {
		await plugin.app.vault.modify(existing, md);
	} else {
		await plugin.app.vault.create(path, md);
	}
	new Notice(`Atlas: cards exportados (formato Obsidian SR) → ${path}`, 8000);
}

async function ensureFolder(app: App, folder: string): Promise<void> {
	const parts = folder.split("/");
	let cur = "";
	for (const p of parts) {
		cur = cur ? `${cur}/${p}` : p;
		if (!app.vault.getAbstractFileByPath(cur)) {
			try {
				await app.vault.createFolder(cur);
			} catch {
				// race
			}
		}
	}
}

export class SocraticModal extends Modal {
	private explanation = "";
	private concept = "";

	constructor(app: App, private plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: "🎓 Atlas — Feynman Check" });
		contentEl.createEl("p", {
			text: "Explique um conceito como se ensinasse alguém. Atlas vai gerar perguntas socráticas para expor lacunas.",
		});

		// Try pre-fill from active note
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		const file = view?.file;
		if (file) {
			this.concept = file.basename;
		}

		new Setting(contentEl)
			.setName("Conceito")
			.addText((t) => {
				t.setValue(this.concept);
				t.onChange((v) => (this.concept = v));
			});

		const explainArea = contentEl.createEl("textarea", {
			attr: {
				placeholder: "Cole/digite sua explicação aqui...",
				rows: "10",
			},
		}) as HTMLTextAreaElement;
		explainArea.style.width = "100%";
		explainArea.style.fontSize = "14px";
		explainArea.style.padding = "8px";
		explainArea.addEventListener("input", () => (this.explanation = explainArea.value));

		new Setting(contentEl)
			.addButton((b) => b.setButtonText("Cancelar").onClick(() => this.close()))
			.addButton((b) =>
				b.setButtonText("Gerar perguntas").setCta().onClick(() => this.run())
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async run(): Promise<void> {
		if (!this.concept || !this.explanation.trim()) {
			new Notice("Atlas: preencha conceito e explicação.");
			return;
		}
		this.close();
		const notice = new Notice("Atlas: gerando perguntas socráticas...", 0);
		try {
			const tool = new SocraticTool(this.plugin.ollama, this.plugin.settings.ollama.generationModel);
			const out = await tool.questions({
				concept: this.concept,
				userExplanation: this.explanation,
			});
			notice.hide();
			new SocraticResultModal(this.plugin.app, this.concept, out).open();
		} catch (e) {
			notice.hide();
			new Notice(`Atlas: erro — ${String(e)}`, 10000);
		}
	}
}

class SocraticResultModal extends Modal {
	constructor(app: App, private concept: string, private questions: string) {
		super(app);
	}
	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: `🎓 Perguntas para "${this.concept}"` });
		const pre = contentEl.createEl("pre");
		pre.style.whiteSpace = "pre-wrap";
		pre.style.padding = "12px";
		pre.style.background = "var(--background-secondary)";
		pre.style.borderRadius = "6px";
		pre.textContent = this.questions;

		new Setting(contentEl)
			.addButton((b) =>
				b.setButtonText("Copiar").onClick(async () => {
					await navigator.clipboard.writeText(this.questions);
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
