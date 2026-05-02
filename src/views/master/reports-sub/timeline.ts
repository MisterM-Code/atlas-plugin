import { TFile, Notice } from "obsidian";
import type AtlasPlugin from "../../../../main";

interface ReportEntry {
	title: string;
	path: string;
	type:
		| "weekly"
		| "monthly"
		| "yearly"
		| "podcast"
		| "decision-diary"
		| "person-summary"
		| "insight";
	date: string;
	icon: string;
}

/**
 * Timeline sub-view — todos os artefatos gerados pelo Atlas, agrupados por mês.
 */
export async function renderReportsTimeline(
	container: HTMLElement,
	plugin: AtlasPlugin
): Promise<void> {
	container.empty();

	const reports = await collectReports(plugin);

	const stats = container.createDiv({ cls: "atlas-tab-section-subtitle" });
	stats.setText(`${reports.length} artefatos gerados`);

	// Quick action bar — usa atlas-analytics-period-bar pra consistência
	const qaBar = container.createDiv({ cls: "atlas-analytics-period-bar" });

	const quickAction = (icon: string, label: string, cmd: string) => {
		const b = qaBar.createEl("button", { cls: "atlas-analytics-period-btn", text: `${icon} ${label}` });
		b.addEventListener("click", () => {
			const apiAny = plugin.app as unknown as {
				commands?: { executeCommandById?: (id: string) => void };
			};
			apiAny.commands?.executeCommandById?.(`atlas:${cmd}`);
		});
	};

	// v0.26: command IDs sem prefixo atlas- (post-v0.9.3)
	quickAction("📊", "Gerar Weekly", "weekly-now");
	quickAction("📔", "Decision Diary", "decision-diary");
	quickAction("📋", "Manager README", "manager-readme");
	quickAction("🎉", "Year in Review", "year-in-review");
	quickAction("🔮", "Pre-mortem", "premortem-oracle");
	quickAction("🎙️", "Podcast", "podcast-generator");

	const timeline = container.createDiv({ cls: "atlas-hub-list" });

	if (reports.length === 0) {
		const empty = timeline.createDiv({ cls: "atlas-tab-empty-state" });
		empty.createEl("div", { cls: "atlas-tab-empty-emoji", text: "🎉" });
		empty.createEl("div", { cls: "atlas-tab-empty-title", text: "Nenhum report gerado ainda" });
		empty.createEl("div", {
			cls: "atlas-tab-empty-desc",
			text: "Use os botões acima pra gerar weekly report, year-in-review, podcast, ou outros artefatos.",
		});
		return;
	}

	const byMonth = new Map<string, ReportEntry[]>();
	for (const r of reports) {
		const monthKey = r.date.substring(0, 7);
		const arr = byMonth.get(monthKey) ?? [];
		arr.push(r);
		byMonth.set(monthKey, arr);
	}

	const sortedMonths = Array.from(byMonth.keys()).sort((a, b) => b.localeCompare(a));
	for (const month of sortedMonths) {
		const monthDate = new Date(`${month}-01`);
		const label = monthDate.toLocaleDateString("pt-BR", {
			month: "long",
			year: "numeric",
		});

		timeline.createDiv({ cls: "atlas-reports-month-header", text: label });

		const monthList = byMonth.get(month);
		if (!monthList) continue;
		const items = monthList.sort((a, b) => b.date.localeCompare(a.date));
		for (const r of items) {
			const card = timeline.createDiv({ cls: "atlas-reports-card" });
			card.createEl("span", { cls: "atlas-reports-card-icon", text: r.icon });
			const wrap = card.createDiv({ cls: "atlas-reports-card-text" });
			wrap.createEl("div", { cls: "atlas-reports-card-title", text: r.title });
			wrap.createEl("div", { cls: "atlas-reports-card-date", text: r.date });
			card.createEl("span", { cls: "atlas-reports-card-type", text: r.type });

			card.addEventListener("click", async () => {
				const f = plugin.app.vault.getAbstractFileByPath(r.path);
				if (f instanceof TFile) await plugin.app.workspace.getLeaf().openFile(f);
				else new Notice(`Atlas: ${r.path} não encontrado.`);
			});
		}
	}
}

async function collectReports(plugin: AtlasPlugin): Promise<ReportEntry[]> {
	const out: ReportEntry[] = [];
	const reportsFolder = plugin.settings.folders.reports;
	const files = plugin.app.vault.getMarkdownFiles().filter((f) =>
		f.path.startsWith(reportsFolder)
	);

	for (const f of files) {
		const cache = plugin.app.metadataCache.getFileCache(f);
		const fm = cache?.frontmatter as Record<string, unknown> | undefined;
		const fmType = (fm?.type as string | undefined) ?? "";

		let type: ReportEntry["type"] = "weekly";
		let icon = "📊";

		if (fmType.includes("weekly")) {
			type = "weekly";
			icon = "📊";
		} else if (fmType.includes("monthly") || fmType.includes("exec")) {
			type = "monthly";
			icon = "📈";
		} else if (fmType.includes("year-in-review")) {
			type = "yearly";
			icon = "🎉";
		} else if (fmType.includes("podcast")) {
			type = "podcast";
			icon = "🎙️";
		} else if (fmType.includes("decision-diary")) {
			type = "decision-diary";
			icon = "📔";
		} else if (fmType.includes("person-summary")) {
			type = "person-summary";
			icon = "👤";
		} else if (fmType.includes("context-collapse")) {
			type = "insight";
			icon = "🔮";
		} else {
			continue;
		}

		const dateFm = fm?.generated_at as string | undefined;
		const date =
			dateFm?.substring(0, 10) ??
			f.basename.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ??
			new Date(f.stat.mtime).toISOString().substring(0, 10);

		out.push({
			title: f.basename,
			path: f.path,
			type,
			date,
			icon,
		});
	}

	return out.sort((a, b) => b.date.localeCompare(a.date));
}
