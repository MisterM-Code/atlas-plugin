/**
 * Atlas v0.9 Sprint 29.2 — Reminders Tab
 *
 * Tab própria com 3 grupos: Overdue, Today, Upcoming (7 days).
 * Cada item: countdown live, snooze (1h / amanhã / sexta), ir pra nota, marcar completo.
 * Botão "+ Novo reminder" abre PromptModal sequence (texto + datetime).
 */

import { Notice, TFile } from "obsidian";
import type AtlasPlugin from "../../../main";
import type { ReminderEntry } from "../../automation/reminder-watcher";
import { promptText } from "../../ui/prompt-modal";
import { renderEmptyState } from "../../ui/empty-states";

export async function renderRemindersTab(container: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	container.empty();
	container.style.padding = "16px";
	container.style.overflow = "auto";

	// Header
	const header = container.createDiv();
	header.style.display = "flex";
	header.style.alignItems = "center";
	header.style.justifyContent = "space-between";
	header.style.marginBottom = "16px";

	const title = header.createDiv();
	title.style.fontSize = "20px";
	title.style.fontWeight = "600";
	title.setText("🔔 Reminders");

	const newBtn = header.createEl("button", { text: "+ Novo reminder", cls: "mod-cta" });
	newBtn.addEventListener("click", () => void promptNewReminder(plugin, container));

	const subtitle = container.createDiv();
	subtitle.style.fontSize = "12px";
	subtitle.style.opacity = "0.6";
	subtitle.style.marginBottom = "16px";
	subtitle.setText("Tasks com (@YYYY-MM-DD HH:MM) viram reminders. Notification 15 min antes.");

	// Loading state
	const loading = container.createDiv();
	loading.style.padding = "12px";
	loading.setText("Atlas: scaneando vault…");

	const watcher = plugin.reminderWatcher;
	if (!watcher) {
		loading.setText("Atlas: ReminderWatcher indisponível.");
		return;
	}

	let upcoming: ReminderEntry[] = [];
	let overdue: ReminderEntry[] = [];
	try {
		[upcoming, overdue] = await Promise.all([watcher.listUpcoming(7), watcher.listOverdue()]);
	} catch (e) {
		loading.setText(`Atlas: erro — ${String(e)}`);
		return;
	}
	loading.remove();

	// Today vs Upcoming split
	const todayStart = new Date();
	todayStart.setHours(0, 0, 0, 0);
	const tomorrowStart = new Date(todayStart);
	tomorrowStart.setDate(tomorrowStart.getDate() + 1);
	const todayItems = upcoming.filter(
		(r) => r.dueAt.getTime() >= todayStart.getTime() && r.dueAt.getTime() < tomorrowStart.getTime()
	);
	const futureItems = upcoming.filter((r) => r.dueAt.getTime() >= tomorrowStart.getTime());

	if (overdue.length === 0 && todayItems.length === 0 && futureItems.length === 0) {
		renderEmptyState(container, "reminders-quiet", {
			action: {
				label: "+ Criar primeiro reminder",
				onClick: () => void promptNewReminder(plugin, container),
			},
		});
		return;
	}

	if (overdue.length > 0) {
		renderGroup(container, "🔴 Atrasados", overdue, "var(--color-red)", plugin);
	}
	if (todayItems.length > 0) {
		renderGroup(container, "🟡 Hoje", todayItems, "var(--color-orange)", plugin);
	}
	if (futureItems.length > 0) {
		renderGroup(container, "🟢 Próximos 7 dias", futureItems, "var(--color-green)", plugin);
	}
}

function renderGroup(
	container: HTMLElement,
	label: string,
	items: ReminderEntry[],
	accentColor: string,
	plugin: AtlasPlugin
): void {
	const groupTitle = container.createEl("h3", { text: `${label} (${items.length})` });
	groupTitle.style.marginTop = "20px";
	groupTitle.style.marginBottom = "8px";
	groupTitle.style.fontSize = "14px";
	groupTitle.style.color = accentColor;

	for (const r of items) {
		renderReminderCard(container, r, accentColor, plugin);
	}
}

