import { TFile } from "obsidian";
import type AtlasPlugin from "../../../main";
import { renderSubTabBar, SubTabDef } from "../../ui/sub-tab-bar";
import { renderStudyCourses } from "./study-sub/courses";

type StudySubId = "flashcards" | "courses" | "papers";

/**
 * 🃏 Study tab — flashcards + cursos + papers em sub-tabs.
 */
export async function renderStudyTab(container: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	container.empty();

	const header = container.createDiv();
	header.style.marginBottom = "10px";
	header.createEl("h3", { text: "🃏 Study" }).style.margin = "0 0 4px 0";

	const subs: SubTabDef<StudySubId>[] = [
		{
			id: "flashcards",
			icon: "🃏",
			label: "Flashcards",
			description: "Spaced repetition FSRS · gerar / revisar / exportar",
			badge: () => {
				const due = plugin.flashcards?.dueToday().length ?? 0;
				return due > 0 ? String(due) : null;
			},
			render: (c) => renderStudyFlashcards(c, plugin),
		},
		{
			id: "courses",
			icon: "🎓",
			label: "Cursos",
			description: "Course Manager: módulos, progresso, takeaways, certificado",
			badge: () => {
				const active = plugin.kg.listCourses().filter((co) => co.status === "active").length;
				return active > 0 ? String(active) : null;
			},
			render: (c) => renderStudyCourses(c, plugin),
		},
		{
			id: "papers",
			icon: "📄",
			label: "Papers",
			description: "Papers timeline · Zotero pipeline · flashcards extraídos",
			render: (c) => renderStudyPapers(c, plugin),
		},
	];

	renderSubTabBar(container, subs, {
		storageKey: "atlas-study-subtab",
		defaultId: "flashcards",
	});
}

