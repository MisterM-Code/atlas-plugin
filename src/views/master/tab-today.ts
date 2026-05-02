/**
 * Atlas v0.21 Sprint E — Today COMMAND CENTER
 *
 * Premium animated dashboard. 3 zones:
 *  🚨 ALERTS — critical items ticker + greeting hero
 *  🎯 ACTION — Eisenhower matrix + vencendo 3 cols + próximos compromissos + quick actions
 *  🌐 AWARENESS — Atlas Percebeu + projects RAG + sparklines + activity stream + vault health + XP
 *
 * Real-time: clock 1s, countdowns 1s, alerts 4s rotate, insights 8s rotate.
 * Slide-in staggered entrance + hover lifts + pulse on critical.
 */

import { TFile } from "obsidian";
import type AtlasPlugin from "../../../main";
import { getMode } from "../../coach/scope";

const ZONE_TITLES = {
	alerts: "🚨 Alerts",
	action: "🎯 Action",
	awareness: "🌐 Awareness",
};

let liveTimers: number[] = [];

export async function renderTodayTab(container: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	container.empty();
	container.addClass("atlas-tab-today", "atlas-today-cmdcenter");

	// Cleanup live timers from previous render
	liveTimers.forEach((t) => window.clearInterval(t));
	liveTimers = [];

	if (getMode() === "coach") {
		const badge = container.createDiv({ cls: "atlas-today-coach-badge", text: "🔒 COACH MODE" });
		void badge;
	}

	// ─── ZONE 1: ALERTS ───────────────────────────────────────────
	const zone1 = container.createDiv({ cls: "atlas-today-zone atlas-today-zone-alerts" });
	const ticker = zone1.createDiv({ cls: "atlas-today-alerts-ticker" });
	void renderAlertsTicker(ticker, plugin);

	const hero = zone1.createDiv({ cls: "atlas-today-hero" });
	void renderHero(hero, plugin);

	// ─── ZONE 2: ACTION ───────────────────────────────────────────
	const zone2 = container.createDiv({ cls: "atlas-today-zone atlas-today-zone-action" });
	zone2.createDiv({ cls: "atlas-today-zone-title", text: ZONE_TITLES.action });

	const actionGrid = zone2.createDiv({ cls: "atlas-today-action-grid" });

	// Eisenhower matrix
	const eisenhower = actionGrid.createDiv({ cls: "atlas-today-widget atlas-today-eisenhower" });
	void renderEisenhower(eisenhower, plugin);

	// Vencendo 3-cols
	const vencendo = actionGrid.createDiv({ cls: "atlas-today-widget atlas-today-vencendo" });
	void renderVencendo(vencendo, plugin);

	// Próximos compromissos
	const meetings = actionGrid.createDiv({ cls: "atlas-today-widget atlas-today-meetings" });
	void renderUpcomingMeetings(meetings, plugin);

	// Quick actions
	const quickActs = actionGrid.createDiv({ cls: "atlas-today-widget atlas-today-quick-actions" });
	void renderQuickActions(quickActs, plugin);

	// ─── ZONE 3: AWARENESS ────────────────────────────────────────
	const zone3 = container.createDiv({ cls: "atlas-today-zone atlas-today-zone-awareness" });
	zone3.createDiv({ cls: "atlas-today-zone-title", text: ZONE_TITLES.awareness });

	const awareGrid = zone3.createDiv({ cls: "atlas-today-aware-grid" });

	const insights = awareGrid.createDiv({ cls: "atlas-today-widget atlas-today-insights" });
	void renderAtlasPercebeu(insights, plugin);

	const projects = awareGrid.createDiv({ cls: "atlas-today-widget atlas-today-projects" });
	void renderProjectsRag(projects, plugin);

	const pulse = awareGrid.createDiv({ cls: "atlas-today-widget atlas-today-pulse" });
	void renderKnowledgePulse(pulse, plugin);

	const activity = awareGrid.createDiv({ cls: "atlas-today-widget atlas-today-activity" });
	void renderActivityStream(activity, plugin);

	const health = awareGrid.createDiv({ cls: "atlas-today-widget atlas-today-health" });
	void renderVaultHealth(health, plugin);

	const xp = awareGrid.createDiv({ cls: "atlas-today-widget atlas-today-xp" });
	void renderXp(xp, plugin);

	// Stagger entrance animations via CSS — adicionar delay incremental nos widgets
	const allWidgets = container.querySelectorAll(".atlas-today-widget, .atlas-today-hero, .atlas-today-alerts-ticker");
	allWidgets.forEach((el, i) => {
		(el as HTMLElement).style.animationDelay = `${i * 60}ms`;
	});

	// v0.41: cursor-tracking spotlight on widgets (premium UX)
	wireCursorSpotlight(container);
}

