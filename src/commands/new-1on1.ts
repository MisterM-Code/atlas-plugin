/**
 * Atlas v0.44 E2 — NEW 1:1 page (cria arquivo, separa de prepare-1on1 que só gera brief).
 *
 * Flow:
 * 1. Modal: pick person + framework + date confirm
 * 2. Apply Atlas template (1on1-grow / 1on1-clear / etc)
 * 3. Inject brief gerado pelo Prepare1on1Tool no topo
 * 4. Create folder 03_Meetings/1on1/<personSlug>/
 * 5. Write file `<YYYY-MM-DD>-<personSlug>.md` + open in editor
 * 6. Upsert Session no KG pra rastreio
 */

import { App, Modal, Notice, Setting, TFile, normalizePath } from "obsidian";
import type AtlasPlugin from "../../main";
// Brief generation: import lazy in create() to avoid circular deps
import { renderTemplate } from "../templates/visual-editor/block-renderer";
import { slugify } from "../kg/schemas";
import { logger } from "../utils/logger";

interface FrameworkOption {
	id: string;
	templateId: string;
	label: string;
	emoji: string;
	desc: string;
}

const FRAMEWORKS: FrameworkOption[] = [
	{ id: "grow", templateId: "1on1-grow", label: "GROW", emoji: "🎯", desc: "Goal · Reality · Options · Will" },
	{ id: "clear", templateId: "1on1-clear", label: "CLEAR", emoji: "🌟", desc: "Contract · Listen · Explore · Action · Review" },
	{ id: "biceps", templateId: "1on1-grow", label: "BICEPS (motivações)", emoji: "💪", desc: "Belonging · Improvement · Choice · Equality · Predictability · Significance" },
	{ id: "oskar", templateId: "1on1-grow", label: "OSKAR", emoji: "🌊", desc: "Outcome · Scale · Know-how · Affirm · Review" },
	{ id: "adhoc", templateId: "1on1-grow", label: "Adhoc (livre)", emoji: "📝", desc: "Sem framework — pauta livre" },
];

export class New1on1Modal extends Modal {
	private personName = "";
	private framework: FrameworkOption = FRAMEWORKS[0];
	private dateStr = new Date().toISOString().split("T")[0];

	constructor(app: App, private plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("atlas-new-1on1-modal");

		contentEl.createEl("h3", { text: "🤝 Novo 1:1 — criar página" });
		contentEl.createEl("div", {
			cls: "atlas-new-1on1-subtitle",
			text: "Atlas cria nota com template + brief auto. Registra a sessão no KG.",
		});

		const people = this.plugin.kg.listPeople();
		if (people.length === 0) {
			contentEl.createEl("p", {
				text: "⚠️ Nenhuma pessoa no KG. Cadastre uma via Quick Add (FAB +) primeiro.",
			});
			new Setting(contentEl).addButton((b) =>
				b.setButtonText("Fechar").onClick(() => this.close())
			);
			return;
		}

		// Pessoa picker
		new Setting(contentEl)
			.setName("Pessoa")
			.addDropdown((dd) => {
				dd.addOption("", "— escolha —");
				for (const p of people.sort((a, b) => a.name.localeCompare(b.name))) {
					dd.addOption(p.name, p.name);
				}
				dd.onChange((v) => (this.personName = v));
			});

		// Framework picker (5 cards)
		const frameworkLabel = contentEl.createEl("div", {
			cls: "atlas-new-1on1-framework-label",
			text: "Framework",
		});
		void frameworkLabel;
		const fwGrid = contentEl.createDiv({ cls: "atlas-new-1on1-framework-grid" });
		for (const f of FRAMEWORKS) {
			const isActive = this.framework.id === f.id;
			const card = fwGrid.createDiv({
				cls: `atlas-new-1on1-framework-card ${isActive ? "is-active" : ""}`,
			});
			card.createEl("span", { cls: "atlas-new-1on1-framework-emoji", text: f.emoji });
			card.createEl("div", { cls: "atlas-new-1on1-framework-name", text: f.label });
			card.createEl("div", { cls: "atlas-new-1on1-framework-desc", text: f.desc });
			card.addEventListener("click", () => {
				this.framework = f;
				fwGrid.querySelectorAll(".atlas-new-1on1-framework-card").forEach((c) =>
					c.removeClass("is-active")
				);
				card.addClass("is-active");
			});
		}

		// Date
		new Setting(contentEl)
			.setName("Data")
			.addText((t) => {
				t.setValue(this.dateStr);
				t.onChange((v) => (this.dateStr = v));
			});

		// Buttons
		new Setting(contentEl)
			.addButton((b) => b.setButtonText("Cancelar").onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText("✨ Criar página")
					.setCta()
					.onClick(() => void this.create())
			);
	}

