import { App, Modal, Notice, Setting, TFile } from "obsidian";
import type AtlasPlugin from "../../main";
import { SummarizePersonTool } from "../tools/summarize-person";
import { Indexer } from "../retrieval/indexer";

export class SummarizePersonModal extends Modal {
	private personName = "";
	private periodMonths = 12;

	constructor(app: App, private plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: "📝 Atlas — Resumir pessoa" });
		contentEl.createEl("p", {
			text: "Gera um relatório consolidado de todas as 1:1s/sessões com a pessoa no período.",
		});

		const people = this.plugin.kg.listPeople();
		if (people.length === 0) {
			contentEl.createEl("p", {
				text: "⚠️ Nenhuma pessoa no Knowledge Graph ainda. Rode 'Atlas: Indexar vault' primeiro.",
			});
			new Setting(contentEl).addButton((b) =>
				b.setButtonText("Fechar").onClick(() => this.close())
			);
			return;
		}

		new Setting(contentEl)
			.setName("Pessoa")
			.addDropdown((dd) => {
				dd.addOption("", "— escolha —");
				for (const p of people) {
					dd.addOption(p.name, p.name);
				}
				dd.onChange((v) => {
					this.personName = v;
				});
			});

		new Setting(contentEl)
			.setName("Período (meses)")
			.setDesc("Quantos meses retroativos analisar.")
			.addText((t) => {
				t.setValue(String(this.periodMonths));
				t.onChange((v) => {
					const n = parseInt(v, 10);
					if (!isNaN(n) && n > 0) this.periodMonths = n;
				});
			});

		new Setting(contentEl)
			.addButton((b) => b.setButtonText("Cancelar").onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText("Gerar resumo")
					.setCta()
					.onClick(() => this.run())
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async run(): Promise<void> {
		if (!this.personName) {
			new Notice("Atlas: escolha uma pessoa.");
			return;
		}

		this.close();
		const notice = new Notice(
			`Atlas: gerando resumo de ${this.personName} (pode levar 30-90s)...`,
			0
		);

		try {
			const indexer = new Indexer(this.app);
			const tool = new SummarizePersonTool(
				this.app,
				this.plugin.kg,
				indexer,
				this.plugin.ollama,
				this.plugin.settings.ollama.generationModel,
				this.plugin.settings.folders.reports
			);
			// v0.23: wire LLMService pra map-reduce interno usar cloud quando configured
			if (this.plugin.llm) tool.setLLMService(this.plugin.llm);

			const result = await tool.run({
				personName: this.personName,
				periodMonths: this.periodMonths,
			});

			notice.hide();

			if (!result.notePath) {
				new Notice(`Atlas: ${this.personName} sem sessões no período.`);
				return;
			}

			const file = this.app.vault.getAbstractFileByPath(result.notePath);
			if (file instanceof TFile) {
				await this.app.workspace.getLeaf().openFile(file);
			}
			new Notice(`Atlas: resumo de ${this.personName} pronto.`);
		} catch (e) {
			notice.hide();
			new Notice(`Atlas: erro — ${String(e)}`, 10000);
		}
	}
}
