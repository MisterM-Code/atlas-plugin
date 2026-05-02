/**
 * Atlas Rule Engine — declarative rules for auto-organization.
 *
 * User defines rules em settings. Atlas aplica em save (passive)
 * ou em batch (manual command).
 *
 * Cada rule: condition (frontmatter type/tag/folder/age) + action (move/tag/archive/notify).
 */

import { App, TFile, Notice, normalizePath } from "obsidian";
import { logger } from "../utils/logger";
import { isCoachPath } from "../coach/scope";
import type AtlasPlugin from "../../main";

export interface RuleCondition {
	type?: string; // frontmatter.type matches
	tag?: string; // has tag (in frontmatter or inline)
	folder?: string; // file path starts with
	olderThanDays?: number; // mtime older than N days
	noBacklinks?: boolean; // 0 backlinks
	titleEmpty?: boolean; // title vazio (sem # heading)
}

export type RuleAction =
	| { kind: "move"; targetFolder: string; preserveSubpath?: boolean }
	| { kind: "addTag"; tag: string }
	| { kind: "removeTag"; tag: string }
	| { kind: "archive"; archiveFolder?: string }
	| { kind: "notify"; message: string };

export interface AtlasRule {
	id: string;
	name: string;
	description?: string;
	enabled: boolean;
	conditions: RuleCondition;
	action: RuleAction;
	mode: "auto" | "suggest"; // auto applies silently, suggest = Notice
}

export const DEFAULT_RULES: AtlasRule[] = [
	{
		id: "1on1-route",
		name: "1:1s vão para 03_Meetings/1on1",
		description: "Notas com type=1on1 são movidas automaticamente.",
		enabled: true,
		conditions: { type: "1on1" },
		action: { kind: "move", targetFolder: "03_Meetings/1on1" },
		mode: "suggest",
	},
	{
		id: "coaching-route",
		name: "Sessões de coaching para vault de coaching",
		description: "Notas com type=coaching-session vão para vault de coaching.",
		enabled: true,
		conditions: { type: "coaching-session" },
		action: { kind: "move", targetFolder: "09_Coaching/coachees" },
		mode: "suggest",
	},
	{
		id: "paper-route",
		name: "Papers para 12_Studies/papers",
		enabled: true,
		conditions: { type: "paper" },
		action: { kind: "move", targetFolder: "12_Studies/papers" },
		mode: "suggest",
	},
	{
		id: "incident-route",
		name: "Incidentes para 08_Incidents",
		enabled: true,
		conditions: { type: "postmortem" },
		action: { kind: "move", targetFolder: "08_Incidents" },
		mode: "suggest",
	},
	{
		id: "raid-route",
		name: "RAID entries para 07_RAID",
		enabled: true,
		conditions: { type: "raid" },
		action: { kind: "move", targetFolder: "07_RAID" },
		mode: "suggest",
	},
	{
		id: "stale-archive",
		name: "Arquivar notas inativas há 6+ meses",
		description: "Move notas em 01_Inbox sem mexer há 180d para 99_Archive.",
		enabled: false, // opt-in, é destrutivo
		conditions: { folder: "01_Inbox", olderThanDays: 180 },
		action: { kind: "archive", archiveFolder: "99_Archive" },
		mode: "suggest",
	},
];

export interface RuleMatch {
	rule: AtlasRule;
	file: TFile;
	preview: string; // descrição do que vai acontecer
}

export class RuleEngine {
	constructor(private app: App, private plugin: AtlasPlugin) {}

	get rules(): AtlasRule[] {
		return this.plugin.settings.rules ?? DEFAULT_RULES;
	}

	async setRules(rules: AtlasRule[]): Promise<void> {
		this.plugin.settings.rules = rules;
		await this.plugin.saveSettings();
	}

	/**
	 * Avalia regras em um arquivo. Retorna matches (sem aplicar).
	 */
	async evaluate(file: TFile): Promise<RuleMatch[]> {
		if (file.extension !== "md") return [];
		// Skip coach paths se não estiver em modo coach
		if (isCoachPath(file.path)) return [];

		const matches: RuleMatch[] = [];
		const cache = this.app.metadataCache.getFileCache(file);
		const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;

		for (const rule of this.rules) {
			if (!rule.enabled) continue;
			if (!(await this.matchesConditions(file, fm, rule.conditions))) continue;

			const preview = this.previewAction(file, rule.action);
			if (!preview) continue;
			matches.push({ rule, file, preview });
		}
		return matches;
	}

	/**
	 * Avalia em todos arquivos do vault. Util para batch.
	 */
	async evaluateVault(): Promise<RuleMatch[]> {
		const all: RuleMatch[] = [];
		const files = this.app.vault.getMarkdownFiles();
		for (const f of files) {
			if (f.path.startsWith(".atlas")) continue;
			const m = await this.evaluate(f);
			all.push(...m);
		}
		return all;
	}

