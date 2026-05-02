import { TFile } from "obsidian";
import type AtlasPlugin from "../../../main";
import { getMode } from "../../coach/scope";
import { WidgetSet, WidgetDef } from "../../ui/widget-system";

/**
 * Atlas Today — drag-drop customizável (Sprint 5).
 */
export async function renderTodayTab(container: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	container.empty();
	container.addClass("atlas-tab-today");

	// Header
	const header = container.createDiv();
	header.style.marginBottom = "12px";

	const now = new Date();
	const hour = now.getHours();
	const greeting =
		hour < 5 ? "🌙 Boa madrugada" :
		hour < 12 ? "🌅 Bom dia" :
		hour < 18 ? "☀️ Boa tarde" :
		"🌇 Boa noite";

	const dateLabel = now.toLocaleDateString("pt-BR", {
		weekday: "long",
		day: "2-digit",
		month: "long",
	});

	const h2 = header.createEl("h2", {
		text: `${greeting}, ${plugin.settings.user.displayName || "—"}`,
	});
	h2.style.margin = "0 0 4px 0";
	h2.style.fontSize = "18px";
	const date = header.createEl("div", { text: dateLabel });
	date.style.fontSize = "12px";
	date.style.opacity = "0.7";
	date.style.textTransform = "capitalize";

	if (getMode() === "coach") {
		const badge = header.createEl("div", { text: "🔒 COACH MODE" });
		badge.style.display = "inline-block";
		badge.style.marginTop = "6px";
		badge.style.padding = "2px 8px";
		badge.style.background = "var(--color-red)";
		badge.style.color = "white";
		badge.style.borderRadius = "4px";
		badge.style.fontSize = "10px";
		badge.style.fontWeight = "bold";
	}

	const widgetWrap = container.createDiv();

	const widgets: WidgetDef[] = [
		{
			id: "stats-bar",
			icon: "📊",
			title: "Stats",
			description: "Streak, cards, KG growth, notas",
			defaultEnabled: true,
			render: (el) => renderStatsWidget(el, plugin),
		},
		{
			id: "atlas-percebeu",
			icon: "💡",
			title: "Atlas percebeu",
			description: "Insights automáticos",
			defaultEnabled: true,
			render: (el) => renderAtlasPercebeu(el, plugin),
		},
		{
			id: "agenda",
			icon: "📅",
			title: "Hoje (reuniões)",
			description: "Agenda do dia",
			defaultEnabled: true,
			render: (el) => renderAgenda(el, plugin),
		},
		{
			id: "tasks",
			icon: "✅",
			title: "Tasks due hoje",
			description: "Tarefas vencendo",
			defaultEnabled: true,
			render: (el) => renderTasks(el, plugin),
		},
		{
			id: "commitments",
			icon: "🔁",
			title: "Commitments abertos",
			description: "Promessas pendentes",
			defaultEnabled: true,
			render: (el) => renderCommitments(el, plugin),
		},
		{
			id: "themes",
			icon: "🏷️",
			title: "Temas em alta",
			description: "Padrões emergindo",
			defaultEnabled: true,
			render: (el) => renderThemes(el, plugin),
		},
		{
			id: "flashcards",
			icon: "🃏",
			title: "Flashcards a revisar",
			description: "Spaced repetition due",
			defaultEnabled: true,
			render: (el) => renderFlashcards(el, plugin),
		},
		{
			id: "quick-actions",
			icon: "⚡",
			title: "Ações rápidas",
			description: "Atalhos pros comandos mais usados",
			defaultEnabled: true,
			render: (el) => renderQuickActions(el, plugin),
		},
		{
			id: "xp-progress",
			icon: "🏆",
			title: "Achievements & XP",
			description: "Nível, achievements desbloqueadas, streak, próximo challenge",
			defaultEnabled: true,
			render: (el) => renderXp(el, plugin),
		},
	];

	const set = new WidgetSet("today", widgets);
	await set.render(widgetWrap);
}

// ──────────────────────────────────────────────────────────────────
// WIDGETS

