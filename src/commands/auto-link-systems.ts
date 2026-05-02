import { App, Modal, Notice, Setting, TFile, MarkdownView } from "obsidian";
import type AtlasPlugin from "../../main";
import { SystemDetector, SystemMention } from "../automation/system-detector";
import { applyResponsiveModal } from "../ui/modal-helpers";

/**
 * Comando "Atlas: Auto-link sistemas mencionados na nota ativa".
 *
 * Varre nota → mostra preview modal com checkboxes → user confirma →
 * substitui matches por [[Sistema: X]] em batch.
 */

export class AutoLinkSystemsModal extends Modal {
	private mentions: SystemMention[] = [];
	private selected = new Set<string>();
	private rawText = "";

	constructor(
		app: App,
		private plugin: AtlasPlugin,
		private file: TFile
	) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		applyResponsiveModal(contentEl, { preferredWidth: 720 });

		contentEl.createEl("h3", { text: "🔗 Auto-link sistemas — preview" });
		contentEl.createEl("p", {
			text: "Atlas detectou estas menções a sistemas cadastrados. Marque as que deseja substituir por [[Sistema: X]] (links).",
		});

		const loadingEl = contentEl.createEl("div", { text: "Escaneando nota..." });
		loadingEl.style.opacity = "0.6";

		this.rawText = await this.app.vault.read(this.file);
		const detector = new SystemDetector(this.app, this.plugin);
		this.mentions = detector.detect(this.rawText).filter((m) => !m.alreadyLinked);
		loadingEl.remove();

		if (this.mentions.length === 0) {
			contentEl.createEl("p", {
				text: "✅ Nenhuma menção não-linkada detectada. Tudo já está organizado!",
			});
			new Setting(contentEl).addButton((b) =>
				b.setButtonText("Fechar").setCta().onClick(() => this.close())
			);
			return;
		}

		// Group by system pra UX melhor
		const bySys = new Map<string, SystemMention[]>();
		for (const m of this.mentions) {
			const arr = bySys.get(m.systemName) ?? [];
			arr.push(m);
			bySys.set(m.systemName, arr);
		}

		const summary = contentEl.createEl("p");
		summary.style.fontSize = "12px";
		summary.style.opacity = "0.7";
		summary.setText(
			`${this.mentions.length} menções de ${bySys.size} sistemas. Por padrão, todas selecionadas.`
		);

		const list = contentEl.createDiv();
		list.style.maxHeight = "50vh";
		list.style.overflowY = "auto";
		list.style.border = "1px solid var(--background-modifier-border)";
		list.style.borderRadius = "4px";
		list.style.padding = "8px";
		list.style.marginBottom = "12px";

		for (const [sysName, mentions] of bySys) {
			const sysHeader = list.createDiv();
			sysHeader.style.fontSize = "13px";
			sysHeader.style.fontWeight = "bold";
			sysHeader.style.marginTop = "8px";
			sysHeader.style.marginBottom = "4px";
			sysHeader.style.padding = "4px 6px";
			sysHeader.style.background = "var(--background-secondary)";
			sysHeader.style.borderRadius = "3px";
			sysHeader.setText(`🖥️ ${sysName} (${mentions.length})`);

			for (const m of mentions) {
				const id = `${m.systemId}-${m.startOffset}`;
				this.selected.add(id);
				const row = list.createDiv();
				row.style.display = "flex";
				row.style.alignItems = "flex-start";
				row.style.gap = "8px";
				row.style.padding = "4px 8px";
				row.style.fontSize = "11px";

				const cb = row.createEl("input", { type: "checkbox" }) as HTMLInputElement;
				cb.checked = true;
				cb.addEventListener("change", () => {
					if (cb.checked) this.selected.add(id);
					else this.selected.delete(id);
				});

				const text = row.createDiv();
				text.style.flexGrow = "1";
				text.style.lineHeight = "1.4";
				text.innerHTML = this.highlightMatch(m.contextSnippet, m.matchedText);
			}
		}

		new Setting(contentEl)
			.addButton((b) => b.setButtonText("Cancelar").onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText(`✅ Substituir ${this.selected.size} menções`)
					.setCta()
					.onClick(() => void this.apply())
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private highlightMatch(snippet: string, match: string): string {
		const escaped = snippet
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;");
		const matchEsc = match.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
		return escaped.replace(
			new RegExp(matchEsc, "i"),
			(m) =>
				`<mark style="background:var(--interactive-accent);color:var(--text-on-accent);padding:0 3px;border-radius:2px;">${m}</mark>`
		);
	}

	private async apply(): Promise<void> {
		const detector = new SystemDetector(this.app, this.plugin);
		const toApply = this.mentions.filter((m) =>
			this.selected.has(`${m.systemId}-${m.startOffset}`)
		);

		if (toApply.length === 0) {
			new Notice("Atlas: nenhuma menção selecionada.");
			this.close();
			return;
		}

		// Map system → notePath
		const sysMap = new Map<string, string>();
		for (const sys of this.plugin.kg.listSystems()) {
			if (sys.notePath) sysMap.set(sys.id, sys.notePath);
		}

		const newText = detector.autoLinkMentions(this.rawText, toApply, sysMap);

		if (newText === this.rawText) {
			new Notice("Atlas: sistemas sem nota associada — abra cada sistema e gere nota primeiro.");
			this.close();
			return;
		}

		await this.app.vault.modify(this.file, newText);

		// Atualiza frontmatter também
		await detector.syncFrontmatterSystems(this.file, toApply);

		new Notice(`Atlas: ${toApply.length} menções linkadas em "${this.file.basename}".`);
		await this.plugin.auditLog({
			action: "auto-link-systems",
			file: this.file.path,
			count: toApply.length,
		});
		this.plugin.gainXp("auto-link", 10);
		this.close();
	}
}

export async function autoLinkSystemsCommand(plugin: AtlasPlugin): Promise<void> {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	const file = view?.file;
	if (!file) {
		new Notice("Atlas: abra uma nota primeiro.");
		return;
	}
	new AutoLinkSystemsModal(plugin.app, plugin, file).open();
}
