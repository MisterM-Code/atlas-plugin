import { TFile, Notice } from "obsidian";
import type AtlasPlugin from "../../../../main";
import { TimeCapsuleModal } from "../../../tools/time-capsule";
import { t } from "../../../i18n";

const CAPSULE_FOLDER = "12_Studies/time-capsules";

interface CapsuleEntry {
	file: TFile;
	title: string;
	createdAt: string;
	unlockDate: string;
	delivered: boolean;
	daysUntil: number;
}

/**
 * Time Capsules sub-view — listar cápsulas (pendentes / desbloqueadas / entregues)
 * + botão "+ Nova" abre TimeCapsuleModal.
 *
 * v0.27: polish premium com utility classes + cyan accents + grouped sections.
 */
export async function renderLabCapsules(
	container: HTMLElement,
	plugin: AtlasPlugin
): Promise<void> {
	container.empty();
	container.addClass("atlas-lab-capsules", "atlas-section-stagger");

	// Header
	const header = container.createDiv({ cls: "atlas-tab-section-header" });
	header.createEl("h3", {
		cls: "atlas-tab-section-title",
		text: "🕰️ Time Capsules",
	});
	container.createEl("div", {
		cls: "atlas-tab-section-subtitle",
		text: `Notas que você sela hoje pra abrir no futuro. Atlas avisa na data marcada. Pasta: ${CAPSULE_FOLDER}`,
	});

	// Action bar
	const actions = container.createDiv({ cls: "atlas-lab-serendipity-actions" });
	const newBtn = actions.createEl("button", {
		cls: "mod-cta",
		text: "+ Nova cápsula",
	});
	newBtn.addEventListener("click", () => {
		new TimeCapsuleModal(plugin.app, plugin).open();
	});

	const checkBtn = actions.createEl("button", { text: "🔔 Verificar entregas hoje" });
	checkBtn.addEventListener("click", async () => {
		const apiAny = plugin.app as unknown as {
			commands?: { executeCommandById?: (id: string) => void };
		};
		apiAny.commands?.executeCommandById?.("atlas:check-capsules");
		new Notice("Atlas: verificação rodada (veja desktop notification se houver entrega).");
		void renderLabCapsules(container, plugin);
	});

	const refreshBtn = actions.createEl("button", { text: "↻" });
	refreshBtn.addEventListener("click", () => void renderLabCapsules(container, plugin));

	container.createDiv({ cls: "atlas-tab-section-divider" });

	const capsules = await collectCapsules(plugin);
	if (capsules.length === 0) {
		const empty = container.createDiv({ cls: "atlas-tab-empty-state" });
		empty.createEl("div", { cls: "atlas-tab-empty-emoji", text: "🕰️" });
		empty.createEl("div", {
			cls: "atlas-tab-empty-title",
			text: t("empty.lab.capsules.title"),
		});
		empty.createEl("div", {
			cls: "atlas-tab-empty-desc",
			text: t("empty.lab.capsules.body"),
		});
		return;
	}

	// Group: pending (delivered=false, future) | unlocked (delivered=false, past) | delivered
	const pending = capsules
		.filter((c) => !c.delivered && c.daysUntil > 0)
		.sort((a, b) => a.daysUntil - b.daysUntil);
	const unlocked = capsules
		.filter((c) => !c.delivered && c.daysUntil <= 0)
		.sort((a, b) => a.daysUntil - b.daysUntil);
	const delivered = capsules
		.filter((c) => c.delivered)
		.sort((a, b) => b.unlockDate.localeCompare(a.unlockDate));

	const list = container.createDiv({ cls: "atlas-lab-capsules-list" });

	if (unlocked.length > 0) {
		section(list, "🎁 Prontas pra abrir", unlocked, plugin, "unlocked");
	}
	if (pending.length > 0) {
		section(list, "🔒 Seladas (aguardando)", pending, plugin, "pending");
	}
	if (delivered.length > 0) {
		section(list, "📬 Entregues", delivered, plugin, "delivered");
	}
}

function section(
	parent: HTMLElement,
	title: string,
	items: CapsuleEntry[],
	plugin: AtlasPlugin,
	kind: "pending" | "unlocked" | "delivered"
): void {
	const header = parent.createDiv({ cls: "atlas-lab-capsules-section-title" });
	header.setText(`${title}  (${items.length})`);

	for (const c of items) {
		const card = parent.createDiv({ cls: `atlas-tab-card-premium atlas-lab-capsules-card is-${kind}` });

		const top = card.createDiv({ cls: "atlas-lab-capsules-card-top" });
		const icon = kind === "delivered" ? "📬" : kind === "unlocked" ? "🎁" : "🔒";
		top.createEl("span", { cls: "atlas-lab-capsules-icon", text: icon });

		const wrap = top.createDiv({ cls: "atlas-lab-capsules-body" });
		wrap.createEl("div", {
			cls: "atlas-lab-capsules-title",
			text: c.title,
		});

		const subEl = wrap.createEl("div", { cls: "atlas-lab-capsules-meta" });
		const createdShort = c.createdAt.substring(0, 10);
		if (kind === "pending") {
			subEl.setText(`Abre em ${c.daysUntil} dias (${c.unlockDate}) · criada ${createdShort}`);
		} else if (kind === "unlocked") {
			subEl.addClass("is-ready");
			subEl.setText(`⚡ Liberada há ${-c.daysUntil} dias (${c.unlockDate}) · CLIQUE para abrir`);
		} else {
			subEl.setText(`Entregue em ${c.unlockDate} · criada ${createdShort}`);
		}

		card.addEventListener("click", async () => {
			await plugin.app.workspace.getLeaf().openFile(c.file);
		});
	}
}

async function collectCapsules(plugin: AtlasPlugin): Promise<CapsuleEntry[]> {
	const folder = plugin.app.vault.getAbstractFileByPath(CAPSULE_FOLDER);
	if (!folder) return [];
	const today = new Date().toISOString().split("T")[0];
	const out: CapsuleEntry[] = [];

	const files = plugin.app.vault.getMarkdownFiles().filter((f) =>
		f.path.startsWith(CAPSULE_FOLDER)
	);

	for (const f of files) {
		const cache = plugin.app.metadataCache.getFileCache(f);
		const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
		const unlockDate = (fm.unlock_date as string) ?? "";
		if (!/^\d{4}-\d{2}-\d{2}$/.test(unlockDate)) continue;
		const title = (fm.title as string) ?? f.basename;
		const createdAt = (fm.created_at as string) ?? new Date(f.stat.ctime).toISOString();
		const delivered = fm.delivered === true;

		const todayMs = new Date(`${today}T00:00:00`).getTime();
		const unlockMs = new Date(`${unlockDate}T00:00:00`).getTime();
		const daysUntil = Math.round((unlockMs - todayMs) / 86_400_000);

		out.push({
			file: f,
			title,
			createdAt,
			unlockDate,
			delivered,
			daysUntil,
		});
	}
	return out;
}
