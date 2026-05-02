import type AtlasPlugin from "../../../main";
import { renderSubTabBar, SubTabDef } from "../../ui/sub-tab-bar";
import { renderReportsTimeline } from "./reports-sub/timeline";
import { renderReportsTemplates } from "./reports-sub/templates";
import { renderReportsComposerTab } from "./tab-reports-composer";

type ReportsSubId = "timeline" | "composer" | "templates";

/**
 * Reports tab — hub de tudo que sai do Atlas.
 *
 * Sub-tabs:
 *   📜 Timeline  — todos artefatos gerados (weekly, podcast, decision diary, etc)
 *   📊 Composer  — montar relatórios filtrados (período × pessoas × sistemas × temas)
 *   📐 Templates — editar templates visuais (Daily, 1:1, Coaching, Weekly...)
 */
export async function renderReportsTab(
	container: HTMLElement,
	plugin: AtlasPlugin
): Promise<void> {
	container.empty();

	// Header
	const header = container.createDiv();
	header.style.marginBottom = "10px";
	const title = header.createEl("h3", { text: "🎙️ Reports & Reviews" });
	title.style.margin = "0";

	const subs: SubTabDef<ReportsSubId>[] = [
		{
			id: "timeline",
			icon: "📜",
			label: "Timeline",
			description: "Todos artefatos gerados (weekly, podcast, decision diary)",
			render: (c) => renderReportsTimeline(c, plugin),
		},
		{
			id: "composer",
			icon: "📊",
			label: "Composer",
			description: "Montar relatórios filtrados (período × pessoas × sistemas × temas)",
			render: (c) => renderReportsComposerTab(c, plugin),
		},
		{
			id: "templates",
			icon: "📐",
			label: "Templates",
			description: "Editar templates visuais (Daily, 1:1, Coaching, Weekly...)",
			render: (c) => renderReportsTemplates(c, plugin),
		},
	];

	renderSubTabBar(container, subs, {
		storageKey: "atlas-reports-subtab",
		defaultId: "timeline",
	});
}

/** Activate Reports tab + sub-tab programaticamente. */
export function getReportsSubtabActivator(plugin: AtlasPlugin): (sub: ReportsSubId) => void {
	return (sub) => {
		try {
			window.localStorage.setItem("atlas-reports-subtab", sub);
		} catch {
			// ignore
		}
		void plugin.activateMasterTab("reports");
	};
}
