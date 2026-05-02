import { App, Modal, Notice, Setting, TFile, MarkdownView } from "obsidian";
import type AtlasPlugin from "../../main";
import { WeeklyReportTool } from "../tools/weekly-report";
import { EmailSender } from "../automation/email";
import { markdownToHtmlEmail } from "../automation/markdown-html";
import { decryptLight } from "../utils/crypto-light";
import { logger } from "../utils/logger";

export async function generateWeeklyReportCommand(plugin: AtlasPlugin): Promise<void> {
	const ok = await plugin.ollama.ping();
	if (!ok) {
		new Notice("Atlas: Ollama offline. O relatório será gerado sem o resumo IA.");
	}

	const notice = new Notice("Atlas: gerando weekly report...", 0);

	try {
		const tool = new WeeklyReportTool(
			plugin.app,
			plugin.kg,
			plugin.ollama,
			plugin.settings.ollama.generationModel,
			{
				daily: plugin.settings.folders.daily,
				meetings: plugin.settings.folders.meetings,
				reports: plugin.settings.folders.reports,
				raid: plugin.settings.folders.raid,
				incidents: plugin.settings.folders.incidents,
			}
		);

		const result = await tool.run({});
		notice.hide();

		const file = plugin.app.vault.getAbstractFileByPath(result.notePath);
		if (file instanceof TFile) {
			await plugin.app.workspace.getLeaf().openFile(file);
		}

		await plugin.notifier.notify({
			title: "Atlas",
			message: `Weekly report ${result.notePath.split("/").pop()} pronto. ${result.stats.meetings} reuniões, ${result.stats.tasksCompleted} tasks fechadas.`,
			severity: "medium",
			channels: ["inAppNotice", "desktop"],
			subtitle: "Weekly report",
		});
	} catch (e) {
		notice.hide();
		new Notice(`Atlas: erro — ${String(e)}`, 10000);
		logger.error("weekly report falhou", { error: String(e) });
	}
}

export class SendWeeklyReportModal extends Modal {
	private file: TFile;
	private toAddresses: string;
	private subject: string;

	constructor(
		app: App,
		private plugin: AtlasPlugin,
		file: TFile
	) {
		super(app);
		this.file = file;
		this.toAddresses = plugin.settings.email.defaultRecipientsWeekly;
		this.subject = `Weekly Status — ${file.basename}`;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: "📧 Enviar weekly report" });

		if (!this.plugin.settings.email.enabled) {
			contentEl.createEl("p", {
				text: "⚠️ Email desabilitado. Habilite em Settings → Atlas → Email.",
			});
			new Setting(contentEl).addButton((b) =>
				b.setButtonText("Fechar").onClick(() => this.close())
			);
			return;
		}

		new Setting(contentEl)
			.setName("Destinatários (separe por vírgula)")
			.addTextArea((t) => {
				t.setValue(this.toAddresses);
				t.onChange((v) => (this.toAddresses = v));
				t.inputEl.style.width = "100%";
				t.inputEl.style.minHeight = "60px";
			});

		new Setting(contentEl)
			.setName("Subject")
			.addText((t) => {
				t.setValue(this.subject);
				t.inputEl.style.width = "100%";
				t.onChange((v) => (this.subject = v));
			});

		const preview = contentEl.createEl("details");
		preview.createEl("summary", { text: "Preview do email (HTML rendered)" });
		const previewBody = preview.createDiv();
		previewBody.style.maxHeight = "300px";
		previewBody.style.overflow = "auto";
		previewBody.style.border = "1px solid var(--background-modifier-border)";
		previewBody.style.padding = "12px";
		previewBody.style.marginTop = "8px";
		previewBody.style.background = "white";
		previewBody.style.color = "#222";
		// Will be filled async
		this.fillPreview(previewBody);

		new Setting(contentEl)
			.addButton((b) => b.setButtonText("Cancelar").onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText("Enviar agora")
					.setCta()
					.onClick(() => this.send())
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async fillPreview(el: HTMLElement): Promise<void> {
		const md = await this.app.vault.read(this.file);
		const html = markdownToHtmlEmail(md, {
			title: this.subject,
			signatureName: this.plugin.settings.user.displayName,
			signatureRole: this.plugin.settings.user.role,
		});
		// Render only the body fragment (strip <html><head>)
		const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
		el.innerHTML = m ? m[1] : html;
	}

	private async send(): Promise<void> {
		const recipients = this.toAddresses
			.split(/[,;\n]+/)
			.map((s) => s.trim())
			.filter(Boolean);

		if (recipients.length === 0) {
			new Notice("Atlas: nenhum destinatário.");
			return;
		}

		const cfg = this.plugin.settings.email;
		const password = decryptLight(cfg.smtpPasswordEncrypted, this.app.vault.getName());
		if (!password) {
			new Notice("Atlas: SMTP password vazia. Configure em Settings.");
			return;
		}

		const md = await this.app.vault.read(this.file);
		const html = markdownToHtmlEmail(md, {
			title: this.subject,
			signatureName: this.plugin.settings.user.displayName,
			signatureRole: this.plugin.settings.user.role,
		});

		const sender = new EmailSender({
			host: cfg.smtpHost,
			port: cfg.smtpPort,
			secure: cfg.smtpSecure,
			user: cfg.smtpUser,
			password,
			fromAddress: cfg.fromAddress,
			fromName: cfg.fromName,
		});

		this.close();
		const notice = new Notice("Atlas: enviando...", 0);

		try {
			const r = await sender.send({
				to: recipients,
				subject: this.subject,
				html,
			});
			notice.hide();
			new Notice(`Atlas: enviado · ${r.id}`, 8000);

			// Mark note as sent
			const updated = md.replace(
				/^status:\s*draft\s*$/m,
				`status: sent\nsent_at: ${new Date().toISOString()}\nsent_to: ${recipients.join(", ")}`
			);
			if (updated !== md) {
				await this.app.vault.modify(this.file, updated);
			}

			await this.plugin.auditLog({
				action: "email.sent",
				report: this.file.path,
				to: recipients,
				messageId: r.id,
			});
		} catch (e) {
			notice.hide();
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`Atlas: falhou — ${msg}`, 12000);
			logger.error("envio falhou", { error: msg });
		}
	}
}

export async function sendCurrentWeeklyCommand(plugin: AtlasPlugin): Promise<void> {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	const file = view?.file;
	if (!file) {
		new Notice("Atlas: abra a nota do weekly report primeiro.");
		return;
	}
	if (!file.basename.match(/^W\d{1,2}-\d{4}/) && !file.path.includes("weekly")) {
		new Notice("Atlas: esta nota não parece um weekly report.");
		return;
	}
	new SendWeeklyReportModal(plugin.app, plugin, file).open();
}
