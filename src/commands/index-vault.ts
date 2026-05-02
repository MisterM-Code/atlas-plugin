import { Notice, normalizePath, TFile } from "obsidian";
import type AtlasPlugin from "../../main";
import { Indexer, IndexedNote } from "../retrieval/indexer";
import { KGExtractor } from "../kg/extractor";
import { logger } from "../utils/logger";
import { slugify } from "../kg/schemas";

export async function indexVaultCommand(plugin: AtlasPlugin): Promise<void> {
	const settings = plugin.settings;
	const ok = await plugin.ollama.ping();
	if (!ok) {
		new Notice("Atlas: Ollama offline. Inicie o Ollama e tente de novo.");
		return;
	}

	const hasModel = await plugin.ollama.hasModel(settings.ollama.generationModel);
	if (!hasModel) {
		new Notice(
			`Atlas: modelo ${settings.ollama.generationModel} não baixado. Rode \`ollama pull ${settings.ollama.generationModel}\`.`,
			15000
		);
		return;
	}

	const notice = new Notice("Atlas: indexando vault... 0%", 0);
	const startedAt = Date.now();

	try {
		const indexer = new Indexer(plugin.app, [
			settings.folders.atlas,
			"99_Archive",
			".obsidian",
			".trash",
		]);
		const extractor = new KGExtractor(plugin.ollama, settings.ollama.generationModel);

		// Foco em pastas onde a extração estruturada faz sentido
		const targetFolders = [
			settings.folders.daily,
			settings.folders.meetings,
			settings.folders.people,
			settings.folders.projects,
			settings.folders.raid,
			settings.folders.incidents,
		];

		const notes = await indexer.indexVault(targetFolders);
		const total = notes.length;

		if (total === 0) {
			notice.hide();
			new Notice(
				"Atlas: nenhuma nota encontrada nas pastas-alvo. Use 'Atlas: Setup vault' primeiro."
			);
			return;
		}

		// Reset KG: re-builda do zero
		await plugin.kg.load();

		let processed = 0;
		let extracted = 0;

		for (const note of notes) {
			processed++;
			const pct = Math.round((processed / total) * 100);
			notice.setMessage(`Atlas: indexando ${processed}/${total} (${pct}%)`);

			const result = await extractor.extract({
				notePath: note.path,
				frontmatter: note.frontmatter,
				body: note.body,
			});

			if (!result) continue;
			extracted++;

			// Pessoas
			for (const pName of result.people) {
				if (!pName.trim()) continue;
				plugin.kg.upsertPerson({ name: pName.trim() });
			}

			// Sessão (se for 1:1, coaching, meeting, daily)
			let sessionId: string | undefined;
			if (
				result.noteType === "1on1" ||
				result.noteType === "coaching" ||
				result.noteType === "meeting"
			) {
				const personName = (note.frontmatter.person ?? note.frontmatter.coachee) as
					| string
					| undefined;
				const personId = personName
					? plugin.kg.findPersonByName(personName)?.id
					: undefined;
				const date =
					(note.frontmatter.date as string) ??
					new Date(note.mtime).toISOString().split("T")[0];

				sessionId = `${slugify(note.path)}`;
				plugin.kg.upsertSession({
					id: sessionId,
					date,
					type: result.noteType === "1on1" ? "1on1" : result.noteType === "coaching" ? "coaching" : "other",
					personId,
					participantIds: [],
					framework: (note.frontmatter.framework as "GROW" | "CLEAR" | undefined) ?? "adhoc",
					topics: [],
					decisions: result.decisions.map((d) => d.text),
					sourceNotePath: note.path,
					confidential: result.noteType === "coaching",
				});
			}

			// Action items
			for (const ai of result.actionItems) {
				const ownerId = ai.ownerName
					? ai.ownerName.toLowerCase() === "eu"
						? "eu"
						: plugin.kg.findPersonByName(ai.ownerName)?.id
					: undefined;
				const id = `${slugify(note.path)}-ai-${slugify(ai.description.substring(0, 30))}`;
				plugin.kg.upsertActionItem({
					id,
					description: ai.description,
					ownerId,
					status: "open",
					priority: ai.priority,
					sessionId,
					sourceNotePath: note.path,
				});
			}

			// Commitments
			for (const c of result.commitments) {
				const madeBy =
					c.madeByName.toLowerCase() === "eu"
						? "eu"
						: plugin.kg.findPersonByName(c.madeByName)?.id ?? slugify(c.madeByName);
				const madeTo =
					c.madeToName.toLowerCase() === "eu"
						? "eu"
						: plugin.kg.findPersonByName(c.madeToName)?.id ?? slugify(c.madeToName);
				const id = `${slugify(note.path)}-com-${slugify(c.text.substring(0, 30))}`;
				plugin.kg.upsertCommitment({
					id,
					text: c.text,
					madeBy,
					madeTo,
					status: "open",
					weight: c.weight,
					sessionId,
					sourceNotePath: note.path,
				});
			}

			// Themes
			for (const t of result.themes) {
				const personId = note.frontmatter.person
					? plugin.kg.findPersonByName(note.frontmatter.person as string)?.id
					: undefined;
				plugin.kg.upsertTheme({
					name: t.name,
					sentiment: t.sentiment,
					scope: personId ? "pessoa" : "time",
					personId,
					sessionId,
				});
			}
		}

		await plugin.kg.save();
		notice.hide();

		const seconds = Math.round((Date.now() - startedAt) / 1000);
		new Notice(
			`Atlas: indexação completa. ${extracted}/${total} notas processadas em ${seconds}s. KG: ${plugin.kg.data.people.length} pessoas, ${plugin.kg.data.sessions.length} sessões, ${plugin.kg.data.actionItems.length} actions.`,
			10000
		);
		logger.info("indexação completa", {
			total,
			extracted,
			seconds,
			people: plugin.kg.data.people.length,
		});
	} catch (e) {
		notice.hide();
		new Notice(`Atlas: erro na indexação — ${String(e)}`, 10000);
		logger.error("indexação falhou", { error: String(e) });
	}
}
