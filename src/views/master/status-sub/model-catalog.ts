import { Notice } from "obsidian";
import * as os from "os";
import type AtlasPlugin from "../../../../main";
import {
	CATALOG,
	CatalogModel,
	CATEGORY_META,
	KIND_META,
	ModelCategory,
	recommendStack,
} from "../../../ollama/model-catalog";

/**
 * Model Catalog sub-view — catálogo de modelos curados Atlas.
 *
 * Mostra cards organizados por categoria (Tiny/Light/Balanced/Quality/Pro).
 * Cada card: nome, RAM, kind, qualidade PT-BR, botão Pull / Switch / Use.
 *
 * Adapta dynamicamente baseado em RAM detectada do user.
 */
export async function renderModelCatalogSub(
	container: HTMLElement,
	plugin: AtlasPlugin
): Promise<void> {
	container.empty();

	// Detect RAM
	const totalRamGB = (() => {
		try {
			return os.totalmem() / 1_073_741_824;
		} catch {
			return 0;
		}
	})();
	const freeRamGB = (() => {
		try {
			return os.freemem() / 1_073_741_824;
		} catch {
			return 0;
		}
	})();

	// Lista atualmente baixados
	const installed = await plugin.ollama.listModels().catch(() => [] as string[]);
	const installedSet = new Set(installed);

	const stack = freeRamGB > 0 ? recommendStack(freeRamGB) : null;

	// Header com info de máquina
	const header = container.createDiv();
	header.style.padding = "12px";
	header.style.background = "var(--background-secondary)";
	header.style.borderRadius = "6px";
	header.style.marginBottom = "12px";

	const ramRow = header.createDiv();
	ramRow.style.display = "flex";
	ramRow.style.alignItems = "center";
	ramRow.style.gap = "12px";
	ramRow.style.flexWrap = "wrap";

	if (totalRamGB > 0) {
		const ramBadge = ramRow.createDiv();
		ramBadge.style.display = "flex";
		ramBadge.style.alignItems = "center";
		ramBadge.style.gap = "6px";
		ramBadge.createEl("span", { text: "💾" }).style.fontSize = "16px";
		const ramText = ramBadge.createDiv();
		ramText.createEl("div", { text: `${totalRamGB.toFixed(1)} GB total` }).style.fontSize = "12px";
		ramText.createEl("div", { text: `${freeRamGB.toFixed(1)} GB livre agora` }).style.fontSize = "10px";
		ramText.style.opacity = "0.85";
	}

	const installedBadge = ramRow.createDiv();
	installedBadge.style.display = "flex";
	installedBadge.style.alignItems = "center";
	installedBadge.style.gap = "6px";
	installedBadge.createEl("span", { text: "📦" }).style.fontSize = "16px";
	installedBadge.createEl("div", { text: `${installed.length} instalado${installed.length === 1 ? "" : "s"}` }).style.fontSize = "12px";

	const currentBadge = ramRow.createDiv();
	currentBadge.style.display = "flex";
	currentBadge.style.alignItems = "center";
	currentBadge.style.gap = "6px";
	currentBadge.createEl("span", { text: "✨" }).style.fontSize = "16px";
	const cur = currentBadge.createDiv();
	cur.createEl("div", { text: "Atual" }).style.fontSize = "10px";
	cur.createEl("div", { text: plugin.settings.ollama.generationModel }).style.fontSize = "11px";
	cur.style.fontFamily = "var(--font-monospace)";

	// Recommendation stack
	if (stack) {
		const recDiv = header.createDiv();
		recDiv.style.marginTop = "10px";
		recDiv.style.padding = "8px";
		recDiv.style.background = "var(--background-secondary-alt)";
		recDiv.style.borderRadius = "4px";
		recDiv.style.fontSize = "11px";
		recDiv.style.borderLeft = "3px solid var(--color-green)";

		const recHead = recDiv.createEl("div", { text: "🎯 Recomendado pra sua máquina" });
		recHead.style.fontWeight = "bold";
		recHead.style.marginBottom = "4px";

		const recList = recDiv.createDiv();
		recList.style.display = "grid";
		recList.style.gridTemplateColumns = "repeat(auto-fit, minmax(200px, 1fr))";
		recList.style.gap = "6px";

		[
			{ label: "Geração", model: stack.generation },
			{ label: "Leve", model: stack.small },
			{ label: "Embeddings", model: stack.embeddings },
		].forEach(({ label, model }) => {
			const cell = recList.createDiv();
			cell.createEl("span", { text: label }).style.fontWeight = "bold";
			const codeEl = cell.createEl("code", { text: model.tag });
			codeEl.style.fontSize = "10px";
			codeEl.style.marginLeft = "4px";
			cell.createEl("div", { text: `~${model.ramGB} GB RAM · ${model.downloadGB} GB pull` }).style.opacity = "0.7";
		});

		const totalEl = recDiv.createEl("div", {
			text: `📥 Total download stack: ~${stack.totalDownloadGB.toFixed(1)} GB`,
		});
		totalEl.style.marginTop = "6px";
		totalEl.style.fontSize = "10px";
		totalEl.style.opacity = "0.65";

		const pullStackBtn = recDiv.createEl("button", { text: "📥 Baixar stack recomendado" });
		pullStackBtn.style.marginTop = "6px";
		pullStackBtn.style.fontSize = "11px";
		pullStackBtn.style.padding = "4px 10px";
		pullStackBtn.addClass("mod-cta");
		pullStackBtn.addEventListener("click", () =>
			void pullStack(plugin, [stack.small, stack.generation, stack.embeddings], () =>
				renderModelCatalogSub(container, plugin)
			)
		);
	}

	// Filter bar
	const filters = container.createDiv();
	filters.style.display = "flex";
	filters.style.gap = "4px";
	filters.style.marginBottom = "10px";
	filters.style.flexWrap = "wrap";

	const allBtn = filters.createEl("button", { text: "Todos" });
	allBtn.style.fontSize = "10px";
	allBtn.style.padding = "3px 8px";
	allBtn.addClass("mod-cta");

	let activeCategory: ModelCategory | "all" = "all";
	const categoryButtons: { btn: HTMLButtonElement; cat: ModelCategory | "all" }[] = [
		{ btn: allBtn, cat: "all" },
	];
	(Object.keys(CATEGORY_META) as ModelCategory[]).forEach((cat) => {
		const meta = CATEGORY_META[cat];
		const btn = filters.createEl("button", { text: `${meta.icon} ${meta.label}` });
		btn.style.fontSize = "10px";
		btn.style.padding = "3px 8px";
		btn.title = meta.ramRange;
		categoryButtons.push({ btn, cat });
		btn.addEventListener("click", () => {
			activeCategory = cat;
			updateFilterButtons();
			renderList();
		});
	});
	allBtn.addEventListener("click", () => {
		activeCategory = "all";
		updateFilterButtons();
		renderList();
	});

	const updateFilterButtons = () => {
		categoryButtons.forEach(({ btn, cat }) => {
			if (cat === activeCategory) {
				btn.addClass("mod-cta");
			} else {
				btn.removeClass("mod-cta");
			}
		});
	};

	// Model list
	const list = container.createDiv();
	list.style.maxHeight = "calc(100vh - 480px)";
	list.style.overflowY = "auto";

	const renderList = () => {
		list.empty();

		const items = activeCategory === "all" ? CATALOG : CATALOG.filter((m) => m.category === activeCategory);

		// Group by category if "all"
		if (activeCategory === "all") {
			const order: ModelCategory[] = ["tiny", "light", "balanced", "quality", "pro"];
			for (const cat of order) {
				const group = items.filter((m) => m.category === cat);
				if (group.length === 0) continue;

				const meta = CATEGORY_META[cat];
				const sectionHead = list.createEl("div", { text: `${meta.icon} ${meta.label} — ${meta.ramRange}` });
				sectionHead.style.fontSize = "11px";
				sectionHead.style.fontWeight = "bold";
				sectionHead.style.opacity = "0.7";
				sectionHead.style.marginTop = "12px";
				sectionHead.style.marginBottom = "6px";
				sectionHead.style.letterSpacing = "0.5px";

				for (const m of group) {
					renderModelCard(list, m, installedSet, plugin, totalRamGB, freeRamGB, () =>
						void renderModelCatalogSub(container, plugin)
					);
				}
			}
		} else {
			for (const m of items) {
				renderModelCard(list, m, installedSet, plugin, totalRamGB, freeRamGB, () =>
					void renderModelCatalogSub(container, plugin)
				);
			}
		}
	};

	renderList();
}