async function renderStudyFlashcards(container: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	container.empty();

	const stats = plugin.flashcards?.stats() ?? { total: 0, due: 0, new: 0, learning: 0, review: 0 };

	const headerStats = container.createDiv();
	headerStats.style.fontSize = "11px";
	headerStats.style.opacity = "0.6";
	headerStats.style.marginBottom = "8px";
	headerStats.setText(`${stats.total} cards · ${stats.due} a revisar · ${stats.new} novos`);

	const statsGrid = container.createDiv();
	statsGrid.style.display = "grid";
	statsGrid.style.gridTemplateColumns = "repeat(4, 1fr)";
	statsGrid.style.gap = "6px";
	statsGrid.style.marginBottom = "12px";

	statCard(statsGrid, "Total", String(stats.total));
	statCard(
		statsGrid,
		"Due",
		String(stats.due),
		stats.due > 0 ? "var(--color-orange)" : undefined
	);
	statCard(statsGrid, "Novos", String(stats.new));
	statCard(statsGrid, "Review", String(stats.review));

	const qaBar = container.createDiv();
	qaBar.style.display = "grid";
	qaBar.style.gridTemplateColumns = "1fr 1fr";
	qaBar.style.gap = "6px";
	qaBar.style.marginBottom = "12px";

	const qa = (icon: string, label: string, cmd: string, primary = false) => {
		const b = qaBar.createEl("button", { text: `${icon} ${label}` });
		b.style.padding = "8px";
		b.style.fontSize = "12px";
		b.style.cursor = "pointer";
		if (primary) b.addClass("mod-cta");
		b.addEventListener("click", () => {
			const apiAny = plugin.app as unknown as {
				commands?: { executeCommandById?: (id: string) => void };
			};
			apiAny.commands?.executeCommandById?.(`atlas:${cmd}`);
		});
	};

	qa("▶️", `Revisar ${stats.due} agora`, "atlas-flashcards-review", stats.due > 0);
	qa("🤖", "Gerar desta nota", "atlas-flashcards-from-note");
	qa("🎓", "Feynman check", "atlas-socratic");
	qa("📥", "Export Anki", "atlas-flashcards-export-anki");

	// Decks list (por source)
	const allCards = plugin.flashcards?.allCards() ?? [];
	const decks = new Map<string, number>();
	for (const c of allCards) {
		const key = (c.sourceNotePath ?? "?").split("/").pop()?.replace(/\.md$/, "") ?? "?";
		decks.set(key, (decks.get(key) ?? 0) + 1);
	}

	if (decks.size > 0) {
		const decksHead = container.createEl("div", { text: `📚 Decks (${decks.size})` });
		decksHead.style.fontSize = "11px";
		decksHead.style.fontWeight = "bold";
		decksHead.style.opacity = "0.7";
		decksHead.style.marginTop = "12px";
		decksHead.style.marginBottom = "6px";

		const decksList = container.createDiv();
		decksList.style.maxHeight = "calc(100vh - 380px)";
		decksList.style.overflowY = "auto";

		for (const [name, count] of [...decks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
			const row = decksList.createDiv();
			row.style.display = "flex";
			row.style.alignItems = "center";
			row.style.padding = "6px 10px";
			row.style.background = "var(--background-secondary)";
			row.style.borderRadius = "4px";
			row.style.marginBottom = "3px";
			row.style.fontSize = "12px";
			row.createEl("span", { text: name }).style.flexGrow = "1";
			row.createEl("span", { text: `🃏 ${count}` }).style.opacity = "0.65";
		}
	}
}

function renderStudyPapers(container: HTMLElement, plugin: AtlasPlugin): void {
	container.empty();

	const intro = container.createDiv();
	intro.style.fontSize = "11px";
	intro.style.opacity = "0.7";
	intro.style.marginBottom = "12px";
	intro.setText(
		"Papers acadêmicos. Drag PDF do Zotero → Atlas cria literature note + 5 flashcards auto."
	);

	const papersFolder = `${plugin.settings.folders.studies}/papers`;
	const papers = plugin.app.vault
		.getMarkdownFiles()
		.filter((f) => f.path.startsWith(papersFolder))
		.sort((a, b) => b.stat.mtime - a.stat.mtime);

	const stats = container.createDiv();
	stats.style.fontSize = "11px";
	stats.style.opacity = "0.6";
	stats.style.marginBottom = "10px";
	stats.setText(`${papers.length} papers no vault`);

	if (papers.length === 0) {
		const empty = container.createDiv();
		empty.style.padding = "32px";
		empty.style.textAlign = "center";
		empty.style.opacity = "0.6";
		empty.setText(
			"📭 Nenhum paper. Use Zotero Integration plugin ou solte PDFs em " +
				papersFolder
		);
		return;
	}

	const list = container.createDiv();
	list.style.maxHeight = "calc(100vh - 320px)";
	list.style.overflowY = "auto";

	for (const f of papers.slice(0, 50)) {
		const cache = plugin.app.metadataCache.getFileCache(f);
		const fm = cache?.frontmatter ?? {};
		const status = (fm.read_status as string | undefined) ?? "?";
		const cardsForPaper = plugin.flashcards?.bySource(f.path).length ?? 0;
		const authors = (fm.authors as string | undefined) ?? "";
		const year = (fm.year as string | undefined) ?? "";

		const row = list.createDiv();
		row.style.display = "flex";
		row.style.flexDirection = "column";
		row.style.gap = "3px";
		row.style.padding = "10px 12px";
		row.style.background = "var(--background-secondary)";
		row.style.borderRadius = "6px";
		row.style.marginBottom = "5px";
		row.style.cursor = "pointer";
		row.addClass("atlas-card-interactive");

		const title = row.createEl("div", { text: f.basename });
		title.style.fontSize = "12px";
		title.style.fontWeight = "500";

		if (authors || year) {
			const meta1 = row.createEl("div");
			meta1.style.fontSize = "10px";
			meta1.style.opacity = "0.65";
			meta1.setText([authors, year].filter(Boolean).join(" · "));
		}

		const meta2 = row.createEl("div");
		meta2.style.fontSize = "10px";
		meta2.style.opacity = "0.55";
		meta2.style.display = "flex";
		meta2.style.gap = "10px";
		meta2.createEl("span", { text: `📖 ${status}` });
		meta2.createEl("span", { text: `🃏 ${cardsForPaper} cards` });

		row.addEventListener("click", () => {
			if (f instanceof TFile) void plugin.app.workspace.getLeaf().openFile(f);
		});
	}
}

function statCard(parent: HTMLElement, label: string, value: string, color?: string): void {
	const c = parent.createDiv();
	c.style.padding = "8px";
	c.style.background = "var(--background-secondary)";
	c.style.borderRadius = "4px";
	c.style.textAlign = "center";
	const v = c.createEl("div", { text: value });
	v.style.fontSize = "16px";
	v.style.fontWeight = "bold";
	if (color) v.style.color = color;
	const l = c.createEl("div", { text: label });
	l.style.fontSize = "10px";
	l.style.opacity = "0.6";
}