async function renderStatsWidget(el: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	const now = Date.now();
	const sevenDaysAgo = now - 7 * 86_400_000;
	const dailyStreak = await computeStreak(plugin);
	const flashcardsDue = plugin.flashcards?.dueToday().length ?? 0;
	const kgGrowth = plugin.kg.data.people.filter(
		(p) => new Date(p.createdAt).getTime() >= sevenDaysAgo
	).length;
	const notesLast7d = plugin.app.vault
		.getMarkdownFiles()
		.filter((f) => f.stat.mtime >= sevenDaysAgo).length;

	const grid = el.createDiv();
	grid.style.display = "grid";
	grid.style.gridTemplateColumns = "1fr 1fr 1fr 1fr";
	grid.style.gap = "8px";

	statCard(grid, "🔥 Streak", `${dailyStreak}d`);
	statCard(grid, "🃏 Cards", String(flashcardsDue));
	statCard(grid, "👥 KG", `+${kgGrowth}`);
	statCard(grid, "📝 Notas", String(notesLast7d));
}

async function renderAtlasPercebeu(el: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	const now = Date.now();
	const sevenDaysAgo = now - 7 * 86_400_000;
	const insights: string[] = [];
	const cutoffIso = new Date(sevenDaysAgo).toISOString();
	const patterns = plugin.kg.data.themes
		.filter((t) => t.lastSeen >= cutoffIso && t.frequency >= 3)
		.sort((a, b) => b.frequency - a.frequency)
		.slice(0, 2);
	for (const p of patterns) {
		insights.push(`Tema "${p.name}" mencionado ${p.frequency}× nos últimos 7 dias`);
	}
	const dailyStreak = await computeStreak(plugin);
	if (dailyStreak >= 7) insights.push(`🔥 ${dailyStreak} dias seguidos de daily log!`);
	const today = new Date(now).toISOString().split("T")[0];
	const overdueCount = plugin.kg.data.actionItems.filter(
		(a) =>
			a.status !== "completed" &&
			a.status !== "cancelled" &&
			a.dueDate &&
			a.dueDate < today
	).length;
	if (overdueCount > 5) insights.push(`${overdueCount} tasks atrasadas — vale priorizar?`);

	if (insights.length === 0) {
		el.createEl("div", { text: "Nada a destacar agora — vault em paz." }).style.opacity = "0.6";
		return;
	}

	for (const ins of insights) {
		const row = el.createDiv();
		row.style.padding = "4px 8px";
		row.style.fontSize = "12px";
		row.style.background = "var(--background-secondary-alt)";
		row.style.borderRadius = "4px";
		row.style.marginBottom = "4px";
		row.setText(`• ${ins}`);
	}
}

