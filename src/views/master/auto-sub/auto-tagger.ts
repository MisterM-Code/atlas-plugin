import { TFile, Notice } from "obsidian";
import type AtlasPlugin from "../../../../main";

/**
 * AutoTagger sub-view — config + notas tagueadas recentemente + tag agora.
 */
export async function renderAutoTaggerSub(
	container: HTMLElement,
	plugin: AtlasPlugin
): Promise<void> {
	container.empty();

	const intro = container.createDiv();
	intro.style.fontSize = "11px";
	intro.style.opacity = "0.7";
	intro.style.marginBottom = "12px";
	intro.setText(
		"AutoTagger usa LLM (small model) pra sugerir tags em frontmatter. Roda em save com debounce 30s. Skipa coachees por privacidade."
	);

	// Config card
	const cfgCard = container.createDiv();
	cfgCard.style.padding = "12px";
	cfgCard.style.background = "var(--background-secondary)";
	cfgCard.style.borderRadius = "6px";
	cfgCard.style.marginBottom = "12px";
	cfgCard.style.border = "1px solid var(--background-modifier-border)";

	const cfgTitle = cfgCard.createEl("div", { text: "⚙️ Configuração" });
	cfgTitle.style.fontSize = "11px";
	cfgTitle.style.fontWeight = "bold";
	cfgTitle.style.marginBottom = "8px";

	const cfgGrid = cfgCard.createDiv();
	cfgGrid.style.display = "grid";
	cfgGrid.style.gridTemplateColumns = "auto 1fr";
	cfgGrid.style.gap = "6px 12px";
	cfgGrid.style.fontSize = "11px";

	const items: { k: string; v: string }[] = [
		{ k: "Modelo", v: plugin.settings.ollama.smallModel },
		{ k: "Debounce", v: "30s após edição" },
		{ k: "Max tamanho", v: "50 KB" },
		{
			k: "Excluídos",
			v: [
				plugin.settings.folders.atlas,
				"99_Archive",
				".obsidian",
				".trash",
				"Coach paths (privacidade)",
			].join(", "),
		},
	];
	for (const it of items) {
		const k = cfgGrid.createDiv();
		k.style.fontWeight = "bold";
		k.style.opacity = "0.7";
		k.setText(it.k);
		const v = cfgGrid.createDiv();
		v.setText(it.v);
		v.style.opacity = "0.85";
	}

	// Action: tag active note now
	const actions = container.createDiv();
	actions.style.display = "flex";
	actions.style.gap = "8px";
	actions.style.marginBottom = "12px";

	const tagNowBtn = actions.createEl("button", { text: "🏷️ Tag agora a nota ativa" });
	tagNowBtn.style.fontSize = "12px";
	tagNowBtn.style.padding = "6px 14px";
	tagNowBtn.addClass("mod-cta");
	tagNowBtn.addEventListener("click", async () => {
		const file = plugin.app.workspace.getActiveFile();
		if (!file) {
			new Notice("Atlas: abra uma nota primeiro.");
			return;
		}
		new Notice("Atlas: gerando tags...");
		await plugin.autoTagger.tagFileNow(file);
		void renderAutoTaggerSub(container, plugin);
	});

	const refreshBtn = actions.createEl("button", { text: "↻ Atualizar lista" });
	refreshBtn.style.fontSize = "11px";
	refreshBtn.style.padding = "6px 12px";
	refreshBtn.addEventListener("click", () => void renderAutoTaggerSub(container, plugin));

	// Recent tagged notes
	const head = container.createEl("div", { text: "📝 Notas com tags atualizadas (últimas 24h)" });
	head.style.fontSize = "10px";
	head.style.fontWeight = "bold";
	head.style.opacity = "0.7";
	head.style.marginTop = "8px";
	head.style.marginBottom = "6px";
	head.style.letterSpacing = "0.5px";

	const since = Date.now() - 86_400_000;
	const recent = plugin.app.vault
		.getMarkdownFiles()
		.filter((f) => f.stat.mtime >= since)
		.filter((f) => {
			const cache = plugin.app.metadataCache.getFileCache(f);
			const fmTags = cache?.frontmatter?.tags;
			return Array.isArray(fmTags) ? fmTags.length > 0 : Boolean(fmTags);
		})
		.sort((a, b) => b.stat.mtime - a.stat.mtime)
		.slice(0, 15);

	if (recent.length === 0) {
		const empty = container.createDiv();
		empty.style.padding = "16px";
		empty.style.textAlign = "center";
		empty.style.opacity = "0.6";
		empty.style.fontSize = "11px";
		empty.setText("📭 Nenhuma nota com tags modificada nas últimas 24h.");
		return;
	}

	for (const f of recent) {
		const cache = plugin.app.metadataCache.getFileCache(f);
		const tags = (cache?.frontmatter?.tags as string[] | undefined) ?? [];

		const row = container.createDiv();
		row.style.display = "flex";
		row.style.alignItems = "center";
		row.style.gap = "8px";
		row.style.padding = "6px 8px";
		row.style.marginBottom = "4px";
		row.style.background = "var(--background-secondary)";
		row.style.borderRadius = "4px";
		row.style.cursor = "pointer";
		row.style.fontSize = "11px";

		const titleEl = row.createDiv();
		titleEl.style.flexGrow = "1";
		titleEl.style.fontWeight = "500";
		titleEl.setText(f.basename);

		const tagsWrap = row.createDiv();
		tagsWrap.style.display = "flex";
		tagsWrap.style.gap = "3px";
		tagsWrap.style.flexWrap = "wrap";
		tagsWrap.style.maxWidth = "60%";
		tagsWrap.style.justifyContent = "flex-end";

		for (const t of tags.slice(0, 4)) {
			const tagEl = tagsWrap.createEl("span", { text: `#${t.replace(/^#+/, "")}` });
			tagEl.style.fontSize = "9px";
			tagEl.style.padding = "1px 5px";
			tagEl.style.borderRadius = "3px";
			tagEl.style.background = "var(--background-modifier-hover)";
		}
		if (tags.length > 4) {
			const more = tagsWrap.createEl("span", { text: `+${tags.length - 4}` });
			more.style.fontSize = "9px";
			more.style.opacity = "0.6";
		}

		row.addEventListener("click", async () => {
			if (f instanceof TFile) await plugin.app.workspace.getLeaf().openFile(f);
		});
	}
}
