import type AtlasPlugin from "../../../main";
import { renderSubTabBar, SubTabDef } from "../../ui/sub-tab-bar";
import { renderLabToolsIa } from "./lab-sub/tools-ia";
import { renderLabSerendipity } from "./lab-sub/serendipity";
import { renderLabCapsules } from "./lab-sub/capsules";
import { renderLabEntityTree } from "./lab-sub/entity-tree";
import { t } from "../../i18n";

type LabSubId = "tools-ia" | "serendipity" | "capsules" | "tree";

/**
 * 🧪 Lab tab — concentra ferramentas e visualizações avançadas.
 *
 * Sub-tabs:
 *   🛠️ Tools IA      — cards click-to-run (Reasoning, Pre-mortem, Manager README, ...)
 *   💡 Serendipity   — feed de insights gerados pela engine
 *   🕰️ Capsules      — time capsules (pendentes / desbloqueadas / entregues)
 *   🌳 Entity Tree   — KG hierárquico (Pessoas / Projetos / Temas)
 */
export async function renderLabTab(
	container: HTMLElement,
	plugin: AtlasPlugin
): Promise<void> {
	container.empty();

	const header = container.createDiv();
	header.style.marginBottom = "10px";
	const title = header.createEl("h3", { text: t("tab.lab.title") });
	title.style.margin = "0 0 4px 0";
	const sub = header.createEl("div", {
		text:
			"Tudo que era 'só Cmd+P': click-to-run, sem precisar lembrar comandos.",
	});
	sub.style.fontSize = "11px";
	sub.style.opacity = "0.6";

	const subs: SubTabDef<LabSubId>[] = [
		{
			id: "tools-ia",
			icon: "🛠️",
			label: "Tools IA",
			description: "Reasoning · Pre-mortem · Manager README · Year in Review · Podcast",
			render: (c) => {
				renderLabToolsIa(c, plugin);
			},
		},
		{
			id: "serendipity",
			icon: "💡",
			label: "Serendipity",
			description: "Feed dos insights gerados pela engine + forçar 1 agora",
			render: (c) => renderLabSerendipity(c, plugin),
		},
		{
			id: "capsules",
			icon: "🕰️",
			label: "Capsules",
			description: "Time capsules: notas seladas para abrir no futuro",
			render: (c) => renderLabCapsules(c, plugin),
		},
		{
			id: "tree",
			icon: "🌳",
			label: "Entity Tree",
			description: "Knowledge Graph hierárquico (pessoas / projetos / temas)",
			render: (c) => renderLabEntityTree(c, plugin),
		},
	];

	renderSubTabBar(container, subs, {
		storageKey: "atlas-lab-subtab",
		defaultId: "tools-ia",
	});
}
