import { App, Modal, Notice, Setting, TFile, normalizePath } from "obsidian";
import { parseNaturalDate, formatObsidianReminder } from "../utils/date-parse";
import type AtlasPlugin from "../../main";

export class QuickCaptureModal extends Modal {
	private value = "";

	constructor(app: App, private plugin: AtlasPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: "🎯 Atlas — Quick Capture" });

		const textInput = contentEl.createEl("textarea", {
			attr: { rows: "3", placeholder: "Ex: cobrar Maria sobre IDP sexta às 10h" },
		});
		textInput.style.width = "100%";
		textInput.style.fontSize = "16px";
		textInput.style.padding = "8px";
		textInput.focus();

		textInput.addEventListener("input", () => {
			this.value = textInput.value;
		});

		textInput.addEventListener("keydown", async (ev: KeyboardEvent) => {
			if ((ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) || ev.key === "Enter") {
				if (ev.key === "Enter" && !ev.shiftKey) {
					ev.preventDefault();
					await this.submit();
				}
			}
			if (ev.key === "Escape") {
				this.close();
			}
		});

		const hint = contentEl.createEl("p", {
			text: "Enter para salvar · Shift+Enter para nova linha · Esc para cancelar",
		});
		hint.style.fontSize = "11px";
		hint.style.opacity = "0.7";

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText("Cancelar").onClick(() => this.close())
			)
			.addButton((btn) =>
				btn
					.setButtonText("Salvar")
					.setCta()
					.onClick(() => this.submit())
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async submit(): Promise<void> {
		const text = this.value.trim();
		if (!text) {
			new Notice("Atlas: nada capturado.");
			this.close();
			return;
		}

		const parsed = parseNaturalDate(text);
		const description = parsed.residualText || text;

		const dateSuffix = parsed.date
			? ` ${formatObsidianReminder(parsed.date, parsed.hasTime)}`
			: "";
		const taskLine = `- [ ] ${description}${dateSuffix} #followup`;

		await appendToInbox(this.plugin, taskLine);
		new Notice(
			parsed.date
				? `Atlas: capturado e agendado para ${parsed.originalText}.`
				: "Atlas: capturado em Inbox."
		);
		this.close();
	}
}

async function appendToInbox(plugin: AtlasPlugin, line: string): Promise<void> {
	const app = plugin.app;
	const folder = plugin.settings.folders.inbox;
	const path = normalizePath(`${folder}/quick-capture.md`);

	if (!app.vault.getAbstractFileByPath(folder)) {
		await app.vault.createFolder(folder);
	}

	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) {
		const current = await app.vault.read(existing);
		const updated = current.trimEnd() + "\n" + line + "\n";
		await app.vault.modify(existing, updated);
	} else {
		const header = `# 📥 Quick Capture\n\n> Capturado via Atlas (Cmd+Shift+A). Reorganize depois.\n\n`;
		await app.vault.create(path, header + line + "\n");
	}
}
