import { TFile, Notice } from "obsidian";
import type AtlasPlugin from "../../../../main";
import { TimeCapsuleModal } from "../../../tools/time-capsule";

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
 */
export async function renderLabCapsules(
	container: HTMLElement,
	plugin: AtlasPlugin
): Promise<void> {
	container.empty();

	const intro = container.createDiv();
	intro.style.fontSize = "11px";
	intro.style.opacity = "0.7";
	intro.style.marginBottom = "12px";
	intro.setText(
		`Notas que você sela hoje pra abrir no futuro. Atlas avisa na data marcada. Pasta: ${CAPSULE_FOLDER}`
	);

	// Action bar
	const actions = container.createDiv();
	actions.style.display = "flex";
	actions.style.gap = "8px";
	actions.style.marginBottom = "12px";

	const newBtn = actions.createEl("button", { text: "+ Nova cápsula" });
	newBtn.style.fontSize = "12px";
	newBtn.style.padding = "6px 14px";
	newBtn.addClass("mod-cta");
	newBtn.addEventListener("click", () => {
		new TimeCapsuleModal(plugin.app, plugin).open();
	});

	const checkBtn = actions.createEl("button", { text: "🔔 Verificar entregas hoje" });
	checkBtn.style.fontSize = "11px";
	checkBtn.style.padding = "6px 12px";
	checkBtn.addEventListener("click", async () => {
		const apiAny = plugin.app as unknown as {
			commands?: { executeCommandById?: (id: string) => void };
		};
		apiAny.commands?.executeCommandById?.("atlas:atlas-check-capsules");
		new Notice("Atlas: verificação rodada (veja desktop notification se houver entrega).");
		void renderLabCapsules(container, plugin);
	});

	const refreshBtn = actions.createEl("button", { text: "↻" });
	refreshBtn.style.fontSize = "11px";
	refreshBtn.style.padding = "6px 10px";
	refreshBtn.addEventListener("click", () => void renderLabCapsules(container, plugin));

	const capsules = await collectCapsules(plugin);
	if (capsules.length === 0) {
		const empty = container.createDiv();
		empty.style.padding = "32px 16px";
		empty.style.textAlign = "center";
		empty.style.opacity = "0.6";
		empty.setText(
			"🕰️ Você ainda não tem cápsulas. Click '+ Nova cápsula' para escrever uma carta pro seu eu futuro."
		);
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

	const list = container.createDiv();
	list.style.maxHeight = "calc(100vh - 320px)";
	list.style.overflowY = "auto";

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
	const header = parent.createDiv();
	header.style.fontSize = "11px";
	header.style.fontWeight = "bold";
	header.style.opacity = "0.7";
	header.style.marginTop = "16px";
	header.style.marginBottom = "6px";
	header.style.letterSpacing = "0.5px";
	header.setText(`${title}  (${items.length})`);

	for (const c of items) {
		const card = parent.createDiv();
		card.style.padding = "10px 12px";
		card.style.marginBottom = "6px";
		card.style.background = "var(--background-secondary)";
		card.style.borderRadius = "6px";
		card.style.cursor = "pointer";
		card.style.borderLeft = `3px solid ${borderColor(kind)}`;

		const top = card.createDiv();
		top.style.display = "flex";
		top.style.alignItems = "center";
		top.style.gap = "10px";

		const iconEl = top.createEl("span", { text: kind === "delivered" ? "📬" : kind === "unlocked" ? "🎁" : "🔒" });
		iconEl.style.fontSize = "16px";

		const wrap = top.createDiv();
		wrap.style.flexGrow = "1";
		const titleEl = wrap.createEl("div", { text: c.title });
		titleEl.style.fontSize = "12px";
		titleEl.style.fontWeight = "500";

		const subEl = wrap.createEl("div");
		subEl.style.fontSize = "10px";
		subEl.style.opacity = "0.65";

		if (kind === "pending") {
			subEl.setText(`Abre em ${c.daysUntil} dias (${c.unlockDate}) · criada ${c.createdAt.substring(0, 10)}`);
		} else if (kind === "unlocked") {
			subEl.setText(`⚡ Liberada há ${-c.daysUntil} dias (${c.unlockDate}) · CLIQUE para abrir`);
			subEl.style.color = "var(--color-orange)";
			subEl.style.fontWeight = "bold";
		} else {
			subEl.setText(`Entregue em ${c.unlockDate} · criada ${c.createdAt.substring(0, 10)}`);
		}

		card.addEventListener("click", async () => {
			await plugin.app.workspace.getLeaf().openFile(c.file);
		});
	}
}

function borderColor(kind: "pending" | "unlocked" | "delivered"): string {
	switch (kind) {
		case "unlocked":
			return "var(--color-orange)";
		case "pending":
			return "var(--color-blue)";
		case "delivered":
			return "var(--color-green)";
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
