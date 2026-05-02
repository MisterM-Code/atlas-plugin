import { Notice } from "obsidian";
import type AtlasPlugin from "../../../../main";
import { AtlasRule, DEFAULT_RULES } from "../../../automation/rule-engine";

/**
 * Rules sub-view — lista regras ativas + toggle ON/OFF inline + actions de batch.
 */
export async function renderAutoRulesSub(
	container: HTMLElement,
	plugin: AtlasPlugin
): Promise<void> {
	container.empty();

	const intro = container.createDiv();
	intro.style.fontSize = "11px";
	intro.style.opacity = "0.7";
	intro.style.marginBottom = "12px";
	intro.setText(
		"Rules organizam o vault automaticamente: 1:1s viram 03_Meetings, papers viram 12_Studies/papers, etc. Toggle ON/OFF inline."
	);

	// Action bar
	const actions = container.createDiv();
	actions.style.display = "flex";
	actions.style.gap = "8px";
	actions.style.marginBottom = "12px";

	const evalActiveBtn = actions.createEl("button", { text: "🔎 Avaliar nota ativa" });
	evalActiveBtn.style.fontSize = "12px";
	evalActiveBtn.style.padding = "6px 12px";
	evalActiveBtn.addEventListener("click", async () => {
		const file = plugin.app.workspace.getActiveFile();
		if (!file) {
			new Notice("Atlas: abra uma nota primeiro.");
			return;
		}
		const matches = await plugin.ruleEngine.evaluate(file);
		if (matches.length === 0) {
			new Notice("Atlas: nenhuma rule match para esta nota.");
			return;
		}
		const lines = matches.map((m) => `• ${m.rule.name}: ${m.preview}`);
		new Notice(`Atlas rules:\n${lines.join("\n")}`, 12000);
	});

	const applyActiveBtn = actions.createEl("button", { text: "✅ Aplicar na nota ativa" });
	applyActiveBtn.style.fontSize = "12px";
	applyActiveBtn.style.padding = "6px 12px";
	applyActiveBtn.addClass("mod-cta");
	applyActiveBtn.addEventListener("click", async () => {
		const file = plugin.app.workspace.getActiveFile();
		if (!file) {
			new Notice("Atlas: abra uma nota primeiro.");
			return;
		}
		const matches = await plugin.ruleEngine.evaluate(file);
		if (matches.length === 0) {
			new Notice("Atlas: nenhuma rule match.");
			return;
		}
		const r = await plugin.ruleEngine.applyAll(matches);
		new Notice(`Atlas: ${r.applied} aplicadas, ${r.failed} falharam.`);
	});

	const resetBtn = actions.createEl("button", { text: "↻ Restaurar defaults" });
	resetBtn.style.fontSize = "11px";
	resetBtn.style.padding = "6px 12px";
	resetBtn.addEventListener("click", async () => {
		if (!confirm("Atlas: descartar customizações de rules e voltar aos defaults?")) return;
		await plugin.ruleEngine.setRules(DEFAULT_RULES);
		new Notice("Atlas: rules resetadas.");
		void renderAutoRulesSub(container, plugin);
	});

	// List
	const head = container.createEl("div", {
		text: `📋 Rules ativas (${plugin.ruleEngine.rules.filter((r) => r.enabled).length}/${plugin.ruleEngine.rules.length})`,
	});
	head.style.fontSize = "10px";
	head.style.fontWeight = "bold";
	head.style.opacity = "0.7";
	head.style.marginTop = "8px";
	head.style.marginBottom = "6px";
	head.style.letterSpacing = "0.5px";

	const list = container.createDiv();
	list.style.maxHeight = "calc(100vh - 350px)";
	list.style.overflowY = "auto";

	for (const rule of plugin.ruleEngine.rules) {
		renderRuleRow(list, rule, plugin, () => void renderAutoRulesSub(container, plugin));
	}
}

function renderRuleRow(
	parent: HTMLElement,
	rule: AtlasRule,
	plugin: AtlasPlugin,
	onChange: () => void
): void {
	const card = parent.createDiv();
	card.style.padding = "10px 12px";
	card.style.marginBottom = "6px";
	card.style.background = "var(--background-secondary)";
	card.style.borderRadius = "6px";
	card.style.borderLeft = `3px solid ${rule.enabled ? "var(--color-green)" : "var(--background-modifier-border)"}`;
	card.style.opacity = rule.enabled ? "1" : "0.55";

	const top = card.createDiv();
	top.style.display = "flex";
	top.style.alignItems = "center";
	top.style.gap = "10px";

	// Toggle
	const toggle = top.createEl("input", { type: "checkbox" }) as HTMLInputElement;
	toggle.checked = rule.enabled;
	toggle.addEventListener("change", async () => {
		const all = [...plugin.ruleEngine.rules];
		const idx = all.findIndex((r) => r.id === rule.id);
		if (idx >= 0) {
			all[idx] = { ...rule, enabled: toggle.checked };
			await plugin.ruleEngine.setRules(all);
			onChange();
		}
	});

	const wrap = top.createDiv();
	wrap.style.flexGrow = "1";
	const titleEl = wrap.createEl("div", { text: rule.name });
	titleEl.style.fontSize = "12px";
	titleEl.style.fontWeight = "bold";
	if (rule.description) {
		const desc = wrap.createEl("div", { text: rule.description });
		desc.style.fontSize = "10px";
		desc.style.opacity = "0.7";
	}

	// Action label
	const actLabel = card.createEl("div", { text: actionToString(rule.action) });
	actLabel.style.fontSize = "10px";
	actLabel.style.fontFamily = "var(--font-monospace)";
	actLabel.style.opacity = "0.6";
	actLabel.style.marginTop = "4px";
	actLabel.style.paddingLeft = "26px";

	// Mode badge
	const modeBadge = top.createEl("span", { text: rule.mode === "auto" ? "AUTO" : "SUGGEST" });
	modeBadge.style.fontSize = "9px";
	modeBadge.style.padding = "2px 6px";
	modeBadge.style.borderRadius = "3px";
	modeBadge.style.background = rule.mode === "auto" ? "var(--color-orange)" : "var(--background-modifier-hover)";
	modeBadge.style.color = rule.mode === "auto" ? "white" : "var(--text-muted)";
	modeBadge.style.fontWeight = "bold";
	modeBadge.style.letterSpacing = "0.5px";
}

function actionToString(action: AtlasRule["action"]): string {
	switch (action.kind) {
		case "move":
			return `→ mover para ${action.targetFolder}`;
		case "addTag":
			return `+ adicionar tag #${action.tag}`;
		case "removeTag":
			return `− remover tag #${action.tag}`;
		case "archive":
			return `📦 arquivar em ${action.archiveFolder ?? "99_Archive"}`;
		case "notify":
			return `🔔 notificar: ${action.message}`;
	}
}