async function renderAgenda(el: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	const today = new Date().toISOString().split("T")[0];

	// 1. Eventos do iCal (se URL configurada)
	const calendarUrl = plugin.settings.profile?.calendarUrl;
	if (calendarUrl) {
		try {
			const { IcalClient } = await import("../../integrations/ical");
			const ical = new IcalClient(plugin.app, plugin.settings.folders.atlas);
			const icalEvents = await ical.eventsToday();
			for (const ev of icalEvents.slice(0, 6)) {
				const row = el.createDiv();
				row.style.display = "flex";
				row.style.gap = "12px";
				row.style.padding = "4px 0";
				row.style.alignItems = "center";

				const time = ev.allDay
					? "📅 dia"
					: new Date(ev.startsAt).toLocaleTimeString("pt-BR", {
							hour: "2-digit",
							minute: "2-digit",
						});
				const t = row.createEl("span", { text: time });
				t.style.fontWeight = "bold";
				t.style.minWidth = "55px";
				t.style.fontSize = "12px";
				t.style.color = "var(--color-blue)";

				const titleEl = row.createEl("span", { text: ev.summary });
				titleEl.style.fontSize = "12px";
				titleEl.style.flexGrow = "1";

				const calBadge = row.createEl("span", { text: "📆" });
				calBadge.style.fontSize = "10px";
				calBadge.title = "iCal Calendar event";
			}
			if (icalEvents.length > 0) {
				const sep = el.createDiv();
				sep.style.borderTop = "1px solid var(--background-modifier-border)";
				sep.style.margin = "6px 0";
			}
		} catch {
			// ignore — sem cache ainda
		}
	}

	// 2. Meeting notes do vault
	const folder = plugin.settings.folders.meetings;
	const meetings = plugin.app.vault
		.getMarkdownFiles()
		.filter((f) => f.path.startsWith(folder))
		.filter((f) => {
			const cache = plugin.app.metadataCache.getFileCache(f);
			const date = (cache?.frontmatter?.date as string | undefined) ?? "";
			return date.startsWith(today) || f.path.includes(today);
		})
		.slice(0, 6);

	if (meetings.length === 0 && !calendarUrl) {
		el.createEl("div", {
			text: "Sem reuniões agendadas. Configure iCal em Settings → Atlas → Calendar URL.",
		}).style.opacity = "0.6";
		return;
	}

	for (const f of meetings) {
		const cache = plugin.app.metadataCache.getFileCache(f);
		const time = (cache?.frontmatter?.time as string | undefined) ?? "—";
		const titleStr = (cache?.frontmatter?.title as string | undefined) ?? f.basename;
		const row = el.createDiv();
		row.style.display = "flex";
		row.style.gap = "12px";
		row.style.padding = "4px 0";
		row.style.cursor = "pointer";
		const t = row.createEl("span", { text: time });
		t.style.fontWeight = "bold";
		t.style.minWidth = "55px";
		t.style.fontSize = "12px";
		const titleEl = row.createEl("span", { text: titleStr });
		titleEl.style.fontSize = "12px";
		row.addEventListener("click", () => {
			void plugin.app.workspace.getLeaf().openFile(f);
		});
	}
}

async function renderTasks(el: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	const today = new Date().toISOString().split("T")[0];
	const overdueCount = plugin.kg.data.actionItems.filter(
		(a) =>
			a.status !== "completed" &&
			a.status !== "cancelled" &&
			a.dueDate &&
			a.dueDate < today
	).length;
	const dueToday = plugin.kg.data.actionItems.filter(
		(a) => a.status !== "completed" && a.status !== "cancelled" && a.dueDate?.startsWith(today)
	);

	const summary = el.createEl("div");
	summary.style.fontSize = "11px";
	summary.style.opacity = "0.7";
	summary.style.marginBottom = "6px";
	summary.setText(`${dueToday.length} hoje · ${overdueCount} atrasadas`);

	for (const a of dueToday.slice(0, 5)) {
		const row = el.createDiv();
		row.style.padding = "4px 0";
		row.style.fontSize = "12px";
		row.style.cursor = "pointer";
		row.setText(`⏰ ${a.description}`);
		row.addEventListener("click", () => {
			const f = plugin.app.vault.getAbstractFileByPath(a.sourceNotePath);
			if (f instanceof TFile) plugin.app.workspace.getLeaf().openFile(f);
		});
	}
}

async function renderCommitments(el: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	const open = plugin.kg.data.commitments.filter((c) => c.status === "open").slice(0, 5);
	if (open.length === 0) {
		el.createEl("div", { text: "🎉 0 commitments abertos!" }).style.opacity = "0.6";
		return;
	}
	for (const c of open) {
		const row = el.createDiv();
		row.style.padding = "3px 0";
		row.style.fontSize = "11px";
		const txt = c.text.length > 60 ? c.text.substring(0, 60) + "…" : c.text;
		const due = c.dueDate ? ` · ${c.dueDate}` : "";
		row.setText(`• "${txt}"${due}`);
	}
}

