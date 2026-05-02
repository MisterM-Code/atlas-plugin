import { App, Notice, TFolder, normalizePath } from "obsidian";
import { setMode, getMode, configureCoachScope } from "./scope";
import type AtlasPlugin from "../../main";

export const COACH_FOLDER_DEFAULT = "09_Coaching";

export async function initializeCoachFolders(plugin: AtlasPlugin): Promise<void> {
	const folder = plugin.settings.coachMode.separateVaultPath || COACH_FOLDER_DEFAULT;

	// Ensure coach folder exists with subfolders
	const subFolders = ["coachees", "templates", "_index"];
	for (const sub of subFolders) {
		const path = normalizePath(`${folder}/${sub}`);
		const existing = plugin.app.vault.getAbstractFileByPath(path);
		if (!existing) {
			try {
				await plugin.app.vault.createFolder(path);
			} catch {
				// already exists race
			}
		} else if (!(existing instanceof TFolder)) {
			console.warn(`Atlas: ${path} existe mas não é pasta`);
		}
	}

	configureCoachScope({
		coachFolderPrefixes: [folder],
		workExcludeFolders: [folder],
		auditAccessToCoach: true,
	});
}

export async function toggleCoachMode(plugin: AtlasPlugin): Promise<void> {
	const current = getMode();
	const next = current === "work" ? "coach" : "work";
	setMode(next);

	await plugin.auditLog({
		action: "coach.mode.changed",
		from: current,
		to: next,
	});

	plugin.updateStatusBar?.();

	if (next === "coach") {
		new Notice(
			"🔒 Atlas: COACH MODE ativo.\nNotas de coachees são confidenciais.\nDados de trabalho ficam invisíveis.",
			8000
		);
	} else {
		new Notice("💼 Atlas: WORK MODE ativo.\nDados de coaching ficam invisíveis.", 6000);
	}
}

export function getModeLabel(): string {
	return getMode() === "coach" ? "🔒 Coach Mode" : "💼 Work Mode";
}