function renderModelCard(
	parent: HTMLElement,
	m: CatalogModel,
	installed: Set<string>,
	plugin: AtlasPlugin,
	totalRamGB: number,
	freeRamGB: number,
	onChange: () => void
): void {
	const isInstalled = installed.has(m.tag) || installed.has(m.tag.split(":")[0]);
	const isCurrent = plugin.settings.ollama.generationModel === m.tag;
	const fits = totalRamGB === 0 || m.ramGB <= totalRamGB * 0.8;

	const card = parent.createDiv();
	card.style.padding = "10px 12px";
	card.style.marginBottom = "6px";
	card.style.background = "var(--background-secondary)";
	card.style.borderRadius = "6px";
	card.style.borderLeft = `3px solid ${isCurrent ? "var(--color-green)" : isInstalled ? "var(--interactive-accent)" : fits ? "transparent" : "var(--color-orange)"}`;

	const top = card.createDiv();
	top.style.display = "flex";
	top.style.alignItems = "center";
	top.style.gap = "10px";
	top.style.marginBottom = "4px";

	const kind = KIND_META[m.kind];
	top.createEl("span", { text: kind.icon }).style.fontSize = "16px";

	const wrap = top.createDiv();
	wrap.style.flexGrow = "1";
	const nameRow = wrap.createDiv();
	nameRow.style.display = "flex";
	nameRow.style.gap = "6px";
	nameRow.style.alignItems = "center";

	const nameEl = nameRow.createEl("div", { text: m.name });
	nameEl.style.fontSize = "13px";
	nameEl.style.fontWeight = "bold";

	if (m.recommended) {
		const recBadge = nameRow.createEl("span", { text: "★" });
		recBadge.style.color = "var(--color-yellow)";
		recBadge.title = "Recomendado pelo Atlas";
	}

	if (isCurrent) {
		const curBadge = nameRow.createEl("span", { text: "ATUAL" });
		curBadge.style.fontSize = "9px";
		curBadge.style.padding = "1px 5px";
		curBadge.style.borderRadius = "3px";
		curBadge.style.background = "var(--color-green)";
		curBadge.style.color = "white";
		curBadge.style.fontWeight = "bold";
	} else if (isInstalled) {
		const inBadge = nameRow.createEl("span", { text: "INSTALADO" });
		inBadge.style.fontSize = "9px";
		inBadge.style.padding = "1px 5px";
		inBadge.style.borderRadius = "3px";
		inBadge.style.background = "var(--interactive-accent)";
		inBadge.style.color = "var(--text-on-accent)";
	}

	const tagEl = wrap.createEl("code", { text: m.tag });
	tagEl.style.fontSize = "10px";
	tagEl.style.opacity = "0.65";

	// Specs
	const specs = card.createDiv();
	specs.style.display = "flex";
	specs.style.gap = "10px";
	specs.style.fontSize = "10px";
	specs.style.opacity = "0.75";
	specs.style.flexWrap = "wrap";
	specs.style.marginBottom = "6px";

	specs.createEl("span", { text: `~${m.ramGB} GB RAM` });
	specs.createEl("span", { text: `📥 ${m.downloadGB} GB` });
	specs.createEl("span", { text: `${m.contextK}k ctx` });
	if (m.supportsTools) specs.createEl("span", { text: "🔧 tools" });
	specs.createEl("span", { text: `PT-BR ${"⭐".repeat(m.ptBrQuality)}` });
	if (!fits && totalRamGB > 0) {
		const warn = specs.createEl("span", { text: "⚠️ pode não caber" });
		warn.style.color = "var(--color-orange)";
		warn.style.fontWeight = "bold";
	}

	const desc = card.createEl("div", { text: m.description });
	desc.style.fontSize = "11px";
	desc.style.opacity = "0.85";
	desc.style.marginBottom = "8px";

	// Actions
	const actions = card.createDiv();
	actions.style.display = "flex";
	actions.style.gap = "6px";
	actions.style.flexWrap = "wrap";

	if (!isInstalled) {
		const pullBtn = actions.createEl("button", { text: `📥 Baixar (${m.downloadGB} GB)` });
		pullBtn.style.fontSize = "10px";
		pullBtn.style.padding = "4px 10px";
		pullBtn.addClass("mod-cta");
		pullBtn.addEventListener("click", async () => {
			pullBtn.setText("Baixando...");
			pullBtn.disabled = true;
			const notice = new Notice(`Atlas: baixando ${m.tag}...`, 0);
			try {
				await plugin.ollama.pullModel(m.tag, (status, pct) => {
					notice.setMessage(`Atlas: ${m.tag} · ${status} ${pct.toFixed(0)}%`);
				});
				notice.hide();
				new Notice(`✓ ${m.name} baixado.`, 5000);
				onChange();
			} catch (e) {
				notice.hide();
				new Notice(`Atlas: falha — ${String(e)}`, 10000);
				pullBtn.setText(`📥 Baixar (${m.downloadGB} GB)`);
				pullBtn.disabled = false;
			}
		});
	}

	if (isInstalled && !isCurrent && (m.kind === "generation" || m.kind === "small")) {
		const useBtn = actions.createEl("button", { text: "✨ Usar como default" });
		useBtn.style.fontSize = "10px";
		useBtn.style.padding = "4px 10px";
		useBtn.addEventListener("click", async () => {
			if (m.kind === "generation") {
				plugin.settings.ollama.generationModel = m.tag;
			} else {
				plugin.settings.ollama.smallModel = m.tag;
			}
			await plugin.saveSettings();
			new Notice(`Atlas: ${m.name} é o novo default.`);
			onChange();
		});
	}

	if (m.tag.includes("vision")) {
		const warn = actions.createEl("span", { text: "ℹ️ vision = +8 GB RAM temporário ao usar" });
		warn.style.fontSize = "9px";
		warn.style.opacity = "0.7";
		warn.style.alignSelf = "center";
	}
}

async function pullStack(
	plugin: AtlasPlugin,
	models: CatalogModel[],
	onDone: () => void
): Promise<void> {
	const notice = new Notice("Atlas: baixando stack recomendado...", 0);
	try {
		for (const m of models) {
			const installed = await plugin.ollama.listModels();
			if (installed.includes(m.tag) || installed.includes(m.tag.split(":")[0])) continue;
			await plugin.ollama.pullModel(m.tag, (status, pct) => {
				notice.setMessage(`Atlas: ${m.tag} · ${status} ${pct.toFixed(0)}%`);
			});
		}
		notice.hide();
		new Notice("✓ Stack instalado.", 6000);
		onDone();
	} catch (e) {
		notice.hide();
		new Notice(`Atlas: falha — ${String(e)}`, 10000);
	}
}
