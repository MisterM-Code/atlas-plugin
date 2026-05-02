import type AtlasPlugin from "../../../main";
import { renderSubTabBar, SubTabDef } from "../../ui/sub-tab-bar";
import { renderAnalyticsHeatmap } from "./analytics-sub/heatmap";
import { renderAnalyticsTrends } from "./analytics-sub/trends";
import { renderAnalyticsKgGraph } from "./analytics-sub/kg-graph";
import { renderAnalyticsMood } from "./analytics-sub/mood";

type AnalyticsSubId = "heatmap" | "trends" | "kg-graph" | "mood";

/**
 * 📈 Analytics tab — visualizações tecnológicas via ECharts (zero canvas próprio).
 *
 * Sub-tabs:
 *   📅 Heatmap    — 365-day grid GitHub-style de modificações
 *   📊 Trends     — 4 charts (KG growth, sessions/week, top temas, commitments pie)
 *   🌐 KG Graph   — force-directed do Knowledge Graph (people/projects/themes/systems)
 *   🌡️ Mood       — line + radar de mood/energy ao longo do tempo
 */
export async function renderAnalyticsTab(
	container: HTMLElement,
	plugin: AtlasPlugin
): Promise<void> {
	container.empty();

	const header = container.createDiv();
	header.style.marginBottom = "10px";
	header.createEl("h3", { text: "📈 Analytics" }).style.margin = "0 0 4px 0";
	const sub = header.createEl("div", {
		text: "Charts ECharts: heatmap, trends, KG graph, mood timeline. Click nodes/cells pra navegar.",
	});
	sub.style.fontSize = "11px";
	sub.style.opacity = "0.6";

	const subs: SubTabDef<AnalyticsSubId>[] = [
		{
			id: "heatmap",
			icon: "📅",
			label: "Heatmap",
			description: "365-day grid de modificações (GitHub-style)",
			render: (c) => renderAnalyticsHeatmap(c, plugin),
		},
		{
			id: "trends",
			icon: "📊",
			label: "Trends",
			description: "KG growth · Sessões/semana · Top temas · Commitments",
			render: (c) => renderAnalyticsTrends(c, plugin),
		},
		{
			id: "kg-graph",
			icon: "🌐",
			label: "KG Graph",
			description: "Force-directed do Knowledge Graph (people/projects/themes/systems)",
			render: (c) => renderAnalyticsKgGraph(c, plugin),
		},
		{
			id: "mood",
			icon: "🌡️",
			label: "Mood",
			description: "Mood/energy line + radar mensal (lê frontmatter dos daily logs)",
			render: (c) => renderAnalyticsMood(c, plugin),
		},
	];

	renderSubTabBar(container, subs, {
		storageKey: "atlas-analytics-subtab",
		defaultId: "heatmap",
	});
}
