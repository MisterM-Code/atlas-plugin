/**
 * Atlas v0.44 E7 — Person Mention Detector (retroativo).
 *
 * Quando user cria/atualiza Person nova, varre vault em busca de menções
 * existentes (regex word-boundary com aliases) e atualiza frontmatter
 * `participants: [PersonName]` (merge non-destructive).
 *
 * Mirror do pattern em system-detector.ts mas focado em People.
 *
 * Token economy: 100% regex, ZERO LLM calls. Roda em background async.
 */

import { App, TFile } from "obsidian";
import type AtlasPlugin from "../../main";
import type { PersonT } from "../kg/schemas";
import { isCoachPath } from "../coach/scope";
import { logger } from "../utils/logger";

export interface PersonMatch {
	notePath: string;
	matchedTexts: string[]; // siglas/aliases that matched
}

export class PersonMentionDetector {
	constructor(private app: App, private plugin: AtlasPlugin) {}

	/**
	 * Varre vault inteiro em busca de menções à pessoa fornecida.
	 * Retorna paths das notas que mencionam (não-linkado).
	 *
	 * Usado quando user cria/atualiza Person — popula automaticamente
	 * timeline de menções históricas.
	 */
	async scanVaultForPerson(person: PersonT): Promise<PersonMatch[]> {
		const targets = [person.name, ...(person.aliases ?? [])]
			.map((s) => s.trim())
			.filter((s) => s.length >= 2);

		if (targets.length === 0) return [];

		const matches: PersonMatch[] = [];
		const allFiles = this.app.vault.getMarkdownFiles();

		for (const file of allFiles) {
			// Skip coach-private notes (LGPD): if note is in coach folder, only scan if Atlas is in coach mode
			const inCoachFolder = isCoachPath(file.path);
			const coachModeOn = !!this.plugin.settings.coachMode?.enabled;
			if (inCoachFolder && !coachModeOn) continue;
			// Skip person's own note (avoid self-reference)
			if (file.path === person.notePath) continue;

			let text: string;
			try {
				text = await this.app.vault.cachedRead(file);
			} catch {
				continue;
			}

			const matchedTexts: string[] = [];
			for (const target of targets) {
				const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				// Lookbehind/ahead pra word boundary unicode-aware (PT-BR)
				const re = new RegExp(`(?<![\\w])${escaped}(?![\\w])`, "i");
				if (re.test(text)) {
					matchedTexts.push(target);
				}
			}

			if (matchedTexts.length > 0) {
				matches.push({ notePath: file.path, matchedTexts });
			}
		}

		logger.info("person-detector: scan complete", {
			person: person.name,
			notesMatched: matches.length,
		});
		return matches;
	}

	/**
	 * Adiciona Person ao frontmatter `participants` das notas matched.
	 * Non-destructive merge: preserva participants existentes.
	 *
	 * Returns count of files updated.
	 */
	async backlinkInFrontmatter(person: PersonT, matches: PersonMatch[]): Promise<number> {
		let updated = 0;

		for (const match of matches) {
			const file = this.app.vault.getAbstractFileByPath(match.notePath);
			if (!(file instanceof TFile)) continue;

			try {
				await this.app.fileManager.processFrontMatter(file, (fm) => {
					const cur = Array.isArray(fm.participants) ? (fm.participants as string[]) : [];
					if (!cur.includes(person.name)) {
						fm.participants = [...cur, person.name];
					}
				});
				updated++;
			} catch (e) {
				logger.warn("person-detector: frontmatter update failed", {
					path: match.notePath,
					error: String(e),
				});
			}
		}

		return updated;
	}

	/**
	 * Conveniência: scan + backlink em um chamado.
	 * Retorna número de notas linkadas.
	 */
	async scanAndLink(person: PersonT): Promise<number> {
		const matches = await this.scanVaultForPerson(person);
		if (matches.length === 0) return 0;
		return this.backlinkInFrontmatter(person, matches);
	}
}