/** v0.41: tracks cursor position across each widget and exposes --mx/--my CSS vars
 *  for spotlight gradient effect. Uses single mousemove listener for perf. */
function wireCursorSpotlight(container: HTMLElement): void {
	const onMove = (ev: MouseEvent): void => {
		const t = ev.target as HTMLElement | null;
		if (!t) return;
		const widget = t.closest(".atlas-today-widget") as HTMLElement | null;
		if (!widget) return;
		const r = widget.getBoundingClientRect();
		const mx = ((ev.clientX - r.left) / r.width) * 100;
		const my = ((ev.clientY - r.top) / r.height) * 100;
		widget.style.setProperty("--atlas-mx", `${mx}%`);
		widget.style.setProperty("--atlas-my", `${my}%`);
	};
	container.addEventListener("mousemove", onMove);
}

// ══ ZONE 1: ALERTS + HERO ═══════════════════════════════════════════

async function renderAlertsTicker(el: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	const alerts = await collectCriticalAlerts(plugin);
	if (alerts.length === 0) {
		el.addClass("is-empty");
		el.createDiv({ cls: "atlas-today-alert-item is-quiet", text: "✓ Nada crítico no momento" });
		return;
	}
	el.addClass("is-active");
	let idx = 0;
	const item = el.createDiv({ cls: "atlas-today-alert-item is-critical" });
	const update = () => {
		item.empty();
		const a = alerts[idx];
		item.createSpan({ cls: "atlas-today-alert-icon", text: a.icon });
		item.createSpan({ cls: "atlas-today-alert-text", text: a.text });
		idx = (idx + 1) % alerts.length;
	};
	update();
	const timer = window.setInterval(update, 4000);
	liveTimers.push(timer);
}

async function renderHero(el: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	const now = new Date();
	const hour = now.getHours();
	const greeting =
		hour < 5 ? "🌙 Boa madrugada" :
		hour < 12 ? "🌅 Bom dia" :
		hour < 18 ? "☀️ Boa tarde" :
		"🌇 Boa noite";

	// v0.43: starfield removido por feedback — manter apenas LED glow ambient

	const left = el.createDiv({ cls: "atlas-today-hero-left" });
	const greetWrap = left.createDiv({ cls: "atlas-today-hero-greet" });
	greetWrap.createEl("h1", {
		text: `${greeting}, ${plugin.settings.user.displayName || "Atlas"}`,
	});
	const dateText = now.toLocaleDateString("pt-BR", {
		weekday: "long",
		day: "2-digit",
		month: "long",
	});
	left.createDiv({ cls: "atlas-today-hero-date", text: dateText });
	const quoteEl = left.createDiv({ cls: "atlas-today-hero-quote" });
	quoteEl.setText(rotateQuote());
	// v0.43: rotate quote every 8s with fade transition
	const quoteTimer = window.setInterval(() => {
		quoteEl.classList.add("is-fading");
		window.setTimeout(() => {
			quoteEl.setText(rotateQuote());
			quoteEl.classList.remove("is-fading");
		}, 280);
	}, 8000);
	liveTimers.push(quoteTimer);

	const right = el.createDiv({ cls: "atlas-today-hero-right" });
	const clock = right.createDiv({ cls: "atlas-today-hero-clock" });
	const updateClock = () => {
		clock.setText(new Date().toLocaleTimeString("pt-BR", { hour12: false }));
	};
	updateClock();
	const clockTimer = window.setInterval(updateClock, 1000);
	liveTimers.push(clockTimer);

	// Stats ticker (animated count-up)
	const stats = right.createDiv({ cls: "atlas-today-hero-stats" });
	const sevenDaysAgo = Date.now() - 7 * 86_400_000;
	const notesN = plugin.app.vault.getMarkdownFiles().length;
	const sessionsN = plugin.kg?.data.sessions?.length ?? 0;
	const streakN = await computeStreak(plugin);
	const factsN = plugin.memory?.getFacts().length ?? 0;

	createStatTicker(stats, "📚", "notas", notesN);
	createStatTicker(stats, "🤝", "sessions", sessionsN);
	createStatTicker(stats, "🔥", "streak", streakN);
	createStatTicker(stats, "🧠", "facts", factsN);
}