async function renderThemes(el: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	const top = [...plugin.kg.data.themes]
		.sort((a, b) => b.frequency - a.frequency)
		.slice(0, 5);
	if (top.length === 0) {
		el.createEl("div", { text: "Indexe vault para ver temas." }).style.opacity = "0.6";
		return;
	}
	const wrap = el.createDiv();
	wrap.style.display = "flex";
	wrap.style.flexWrap = "wrap";
	wrap.style.gap = "4px";
	const colors: Record<string, string> = {
		blocker: "#c62828",
		growth: "#1976d2",
		strength: "#2e7d32",
		neutral: "#616161",
	};
	for (const t of top) {
		const chip = wrap.createEl("span");
		chip.style.padding = "3px 8px";
		chip.style.borderRadius = "4px";
		chip.style.fontSize = "11px";
		chip.style.color = "white";
		chip.style.background = colors[t.sentiment] ?? "#616161";
		chip.setText(`${t.name} (${t.frequency}×)`);
	}
}

async function renderFlashcards(el: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	const stats = plugin.flashcards?.stats() ?? { total: 0, due: 0, new: 0, learning: 0, review: 0 };
	if (stats.total === 0) {
		el.createEl("div", { text: "Nenhum flashcard. Use Atlas: Gerar flashcards." }).style.opacity = "0.6";
		return;
	}
	const txt = el.createEl("div");
	txt.style.fontSize = "12px";
	txt.style.marginBottom = "6px";
	txt.setText(`${stats.due} a revisar · ${stats.total} total`);

	if (stats.due > 0) {
		const btn = el.createEl("button", { text: `▶️ Revisar ${stats.due} cards` });
		btn.addClass("mod-cta");
		btn.style.fontSize = "11px";
		btn.addEventListener("click", () => {
			const apiAny = plugin.app as unknown as {
				commands?: { executeCommandById?: (id: string) => void };
			};
			apiAny.commands?.executeCommandById?.("atlas:atlas-flashcards-review");
		});
	}
}

async function renderQuickActions(el: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	const grid = el.createDiv();
	grid.style.display = "grid";
	grid.style.gridTemplateColumns = "1fr 1fr 1fr";
	grid.style.gap = "6px";

	const action = (icon: string, label: string, cmd: string) => {
		const btn = grid.createEl("button", { text: `${icon} ${label}` });
		btn.style.padding = "6px";
		btn.style.fontSize = "11px";
		btn.style.cursor = "pointer";
		btn.addEventListener("click", () => {
			const apiAny = plugin.app as unknown as {
				commands?: { executeCommandById?: (id: string) => void };
			};
			apiAny.commands?.executeCommandById?.(`atlas:${cmd}`);
		});
	};

	action("📓", "Daily", "atlas-daily-log");
	action("🎯", "Capture", "atlas-quick-capture");
	action("🔎", "Search", "atlas-search-vault");
	action("🤝", "Brief 1:1", "atlas-prepare-1on1");
	action("🧠", "Pense", "atlas-reasoning");
	action("📊", "Weekly", "atlas-weekly-now");
}

