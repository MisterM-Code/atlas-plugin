import { App, Notice, TFolder } from "obsidian";
import type AtlasPlugin from "../../main";

export async function setupVaultStructure(plugin: AtlasPlugin): Promise<void> {
	const app = plugin.app;
	const f = plugin.settings.folders;

	const allFolders = [
		"00_System/Templates",
		"00_System/Settings",
		f.inbox,
		f.daily,
		f.meetings,
		`${f.meetings}/1on1`,
		`${f.meetings}/all-hands`,
		`${f.meetings}/stakeholder-calls`,
		f.projects,
		f.reports,
		`${f.reports}/weekly`,
		`${f.reports}/monthly`,
		`${f.reports}/quarterly`,
		f.people,
		f.raid,
		`${f.raid}/risks`,
		`${f.raid}/issues`,
		`${f.raid}/decisions`,
		f.incidents,
		f.knowledge,
		`${f.knowledge}/adrs`,
		`${f.knowledge}/runbooks`,
		f.compliance,
		f.metrics,
		f.studies,
		`${f.studies}/courses`,
		`${f.studies}/papers`,
		`${f.studies}/flashcards`,
		f.themes,
		f.archive,
		f.atlas,
		`${f.atlas}/embeddings`,
	];

	let created = 0;
	for (const folderPath of allFolders) {
		const exists = app.vault.getAbstractFileByPath(folderPath);
		if (!exists) {
			try {
				await app.vault.createFolder(folderPath);
				created++;
			} catch (e) {
				console.warn(`Atlas: falhou criar ${folderPath}`, e);
			}
		} else if (!(exists instanceof TFolder)) {
			console.warn(`Atlas: ${folderPath} existe mas não é pasta.`);
		}
	}

	plugin.settings.vaultStructureCreated = true;
	await plugin.saveSettings();

	new Notice(`Atlas: ${created} pastas criadas. Vault pronto.`);
}