function createStatTicker(parent: HTMLElement, emoji: string, label: string, target: number): void {
	const wrap = parent.createDiv({ cls: "atlas-today-stat-ticker" });
	wrap.createSpan({ cls: "atlas-today-stat-emoji", text: emoji });
	const num = wrap.createSpan({ cls: "atlas-today-stat-num" });
	const lbl = wrap.createSpan({ cls: "atlas-today-stat-label", text: label });
	void lbl;
	// Animate count up from 0 to target over 800ms
	const duration = 800;
	const start = performance.now();
	const tick = (t: number) => {
		const progress = Math.min(1, (t - start) / duration);
		const eased = 1 - Math.pow(1 - progress, 3); // cubic ease-out
		num.setText(String(Math.floor(target * eased)));
		if (progress < 1) requestAnimationFrame(tick);
		else num.setText(String(target));
	};
	requestAnimationFrame(tick);
}

const QUOTES = [
	"\"O conhecimento que não é organizado é só ruído.\" — Drucker",
	"\"O que você mede, melhora.\" — Peter Drucker",
	"\"O melhor momento de plantar uma árvore foi 20 anos atrás. O segundo melhor é agora.\"",
	"\"Sua melhor ferramenta é uma boa noite de sono.\" — Naval",
	"\"A chave é não priorizar o que está na sua agenda, mas agendar suas prioridades.\" — Stephen Covey",
	"\"Decisões reversíveis devem ser feitas rápido. Irreversíveis, com cuidado.\" — Bezos",
	"\"Make it work, make it right, make it fast.\" — Kent Beck",
	"\"Você não constrói cultura — você reforça os comportamentos que aceita.\"",
	"\"Liderança é serviço.\" — Servant Leadership",
	"\"Pessoas precisam de feedback como precisam de oxigênio.\" — Camille Fournier",
];