async function renderXp(el: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	const p = plugin.achievements?.getProgress();
	if (!p) {
		el.createEl("div", { text: "XP indisponível." }).style.opacity = "0.6";
		return;
	}

	// Linha 1: Level + XP atual + Streak
	const topRow = el.createDiv();
	topRow.style.display = "flex";
	topRow.style.alignItems = "center";
	topRow.style.justifyContent = "space-between";
	topRow.style.gap = "12px";
	topRow.style.marginBottom = "8px";

	const lvlBadge = topRow.createDiv();
	lvlBadge.style.display = "flex";
	lvlBadge.style.alignItems = "center";
	lvlBadge.style.gap = "8px";

	const lvlIcon = lvlBadge.createEl("span", { text: "💎" });
	lvlIcon.style.fontSize = "26px";
	const lvlText = lvlBadge.createDiv();
	const lvlNum = lvlText.createEl("div", { text: `Level ${p.level}` });
	lvlNum.style.fontSize = "16px";
	lvlNum.style.fontWeight = "bold";
	const xpText = lvlText.createEl("div", { text: `${p.xp} XP` });
	xpText.style.fontSize = "11px";
	xpText.style.opacity = "0.65";

	const streak = await computeStreak(plugin);
	const streakBadge = topRow.createDiv();
	streakBadge.style.display = "flex";
	streakBadge.style.alignItems = "center";
	streakBadge.style.gap = "6px";
	streakBadge.style.padding = "8px 12px";
	streakBadge.style.background = "var(--background-secondary-alt)";
	streakBadge.style.borderRadius = "8px";
	const fireIcon = streakBadge.createEl("span", { text: streak >= 7 ? "🔥🔥🔥" : streak >= 3 ? "🔥" : "·" });
	fireIcon.style.fontSize = "16px";
	const streakText = streakBadge.createDiv();
	streakText.style.lineHeight = "1.1";
	const streakNum = streakText.createEl("div", { text: `${streak}d` });
	streakNum.style.fontSize = "14px";
	streakNum.style.fontWeight = "bold";
	const streakLbl = streakText.createEl("div", { text: "streak" });
	streakLbl.style.fontSize = "9px";
	streakLbl.style.opacity = "0.6";

	// Progress bar
	const progressWrap = el.createDiv();
	progressWrap.style.marginBottom = "10px";

	const progressLabel = progressWrap.createDiv();
	progressLabel.style.fontSize = "10px";
	progressLabel.style.opacity = "0.6";
	progressLabel.style.marginBottom = "3px";
	const xpToNext = p.nextLevelXp - p.xp;
	progressLabel.setText(`Próximo level em ${xpToNext} XP`);

	const bar = progressWrap.createDiv();
	bar.style.height = "8px";
	bar.style.background = "var(--background-modifier-border)";
	bar.style.borderRadius = "4px";
	bar.style.overflow = "hidden";
	const fill = bar.createDiv();
	fill.style.height = "100%";
	fill.style.width = `${Math.round(p.pct * 100)}%`;
	fill.style.background =
		"linear-gradient(90deg, var(--interactive-accent), var(--color-purple))";
	fill.style.transition = "width 400ms ease";

	// Achievements section
	const all = plugin.achievements?.getAllAchievements() ?? [];
	const unlocked = all.filter((a) => a.unlocked);
	const locked = all.filter((a) => !a.unlocked);

	const achHeader = el.createDiv();
	achHeader.style.display = "flex";
	achHeader.style.justifyContent = "space-between";
	achHeader.style.alignItems = "center";
	achHeader.style.fontSize = "10px";
	achHeader.style.fontWeight = "bold";
	achHeader.style.opacity = "0.7";
	achHeader.style.marginTop = "8px";
	achHeader.style.marginBottom = "6px";
	achHeader.style.letterSpacing = "0.5px";
	achHeader.createEl("span", { text: `🏆 ACHIEVEMENTS (${unlocked.length}/${all.length})` });

	// Grid de badges desbloqueadas
	const unlockedGrid = el.createDiv();
	unlockedGrid.style.display = "grid";
	unlockedGrid.style.gridTemplateColumns = "repeat(auto-fill, minmax(36px, 1fr))";
	unlockedGrid.style.gap = "4px";
	unlockedGrid.style.marginBottom = "8px";

	if (unlocked.length === 0) {
		const empty = unlockedGrid.createDiv();
		empty.style.gridColumn = "1 / -1";
		empty.style.fontSize = "11px";
		empty.style.opacity = "0.5";
		empty.style.padding = "8px";
		empty.setText("Nenhuma conquista ainda. Capture algo, faça um daily, indexe o vault…");
	} else {
		for (const a of unlocked.slice(0, 12)) {
			const badge = unlockedGrid.createDiv();
			badge.style.fontSize = "20px";
			badge.style.textAlign = "center";
			badge.style.padding = "4px";
			badge.style.borderRadius = "4px";
			badge.style.cursor = "help";
			badge.style.transition = "background 120ms";
			badge.title = `${a.def.title}\n${a.def.description}\n+${a.def.xp} XP`;
			badge.setText(a.def.icon);
			badge.addEventListener("mouseenter", () => {
				badge.style.background = "var(--background-modifier-hover)";
			});
			badge.addEventListener("mouseleave", () => {
				badge.style.background = "transparent";
			});
		}
	}

	// Next challenge
	if (locked.length > 0) {
		const challenge = locked[0]; // first locked = most achievable next
		const challengeRow = el.createDiv();
		challengeRow.style.display = "flex";
		challengeRow.style.alignItems = "center";
		challengeRow.style.gap = "8px";
		challengeRow.style.padding = "8px 10px";
		challengeRow.style.background = "var(--background-secondary)";
		challengeRow.style.borderRadius = "6px";
		challengeRow.style.borderLeft = "3px solid var(--color-orange)";
		challengeRow.style.marginBottom = "8px";

		const chIcon = challengeRow.createEl("span", { text: "🎯" });
		chIcon.style.fontSize = "16px";

		const chWrap = challengeRow.createDiv();
		chWrap.style.flexGrow = "1";
		const chTitle = chWrap.createEl("div", { text: `Próximo desafio: ${challenge.def.title}` });
		chTitle.style.fontSize = "11px";
		chTitle.style.fontWeight = "bold";
		const chDesc = chWrap.createEl("div", { text: challenge.def.description });
		chDesc.style.fontSize = "10px";
		chDesc.style.opacity = "0.65";

		const chXp = challengeRow.createEl("span", { text: `+${challenge.def.xp} XP` });
		chXp.style.fontSize = "10px";
		chXp.style.color = "var(--color-orange)";
		chXp.style.fontWeight = "bold";
	}

	// Tour picker inline
	const tourRow = el.createDiv();
	tourRow.style.display = "flex";
	tourRow.style.gap = "6px";
	tourRow.style.flexWrap = "wrap";
	tourRow.style.marginTop = "6px";

	const tourLabel = tourRow.createEl("span", { text: "📚 Tours: " });
	tourLabel.style.fontSize = "10px";
	tourLabel.style.opacity = "0.7";
	tourLabel.style.marginRight = "4px";
	tourLabel.style.alignSelf = "center";

	const tours: { id: string; label: string }[] = [
		{ id: "first-steps", label: "Primeiros passos" },
		{ id: "one-on-one", label: "1:1" },
		{ id: "weekly-report", label: "Weekly" },
		{ id: "flashcards", label: "Flashcards" },
		{ id: "knowledge-graph", label: "KG" },
	];
	for (const t of tours) {
		const completed = plugin.tutorialSystem?.hasCompleted(t.id) ?? false;
		const btn = tourRow.createEl("button", {
			text: `${completed ? "✓" : "▶"} ${t.label}`,
		});
		btn.style.fontSize = "9px";
		btn.style.padding = "3px 8px";
		btn.style.cursor = "pointer";
		btn.style.opacity = completed ? "0.5" : "1";
		btn.title = completed ? "Tour já completado" : `Iniciar tour: ${t.label}`;
		btn.addEventListener("click", () => {
			plugin.startTutorial(t.id);
		});
	}
}

