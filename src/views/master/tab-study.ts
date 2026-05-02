import { TFile } from "obsidian";
import type AtlasPlugin from "../../../main";
import { renderSubTabBar, SubTabDef } from "../../ui/sub-tab-bar";
import { renderStudyCourses } from "./study-sub/courses";

type StudySubId = "flashcards" | "courses" | "papers";

/**
 * 🃏 Study tab — flashcards + cursos + papers em sub-tabs.
 *
 * v0.27: polish premium com utility classes + cyan accents.
 */
export async function renderStudyTab(container: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	container.empty();

	const header = container.createDiv({ cls: "atlas-tab-section-header" });
	header.createEl("h3", {
		cls: "atlas-tab-section-title",
		text: "🃏 Study",
	});

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
	container.addClass("atlas-study-flashcards", "atlas-section-stagger");

	const stats = plugin.flashcards?.stats() ?? { total: 0, due: 0, new: 0, learning: 0, review: 0 };

	container.createEl("div", {
		cls: "atlas-tab-section-subtitle",
		text: `${stats.total} cards · ${stats.due} a revisar · ${stats.new} novos`,
	});

	const statsGrid = container.createDiv({ cls: "atlas-study-stats-grid" });

	statCard(statsGrid, "Total", String(stats.total));
	statCard(statsGrid, "Due", String(stats.due), stats.due > 0 ? "is-orange" : undefined);
	statCard(statsGrid, "Novos", String(stats.new));
	statCard(statsGrid, "Review", String(stats.review));

	const qaBar = container.createDiv({ cls: "atlas-study-qa-bar" });

	const qa = (icon: string, label: string, cmd: string, primary = false): void => {
		const b = qaBar.createEl("button", {
			cls: primary ? "mod-cta" : "",
			text: `${icon} ${label}`,
		});
		b.addEventListener("click", () => {
			const apiAny = plugin.app as unknown as {
				commands?: { executeCommandById?: (id: string) => void };
			};
			apiAny.commands?.executeCommandById?.(`atlas:${cmd}`);
		});
	};

	qa("▶️", `Revisar ${stats.due} agora`, "flashcards-review", stats.due > 0);
	qa("🤖", "Gerar desta nota", "flashcards-from-note");
	qa("🎓", "Feynman check", "socratic");
	qa("📥", "Export Anki", "flashcards-export-anki");

	// Decks list (por source)
	const allCards = plugin.flashcards?.allCards() ?? [];
	const decks = new Map<string, number>();
	for (const c of allCards) {
		const key = (c.sourceNotePath ?? "?").split("/").pop()?.replace(/\.md$/, "") ?? "?";
		decks.set(key, (decks.get(key) ?? 0) + 1);
	}

	if (decks.size > 0) {
		container.createDiv({ cls: "atlas-tab-section-divider" });

		const decksHead = container.createEl("div", { cls: "atlas-study-decks-head" });
		decksHead.setText(`📚 DECKS (${decks.size})`);

		const decksList = container.createDiv({ cls: "atlas-study-decks-list" });

		for (const [name, count] of [...decks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
			const row = decksList.createDiv({ cls: "atlas-study-deck-row" });
			row.createEl("span", { cls: "atlas-study-deck-name", text: name });
			row.createEl("span", { cls: "atlas-study-deck-count", text: `🃏 ${count}` });
		}
	}
}

function renderStudyPapers(container: HTMLElement, plugin: AtlasPlugin): void {
	container.empty();
	container.addClass("atlas-study-papers", "atlas-section-stagger");

	container.createEl("div", {
		cls: "atlas-tab-section-subtitle",
		text: "Papers acadêmicos. Drag PDF do Zotero → Atlas cria literature note + 5 flashcards auto.",
	});

	const papersFolder = `${plugin.settings.folders.studies}/papers`;
	const papers = plugin.app.vault
		.getMarkdownFiles()
		.filter((f) => f.path.startsWith(papersFolder))
		.sort((a, b) => b.stat.mtime - a.stat.mtime);

	if (papers.length === 0) {
		const empty = container.createDiv({ cls: "atlas-tab-empty-state" });
		empty.createEl("div", { cls: "atlas-tab-empty-emoji", text: "📭" });
		empty.createEl("div", {
			cls: "atlas-tab-empty-title",
			text: "Nenhum paper",
		});
		empty.createEl("div", {
			cls: "atlas-tab-empty-desc",
			text: `Use Zotero Integration plugin ou solte PDFs em ${papersFolder}.`,
		});
		return;
	}

	const stats = container.createDiv({ cls: "atlas-tab-section-subtitle" });
	stats.setText(`${papers.length} papers no vault`);

	container.createDiv({ cls: "atlas-tab-section-divider" });

	const list = container.createDiv({ cls: "atlas-study-papers-list" });

	for (const f of papers.slice(0, 50)) {
		const cache = plugin.app.metadataCache.getFileCache(f);
		const fm = cache?.frontmatter ?? {};
		const status = (fm.read_status as string | undefined) ?? "?";
		const cardsForPaper = plugin.flashcards?.bySource(f.path).length ?? 0;
		const authors = (fm.authors as string | undefined) ?? "";
		const year = (fm.year as string | undefined) ?? "";

		const row = list.createDiv({ cls: "atlas-tab-card-premium atlas-study-paper-row" });

		row.createEl("div", {
			cls: "atlas-study-paper-title",
			text: f.basename,
		});

		if (authors || year) {
			row.createEl("div", {
				cls: "atlas-study-paper-meta-1",
				text: [authors, year].filter(Boolean).join(" · "),
			});
		}

		const meta2 = row.createDiv({ cls: "atlas-study-paper-meta-2" });
		meta2.createEl("span", { text: `📖 ${status}` });
		meta2.createEl("span", { text: `🃏 ${cardsForPaper} cards` });

		row.addEventListener("click", () => {
			if (f instanceof TFile) void plugin.app.workspace.getLeaf().openFile(f);
		});
	}
}

function statCard(parent: HTMLElement, label: string, value: string, modCls?: string): void {
	const c = parent.createDiv({ cls: "atlas-study-stat-card" });
	const v = c.createEl("div", { cls: `atlas-study-stat-value ${modCls ?? ""}`.trim(), text: value });
	void v;
	c.createEl("div", { cls: "atlas-study-stat-label", text: label });
}