function rotateQuote(): string {
	const today = new Date();
	const dayOfYear = Math.floor(
		(today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86_400_000
	);
	return QUOTES[dayOfYear % QUOTES.length];
}

// ══ ZONE 2: ACTION ═══════════════════════════════════════════════════

async function renderEisenhower(el: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	el.createDiv({ cls: "atlas-today-widget-title", text: "🎯 Urgência × Importância" });
	const grid = el.createDiv({ cls: "atlas-today-eisenhower-grid" });

	const items = plugin.kg.data.actionItems.filter(
		(a) => a.status !== "completed" && a.status !== "cancelled"
	);
	const now = Date.now();
	const dayMs = 86_400_000;

	const buckets = {
		urgent_important: [] as typeof items,
		important_only: [] as typeof items,
		urgent_only: [] as typeof items,
		neither: [] as typeof items,
	};
	for (const it of items) {
		const due = it.dueDate ? new Date(it.dueDate).getTime() : null;
		const isUrgent = due !== null && due - now < 2 * dayMs;
		const prio = it.priority ?? "P3";
		const isImportant = prio === "P1" || prio === "P2";
		if (isUrgent && isImportant) buckets.urgent_important.push(it);
		else if (isImportant) buckets.important_only.push(it);
		else if (isUrgent) buckets.urgent_only.push(it);
		else buckets.neither.push(it);
	}

	const cells: { key: keyof typeof buckets; label: string; cls: string }[] = [
		{ key: "urgent_important", label: "🔴 Fazer agora", cls: "is-critical" },
		{ key: "important_only", label: "🟡 Agendar", cls: "is-important" },
		{ key: "urgent_only", label: "🟠 Delegar", cls: "is-urgent" },
		{ key: "neither", label: "⚪ Eliminar", cls: "is-low" },
	];
	for (const cell of cells) {
		const cellEl = grid.createDiv({ cls: `atlas-eisenhower-cell ${cell.cls}` });
		cellEl.createDiv({ cls: "atlas-eisenhower-label", text: cell.label });
		cellEl.createDiv({ cls: "atlas-eisenhower-count", text: String(buckets[cell.key].length) });
	}
}

async function renderVencendo(el: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	el.createDiv({ cls: "atlas-today-widget-title", text: "⏰ Vencendo" });
	const cols = el.createDiv({ cls: "atlas-today-vencendo-cols" });
	const now = Date.now();
	const dayMs = 86_400_000;
	const items = plugin.kg.data.actionItems.filter(
		(a) => a.status !== "completed" && a.status !== "cancelled" && a.dueDate
	);

	const overdue = items
		.filter((a) => new Date(a.dueDate as string).getTime() < now - dayMs * 0)
		.filter((a) => new Date(a.dueDate as string).getTime() < new Date(new Date().setHours(0, 0, 0, 0)).getTime())
		.sort((a, b) => new Date(a.dueDate as string).getTime() - new Date(b.dueDate as string).getTime());
	const todayDue = items.filter((a) => isSameDay(new Date(a.dueDate as string), new Date()));
	const tomorrowDue = items.filter((a) => isSameDay(new Date(a.dueDate as string), new Date(now + dayMs)));

	renderVencendoColumn(cols, "🔴 OVERDUE", overdue, "is-overdue");
	renderVencendoColumn(cols, "🔥 HOJE", todayDue, "is-today");
	renderVencendoColumn(cols, "📅 AMANHÃ", tomorrowDue, "is-tomorrow");
}

function renderVencendoColumn(
	parent: HTMLElement,
	label: string,
	items: { id: string; description: string; dueDate?: string; ownerId?: string }[],
	cls: string
): void {
	const col = parent.createDiv({ cls: `atlas-vencendo-col ${cls}` });
	col.createDiv({ cls: "atlas-vencendo-col-label", text: `${label} (${items.length})` });
	const list = col.createDiv({ cls: "atlas-vencendo-list" });
	if (items.length === 0) {
		list.createDiv({ cls: "atlas-vencendo-empty", text: "—" });
		return;
	}
	for (const it of items.slice(0, 5)) {
		const row = list.createDiv({ cls: "atlas-vencendo-item" });
		row.createDiv({ cls: "atlas-vencendo-text", text: it.description.substring(0, 60) });
	}
	if (items.length > 5) {
		list.createDiv({ cls: "atlas-vencendo-more", text: `+${items.length - 5} mais` });
	}
}

function isSameDay(a: Date, b: Date): boolean {
	return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

async function renderUpcomingMeetings(el: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	el.createDiv({ cls: "atlas-today-widget-title", text: "🤝 Próximos compromissos" });
	const list = el.createDiv({ cls: "atlas-today-meetings-list" });
	const now = Date.now();

	// Look in vault for notes with type=meeting/1on1 and date >= today
	const all = plugin.app.vault.getMarkdownFiles();
	const upcoming = all
		.map((f) => {
			const cache = plugin.app.metadataCache.getFileCache(f);
			const fm = cache?.frontmatter as Record<string, unknown> | undefined;
			if (!fm) return null;
			const type = String(fm.type ?? "");
			if (!type.includes("meeting") && !type.includes("1on1") && !type.includes("session")) return null;
			const dateStr = String(fm.date ?? fm.datetime ?? "");
			if (!dateStr) return null;
			const ts = new Date(dateStr).getTime();
			if (Number.isNaN(ts) || ts < now - 86_400_000) return null;
			return { file: f, ts, person: String(fm.person ?? fm.attendee ?? "") };
		})
		.filter((x): x is { file: TFile; ts: number; person: string } => x !== null)
		.sort((a, b) => a.ts - b.ts)
		.slice(0, 3);

	if (upcoming.length === 0) {
		list.createDiv({ cls: "atlas-today-meetings-empty", text: "Nenhum compromisso futuro registrado." });
		return;
	}

	for (const m of upcoming) {
		const row = list.createDiv({ cls: "atlas-today-meeting-row" });
		row.createDiv({ cls: "atlas-today-meeting-title", text: m.file.basename });
		const meta = row.createDiv({ cls: "atlas-today-meeting-meta" });
		const countdownEl = meta.createSpan({ cls: "atlas-today-meeting-countdown" });
		const updateCountdown = () => {
			const diff = m.ts - Date.now();
			countdownEl.setText(formatCountdown(diff));
		};
		updateCountdown();
		const t = window.setInterval(updateCountdown, 1000);
		liveTimers.push(t);
		row.addEventListener("click", () => {
			void plugin.app.workspace.getLeaf().openFile(m.file);
		});
	}
}

function formatCountdown(ms: number): string {
	if (ms < 0) return "passou";
	const h = Math.floor(ms / 3_600_000);
	const m = Math.floor((ms % 3_600_000) / 60_000);
	if (h >= 24) return `em ${Math.floor(h / 24)}d ${h % 24}h`;
	return `em ${h}h ${m}min`;
}

async function renderQuickActions(el: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	el.createDiv({ cls: "atlas-today-widget-title", text: "⚡ Ações rápidas" });
	const grid = el.createDiv({ cls: "atlas-today-quickact-grid" });
	const action = (icon: string, label: string, cmd: string) => {
		const btn = grid.createDiv({ cls: "atlas-today-quickact-btn" });
		btn.createDiv({ cls: "atlas-today-quickact-icon", text: icon });
		btn.createDiv({ cls: "atlas-today-quickact-label", text: label });
		btn.addEventListener("click", () => {
			const apiAny = plugin.app as unknown as {
				commands?: { executeCommandById?: (id: string) => void };
			};
			apiAny.commands?.executeCommandById?.(`atlas:${cmd}`);
		});
	};
	action("🎙️", "Falar com Atlas", "jarvis");
	action("📓", "Daily log", "daily-log");
	action("🤝", "Novo 1:1", "prepare-1on1");
	action("💬", "Chat", "chat-open");
}

// ══ ZONE 3: AWARENESS ═══════════════════════════════════════════════

async function renderAtlasPercebeu(el: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	el.createDiv({ cls: "atlas-today-widget-title", text: "💡 Atlas Percebeu" });
	const insights = collectInsights(plugin);
	if (insights.length === 0) {
		el.createDiv({ cls: "atlas-today-insight-empty", text: "Nenhum padrão notável detectado." });
		return;
	}
	let idx = 0;
	const slot = el.createDiv({ cls: "atlas-today-insight-slot" });
	const update = () => {
		slot.empty();
		const ins = insights[idx];
		slot.createSpan({ cls: "atlas-today-insight-icon", text: ins.icon });
		slot.createSpan({ cls: "atlas-today-insight-text", text: ins.text });
		idx = (idx + 1) % insights.length;
	};
	update();
	const timer = window.setInterval(update, 8000);
	liveTimers.push(timer);
}

async function renderProjectsRag(el: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	el.createDiv({ cls: "atlas-today-widget-title", text: "🚦 Projetos (RAG)" });
	const projects = plugin.kg.data.projects.filter((p) => p.status === "active");
	const cols = el.createDiv({ cls: "atlas-today-rag-cols" });

	const ragGroups: { rag: string; cls: string; label: string; items: typeof projects }[] = [
		{ rag: "red", cls: "is-red", label: "🔴 Red", items: projects.filter((p) => p.rag === "red") },
		{ rag: "amber", cls: "is-amber", label: "🟡 Amber", items: projects.filter((p) => p.rag === "amber") },
		{ rag: "green", cls: "is-green", label: "🟢 Green", items: projects.filter((p) => p.rag === "green") },
	];

	for (const g of ragGroups) {
		const col = cols.createDiv({ cls: `atlas-today-rag-col ${g.cls}` });
		col.createDiv({ cls: "atlas-today-rag-label", text: `${g.label} (${g.items.length})` });
		for (const p of g.items.slice(0, 3)) {
			col.createDiv({ cls: "atlas-today-rag-item", text: p.name });
		}
	}
}

async function renderKnowledgePulse(el: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	el.createDiv({ cls: "atlas-today-widget-title", text: "📈 Knowledge Pulse" });
	// Simple sparkline: vault activity 14d
	const days = 14;
	const buckets: number[] = [];
	const now = new Date();
	for (let i = days - 1; i >= 0; i--) {
		const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i).getTime();
		const dayEnd = dayStart + 86_400_000;
		const count = plugin.app.vault.getMarkdownFiles().filter(
			(f) => f.stat.mtime >= dayStart && f.stat.mtime < dayEnd
		).length;
		buckets.push(count);
	}
	const max = Math.max(1, ...buckets);
	const bars = el.createDiv({ cls: "atlas-today-pulse-bars" });
	for (const b of buckets) {
		const bar = bars.createDiv({ cls: "atlas-today-pulse-bar" });
		bar.style.height = `${Math.max(4, (b / max) * 100)}%`;
		bar.title = `${b} notas`;
	}
}

async function renderActivityStream(el: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	el.createDiv({ cls: "atlas-today-widget-title", text: "🌊 Atividade recente" });
	const sevenDaysAgo = Date.now() - 7 * 86_400_000;
	const recent = plugin.app.vault
		.getMarkdownFiles()
		.filter((f) => f.stat.mtime >= sevenDaysAgo)
		.sort((a, b) => b.stat.mtime - a.stat.mtime)
		.slice(0, 8);

	const list = el.createDiv({ cls: "atlas-today-activity-list" });
	if (recent.length === 0) {
		list.createDiv({ cls: "atlas-today-activity-empty", text: "Nenhuma atividade nos últimos 7 dias." });
		return;
	}
	for (const f of recent) {
		const row = list.createDiv({ cls: "atlas-today-activity-row" });
		row.createSpan({ cls: "atlas-today-activity-emoji", text: "📝" });
		row.createSpan({ cls: "atlas-today-activity-name", text: f.basename });
		row.createSpan({ cls: "atlas-today-activity-time", text: relativeTime(f.stat.mtime) });
		row.addEventListener("click", () => {
			void plugin.app.workspace.getLeaf().openFile(f);
		});
	}
}

function relativeTime(ts: number): string {
	const diff = Date.now() - ts;
	const h = Math.floor(diff / 3_600_000);
	if (h < 1) return "agora há pouco";
	if (h < 24) return `${h}h atrás`;
	return `${Math.floor(h / 24)}d atrás`;
}

async function renderVaultHealth(el: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	el.createDiv({ cls: "atlas-today-widget-title", text: "🩺 Vault Health" });
	const allFiles = plugin.app.vault.getMarkdownFiles().filter(
		(f) => !f.path.startsWith(plugin.settings.folders.atlas)
	);
	const ninetyDaysAgo = Date.now() - 90 * 86_400_000;
	const stale = allFiles.filter((f) => f.stat.mtime < ninetyDaysAgo).length;

	let orphans = 0;
	let untagged = 0;
	for (const f of allFiles) {
		const cache = plugin.app.metadataCache.getFileCache(f);
		const links = cache?.links?.length ?? 0;
		const tags = cache?.tags?.length ?? 0;
		const fmTags = (cache?.frontmatter as { tags?: unknown })?.tags;
		const hasFmTags = Array.isArray(fmTags) ? fmTags.length > 0 : Boolean(fmTags);
		if (links === 0) orphans++;
		if (tags === 0 && !hasFmTags) untagged++;
	}

	const grid = el.createDiv({ cls: "atlas-today-health-grid" });
	healthCard(grid, "🧹", "Órfãs", String(orphans));
	healthCard(grid, "💀", "Stale", String(stale));
	healthCard(grid, "🏷️", "Sem tag", String(untagged));
	healthCard(grid, "📊", "Total", String(allFiles.length));
}

function healthCard(parent: HTMLElement, emoji: string, label: string, value: string): void {
	const c = parent.createDiv({ cls: "atlas-today-health-card" });
	c.createDiv({ cls: "atlas-today-health-emoji", text: emoji });
	c.createDiv({ cls: "atlas-today-health-value", text: value });
	c.createDiv({ cls: "atlas-today-health-label", text: label });
}

async function renderXp(el: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	el.createDiv({ cls: "atlas-today-widget-title", text: "🏆 Achievements & XP" });
	const p = plugin.achievements?.getProgress();
	if (!p) {
		el.createDiv({ text: "XP indisponível.", cls: "atlas-today-xp-empty" });
		return;
	}
	const lvl = el.createDiv({ cls: "atlas-today-xp-level" });
	lvl.createSpan({ cls: "atlas-today-xp-emoji", text: "💎" });
	lvl.createSpan({ cls: "atlas-today-xp-text", text: `Level ${p.level} · ${p.xp} XP` });

	const barWrap = el.createDiv({ cls: "atlas-today-xp-bar" });
	const fill = barWrap.createDiv({ cls: "atlas-today-xp-fill" });
	fill.style.width = `${Math.round(p.pct * 100)}%`;
	const next = p.nextLevelXp - p.xp;
	el.createDiv({ cls: "atlas-today-xp-next", text: `Próximo level em ${next} XP` });
}

// ══ HELPERS ═════════════════════════════════════════════════════════

interface AlertItem {
	icon: string;
	text: string;
	severity: "critical" | "high" | "medium";
}

async function collectCriticalAlerts(plugin: AtlasPlugin): Promise<AlertItem[]> {
	const alerts: AlertItem[] = [];
	const now = Date.now();
	const dayMs = 86_400_000;

	// Overdue action items
	const items = plugin.kg.data.actionItems;
	const overdueCritical = items.filter(
		(a) =>
			a.status !== "completed" &&
			a.status !== "cancelled" &&
			a.dueDate &&
			new Date(a.dueDate).getTime() < now - 5 * dayMs
	).length;
	if (overdueCritical > 0) {
		alerts.push({
			icon: "🚨",
			text: `${overdueCritical} action item${overdueCritical > 1 ? "s" : ""} vencidos há 5+ dias`,
			severity: "critical",
		});
	}

	// Items due today
	const dueTodayCount = items.filter(
		(a) =>
			a.status !== "completed" &&
			a.status !== "cancelled" &&
			a.dueDate &&
			isSameDay(new Date(a.dueDate), new Date())
	).length;
	if (dueTodayCount >= 3) {
		alerts.push({
			icon: "⚡",
			text: `${dueTodayCount} items vencem HOJE`,
			severity: "high",
		});
	}

	// Stale projects RAG=red
	const redProjects = plugin.kg.data.projects.filter((p) => p.status === "active" && p.rag === "red");
	for (const p of redProjects.slice(0, 2)) {
		alerts.push({
			icon: "🔴",
			text: `Projeto "${p.name}" RAG=red`,
			severity: "high",
		});
	}

	// People without 1:1 in 4+ weeks
	const fourWeeksAgo = now - 28 * dayMs;
	const directReports = plugin.kg.data.people.filter((p) => p.type === "direct-report");
	for (const person of directReports) {
		const lastSession = plugin.kg.data.sessions
			.filter((s) => s.personId === person.id)
			.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
		if (!lastSession || new Date(lastSession.date).getTime() < fourWeeksAgo) {
			alerts.push({
				icon: "👤",
				text: `${person.name} sem 1:1 há 4+ semanas`,
				severity: "medium",
			});
		}
	}

	return alerts;
}

interface InsightItem {
	icon: string;
	text: string;
}

function collectInsights(plugin: AtlasPlugin): InsightItem[] {
	const insights: InsightItem[] = [];
	const sevenDaysAgo = Date.now() - 7 * 86_400_000;
	const cutoffIso = new Date(sevenDaysAgo).toISOString();

	const patterns = plugin.kg.data.themes
		.filter((t) => t.lastSeen >= cutoffIso && t.frequency >= 3)
		.sort((a, b) => b.frequency - a.frequency)
		.slice(0, 3);
	for (const p of patterns) {
		insights.push({
			icon: "🏷️",
			text: `Tema "${p.name}" mencionado ${p.frequency}× nos últimos 7 dias`,
		});
	}

	const peopleN = plugin.kg.data.people.length;
	if (peopleN > 0) {
		insights.push({
			icon: "🧠",
			text: `${peopleN} pessoas no seu Knowledge Graph — vault rico em relacionamentos`,
		});
	}

	const recentMods = plugin.app.vault.getMarkdownFiles().filter((f) => f.stat.mtime >= sevenDaysAgo).length;
	if (recentMods > 20) {
		insights.push({
			icon: "🔥",
			text: `${recentMods} notas modificadas em 7d — você tá produzindo!`,
		});
	}

	return insights;
}

async function computeStreak(plugin: AtlasPlugin): Promise<number> {
	let streak = 0;
	const today = new Date();
	for (let i = 0; i < 60; i++) {
		const d = new Date(today.getTime() - i * 86_400_000);
		const dateStr = d.toISOString().split("T")[0];
		const path = `${plugin.settings.folders.daily}/${dateStr}.md`;
		const file = plugin.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			streak++;
		} else if (i > 0) {
			break; // streak broken (allow "today" not done yet)
		}
	}
	return streak;
}

