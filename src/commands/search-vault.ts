import { App, Modal, Notice, Setting, TFile } from "obsidian";
import type AtlasPlugin from "../../main";
import { Indexer } from "../retrieval/indexer";
import { HybridSearcher, SearchResult } from "../retrieval/search";

export class SearchVaultModal extends Modal {
	private query = "";
	private resultsEl!: HTMLDivElement;
	private searcher: HybridSearcher | null = null;
	private debounceTimer: number | null = null;

	constructor(app: App, private plugin: AtlasPlugin) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: "🔎 Atlas — Buscar no vault" });

		const inputEl = contentEl.createEl("input", {
			type: "search",
			attr: { placeholder: "Digite sua busca... (ex: bloqueios João maio)" },
		});
		inputEl.style.width = "100%";
		inputEl.style.fontSize = "16px";
		inputEl.style.padding = "10px";
		inputEl.focus();

		this.resultsEl = contentEl.createDiv({ cls: "atlas-search-results" });
		this.resultsEl.style.marginTop = "12px";
		this.resultsEl.style.maxHeight = "60vh";
		this.resultsEl.style.overflow = "auto";

		const status = contentEl.createDiv();
		status.style.fontSize = "12px";
		status.style.opacity = "0.7";
		status.setText("Indexando vault para busca...");

		// Build searcher in background
		try {
			const indexer = new Indexer(this.app, [
				this.plugin.settings.folders.atlas,
				".obsidian",
				".trash",
			]);
			const notes = await indexer.indexVault();
			const allChunks = notes.flatMap((n) => indexer.chunk(n));
			this.searcher = new HybridSearcher(
				this.plugin.embedder,
				this.plugin.settings.performance.rerankerEnabled ? this.plugin.reranker : undefined
			);
			this.searcher.indexChunks(allChunks);
			const rerankSuffix = this.plugin.settings.performance.rerankerEnabled
				? " · reranker ON"
				: "";
			status.setText(
				`Pronto. ${notes.length} notas, ${allChunks.length} chunks indexados.${rerankSuffix}`
			);
		} catch (e) {
			status.setText(`Erro ao indexar: ${String(e)}`);
			return;
		}

		inputEl.addEventListener("input", (ev) => {
			this.query = (ev.target as HTMLInputElement).value;
			if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
			this.debounceTimer = window.setTimeout(() => void this.runSearch(), 300);
		});

		new Setting(contentEl).addButton((b) =>
			b.setButtonText("Fechar").onClick(() => this.close())
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async runSearch(): Promise<void> {
		if (!this.searcher || !this.query.trim()) {
			this.resultsEl.empty();
			return;
		}

		this.resultsEl.empty();
		this.resultsEl.createEl("p", { text: "Buscando..." }).style.opacity = "0.5";

		const results = await this.searcher.search(this.query.trim(), 10);

		this.resultsEl.empty();
		if (results.length === 0) {
			this.resultsEl.createEl("p", { text: "Nada encontrado." });
			return;
		}

		for (const r of results) {
			this.renderResult(r);
		}
	}

	private renderResult(r: SearchResult): void {
		const card = this.resultsEl.createDiv();
		card.style.padding = "10px";
		card.style.marginBottom = "8px";
		card.style.border = "1px solid var(--background-modifier-border)";
		card.style.borderRadius = "6px";
		card.style.cursor = "pointer";

		const title = card.createEl("div");
		title.style.fontWeight = "bold";
		title.style.marginBottom = "4px";
		title.setText(r.notePath);

		const meta = card.createEl("div");
		meta.style.fontSize = "11px";
		meta.style.opacity = "0.6";
		meta.setText(
			`${r.context} · score=${r.score.toFixed(3)} (BM25=${r.bm25Score.toFixed(2)} · dense=${r.denseScore.toFixed(2)})`
		);

		const snippet = card.createEl("div");
		snippet.style.fontSize = "13px";
		snippet.style.marginTop = "6px";
		snippet.setText(r.snippet);

		card.addEventListener("click", () => {
			const file = this.app.vault.getAbstractFileByPath(r.notePath);
			if (file instanceof TFile) {
				this.close();
				this.app.workspace.getLeaf().openFile(file);
			} else {
				new Notice(`Atlas: arquivo ${r.notePath} não encontrado.`);
			}
		});
	}
}
