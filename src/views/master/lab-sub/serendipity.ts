import { TFile, Notice } from "obsidian";
import type AtlasPlugin from "../../../../main";

/**
 * Serendipity sub-view — feed dos insights gerados pela engine.
 *
 * Mostra histórico de notas que Atlas resgatou + botão "Forçar 1 agora".
 */
export async function renderLabSerendipity(
	container: HTMLElement,
	plugin: AtlasPlugin
): Promise<void> {
	container.empty();

	const intro = container.createDiv();
	intro.style.fontSize = "11px";
	intro.style.opacity = "0.7";
	intro.style.marginBottom = "12px";
	intro.setText(
		"Atlas resgata 3×/dia (10h, 14h, 19h) uma nota antiga relevante. Aqui você vê o histórico e pode forçar um insight agora."
	);

	// Action bar
	const actions = container.createDiv();
	actions.style.display = "flex";
	actions.style.gap = "8px";
	actions.style.marginBottom = "12px";

	const forceBtn = actions.createEl("button", { text: "💡 Forçar 1 insight agora" });
	forceBtn.style.fontSize = "12px";
	forceBtn.style.padding = "6px 14px";
	forceBtn.addClass("mod-cta");
	forceBtn.addEventListener("click", async () => {
		forceBtn.setText("Pensando...");
		forceBtn.disabled = true;
		try {
			await plugin.serendipity.tick();
			new Notice("Atlas: insight gerado (veja a notification + lista abaixo).");
		} catch (e) {
			new Notice(`Atlas: ${String(e)}`, 8000);
		}
		forceBtn.setText("💡 Forçar 1 insight agora");
		forceBtn.disabled = false;
		void renderLabSerendipity(container, plugin);
	});

	const refreshBtn = actions.createEl("button", { text: "↻ Atualizar" });
	refreshBtn.style.fontSize = "11px";
	refreshBtn.style.padding = "6px 12px";
	refreshBtn.addEventListener("click", () => void renderLabSerendipity(container, plugin));

	// Feed
	const feedHeader = container.createEl("div", { text: "Histórico recente (últimos 15)" });
	feedHeader.style.fontSize = "10px";
	feedHeader.style.fontWeight = "bold";
	feedHeader.style.opacity = "0.7";
	feedHeader.style.marginBottom = "6px";
	feedHeader.style.letterSpacing = "0.5px";

	const list = container.createDiv();
	list.style.maxHeight = "calc(100vh - 280px)";
	list.style.overflowY = "auto";

	const recent = plugin.serendipity?.recent(15) ?? [];
	if (recent.length === 0) {
		const empty = list.createDiv();
		empty.style.padding = "32px 16px";
		empty.style.textAlign = "center";
		empty.style.opacity = "0.6";
		empty.setText(
			"📭 Nenhum insight ainda. Click 'Forçar 1 insight agora' acima ou aguarde o próximo tick (10h/14h/19h)."
		);
		return;
	}

	for (const item of recent) {
		const card = list.createDiv();
		card.style.padding = "10px 12px";
		card.style.marginBottom = "6px";
		card.style.background = "var(--background-secondary)";
		card.style.borderRadius = "6px";
		card.style.border = "1px solid var(--background-modifier-border)";
		card.style.cursor = "pointer";
		card.style.transition = "border-color 120ms";

		card.addEventListener("mouseenter", () => {
			card.style.borderColor = "var(--interactive-accent)";
		});
		card.addEventListener("mouseleave", () => {
			card.style.borderColor = "var(--background-modifier-border)";
		});

		const top = card.createDiv();
		top.style.display = "flex";
		top.style.alignItems = "center";
		top.style.gap = "10px";

		const iconEl = top.createEl("span", { text: "💡" });
		iconEl.style.fontSize = "18px";

		const wrap = top.createDiv();
		wrap.style.flexGrow = "1";
		const file = plugin.app.vault.getAbstractFileByPath(item.path);
		const titleText = file instanceof TFile ? file.basename : item.path;
		const titleEl = wrap.createEl("div", { text: titleText });
		titleEl.style.fontSize = "13px";
		titleEl.style.fontWeight = "500";

		const subEl = wrap.createEl("div");
		subEl.style.fontSize = "10px";
		subEl.style.opacity = "0.65";
		const shownDate = new Date(item.shownAt);
		const ago = relativeTime(shownDate);
		subEl.setText(
			`Mostrado ${ago} · ${item.dismissed > 0 ? `dispensado ${item.dismissed}× · ` : ""}${item.path}`
		);

		// Open + dismiss buttons
		const btns = card.createDiv();
		btns.style.display = "flex";
		btns.style.gap = "6px";
		btns.style.marginTop = "6px";

		const openBtn = btns.createEl("button", { text: "📖 Abrir" });
		openBtn.style.fontSize = "10px";
		openBtn.style.padding = "4px 10px";
		openBtn.addEventListener("click", async (ev) => {
			ev.stopPropagation();
			if (file instanceof TFile) {
				await plugin.app.workspace.getLeaf().openFile(file);
			} else {
				new Notice(`Atlas: nota ${item.path} não encontrada.`);
			}
		});

		const dismissBtn = btns.createEl("button", { text: "🚫 Dispensar" });
		dismissBtn.style.fontSize = "10px";
		dismissBtn.style.padding = "4px 10px";
		dismissBtn.title = "Marcar como 'não relevante' — Atlas evita recomendar de novo";
		dismissBtn.addEventListener("click", (ev) => {
			ev.stopPropagation();
			plugin.serendipity?.dismiss(item.path);
			new Notice("Atlas: dispensado.");
			void renderLabSerendipity(container, plugin);
		});

		// Click no card abre nota
		card.addEventListener("click", async () => {
			if (file instanceof TFile) {
				await plugin.app.workspace.getLeaf().openFile(file);
			}
		});
	}
}

function relativeTime(d: Date): string {
	const ms = Date.now() - d.getTime();
	const min = Math.floor(ms / 60_000);
	const h = Math.floor(min / 60);
	const days = Math.floor(h / 24);
	if (min < 1) return "agora";
	if (min < 60) return `há ${min} min`;
	if (h < 24) return `há ${h}h`;
	if (days < 7) return `há ${days}d`;
	if (days < 30) return `há ${Math.floor(days / 7)}sem`;
	return d.toLocaleDateString("pt-BR");
}
