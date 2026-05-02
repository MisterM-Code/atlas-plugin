import nodemailer, { Transporter } from "nodemailer";
import { logger } from "../utils/logger";

export interface EmailConfig {
	host: string;
	port: number;
	secure: boolean;
	user: string;
	password: string;
	fromAddress: string;
	fromName: string;
}

export interface SendEmailInput {
	to: string | string[];
	cc?: string | string[];
	bcc?: string | string[];
	subject: string;
	html?: string;
	text?: string;
	attachments?: { filename: string; content: Buffer | string; contentType?: string }[];
}

export class EmailSender {
	private transporter: Transporter | null = null;

	constructor(private config: EmailConfig) {}

	private get transport(): Transporter {
		if (!this.transporter) {
			this.transporter = nodemailer.createTransport({
				host: this.config.host,
				port: this.config.port,
				secure: this.config.secure,
				auth: {
					user: this.config.user,
					pass: this.config.password,
				},
			});
		}
		return this.transporter;
	}

	async verify(): Promise<{ ok: boolean; error?: string }> {
		try {
			await this.transport.verify();
			return { ok: true };
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			return { ok: false, error: msg };
		}
	}

	async send(input: SendEmailInput): Promise<{ id: string }> {
		const info = await this.transport.sendMail({
			from: this.config.fromName
				? `"${this.config.fromName}" <${this.config.fromAddress}>`
				: this.config.fromAddress,
			to: input.to,
			cc: input.cc,
			bcc: input.bcc,
			subject: input.subject,
			html: input.html,
			text: input.text ?? this.htmlToPlain(input.html ?? ""),
			attachments: input.attachments,
		});
		logger.info("email enviado", { id: info.messageId, to: input.to });
		return { id: info.messageId };
	}

	private htmlToPlain(html: string): string {
		return html
			.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
			.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
			.replace(/<br\s*\/?>/gi, "\n")
			.replace(/<\/(p|div|h\d|li|tr)>/gi, "\n")
			.replace(/<[^>]+>/g, "")
			.replace(/&nbsp;/g, " ")
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/\n{3,}/g, "\n\n")
			.trim();
	}
}
