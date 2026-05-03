import type AtlasPlugin from "../../../main";
import { renderSubTabBar, SubTabDef } from "../../ui/sub-tab-bar";
import { renderAutoTaggerSub } from "./auto-sub/auto-tagger";
import { renderAutoAliaserSub } from "./auto-sub/auto-aliaser";
import { renderAutoRulesSub } from "./auto-sub/auto-rules";
import { renderProactiveFeedSub } from "./auto-sub/proactive-feed";
import { t } from "../../i18n";

type AutoSubId = "tagger" | "aliaser" | "rules" | "proactive";

/**
 * 🤖 Auto tab — monitoramento das automações silenciosas.
 *
 * Sub-tabs:
 *   🏷️ Auto-Tagger    — config + notas tagueadas (24h) + tag agora
 *   👥 Auto-Aliaser   — pessoas com aliases + buscar duplicatas
 *   📋 Rules           — toggle ON/OFF + avaliar/aplicar batch
 *   📡 Atlas Percebeu — feed de eventos proativos
 */
export async function renderAutomationsTab(
	container: HTMLElement,
	plugin: AtlasPlugin
): Promise<void> {
	container.empty();

	const header = container.createDiv();
	header.style.marginBottom = "10px";
	const title = header.createEl("h3", { text: t("tab.auto.title") });
	title.style.margin = "0 0 4px 0";
	const sub = header.createEl("div", {
		text: "Atlas faz muita coisa sozinho. Aqui você vê o que ele tá fazendo agora.",
	});
	sub.style.fontSize = "11px";
	sub.style.opacity = "0.6";

	const subs: SubTabDef<AutoSubId>[] = [
		{
			id: "tagger",
			icon: "🏷️",
			label: t("sub.auto.tagger"),
			description: "AutoTagger config + notas tagueadas recentemente",
			render: (c) => renderAutoTaggerSub(c, plugin),
		},
		{
			id: "aliaser",
			icon: "👥",
			label: t("sub.auto.aliaser"),
			description: "Detecta duplicatas (JS = João Silva) e propõe fusão",
			render: (c) => renderAutoAliaserSub(c, plugin),
		},
		{
			id: "rules",
			icon: "📋",
			label: t("sub.auto.rules"),
			description: "Rules de auto-organização (move, tag, archive) com toggle inline",
			render: (c) => renderAutoRulesSub(c, plugin),
		},
		{
			id: "proactive",
			icon: "📡",
			label: t("sub.auto.proactive"),
			description: "Feed de detecções: meetings, padrões, pessoas inativas, commitments overdue",
			render: (c) => renderProactiveFeedSub(c, plugin),
		},
	];

	renderSubTabBar(container, subs, {
		storageKey: "atlas-auto-subtab",
		defaultId: "tagger",
	});
}