// ══ v0.41: HERO STARFIELD (premium ambient particles) ═════════════════
function renderHeroStarfield(el: HTMLElement): void {
	const canvas = document.createElement("canvas");
	canvas.classList.add("atlas-today-hero-starfield");
	el.appendChild(canvas);

	const ctx = canvas.getContext("2d");
	if (!ctx) return;

	const dpr = window.devicePixelRatio || 1;
	const resize = (): void => {
		const r = el.getBoundingClientRect();
		canvas.width = Math.max(100, r.width) * dpr;
		canvas.height = Math.max(100, r.height) * dpr;
		ctx.scale(dpr, dpr);
	};
	resize();

	const ro = new ResizeObserver(() => {
		canvas.width = canvas.width; // reset transform
		resize();
	});
	ro.observe(el);

	// Generate stars
	const STAR_COUNT = 30;
	type Star = { x: number; y: number; r: number; alpha: number; speed: number; phase: number };
	const stars: Star[] = [];
	const rect = canvas.getBoundingClientRect();
	for (let i = 0; i < STAR_COUNT; i++) {
		stars.push({
			x: Math.random() * rect.width,
			y: Math.random() * rect.height,
			r: 0.5 + Math.random() * 1.5,
			alpha: 0.3 + Math.random() * 0.7,
			speed: 0.04 + Math.random() * 0.08,
			phase: Math.random() * Math.PI * 2,
		});
	}

	let raf = 0;
	const draw = (t: number): void => {
		const r = canvas.getBoundingClientRect();
		ctx.clearRect(0, 0, r.width, r.height);
		for (const s of stars) {
			s.phase += s.speed;
			const a = s.alpha * (0.5 + 0.5 * Math.sin(s.phase));
			ctx.beginPath();
			ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
			ctx.fillStyle = `rgba(0, 229, 229, ${a})`;
			ctx.shadowColor = "rgba(0, 229, 229, 0.6)";
			ctx.shadowBlur = 6;
			ctx.fill();
		}
		ctx.shadowBlur = 0;
		void t;
		raf = requestAnimationFrame(draw);
	};
	raf = requestAnimationFrame(draw);

	// Cleanup tied to view lifecycle: stop when canvas detached
	const stopWatcher = new MutationObserver(() => {
		if (!document.body.contains(canvas)) {
			cancelAnimationFrame(raf);
			ro.disconnect();
			stopWatcher.disconnect();
		}
	});
	stopWatcher.observe(document.body, { childList: true, subtree: true });
}
