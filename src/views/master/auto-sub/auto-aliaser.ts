import { Notice } from "obsidian";
import type AtlasPlugin from "../../../../main";
import { AutoAliasingModal } from "../../../automation/auto-aliasing";

/**
 * AutoAliaser sub-view — descobre candidatos a fusão pessoa duplicada.
 */
export async function renderAutoAliaserSub(
	container: HTMLElement,
	plugin: AtlasPlugin
): Promise<void> {
	container.empty();

	const intro = container.createDiv();
	intro.style.fontSize = "11px";
	intro.style.opacity = "0.7";
	intro.style.marginBottom = "12px";
	intro.setText(
		'Atlas detecta "JS" + "João Silva" como mesma pessoa via Levenshtein + iniciais + embeddings. Sempre pede confirmação — nunca funde sozinho.'
	);

	// Action bar
	const actions = container.createDiv();
	actions.style.display = "flex";
	actions.style.gap = "8px";
	actions.style.marginBottom = "12px";

	const scanBtn = actions.createEl("button", { text: "🔍 Buscar duplicatas no KG" });
	scanBtn.style.fontSize = "12px";
	scanBtn.style.padding = "6px 14px";
	scanBtn.addClass("mod-cta");
	scanBtn.addEventListener("click", () => {
		new AutoAliasingModal(plugin.app, plugin.autoAliaser).open();
	});

	const refreshBtn = actions.createEl("button", { text: "↻ Atualizar" });
	refreshBtn.style.fontSize = "11px";
	refreshBtn.style.padding = "6px 12px";
	refreshBtn.addEventListener("click", () => void renderAutoAliaserSub(container, plugin));

	// Stats card
	const statsCard = container.createDiv();
	statsCard.style.padding = "12px";
	statsCard.style.background = "var(--background-secondary)";
	statsCard.style.borderRadius = "6px";
	statsCard.style.marginBottom = "12px";
	statsCard.style.display = "grid";
	statsCard.style.gridTemplateColumns = "1fr 1fr";
	statsCard.style.gap = "8px";

	const people = plugin.kg.listPeople();
	const withAliases = people.filter((p) => p.aliases.length > 0);

	statBlock(statsCard, "👥 Total pessoas", String(people.length));
	statBlock(
		statsCard,
		"🏷️ Com aliases",
		`${withAliases.length} (${
			people.length > 0 ? Math.round((withAliases.length / people.length) * 100) : 0
		}%)`
	);

	// People with aliases preview
	const head = container.createEl("div", { text: "🏷️ Pessoas com aliases configurados" });
	head.style.fontSize = "10px";
	head.style.fontWeight = "bold";
	head.style.opacity = "0.7";
	head.style.marginTop = "8px";
	head.style.marginBottom = "6px";
	head.style.letterSpacing = "0.5px";

	if (withAliases.length === 0) {
		const empty = container.createDiv();
		empty.style.padding = "16px";
		empty.style.textAlign = "center";
		empty.style.opacity = "0.6";
		empty.style.fontSize = "11px";
		empty.setText(
			"Nenhuma pessoa com aliases ainda. Roda 'Buscar duplicatas' acima para Atlas detectar e propor fusões."
		);
		return;
	}

	const list = container.createDiv();
	list.style.maxHeight = "calc(100vh - 380px)";
	list.style.overflowY = "auto";

	for (const p of withAliases.slice(0, 30)) {
		const row = list.createDiv();
		row.style.display = "flex";
		row.style.alignItems = "center";
		row.style.gap = "10px";
		row.style.padding = "8px";
		row.style.marginBottom = "4px";
		row.style.background = "var(--background-secondary)";
		row.style.borderRadius = "4px";

		const iconEl = row.createEl("span", { text: "👤" });
		iconEl.style.fontSize = "14px";

		const wrap = row.createDiv();
		wrap.style.flexGrow = "1";
		const nameEl = wrap.createEl("div", { text: p.name });
		nameEl.style.fontSize = "12px";
		nameEl.style.fontWeight = "500";
		const aliasEl = wrap.createEl("div", { text: `Aliases: ${p.aliases.join(" · ")}` });
		aliasEl.style.fontSize = "10px";
		aliasEl.style.opacity = "0.6";

		const countEl = row.createEl("span", { text: `${p.aliases.length}` });
		countEl.style.fontSize = "10px";
		countEl.style.padding = "2px 6px";
		countEl.style.background = "var(--background-modifier-hover)";
		countEl.style.borderRadius = "3px";
	}
}

function statBlock(parent: HTMLElement, label: string, value: string): void {
	const cell = parent.createDiv();
	cell.style.padding = "8px";
	cell.style.textAlign = "center";

	const v = cell.createEl("div", { text: value });
	v.style.fontSize = "18px";
	v.style.fontWeight = "bold";
	v.style.color = "var(--interactive-accent)";

	const l = cell.createEl("div", { text: label });
	l.style.fontSize = "10px";
	l.style.opacity = "0.7";
	l.style.marginTop = "2px";
}
