import { App, normalizePath, TFile } from "obsidian";
import { logger } from "../utils/logger";

export interface AuditEvent {
	timestamp: string;
	action: string;
	[key: string]: unknown;
}

export type AuditEventInput = { action: string } & Record<string, unknown>;

export class AuditLog {
	constructor(private app: App, private folder: string) {}

	private get path(): string {
		return normalizePath(`${this.folder}/audit.jsonl`);
	}

	async append(event: AuditEventInput): Promise<void> {
		const entry: AuditEvent = {
			...event,
			timestamp: new Date().toISOString(),
		};
		const line = JSON.stringify(entry) + "\n";

		const file = this.app.vault.getAbstractFileByPath(this.path);
		try {
			if (file instanceof TFile) {
				const cur = await this.app.vault.read(file);
				await this.app.vault.modify(file, cur + line);
			} else {
				if (!this.app.vault.getAbstractFileByPath(this.folder)) {
					await this.app.vault.createFolder(this.folder);
				}
				await this.app.vault.create(this.path, line);
			}
		} catch (e) {
			logger.warn("audit: append falhou", { error: String(e) });
		}
	}
}
