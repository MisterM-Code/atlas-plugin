/**
 * Atlas v0.9 Sprint 30 — ComposeEmailModal
 *
 * Modal pra compor email avulso. Usa SMTP existente (EmailSender).
 * Pode ser disparado via:
 *  - Comando atlas:compose-email
 *  - Tool call create_compose_email (LLM ou voice)
 *  - FAB v2 → "Email"
 */

import { App, Modal, Notice, Setting, TextAreaComponent, TextComponent } from "obsidian";
import type AtlasPlugin from "../../main";
import { EmailSender } from "../automation/email";
import { applyResponsiveModal } from "../ui/modal-helpers";
import { decryptLight } from "../utils/crypto-light";
import { logger } from "../utils/logger";

export interface ComposePrefill {
	to?: string;
	cc?: string;
	bcc?: string;
	subject?: string;
	body?: string;
}

export class ComposeEmailModal extends Modal {
	private toEl!: TextComponent;
	private subjectEl!: TextComponent;
	private bodyEl!: TextAreaComponent;
	private ccEl!: TextComponent;
	private bccEl!: TextComponent;

	constructor(
		app: App,
		private plugin: AtlasPlugin,
		private prefill: ComposePrefill = {}
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		applyResponsiveModal(contentEl, { preferredWidth: 640 });
		contentEl.empty();

		contentEl.createEl("h2", { text: "📧 Compose Email" });

		new Setting(contentEl)
			.setName("Para")
			.setDesc("Email destinatário (ou múltiplos separados por vírgula)")
			.addText((t) => {
				this.toEl = t;
				t.setValue(this.prefill.to ?? "");
				t.setPlaceholder("alguem@exemplo.com");
				t.inputEl.addClass("atlas-email-text-full");
			});

		new Setting(contentEl)
			.setName("CC")
			.addText((t) => {
				this.ccEl = t;
				t.setValue(this.prefill.cc ?? "");
				t.inputEl.addClass("atlas-email-text-full");
			});

		new Setting(contentEl)
			.setName("BCC")
			.addText((t) => {
				this.bccEl = t;
				t.setValue(this.prefill.bcc ?? "");
				t.inputEl.addClass("atlas-email-text-full");
			});

		new Setting(contentEl)
			.setName("Assunto")
			.addText((t) => {
				this.subjectEl = t;
				t.setValue(this.prefill.subject ?? "");
				t.inputEl.addClass("atlas-email-text-full");
			});

		contentEl.createEl("h4", { text: "Corpo (markdown)", cls: "atlas-email-body-label" });

		const bodyWrap = contentEl.createDiv({ cls: "atlas-email-body-wrap" });
		this.bodyEl = new TextAreaComponent(bodyWrap);
		this.bodyEl.setValue(this.prefill.body ?? "");
		this.bodyEl.inputEl.addClass("atlas-email-body-textarea");

		const aiBar = contentEl.createDiv({ cls: "atlas-email-actions-bar" });
		const aiBtn = aiBar.createEl("button", { text: "✨ AI assist (rascunhar)" });
		aiBtn.addEventListener("click", () => void this.aiAssist());

		const tplBtn = aiBar.createEl("button", { text: "📐 Template" });
		tplBtn.addEventListener("click", () => this.useTemplate());

		const actionRow = contentEl.createDiv({ cls: "atlas-email-action-row" });
		const cancelBtn = actionRow.createEl("button", { text: "Cancelar" });
		cancelBtn.addEventListener("click", () => this.close());

		const sendBtn = actionRow.createEl("button", { text: "📨 Enviar", cls: "mod-cta" });
		sendBtn.addEventListener("click", () => void this.send());
	}

	private async aiAssist(): Promise<void> {
		const subject = this.subjectEl.getValue().trim();
		const intent = this.bodyEl.getValue().trim() || subject;
		if (!intent) {
			new Notice("Atlas: digite assunto ou intenção pra AI rascunhar.");
			return;
		}
		new Notice("Atlas: rascunhando email…");
		try {
			const prompt = `Você é o Atlas. Rascunhe um email curto e profissional em PT-BR.
Assunto: ${subject || "(definir)"}
Intenção: ${intent}

Formato:
- Saudação curta
- 2-4 parágrafos
- Encerramento profissional + assinatura "Atenciosamente,"

Responda APENAS com o corpo do email (sem assunto, sem cabeçalho).`;
			const text = await this.plugin.ollama.generate(prompt, {
				model: this.plugin.settings.ollama.generationModel,
				temperature: 0.5,
				max_tokens: 800,
			});
			this.bodyEl.setValue(text.trim());
			new Notice("Atlas: rascunho gerado. Revise e envie.");
		} catch (e) {
			new Notice(`Atlas: AI assist falhou — ${String(e)}`, 8000);
		}
	}

	private useTemplate(): void {
		const tpl = `Olá,

(corpo aqui)

Atenciosamente,
${this.plugin.settings.email?.fromName ?? ""}`;
		this.bodyEl.setValue(tpl);
	}

	private async send(): Promise<void> {
		const to = this.toEl.getValue().trim();
		const subject = this.subjectEl.getValue().trim();
		const body = this.bodyEl.getValue().trim();
		const cc = this.ccEl.getValue().trim();
		const bcc = this.bccEl.getValue().trim();

		if (!to || !subject || !body) {
			new Notice("Atlas: preencha destinatário, assunto e corpo.");
			return;
		}
		const cfg = this.plugin.settings.email;
		if (!cfg?.smtpHost) {
			new Notice("Atlas: SMTP não configurado em Settings.", 8000);
			return;
		}
		const password = decryptLight(cfg.smtpPasswordEncrypted, this.app.vault.getName());
		if (!password) {
			new Notice("Atlas: SMTP password vazia. Configure em Settings.");
			return;
		}
		try {
			const sender = new EmailSender({
				host: cfg.smtpHost,
				port: cfg.smtpPort,
				secure: cfg.smtpSecure,
				user: cfg.smtpUser,
				password,
				fromAddress: cfg.fromAddress,
				fromName: cfg.fromName,
			});
			await sender.send({
				to: to.split(",").map((s) => s.trim()).filter(Boolean),
				cc: cc ? cc.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
				bcc: bcc ? bcc.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
				subject,
				text: body,
			});
			await this.plugin.auditLog({ action: "email.sent.adhoc", to, subject });
			new Notice(`📧 Atlas: email enviado pra ${to}.`);
			this.close();
		} catch (e) {
			logger.error("compose-email send falhou", { error: String(e) });
			new Notice(`Atlas: envio falhou — ${String(e)}`, 10000);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
