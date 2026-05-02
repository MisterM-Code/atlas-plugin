/**
 * Atlas v0.45 E3 — Course Mention Detector.
 *
 * Mirror do SystemDetector pattern. Detecta menções a cursos cadastrados
 * em qualquer texto markdown e atualiza frontmatter `courses: [...]`.
 *
 * Token economy: 100% regex, ZERO LLM calls.
 *
 * Used in 2 contextos:
 *  1. Auto-frontmatter populator (debounced em save) — wired no main.ts
 *  2. Manual scan: command "Atlas: Auto-link cursos mencionados na nota"
 */

import { App, TFile } from "obsidian";
import type AtlasPlugin from "../../main";
import type { CourseT } from "../kg/schemas";
import { isCoachPath } from "../coach/scope";
import { logger } from "../utils/logger";

export interface CourseMention {
	courseId: string;
	courseName: string;
	matchedText: string;
	startOffset: number;
	endOffset: number;
	alreadyLinked: boolean;
	contextSnippet: string;
}

export class CourseDetector {
	constructor(private readonly app: App, private readonly plugin: AtlasPlugin) {}

	/**
	 * Detecta menções num texto. Retorna sem modificar.
	 * Variações comuns: "Curso de X", "no curso X", "X (Coursera)", aliases user-defined.
	 */
	detect(text: string): CourseMention[] {
		const courses = this.plugin.kg.listCourses();
		if (courses.length === 0) return [];

		const mentions: CourseMention[] = [];
		const wikilinkRanges = this.findWikilinkRanges(text);

		for (const course of courses) {
			const targets = [course.name].filter(Boolean);
			for (const target of targets) {
				if (target.length < 3) continue;
				const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				const re = new RegExp(`(?<![\\w])${escaped}(?![\\w])`, "gi");
				let m: RegExpExecArray | null;
				while ((m = re.exec(text)) !== null) {
					const start = m.index;
					const end = start + m[0].length;
					const insideLink = wikilinkRanges.some(([s, e]) => start >= s && end <= e);

					mentions.push({
						courseId: course.id,
						courseName: course.name,
						matchedText: m[0],
						startOffset: start,
						endOffset: end,
						alreadyLinked: insideLink,
						contextSnippet: text.substring(Math.max(0, start - 50), Math.min(text.length, end + 50)),
					});
				}
			}
		}

		return mentions;
	}

	private findWikilinkRanges(text: string): Array<[number, number]> {
		const ranges: Array<[number, number]> = [];
		const re = /\[\[([^\]]+)\]\]/g;
		let m: RegExpExecArray | null;
		while ((m = re.exec(text)) !== null) {
			ranges.push([m.index, m.index + m[0].length]);
		}
		return ranges;
	}

	/**
	 * Sync frontmatter `courses: [...]` non-destructive.
	 * Adiciona courses mentioned se não estiverem listados.
	 */
	async syncFrontmatterCourses(file: TFile, mentions: CourseMention[]): Promise<void> {
		if (mentions.length === 0) return;
		const uniqueCourses = Array.from(new Set(mentions.map((m) => m.courseName)));
		try {
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				const cur = Array.isArray(fm.courses) ? (fm.courses as string[]) : [];
				const merged = [...new Set([...cur, ...uniqueCourses])];
				if (merged.length !== cur.length) {
					fm.courses = merged;
				}
			});
		} catch (e) {
			logger.warn("course-detector: frontmatter update failed", {
				path: file.path,
				error: String(e),
			});
		}
	}

	/** Conveniência: scan + sync em um chamado. */
	async passiveScan(file: TFile): Promise<number> {
		if (isCoachPath(file.path) && !this.plugin.settings.coachMode?.enabled) return 0;
		const text = await this.app.vault.cachedRead(file);
		const mentions = this.detect(text);
		if (mentions.length === 0) return 0;
		await this.syncFrontmatterCourses(file, mentions);
		return mentions.length;
	}

	/**
	 * Scan vault inteiro pra um Course específico (retroativo).
	 * Used quando user cria Course novo — popular notas existentes que mencionam.
	 */
	async scanVaultForCourse(course: CourseT): Promise<number> {
		const targets = [course.name]
			.map((s) => s.trim())
			.filter((s) => s.length >= 3);
		if (targets.length === 0) return 0;

		const allFiles = this.app.vault.getMarkdownFiles();
		let updated = 0;

		for (const file of allFiles) {
			if (isCoachPath(file.path) && !this.plugin.settings.coachMode?.enabled) continue;
			if (file.path === course.notePath) continue;

			let text: string;
			try {
				text = await this.app.vault.cachedRead(file);
			} catch {
				continue;
			}

			let matched = false;
			for (const target of targets) {
				const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				const re = new RegExp(`(?<![\\w])${escaped}(?![\\w])`, "i");
				if (re.test(text)) {
					matched = true;
					break;
				}
			}

			if (matched) {
				try {
					await this.app.fileManager.processFrontMatter(file, (fm) => {
						const cur = Array.isArray(fm.courses) ? (fm.courses as string[]) : [];
						if (!cur.includes(course.name)) {
							fm.courses = [...cur, course.name];
						}
					});
					updated++;
				} catch (e) {
					logger.warn("course-detector: frontmatter update failed", {
						path: file.path,
						error: String(e),
					});
				}
			}
		}

		logger.info("course-detector: scan complete", {
			course: course.name,
			notesUpdated: updated,
		});
		return updated;
	}
}

/**
 * Watcher: hooks vault `modify` event + debounce 30s pra passive scan.
 * Mirror do SystemDetectorWatcher.
 */
export class CourseDetectorWatcher {
	private timers = new Map<string, number>();

	constructor(private readonly app: App, private readonly plugin: AtlasPlugin) {}

	start(): void {
		this.plugin.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (!(file instanceof TFile)) return;
				if (file.extension !== "md") return;

				const existing = this.timers.get(file.path);
				if (existing !== undefined) window.clearTimeout(existing);
				const timer = window.setTimeout(() => {
					void new CourseDetector(this.app, this.plugin).passiveScan(file);
					this.timers.delete(file.path);
				}, 30_000);
				this.timers.set(file.path, timer);
			})
		);
	}

	stop(): void {
		for (const [, t] of this.timers) {
			window.clearTimeout(t);
		}
		this.timers.clear();
	}
}