	private async create(): Promise<void> {
		if (!this.personName.trim()) {
			new Notice("Atlas: escolha uma pessoa.");
			return;
		}
		if (!/^\d{4}-\d{2}-\d{2}$/.test(this.dateStr)) {
			new Notice("Atlas: data inválida (use YYYY-MM-DD).");
			return;
		}

		const personSlug = slugify(this.personName);
		const folder = normalizePath(`${this.plugin.settings.folders.meetings}/1on1/${personSlug}`);
		const fileName = `${this.dateStr}-${personSlug}.md`;
		const filePath = normalizePath(`${folder}/${fileName}`);

		// Check existing
		const existing = this.app.vault.getAbstractFileByPath(filePath);
		if (existing instanceof TFile) {
			new Notice(`Atlas: arquivo já existe — abrindo.`);
			await this.app.workspace.getLeaf().openFile(existing);
			this.close();
			return;
		}

		this.close();
		const notice = new Notice(`Atlas: criando 1:1 com ${this.personName}…`, 0);

		try {
			// Ensure folder
			if (!this.app.vault.getAbstractFileByPath(folder)) {
				await this.app.vault.createFolder(folder);
			}

			// Generate brief (usa Prepare1on1Tool existente)
			const { Prepare1on1Tool } = await import("../tools/prepare-1on1");
			const briefTool = new Prepare1on1Tool(
				this.app,
				this.plugin.kg,
				this.plugin.ollama,
				this.plugin.settings.ollama.generationModel
			);
			if (this.plugin.llm) briefTool.setLLMService(this.plugin.llm);
			let brief = "";
			try {
				brief = await briefTool.run({ personName: this.personName });
			} catch (e) {
				logger.warn("new-1on1: brief generation failed", { error: String(e) });
				brief = "_(Brief não gerado — pode regenerar via comando 'Atlas: Brief 1:1')_";
			}

			// Resolve template
			const template = this.plugin.templateStore?.get(this.framework.templateId);
			let body = "";
			if (template) {
				body = renderTemplate(template, {
					data: this.dateStr,
					pessoa: this.personName,
					framework: this.framework.label,
				});
			} else {
				// Fallback: minimal template inline
				body = this.buildMinimalTemplate();
			}

			// Inject brief at top (after frontmatter)
			const briefBlock = `\n## 🤖 Atlas Brief (auto-gerado)\n\n${brief}\n\n---\n`;
			const fmEnd = body.indexOf("---", 4); // skip first --- (start of frontmatter)
			if (fmEnd > 0) {
				body = body.slice(0, fmEnd + 4) + briefBlock + body.slice(fmEnd + 4);
			} else {
				body = briefBlock + body;
			}

			// Create file
			const file = await this.app.vault.create(filePath, body);

			// Register session in KG (Framework enum: GROW|CLEAR|BICEPS|OSKAR|adhoc)
			const personId = this.plugin.kg.findPersonByName(this.personName)?.id;
			const sessionId = `${this.dateStr}-${personSlug}`;
			const fwEnum =
				this.framework.id === "grow"
					? "GROW"
					: this.framework.id === "clear"
					? "CLEAR"
					: this.framework.id === "biceps"
					? "BICEPS"
					: this.framework.id === "oskar"
					? "OSKAR"
					: "adhoc";
			this.plugin.kg.upsertSession({
				id: sessionId,
				date: this.dateStr,
				type: "1on1",
				personId,
				participantIds: [],
				framework: fwEnum,
				topics: [],
				decisions: [],
				sourceNotePath: file.path,
				confidential: false,
			});
			await this.plugin.kg.save();

			notice.hide();
			new Notice(`✓ 1:1 criado: ${fileName}`, 6000);
			await this.app.workspace.getLeaf().openFile(file);

			// Audit log
			await this.plugin.auditLog?.({
				action: "1on1.created",
				person: this.personName,
				framework: this.framework.label,
				file: file.path,
			});
		} catch (e) {
			notice.hide();
			new Notice(`Atlas: erro criar 1:1 — ${String(e)}`, 8000);
			logger.error("new-1on1 failed", { error: String(e) });
		}
	}

	private buildMinimalTemplate(): string {
		return `---
type: 1on1
person: "${this.personName}"
date: ${this.dateStr}
framework: ${this.framework.label}
participants: ["${this.personName}"]
tags: [1on1]
---

# 🤝 1:1 com ${this.personName} — ${this.dateStr}

## 🎯 Goal
-

## 🔍 Reality
-

## 💡 Options
-

## 🏃 Will
-

## ✅ Action Items
- [ ] [[${this.personName}]] — _ (@_)

## 🔁 Meus follow-ups
- [ ] eu — _ (@_)

## 🏷️ Themes
#theme/

## 📌 Recall (próxima sessão)
-
`;
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
