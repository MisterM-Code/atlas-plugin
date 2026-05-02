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

	const stats = container.createDiv();
	stats.style.fontSize = "11px";
	stats.style.opacity = "0.6";
	stats.style.marginBottom = "8px";
	stats.setText(`${reports.length} artefatos gerados`);

	// Quick action bar
	const qaBar = container.createDiv();
	qaBar.style.display = "flex";
	qaBar.style.gap = "4px";
	qaBar.style.flexWrap = "wrap";
	qaBar.style.marginBottom = "10px";

	const quickAction = (icon: string, label: string, cmd: string) => {
		const b = qaBar.createEl("button", { text: `${icon} ${label}` });
		b.style.fontSize = "11px";
		b.style.padding = "4px 8px";
		b.style.cursor = "pointer";
		b.addEventListener("click", () => {
			const apiAny = plugin.app as unknown as {
				commands?: { executeCommandById?: (id: string) => void };
			};
			apiAny.commands?.executeCommandById?.(`atlas:${cmd}`);
		});
	};

	quickAction("📊", "Gerar Weekly", "atlas-weekly-now");
	quickAction("📔", "Decision Diary", "atlas-decision-diary");
	quickAction("📋", "Manager README", "atlas-manager-readme");
	quickAction("🎉", "Year in Review", "atlas-year-in-review");
	quickAction("🔮", "Pre-mortem", "atlas-premortem-oracle");
	quickAction("🎙️", "Podcast", "atlas-podcast-generator");

	const timeline = container.createDiv();
	timeline.style.maxHeight = "calc(100vh - 320px)";
	timeline.style.overflowY = "auto";

	if (reports.length === 0) {
		const empty = timeline.createDiv();
		empty.style.padding = "32px 16px";
		empty.style.textAlign = "center";
		empty.style.opacity = "0.6";
		empty.setText("🎉 Nenhum report gerado ainda. Use os botões acima.");
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

		const monthHeader = timeline.createDiv();
		monthHeader.style.fontSize = "11px";
		monthHeader.style.fontWeight = "bold";
		monthHeader.style.opacity = "0.7";
		monthHeader.style.textTransform = "capitalize";
		monthHeader.style.marginTop = "12px";
		monthHeader.style.marginBottom = "6px";
		monthHeader.style.paddingBottom = "4px";
		monthHeader.style.borderBottom = "1px solid var(--background-modifier-border)";
		monthHeader.setText(label);

		const monthList = byMonth.get(month);
		if (!monthList) continue;
		const items = monthList.sort((a, b) => b.date.localeCompare(a.date));
		for (const r of items) {
			const card = timeline.createDiv();
			card.style.display = "flex";
			card.style.alignItems = "center";
			card.style.gap = "10px";
			card.style.padding = "8px";
			card.style.marginBottom = "4px";
			card.style.background = "var(--background-secondary)";
			card.style.borderRadius = "4px";
			card.style.cursor = "pointer";

			card.createEl("span", { text: r.icon }).style.fontSize = "16px";

			const wrap = card.createDiv();
			wrap.style.flexGrow = "1";
			const title = wrap.createEl("div", { text: r.title });
			title.style.fontSize = "12px";
			title.style.fontWeight = "500";
			const sub = wrap.createEl("div", { text: r.date });
			sub.style.fontSize = "10px";
			sub.style.opacity = "0.6";

			const typeLabel = card.createEl("span", { text: r.type });
			typeLabel.style.fontSize = "9px";
			typeLabel.style.padding = "2px 6px";
			typeLabel.style.borderRadius = "3px";
			typeLabel.style.background = "var(--background-modifier-hover)";
			typeLabel.style.opacity = "0.7";

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