	/**
	 * Aplica match (move/tag/archive). Retorna descrição do que mudou.
	 */
	async apply(match: RuleMatch): Promise<string> {
		const { rule, file } = match;
		const action = rule.action;

		try {
			switch (action.kind) {
				case "move": {
					const newPath = this.computeMovePath(file, action);
					if (newPath === file.path) return "(já está no destino)";
					await this.ensureFolder(action.targetFolder);
					await this.app.fileManager.renameFile(file, newPath);
					await this.plugin.auditLog({
						action: "rule.applied",
						rule: rule.id,
						kind: "move",
						from: file.path,
						to: newPath,
					});
					return `movido para ${newPath}`;
				}

				case "addTag": {
					await this.app.fileManager.processFrontMatter(file, (fm) => {
						const cur: string[] = Array.isArray(fm.tags) ? fm.tags : [];
						if (!cur.includes(action.tag)) cur.push(action.tag);
						fm.tags = cur;
					});
					return `tag #${action.tag} adicionada`;
				}

				case "removeTag": {
					await this.app.fileManager.processFrontMatter(file, (fm) => {
						if (Array.isArray(fm.tags)) {
							fm.tags = fm.tags.filter((t: string) => t !== action.tag);
						}
					});
					return `tag #${action.tag} removida`;
				}

				case "archive": {
					const archiveFolder = action.archiveFolder ?? "99_Archive";
					const year = new Date(file.stat.mtime).getFullYear();
					const newPath = normalizePath(`${archiveFolder}/${year}/${file.name}`);
					await this.ensureFolder(`${archiveFolder}/${year}`);
					await this.app.fileManager.renameFile(file, newPath);
					return `arquivado em ${newPath}`;
				}

				case "notify": {
					new Notice(`Atlas: ${action.message} — ${file.path}`, 8000);
					return `notificado`;
				}
			}
		} catch (e) {
			logger.warn("rule-engine: apply falhou", { rule: rule.id, error: String(e) });
			return `erro: ${String(e)}`;
		}
		return "(sem ação)";
	}

	async applyAll(matches: RuleMatch[]): Promise<{ applied: number; failed: number }> {
		let applied = 0;
		let failed = 0;
		for (const m of matches) {
			try {
				await this.apply(m);
				applied++;
			} catch {
				failed++;
			}
		}
		return { applied, failed };
	}

	// ─── Helpers ───

	private async matchesConditions(
		file: TFile,
		fm: Record<string, unknown>,
		cond: RuleCondition
	): Promise<boolean> {
		if (cond.type !== undefined) {
			const fmType = String(fm.type ?? "");
			if (fmType !== cond.type) return false;
		}
		if (cond.folder !== undefined) {
			if (!file.path.startsWith(cond.folder)) return false;
		}
		if (cond.olderThanDays !== undefined) {
			const ageMs = Date.now() - file.stat.mtime;
			if (ageMs < cond.olderThanDays * 86_400_000) return false;
		}
		if (cond.tag !== undefined) {
			const fmTags = Array.isArray(fm.tags) ? (fm.tags as string[]) : [];
			if (!fmTags.includes(cond.tag)) {
				// also check inline tags
				try {
					const raw = await this.app.vault.read(file);
					if (!new RegExp(`#${cond.tag}\\b`).test(raw)) return false;
				} catch {
					return false;
				}
			}
		}
		if (cond.noBacklinks === true) {
			const cache = this.app.metadataCache as unknown as {
				getBacklinksForFile?: (file: TFile) => { data: Map<string, unknown> };
			};
			const r = cache.getBacklinksForFile?.(file);
			if (r?.data && r.data.size > 0) return false;
		}
		if (cond.titleEmpty === true) {
			try {
				const raw = await this.app.vault.read(file);
				if (/^#\s+\S/m.test(raw)) return false;
			} catch {
				return false;
			}
		}
		return true;
	}

	private previewAction(file: TFile, action: RuleAction): string | null {
		switch (action.kind) {
			case "move": {
				const newPath = this.computeMovePath(file, action);
				if (newPath === file.path) return null;
				return `mover para ${newPath}`;
			}
			case "addTag":
				return `adicionar tag #${action.tag}`;
			case "removeTag":
				return `remover tag #${action.tag}`;
			case "archive":
				return `arquivar em ${action.archiveFolder ?? "99_Archive"}`;
			case "notify":
				return `notificar: "${action.message}"`;
		}
	}

	private computeMovePath(file: TFile, action: { kind: "move"; targetFolder: string; preserveSubpath?: boolean }): string {
		const subpath = action.preserveSubpath ? file.parent?.path?.replace(/^[^/]+/, "") ?? "" : "";
		const dir = subpath
			? normalizePath(`${action.targetFolder}/${subpath}`)
			: action.targetFolder;
		return normalizePath(`${dir}/${file.name}`);
	}

	private async ensureFolder(folder: string): Promise<void> {
		const parts = folder.split("/").filter(Boolean);
		let cur = "";
		for (const p of parts) {
			cur = cur ? `${cur}/${p}` : p;
			if (!this.app.vault.getAbstractFileByPath(cur)) {
				try {
					await this.app.vault.createFolder(cur);
				} catch {
					// race
				}
			}
		}
	}
}
