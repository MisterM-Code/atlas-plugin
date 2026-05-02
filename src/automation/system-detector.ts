/**
 * Atlas v0.5 Sprint 7 — System Mention Detector.
 *
 * Detecta menções a sistemas cadastrados em qualquer texto markdown.
 * Funciona via regex word-boundary contra `system.name + system.aliases`.
 *
 * Usado em 3 contextos:
 *  1. Auto-frontmatter populator (debounced em save)
 *  2. Auto-link command (varre nota, substitui matches por [[Sistema: X]])
 *  3. Score de relevância pra reports compostos (sistemas mencionados na semana)
 */

import { App, TFile, Notice } from "obsidian";
import type AtlasPlugin from "../../main";
import type { SystemT } from "../kg/schemas";
import { isCoachPath } from "../coach/scope";
import { logger } from "../utils/logger";

export interface SystemMention {
	systemId: string;
	systemName: string;
	matchedText: string; // texto literal que casou (pode ser alias)
	startOffset: number; // posição no texto (raw)
	endOffset: number;
	alreadyLinked: boolean; // se está dentro de [[...]]
	contextSnippet: string;
}

export class SystemDetector {
	constructor(private app: App, private plugin: AtlasPlugin) {}

	/**
	 * Detecta menções num texto. Retorna sem modificar nada.
	 */
	detect(text: string): SystemMention[] {
		const systems = this.plugin.kg.listSystems();
		if (systems.length === 0) return [];

		const mentions: SystemMention[] = [];
		const wikilinkRanges = this.findWikilinkRanges(text);

		for (const sys of systems) {
			const targets = [sys.name, ...sys.aliases].filter(Boolean);
			for (const target of targets) {
				if (target.length < 2) continue;
				const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				// Word boundary funciona pra ASCII. Pra siglas como "PIX" funciona ok.
				// Pra nomes compostos ("App Bradesco") usamos boundary alternativo.
				const flags = "gi";
				const re = new RegExp(
					/^[A-Z]{2,}$/.test(target) ? `\\b${escaped}\\b` : `(?<![\\w])${escaped}(?![\\w])`,
					flags
				);
				let m: RegExpExecArray | null;
				while ((m = re.exec(text)) !== null) {
					const start = m.index;
					const end = start + m[0].length;
					const insideLink = wikilinkRanges.some(
						([s, e]) => start >= s && end <= e
					);
					mentions.push({
						systemId: sys.id,
						systemName: sys.name,
						matchedText: m[0],
						startOffset: start,
						endOffset: end,
						alreadyLinked: insideLink,
						contextSnippet: this.sliceContext(text, start, end),
					});
				}
			}
		}

		// Dedup por (systemId, startOffset)
		const seen = new Set<string>();
		return mentions.filter((m) => {
			const key = `${m.systemId}-${m.startOffset}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	}

	private findWikilinkRanges(text: string): [number, number][] {
		const ranges: [number, number][] = [];
		const re = /\[\[[^\]]+\]\]/g;
		let m: RegExpExecArray | null;
		while ((m = re.exec(text)) !== null) {
			ranges.push([m.index, m.index + m[0].length]);
		}
		return ranges;
	}

	private sliceContext(text: string, start: number, end: number, pad = 40): string {
		const lo = Math.max(0, start - pad);
		const hi = Math.min(text.length, end + pad);
		let snippet = text.substring(lo, hi).replace(/\s+/g, " ").trim();
		if (lo > 0) snippet = "…" + snippet;
		if (hi < text.length) snippet += "…";
		return snippet;
	}

	/**
	 * Atualiza frontmatter da nota com lista de sistemas mencionados.
	 * Não-destrutivo: preserva campos existentes, só atualiza `systems: [...]`.
	 */
	async syncFrontmatterSystems(file: TFile, mentions: SystemMention[]): Promise<{ added: string[]; total: number }> {
		const uniqueSystems = Array.from(new Set(mentions.map((m) => m.systemName))).sort();
		let added: string[] = [];

		try {
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				const existing: string[] = Array.isArray(fm.systems)
					? (fm.systems as string[]).map(String)
					: [];
				const merged = Array.from(new Set([...existing, ...uniqueSystems])).sort();
				added = merged.filter((s) => !existing.includes(s));
				if (added.length > 0 || merged.length !== existing.length) {
					fm.systems = merged;
				}
			});
		} catch (e) {
			logger.warn("system-detector: frontmatter update falhou", { error: String(e) });
		}

		return { added, total: uniqueSystems.length };
	}

	/**
	 * Substitui menções não-linkadas por [[Sistema: X]].
	 * Trabalha com offsets em ordem reversa pra não invalidar índices.
	 */
	autoLinkMentions(text: string, mentions: SystemMention[], systemNotePathMap: Map<string, string>): string {
		const toReplace = mentions
			.filter((m) => !m.alreadyLinked)
			.sort((a, b) => b.startOffset - a.startOffset);

		let result = text;
		for (const m of toReplace) {
			const sysPath = systemNotePathMap.get(m.systemId);
			if (!sysPath) continue;
			// Use só nome no display: [[caminho|Nome]]
			const link = `[[${sysPath.replace(/\.md$/, "")}|${m.matchedText}]]`;
			result = result.substring(0, m.startOffset) + link + result.substring(m.endOffset);
		}
		return result;
	}

	/**
	 * Auto-detecta + atualiza frontmatter de uma nota (sem inserir links no body).
	 * Versão "passive" — chamada em hook de save com debounce.
	 */
	async passiveScan(file: TFile): Promise<{ changed: boolean; added: string[] }> {
		if (file.extension !== "md") return { changed: false, added: [] };
		if (file.path.startsWith(".atlas")) return { changed: false, added: [] };
		if (isCoachPath(file.path)) return { changed: false, added: [] };

		try {
			const text = await this.app.vault.read(file);
			const mentions = this.detect(text);
			if (mentions.length === 0) return { changed: false, added: [] };

			const r = await this.syncFrontmatterSystems(file, mentions);
			return { changed: r.added.length > 0, added: r.added };
		} catch (e) {
			logger.warn("system-detector: passiveScan falhou", { error: String(e) });
			return { changed: false, added: [] };
		}
	}
}

/**
 * Registra hook de auto-detection com debounce (30s after last edit).
 */
export class SystemDetectorWatcher {
	private debouncers = new Map<string, ReturnType<typeof setTimeout>>();
	private detector: SystemDetector;

	constructor(private plugin: AtlasPlugin) {
		this.detector = new SystemDetector(plugin.app, plugin);
	}

	register(register: (cleanup: () => void) => void): () => void {
		const handler = (file: TFile) => {
			if (!(file instanceof TFile)) return;
			if (file.extension !== "md") return;
			// Skip systems folder (a própria nota do sistema seria recursivo)
			if (file.path.startsWith(`${this.plugin.settings.folders.projects}/systems`)) return;

			const existing = this.debouncers.get(file.path);
			if (existing) clearTimeout(existing);

			const t = setTimeout(() => {
				this.debouncers.delete(file.path);
				void this.processFile(file);
			}, 30000);

			this.debouncers.set(file.path, t);
		};

		const ref = this.plugin.app.vault.on("modify", handler);

		const cleanup = () => {
			this.plugin.app.vault.offref(ref);
			for (const t of this.debouncers.values()) clearTimeout(t);
			this.debouncers.clear();
		};
		register(cleanup);
		return cleanup;
	}

	private async processFile(file: TFile): Promise<void> {
		const r = await this.detector.passiveScan(file);
		if (!r.changed || r.added.length === 0) return;

		// Subtle notice se nota ativa
		const active = this.plugin.app.workspace.getActiveFile();
		if (active?.path === file.path) {
			new Notice(
				`🖥️ Atlas: detectados ${r.added.length} sistema(s): ${r.added.join(", ")}`,
				5000
			);
		}
		this.plugin.gainXp("system-detected", 5);
	}

	/** Manual scan immediate de um arquivo. */
	async scanNow(file: TFile): Promise<{ changed: boolean; added: string[] }> {
		const old = this.debouncers.get(file.path);
		if (old) clearTimeout(old);
		this.debouncers.delete(file.path);
		return await this.detector.passiveScan(file);
	}

	get core(): SystemDetector {
		return this.detector;
	}
}
