import { App, Modal, Notice, Setting, MarkdownView, Editor } from "obsidian";
import type AtlasPlugin from "../../main";
import { Prepare1on1Tool } from "../tools/prepare-1on1";

const BRIEF_START = "<!-- atlas-brief-start -->";
const BRIEF_END = "<!-- atlas-brief-end -->";

export class Prepare1on1Modal extends Modal {
	private personName = "";

	constructor(app: App, private plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: "🤝 Atlas — Preparar 1:1" });

		// Pre-fill if active note has frontmatter `person`
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const activeFile = view?.file;
		if (activeFile) {
			const cache = this.app.metadataCache.getFileCache(activeFile);
			const fmPerson = cache?.frontmatter?.person ?? cache?.frontmatter?.coachee;
			if (typeof fmPerson === "string") this.personName = fmPerson;
		}

		const people = this.plugin.kg.listPeople();
		if (people.length === 0) {
			contentEl.createEl("p", {
				text: "⚠️ Nenhuma pessoa no KG. Rode 'Atlas: Indexar vault' primeiro.",
			});
			new Setting(contentEl).addButton((b) =>
				b.setButtonText("Fechar").onClick(() => this.close())
			);
			return;
		}

		new Setting(contentEl)
			.setName("Pessoa")
			.setDesc("Atlas usa o KG para gerar brief com últimas sessões + commitments + temas.")
			.addDropdown((dd) => {
				dd.addOption("", "— escolha —");
				for (const p of people) {
					dd.addOption(p.name, p.name);
				}
				if (this.personName) dd.setValue(this.personName);
				dd.onChange((v) => {
					this.personName = v;
				});
			});

		new Setting(contentEl)
			.addButton((b) => b.setButtonText("Cancelar").onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText("Inserir brief na nota ativa")
					.setCta()
					.onClick(() => this.run("editor"))
			)
			.addButton((b) =>
				b.setButtonText("Mostrar em popup").onClick(() => this.run("popup"))
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async run(mode: "editor" | "popup"): Promise<void> {
		if (!this.personName) {
			new Notice("Atlas: escolha uma pessoa.");
			return;
		}
		this.close();

		const notice = new Notice(
			`Atlas: preparando brief de ${this.personName}...`,
			0
		);

		try {
			const tool = new Prepare1on1Tool(
				this.app,
				this.plugin.kg,
				this.plugin.ollama,
				this.plugin.settings.ollama.generationModel
			);
			// v0.23: wire LLMService
			if (this.plugin.llm) tool.setLLMService(this.plugin.llm);
			const brief = await tool.run({ personName: this.personName });
			notice.hide();

			if (mode === "popup") {
				new BriefPopup(this.app, this.personName, brief).open();
				return;
			}

			// Insert into active markdown editor
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			const editor = view?.editor;
			if (!editor) {
				new BriefPopup(this.app, this.personName, brief).open();
				new Notice("Atlas: nenhuma nota aberta — exibindo em popup.");
				return;
			}

			insertBriefInEditor(editor, brief);
			new Notice("Atlas: brief inserido na nota.");
		} catch (e) {
			notice.hide();
			new Notice(`Atlas: erro — ${String(e)}`, 10000);
		}
	}
}

function insertBriefInEditor(editor: Editor, brief: string): void {
	const content = editor.getValue();
	const startIdx = content.indexOf(BRIEF_START);
	const endIdx = content.indexOf(BRIEF_END);

	const newBlock = `${BRIEF_START}\n${brief}\n${BRIEF_END}`;

	if (startIdx >= 0 && endIdx > startIdx) {
		// Replace existing block
		const before = content.substring(0, startIdx);
		const after = content.substring(endIdx + BRIEF_END.length);
		editor.setValue(before + newBlock + after);
	} else {
		// Insert at cursor position
		editor.replaceSelection(`\n${newBlock}\n`);
	}
}

class BriefPopup extends Modal {
	constructor(app: App, private personName: string, private content: string) {
		super(app);
	}
	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: `Brief — ${this.personName}` });
		const pre = contentEl.createEl("pre");
		pre.style.whiteSpace = "pre-wrap";
		pre.style.maxHeight = "60vh";
		pre.style.overflow = "auto";
		pre.style.padding = "12px";
		pre.style.background = "var(--background-secondary)";
		pre.style.borderRadius = "6px";
		pre.textContent = this.content;
		new Setting(contentEl)
			.addButton((b) =>
				b.setButtonText("Copiar").onClick(async () => {
					await navigator.clipboard.writeText(this.content);
					new Notice("Atlas: brief copiado.");
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
