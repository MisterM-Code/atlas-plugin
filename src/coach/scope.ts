/**
 * Atlas Mode: "work" vs "coach".
 *
 * Princípio LGPD/ICF: dados de coachees NUNCA aparecem em queries
 * do contexto de trabalho. Vice-versa: notas de trabalho não poluem
 * sessões de coach.
 *
 * Isolation runtime — toda função que faz query no vault ou KG deve
 * passar pelo `applyScope()` antes de retornar.
 */

export type AtlasMode = "work" | "coach";

export interface ScopeConfig {
	currentMode: AtlasMode;
	coachFolderPrefixes: string[]; // ex: "09_Coaching", "Coaching/"
	workExcludeFolders: string[]; // built from coach prefixes
	auditAccessToCoach: boolean;
}

let currentScope: ScopeConfig = {
	currentMode: "work",
	coachFolderPrefixes: ["09_Coaching", "Coaching"],
	workExcludeFolders: ["09_Coaching", "Coaching"],
	auditAccessToCoach: true,
};

export function setMode(mode: AtlasMode): void {
	currentScope.currentMode = mode;
}

export function getMode(): AtlasMode {
	return currentScope.currentMode;
}

export function configureCoachScope(opts: Partial<ScopeConfig>): void {
	currentScope = { ...currentScope, ...opts };
	if (opts.coachFolderPrefixes) {
		currentScope.workExcludeFolders = [...opts.coachFolderPrefixes];
	}
}

export function getScope(): ScopeConfig {
	return { ...currentScope };
}

/** Returns true if path belongs to coach domain. */
export function isCoachPath(path: string): boolean {
	return currentScope.coachFolderPrefixes.some(
		(p) => path === p || path.startsWith(p + "/")
	);
}

/** Filter notes/chunks/sessions to current scope. */
export function applyScope<T extends { sourceNotePath?: string; notePath?: string; path?: string }>(
	items: T[]
): T[] {
	const mode = currentScope.currentMode;
	return items.filter((it) => {
		const p = it.sourceNotePath ?? it.notePath ?? it.path;
		if (!p) return true;
		const inCoach = isCoachPath(p);
		return mode === "coach" ? inCoach : !inCoach;
	});
}

/** Folders to exclude from indexing in current scope. */
export function getExcludedFolders(): string[] {
	return currentScope.currentMode === "work" ? [...currentScope.workExcludeFolders] : [];
}

/** Folders to include exclusively. */
export function getInclusiveFolders(): string[] | null {
	return currentScope.currentMode === "coach" ? [...currentScope.coachFolderPrefixes] : null;
}
