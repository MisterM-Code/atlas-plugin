/**
 * v0.63.0 — Conflict resolver para Vault Importer.
 */

import type { App } from "obsidian";

/**
 * Resolve duplicate filename: nota.md → nota-imported-1.md, -imported-2.md, etc.
 * Stops at first available path.
 */
export async function resolveDuplicate(app: App, targetPath: string): Promise<string> {
	const exists = await app.vault.adapter.exists(targetPath);
	if (!exists) return targetPath;

	const dotIdx = targetPath.lastIndexOf(".");
	const base = dotIdx > 0 ? targetPath.slice(0, dotIdx) : targetPath;
	const ext = dotIdx > 0 ? targetPath.slice(dotIdx) : "";
	for (let i = 1; i < 1000; i += 1) {
		const candidate = `${base}-imported-${i}${ext}`;
		// eslint-disable-next-line no-await-in-loop
		if (!(await app.vault.adapter.exists(candidate))) return candidate;
	}
	throw new Error(`resolveDuplicate: 1000 collisions for ${targetPath}`);
}

/**
 * Mark broken wikilinks com comment HTML (preserva texto original).
 * Ex: `[[Foo Bar]]` no body que não resolve → adiciona no fim:
 *   `<!-- ATLAS_BROKEN_LINK: original=[[Foo Bar]] reason=external -->`
 */
export function markBrokenLink(body: string, link: string, reason = "external"): string {
	const marker = `<!-- ATLAS_BROKEN_LINK: original=[[${link}]] reason=${reason} -->`;
	if (body.includes(marker)) return body; // idempotent
	const trimmed = body.trimEnd();
	return `${trimmed}\n\n${marker}\n`;
}

/**
 * Detect wikilinks no body que NÃO resolvem em nenhum file do vault.
 * Returns list of broken link targets (sem brackets).
 */
export function detectBrokenLinks(app: App, body: string): string[] {
	const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
	const broken: string[] = [];
	const seen = new Set<string>();
	let m;
	while ((m = re.exec(body)) !== null) {
		const target = m[1].trim();
		if (seen.has(target)) continue;
		seen.add(target);
		// Tries plain target.md or target.md path resolution
		const file = app.metadataCache.getFirstLinkpathDest(target, "");
		if (!file) broken.push(target);
	}
	return broken;
}

/**
 * Archive on collision: se path já existe e é mesmo conteúdo, archiva em
 * `99_Archive/imported-YYYY-MM-DD/`. Senão, fallback resolveDuplicate.
 */
export function archivePathForCollision(originalRelative: string): string {
	const today = new Date().toISOString().slice(0, 10);
	return `99_Archive/imported-${today}/${originalRelative}`;
}