function renderReminderCard(
	parent: HTMLElement,
	r: ReminderEntry,
	accentColor: string,
	plugin: AtlasPlugin
): void {
	const card = parent.createDiv();
	card.addClass("atlas-card-interactive");
	card.style.padding = "10px 12px";
	card.style.marginBottom = "8px";
	card.style.borderLeft = `3px solid ${accentColor}`;
	card.style.borderRadius = "6px";
	card.style.background = "var(--background-secondary)";
	card.style.transition = "transform 120ms ease, box-shadow 120ms ease";
	card.style.cursor = "pointer";

	card.addEventListener("mouseenter", () => {
		card.style.transform = "translateY(-1px)";
		card.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)";
	});
	card.addEventListener("mouseleave", () => {
		card.style.transform = "translateY(0)";
		card.style.boxShadow = "none";
	});

	const top = card.createDiv();
	top.style.display = "flex";
	top.style.alignItems = "center";
	top.style.gap = "10px";

	const txt = top.createDiv();
	txt.style.flexGrow = "1";
	txt.style.fontSize = "13px";
	txt.style.fontWeight = "500";
	txt.setText(r.taskText);

	const countdown = top.createDiv();
	countdown.style.fontSize = "11px";
	countdown.style.color = accentColor;
	countdown.style.fontWeight = "600";
	countdown.style.whiteSpace = "nowrap";
	countdown.setText(formatCountdown(r.dueAt));

	const meta = card.createDiv();
	meta.style.fontSize = "11px";
	meta.style.opacity = "0.6";
	meta.style.marginTop = "4px";
	meta.setText(`📍 ${r.notePath} · ${r.dueAt.toLocaleString("pt-BR")}`);

	const actions = card.createDiv();
	actions.style.display = "flex";
	actions.style.gap = "6px";
	actions.style.marginTop = "8px";
	actions.style.flexWrap = "wrap";

	const openBtn = actions.createEl("button", { text: "📖 Abrir nota" });
	openBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		void openReminderNote(plugin, r);
	});

	const doneBtn = actions.createEl("button", { text: "✓ Concluir" });
	doneBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		void completeReminder(plugin, r);
	});

	const snoozeBtn = actions.createEl("button", { text: "💤 +1h" });
	snoozeBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		void snoozeReminder(plugin, r, 60);
	});

	const tomBtn = actions.createEl("button", { text: "⏭ Amanhã" });
	tomBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		void snoozeReminder(plugin, r, 24 * 60);
	});

	card.addEventListener("click", () => void openReminderNote(plugin, r));
}

function formatCountdown(dueAt: Date): string {
	const diff = dueAt.getTime() - Date.now();
	const abs = Math.abs(diff);
	const min = Math.floor(abs / 60_000);
	const hr = Math.floor(min / 60);
	const day = Math.floor(hr / 24);

	const sign = diff < 0 ? "atrasado " : "em ";
	if (day > 0) return `${sign}${day}d ${hr % 24}h`;
	if (hr > 0) return `${sign}${hr}h ${min % 60}m`;
	if (min > 0) return `${sign}${min}m`;
	return diff < 0 ? "AGORA mesmo (atrasado)" : "AGORA";
}

async function openReminderNote(plugin: AtlasPlugin, r: ReminderEntry): Promise<void> {
	const f = plugin.app.vault.getAbstractFileByPath(r.notePath);
	if (f instanceof TFile) {
		await plugin.app.workspace.getLeaf(false).openFile(f);
	}
}

async function completeReminder(plugin: AtlasPlugin, r: ReminderEntry): Promise<void> {
	const f = plugin.app.vault.getAbstractFileByPath(r.notePath);
	if (!(f instanceof TFile)) {
		new Notice("Atlas: nota não encontrada.");
		return;
	}
	let content = await plugin.app.vault.read(f);
	const escaped = r.taskText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const re = new RegExp(`-\\s*\\[\\s*\\]\\s*${escaped}`);
	content = content.replace(re, `- [x] ${r.taskText}`);
	await plugin.app.vault.modify(f, content);
	new Notice(`✓ Atlas: "${r.taskText.substring(0, 40)}…" concluído.`);
	// Re-render tab
	rerender(plugin);
}

async function snoozeReminder(plugin: AtlasPlugin, r: ReminderEntry, addMinutes: number): Promise<void> {
	const f = plugin.app.vault.getAbstractFileByPath(r.notePath);
	if (!(f instanceof TFile)) {
		new Notice("Atlas: nota não encontrada.");
		return;
	}
	const newDate = new Date(r.dueAt.getTime() + addMinutes * 60_000);
	const yyyy = newDate.getFullYear();
	const mm = String(newDate.getMonth() + 1).padStart(2, "0");
	const dd = String(newDate.getDate()).padStart(2, "0");
	const hh = String(newDate.getHours()).padStart(2, "0");
	const min = String(newDate.getMinutes()).padStart(2, "0");
	const newToken = `(@${yyyy}-${mm}-${dd} ${hh}:${min})`;
	let content = await plugin.app.vault.read(f);
	const escaped = r.taskText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const re = new RegExp(`(${escaped})\\s*\\(@\\d{4}-\\d{2}-\\d{2}(?:\\s+\\d{1,2}:\\d{2})?\\)`);
	content = content.replace(re, `$1 ${newToken}`);
	await plugin.app.vault.modify(f, content);
	new Notice(`💤 Atlas: snooze para ${newDate.toLocaleString("pt-BR")}`);
	rerender(plugin);
}

async function promptNewReminder(plugin: AtlasPlugin, container: HTMLElement): Promise<void> {
	const text = await promptText(plugin.app, "Texto do reminder:");
	if (!text) return;
	const datetime = await promptText(plugin.app, "Data/hora (ex: 'amanhã 14h', 'sexta 9h'):");
	if (!datetime) return;
	const tr = await import("../../agent/tool-registry");
	const r = await tr.executeTool("create_reminder", { text, datetime }, plugin);
	new Notice(`Atlas: ${r.message}`, 6000);
	void renderRemindersTab(container, plugin);
}

function rerender(plugin: AtlasPlugin): void {
	// Solicita re-render via plugin event (Master Sidebar listens)
	try {
		document.dispatchEvent(new CustomEvent("atlas:reminders-changed"));
	} catch {
		// ignore
	}
	void plugin;
}
