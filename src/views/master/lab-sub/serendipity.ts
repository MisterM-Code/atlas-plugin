import { TFile, Notice } from "obsidian";
import type AtlasPlugin from "../../../../main";
import { t } from "../../../i18n";

/**
 * Serendipity sub-view — feed dos insights gerados pela engine.
 *
 * Mostra histórico de notas que Atlas resgatou + botão "Forçar 1 agora".
 * v0.27: polish premium com utility classes + cyan accents + hover lifts.
 */
export async function renderLabSerendipity(
	container: HTMLElement,
	plugin: AtlasPlugin
): Promise<void> {
	container.empty();
	container.addClass("atlas-lab-serendipity", "atlas-section-stagger");

	// Header com gradient title
	const header = container.createDiv({ cls: "atlas-tab-section-header" });
	header.createEl("h3", {
		cls: "atlas-tab-section-title",
		text: "💡 Serendipity Engine",
	});
	container.createEl("div", {
		cls: "atlas-tab-section-subtitle",
		text: "Atlas resgata 3×/dia (10h, 14h, 19h) uma nota antiga relevante. Você pode forçar agora ou ver o histórico.",
	});

	// Action bar
	const actions = container.createDiv({ cls: "atlas-lab-serendipity-actions" });
	const forceBtn = actions.createEl("button", {
		cls: "mod-cta",
		text: "💡 Forçar 1 insight agora",
	});
	forceBtn.addEventListener("click", async () => {
		forceBtn.setText("Pensando...");
		forceBtn.disabled = true;
		try {
			await plugin.serendipity.tick();
			new Notice("Atlas: insight gerado.");
		} catch (e) {
			new Notice(`Atlas: ${String(e)}`, 8000);
		}
		void renderLabSerendipity(container, plugin);
	});

	const refreshBtn = actions.createEl("button", { text: "↻ Atualizar" });
	refreshBtn.addEventListener("click", () => void renderLabSerendipity(container, plugin));

	// Divider
	container.createDiv({ cls: "atlas-tab-section-divider" });

	const list = container.createDiv({ cls: "atlas-lab-serendipity-list" });

	const recent = plugin.serendipity?.recent(15) ?? [];
	if (recent.length === 0) {
		const empty = list.createDiv({ cls: "atlas-tab-empty-state" });
		empty.createEl("div", { cls: "atlas-tab-empty-emoji", text: "📭" });
		empty.createEl("div", {
			cls: "atlas-tab-empty-title",
			text: t("empty.lab.serendipity.title"),
		});
		empty.createEl("div", {
			cls: "atlas-tab-empty-desc",
			text: t("empty.lab.serendipity.body"),
		});
		return;
	}

	for (const item of recent) {
		const card = list.createDiv({ cls: "atlas-tab-card-premium atlas-lab-serendipity-card" });

		const top = card.createDiv({ cls: "atlas-lab-serendipity-card-top" });
		top.createEl("span", { cls: "atlas-lab-serendipity-icon", text: "💡" });

		const wrap = top.createDiv({ cls: "atlas-lab-serendipity-body" });
		const file = plugin.app.vault.getAbstractFileByPath(item.path);
		const titleText = file instanceof TFile ? file.basename : item.path;
		wrap.createEl("div", {
			cls: "atlas-lab-serendipity-title",
			text: titleText,
		});

		const shownDate = new Date(item.shownAt);
		const ago = relativeTime(shownDate);
		const dismissedSuffix = item.dismissed > 0 ? `dispensado ${item.dismissed}× · ` : "";
		wrap.createEl("div", {
			cls: "atlas-lab-serendipity-meta",
			text: `Mostrado ${ago} · ${dismissedSuffix}${item.path}`,
		});

		// Action buttons
		const btns = card.createDiv({ cls: "atlas-lab-serendipity-actions-row" });

		const openBtn = btns.createEl("button", { text: "📖 Abrir" });
		openBtn.addEventListener("click", async (ev) => {
			ev.stopPropagation();
			if (file instanceof TFile) {
				await plugin.app.workspace.getLeaf().openFile(file);
			} else {
				new Notice(`Atlas: nota ${item.path} não encontrada.`);
			}
		});

		const dismissBtn = btns.createEl("button", { text: "🚫 Dispensar" });
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