// ──────────────────────────────────────────────────────────────────
// HELPERS

async function computeStreak(plugin: AtlasPlugin): Promise<number> {
	const dailyFolder = plugin.settings.folders.daily;
	let streak = 0;
	const today = new Date();
	for (let i = 0; i < 365; i++) {
		const d = new Date(today.getTime() - i * 86_400_000);
		const yyyy = d.getFullYear();
		const mm = String(d.getMonth() + 1).padStart(2, "0");
		const dd = String(d.getDate()).padStart(2, "0");
		const path = `${dailyFolder}/${yyyy}/${mm}/${yyyy}-${mm}-${dd}.md`;
		if (plugin.app.vault.getAbstractFileByPath(path) instanceof TFile) {
			streak++;
		} else if (i > 0) {
			break;
		}
	}
	return streak;
}

function statCard(parent: HTMLElement, label: string, value: string): void {
	const card = parent.createDiv();
	card.style.padding = "8px";
	card.style.background = "var(--background-secondary-alt)";
	card.style.borderRadius = "4px";
	card.style.textAlign = "center";
	const v = card.createEl("div", { text: value });
	v.style.fontSize = "16px";
	v.style.fontWeight = "bold";
	const l = card.createEl("div", { text: label });
	l.style.fontSize = "10px";
	l.style.opacity = "0.6";
}
