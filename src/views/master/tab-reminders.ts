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
	container.addClass("atlas-reminders-tab");

	// Header
	const header = container.createDiv({ cls: "atlas-reminders-header" });
	header.createDiv({ cls: "atlas-reminders-title", text: "🔔 Reminders" });
	const newBtn = header.createEl("button", { text: "+ Novo reminder", cls: "mod-cta" });
	newBtn.addEventListener("click", () => void promptNewReminder(plugin, container));

	container.createDiv({
		cls: "atlas-reminders-subtitle",
		text: "Tasks com (@YYYY-MM-DD HH:MM) viram reminders. Notification 15 min antes.",
	});

	// Loading state
	const loading = container.createDiv({ cls: "atlas-reminders-loading", text: "Atlas: scaneando vault…" });

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
		renderGroup(container, "🔴 Atrasados", overdue, "is-overdue", plugin);
	}
	if (todayItems.length > 0) {
		renderGroup(container, "🟡 Hoje", todayItems, "is-today", plugin);
	}
	if (futureItems.length > 0) {
		renderGroup(container, "🟢 Próximos 7 dias", futureItems, "is-future", plugin);
	}
}

function renderGroup(
	container: HTMLElement,
	label: string,
	items: ReminderEntry[],
	severity: "is-overdue" | "is-today" | "is-future",
	plugin: AtlasPlugin
): void {
	container.createEl("h3", {
		cls: `atlas-reminders-group-title ${severity}`,
		text: `${label} (${items.length})`,
	});

	for (const r of items) {
		renderReminderCard(container, r, severity, plugin);
	}
}

function renderReminderCard(
	parent: HTMLElement,
	r: ReminderEntry,
	severity: "is-overdue" | "is-today" | "is-future",
	plugin: AtlasPlugin
): void {
	const card = parent.createDiv({ cls: `atlas-reminder-card atlas-card-interactive ${severity}` });

	const top = card.createDiv({ cls: "atlas-reminder-card-top" });
	top.createDiv({ cls: "atlas-reminder-card-text", text: r.taskText });
	top.createDiv({
		cls: `atlas-reminder-card-countdown ${severity}`,
		text: formatCountdown(r.dueAt),
	});

	card.createDiv({
		cls: "atlas-reminder-card-meta",
		text: `📍 ${r.notePath} · ${r.dueAt.toLocaleString("pt-BR")}`,
	});

	const actions = card.createDiv({ cls: "atlas-reminder-card-actions" });

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
