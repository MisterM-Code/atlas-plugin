import { App, normalizePath, TFile } from "obsidian";
import { AtlasTemplate } from "./block-types";
import { DEFAULT_TEMPLATES } from "./default-templates";
import { logger } from "../../utils/logger";

/**
 * Storage de templates Atlas em `.atlas/templates.json`.
 * Inicializa com defaults se vazio.
 */

const STORE_PATH_SUFFIX = "templates.json";

export class TemplateStore {
	private templates: AtlasTemplate[] = [];
	private dirty = false;
	private flushTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(private app: App, private atlasFolder: string) {}

	private get path(): string {
		return normalizePath(`${this.atlasFolder}/${STORE_PATH_SUFFIX}`);
	}

	async load(): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(this.path);
		if (!(file instanceof TFile)) {
			// Inicializa com defaults
			this.templates = DEFAULT_TEMPLATES.map((t) => ({ ...t }));
			await this.save();
			logger.info(`templates: initialized with ${this.templates.length} defaults`);
			return;
		}
		try {
			const raw = await this.app.vault.read(file);
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				this.templates = parsed;
				logger.info(`templates: loaded ${parsed.length}`);
			} else if (parsed.templates && Array.isArray(parsed.templates)) {
				this.templates = parsed.templates;
			} else {
				this.templates = DEFAULT_TEMPLATES.map((t) => ({ ...t }));
			}
		} catch (e) {
			logger.warn("templates: load falhou", { error: String(e) });
			this.templates = DEFAULT_TEMPLATES.map((t) => ({ ...t }));
		}
	}

	async save(): Promise<void> {
		const json = JSON.stringify({ version: 1, templates: this.templates }, null, 2);
		try {
			const file = this.app.vault.getAbstractFileByPath(this.path);
			if (file instanceof TFile) {
				await this.app.vault.modify(file, json);
			} else {
				// v0.52.4: createFolder pode dar race ("Folder already exists") — try/catch silencia
				if (!this.app.vault.getAbstractFileByPath(this.atlasFolder)) {
					try {
						await this.app.vault.createFolder(this.atlasFolder);
					} catch (folderErr) {
						// folder may exist via race — ignore "already exists" error
						if (!String(folderErr).includes("already exists")) throw folderErr;
					}
				}
				await this.app.vault.create(this.path, json);
			}
			this.dirty = false;
		} catch (e) {
			logger.error("templates: save falhou", { error: String(e) });
		}
	}

	private touch(): void {
		this.dirty = true;
		if (this.flushTimer !== null) clearTimeout(this.flushTimer);
		this.flushTimer = setTimeout(() => void this.save(), 1500);
	}

	list(): AtlasTemplate[] {
		return [...this.templates];
	}

	get(id: string): AtlasTemplate | undefined {
		return this.templates.find((t) => t.id === id);
	}

	upsert(template: AtlasTemplate): void {
		const idx = this.templates.findIndex((t) => t.id === template.id);
		template.updatedAt = new Date().toISOString();
		if (idx >= 0) {
			this.templates[idx] = template;
		} else {
			this.templates.push(template);
		}
		this.touch();
	}

	delete(id: string): boolean {
		const idx = this.templates.findIndex((t) => t.id === id);
		if (idx < 0) return false;
		this.templates.splice(idx, 1);
		this.touch();
		return true;
	}

	resetToDefaults(): void {
		this.templates = DEFAULT_TEMPLATES.map((t) => ({ ...t }));
		this.touch();
	}
}
