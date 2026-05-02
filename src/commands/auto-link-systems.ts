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
		contentEl.addClass("atlas-autolink-modal");

		const header = contentEl.createDiv({ cls: "atlas-autolink-header" });
		header.createEl("span", { cls: "atlas-autolink-icon", text: "🔗" });
		const wrap = header.createDiv({ cls: "atlas-autolink-header-wrap" });
		wrap.createEl("h3", { cls: "atlas-autolink-title", text: "Auto-link Sistemas" });
		wrap.createEl("div", {
			cls: "atlas-autolink-subtitle",
			text: "Atlas detectou menções a sistemas cadastrados. Marque os que deseja substituir por [[Sistema: X]] (links).",
		});

		const loadingEl = contentEl.createEl("div", {
			cls: "atlas-autolink-loading",
			text: "Escaneando nota...",
		});

		this.rawText = await this.app.vault.read(this.file);
		const detector = new SystemDetector(this.app, this.plugin);
		this.mentions = detector.detect(this.rawText).filter((m) => !m.alreadyLinked);
		loadingEl.remove();

		if (this.mentions.length === 0) {
			contentEl.createDiv({
				cls: "atlas-autolink-empty",
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

		const summary = contentEl.createEl("p", { cls: "atlas-autolink-summary" });
		summary.setText(
			`${this.mentions.length} menções de ${bySys.size} sistemas. Por padrão, todas selecionadas.`
		);

		const list = contentEl.createDiv({ cls: "atlas-autolink-list" });

		for (const [sysName, mentions] of bySys) {
			const sysHeader = list.createDiv({ cls: "atlas-autolink-sys-header" });
			sysHeader.setText(`🖥️ ${sysName} (${mentions.length})`);

			for (const m of mentions) {
				const id = `${m.systemId}-${m.startOffset}`;
				this.selected.add(id);
				const row = list.createDiv();
				row.addClass("atlas-autolink-row");

				const cb = row.createEl("input", {
					cls: "atlas-autolink-cb",
					type: "checkbox",
				}) as HTMLInputElement;
				cb.checked = true;
				cb.addEventListener("change", () => {
					if (cb.checked) this.selected.add(id);
					else this.selected.delete(id);
				});

				const text = row.createDiv({ cls: "atlas-autolink-row-text" });
				this.renderHighlight(text, m.contextSnippet, m.matchedText);
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

	/** DOM-safe highlight (no innerHTML) — splits snippet around match. */
	private renderHighlight(parent: HTMLElement, snippet: string, match: string): void {
		const lower = snippet.toLowerCase();
		const lowerMatch = match.toLowerCase();
		const idx = lower.indexOf(lowerMatch);
		if (idx < 0) {
			parent.appendText(snippet);
			return;
		}
		const before = snippet.substring(0, idx);
		const matched = snippet.substring(idx, idx + match.length);
		const after = snippet.substring(idx + match.length);
		if (before) parent.appendText(before);
		parent.createEl("mark", { cls: "atlas-autolink-mark", text: matched });
		if (after) parent.appendText(after);
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
