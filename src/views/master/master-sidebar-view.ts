import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type AtlasPlugin from "../../../main";
import { TabId, TabDef } from "./types";
import { t } from "../../i18n";
import { renderAtlasHeader, AtlasHeaderHandle } from "../../ui/atlas-header";
import { renderTodayTab } from "./tab-today";
import { renderChatTab } from "./tab-chat";
import { renderHubTab } from "./tab-hub";
import { renderRemindersTab } from "./tab-reminders";
import { renderJarvisTab } from "./tab-jarvis";
import { renderKnowledgeTab } from "./tab-knowledge";
import { renderReportsTab } from "./tab-reports";
import { renderStudyTab } from "./tab-study";
import { renderSystemsTab } from "./tab-systems";
import { renderProductsTab } from "./tab-products";
import { renderRolesTab } from "./tab-roles";
import { renderLabTab } from "./tab-lab";
import { renderAutomationsTab } from "./tab-automations";
import { renderAnalyticsTab } from "./tab-analytics";
import {
	renderSuggestionsTab,
	renderHealthTab,
	renderStatusTab,
} from "./tab-simple";
import { QuickAddFab } from "../../ui/quick-add-fab";

export const ATLAS_MASTER_VIEW = "atlas-master-sidebar";

export class AtlasMasterSidebarView extends ItemView {
	private currentTab: TabId = "jarvis";
	private activityBarEl!: HTMLDivElement;
	private tabContentEl!: HTMLDivElement;
	private tabs: TabDef[];

	private fab: QuickAddFab | null = null;
	private header: AtlasHeaderHandle | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: AtlasPlugin) {
		super(leaf);
		this.tabs = this.buildTabs();
	}

	getViewType(): string {
		return ATLAS_MASTER_VIEW;
	}

	getDisplayText(): string {
		return "Atlas";
	}

	getIcon(): string {
		return "atlas-brain";
	}

	async onOpen(): Promise<void> {
		const c = this.containerEl.children[1] as HTMLElement;
		c.empty();
		c.addClass("atlas-master-sidebar");

		this.activityBarEl = c.createDiv({ cls: "atlas-activity-bar" }) as HTMLDivElement;
		this.tabContentEl = c.createDiv({ cls: "atlas-tab-content" }) as HTMLDivElement;

		this.renderActivityBar();
		// activateTab cuida de montar o FAB no tabContentEl atual
		await this.activateTab(this.currentTab);
	}

	async onClose(): Promise<void> {
		this.fab?.unmount();
		this.fab = null;
	}

	async activateTab(id: TabId): Promise<void> {
		const tab = this.tabs.find((t) => t.id === id);
		if (!tab) return;
		const prev = this.tabs.find((t) => t.id === this.currentTab);
		if (prev?.onClose) prev.onClose(this.plugin);

		// v0.8.4: sound FX no tab switch (se enabled)
		if (this.plugin.settings.animations?.soundEffects) {
			void import("../../ui/sound-fx").then((m) =>
				m.playDing({ enabled: true })
			);
		}

		this.currentTab = id;
		this.renderActivityBar();
		this.tabContentEl.empty();

		// v0.7.2: Atlas header (logo breathing + profile) sempre no topo
		this.header = renderAtlasHeader(this.tabContentEl, this.plugin);

		// v0.52: Model+cost display REMOVIDO daqui (era duplicado com Today status bar).
		// Display fica APENAS no Today tab status bar (renderTodayStatusBar).
		// Trocar modelo: Status tab → Catalog OU comando "Atlas: switch model".

		// Tab content vai num wrapper separado (header não é re-renderizado)
		const tabBody = this.tabContentEl.createDiv({ cls: "atlas-tab-body" });

		try {
			await tab.render(tabBody, this.plugin);
			// v0.7.3: animação fadeIn + slide pra body do tab inteiro
			tabBody.animate(
				[
					{ opacity: 0, transform: "translateX(8px)" },
					{ opacity: 1, transform: "translateX(0)" },
				],
				{
					duration: 200,
					easing: "cubic-bezier(0.4, 0, 0.2, 1)",
					fill: "forwards",
				}
			);
		} catch (e) {
			tabBody.empty();
			tabBody.createEl("div", {
				cls: "atlas-tab-error",
				text: `Atlas: erro ao renderizar tab "${tab.label}" — ${String(e)}`,
			});
		}

		// Re-mount FAB no novo conteúdo (foi removido pelo empty)
		this.fab?.unmount();
		this.fab = new QuickAddFab(this.plugin);
		this.fab.mount(this.tabContentEl);
	}

	/** v0.7.2: API pública pra outros components disparar logo glow durante LLM thinking. */
	setThinking(thinking: boolean): void {
		this.header?.setThinking(thinking);
	}

	private renderActivityBar(): void {
		this.activityBarEl.empty();
		for (const tab of this.tabs) {
			const isActive = tab.id === this.currentTab;
			const btn = this.activityBarEl.createDiv({
				cls: isActive
					? "atlas-activity-tab is-active atlas-activity-tab-active"
					: "atlas-activity-tab",
				attr: { "data-tab-id": tab.id }, // v0.54.0: id pra animação badge em criações
			});
			// v0.55.0: usa i18n se i18nLabel/i18nDesc setados, senão fallback pra label/description
			const dispLabel = tab.i18nLabel ? t(tab.i18nLabel) : tab.label;
			const dispDesc = tab.i18nDesc ? t(tab.i18nDesc) : tab.description;
			btn.title = `${dispLabel} — ${dispDesc}`;

			// v0.21 Sprint D: SEMPRE wrap icon em .atlas-activity-tab-icon pra alinhamento consistente
			const iconWrap = btn.createDiv({ cls: "atlas-activity-tab-icon" });
			if (tab.lucideIcon) {
				try {
					setIcon(iconWrap, tab.lucideIcon);
				} catch {
					iconWrap.setText(tab.icon);
				}
			} else {
				iconWrap.setText(tab.icon);
			}

			const badge = tab.badge?.();
			if (badge) {
				btn.createDiv({ cls: "atlas-activity-tab-badge atlas-badge-new", text: badge });
			}

			btn.addEventListener("click", () => void this.activateTab(tab.id));
		}

		this.activityBarEl.createDiv({ cls: "atlas-activity-spacer" });

		const settings = this.activityBarEl.createDiv({ cls: "atlas-activity-settings-icon" });
		setIcon(settings, "settings");
		settings.title = "Atlas Settings";
		settings.addEventListener("click", () => {
			const apiAny = this.app as unknown as {
				setting: { open: () => void; openTabById: (id: string) => void };
			};
			apiAny.setting.open();
			apiAny.setting.openTabById("atlas");
		});
	}

	private buildTabs(): TabDef[] {
		const plugin = this.plugin;
		return [
			{
				id: "jarvis",
				icon: "🤖",
				lucideIcon: "sparkles",
				label: "Jarvis",
				description: "Assistente de voz com tool calling",
				i18nLabel: "sidebar.jarvis",
				i18nDesc: "sidebar.jarvis.desc",
				render: renderJarvisTab,
			},
			{
				id: "today",
				icon: "☀️",
				lucideIcon: "sun",
				label: "Today",
				description: "Dashboard do dia",
				i18nLabel: "sidebar.today",
				i18nDesc: "sidebar.today.desc",
				render: renderTodayTab,
			},
			{
				id: "chat",
				icon: "💬",
				lucideIcon: "message-circle",
				label: "Chat",
				description: "Atlas Chat com KG",
				i18nLabel: "sidebar.chat",
				i18nDesc: "sidebar.chat.desc",
				render: renderChatTab,
			},
			{
				id: "hub",
				icon: "✅",
				lucideIcon: "check-square",
				label: "Hub",
				description: "Action Items consolidados",
				i18nLabel: "sidebar.hub",
				i18nDesc: "sidebar.hub.desc",
				badge: () => {
					const today = new Date().toISOString().split("T")[0];
					const overdue = plugin.kg.data.actionItems.filter(
						(a) =>
							a.status !== "completed" &&
							a.status !== "cancelled" &&
							a.dueDate &&
							a.dueDate < today
					).length;
					return overdue > 0 ? String(overdue) : null;
				},
				render: renderHubTab,
			},
			{
				id: "reminders",
				icon: "🔔",
				lucideIcon: "bell",
				label: "Reminders",
				description: "Lembretes com countdown + snooze",
				i18nLabel: "sidebar.reminders",
				i18nDesc: "sidebar.reminders.desc",
				badge: () => {
					try {
						const w = (plugin as unknown as { reminderWatcher?: { lastOverdueCount?: number } })
							.reminderWatcher;
						const c = w?.lastOverdueCount ?? 0;
						return c > 0 ? String(c) : null;
					} catch {
						return null;
					}
				},
				render: renderRemindersTab,
			},
			{
				id: "suggest",
				icon: "🔗",
				lucideIcon: "link",
				label: "Suggest",
				description: "Smart link suggestions live",
				i18nLabel: "sidebar.suggest",
				i18nDesc: "sidebar.suggest.desc",
				render: renderSuggestionsTab,
			},
			{
				id: "knowledge",
				icon: "🌐",
				lucideIcon: "network",
				label: "Knowledge",
				description: "Pessoas, projetos, temas (cards)",
				i18nLabel: "sidebar.knowledge",
				i18nDesc: "sidebar.knowledge.desc",
				render: renderKnowledgeTab,
			},
			{
				id: "systems",
				icon: "🖥️",
				lucideIcon: "server",
				label: "Sistemas",
				description: "PIX, Stripe, apps internos — CRUD completo",
				i18nLabel: "sidebar.systems",
				i18nDesc: "sidebar.systems.desc",
				badge: () => {
					const down = plugin.kg.data.systems.filter(
						(s) => s.status === "down" || s.status === "degraded"
					).length;
					return down > 0 ? String(down) : null;
				},
				render: renderSystemsTab,
			},
			{
				id: "products",
				icon: "📦",
				lucideIcon: "package",
				label: "Produtos",
				description: "Portfolio de produtos com sistemas associados",
				i18nLabel: "sidebar.products",
				i18nDesc: "sidebar.products.desc",
				render: renderProductsTab,
			},
			{
				id: "roles",
				icon: "🎓",
				lucideIcon: "graduation-cap",
				label: "Cargos",
				description: "Cargos padronizados do time",
				i18nLabel: "sidebar.roles",
				i18nDesc: "sidebar.roles.desc",
				render: renderRolesTab,
			},
			{
				id: "reports",
				icon: "🎙️",
				lucideIcon: "file-bar-chart",
				label: "Reports",
				description: "Timeline · Composer · Templates (3 sub-tabs)",
				i18nLabel: "sidebar.reports",
				i18nDesc: "sidebar.reports.desc",
				render: renderReportsTab,
			},
			{
				id: "analytics",
				icon: "📈",
				lucideIcon: "trending-up",
				label: "Analytics",
				description: "Heatmap · Trends · KG Graph · Mood (ECharts)",
				i18nLabel: "sidebar.analytics",
				i18nDesc: "sidebar.analytics.desc",
				render: renderAnalyticsTab,
			},
			{
				id: "lab",
				icon: "🧪",
				lucideIcon: "flask-conical",
				label: "Lab",
				description: "Tools IA · Serendipity · Time Capsules · Entity Tree",
				i18nLabel: "sidebar.lab",
				i18nDesc: "sidebar.lab.desc",
				badge: () => {
					// v0.51.1: Time capsules ready to deliver TODAY (or overdue)
					try {
						const cw = (plugin as unknown as {
							capsuleWatcher?: { getDueCount?: () => number };
						}).capsuleWatcher;
						const due = cw?.getDueCount?.() ?? 0;
						return due > 0 ? String(due) : null;
					} catch {
						return null;
					}
				},
				render: renderLabTab,
			},
			{
				id: "automations",
				icon: "🤖",
				lucideIcon: "bot",
				label: "Auto",
				description: "AutoTagger · Aliaser · Rules · Atlas Percebeu (monitoramento)",
				i18nLabel: "sidebar.automations",
				i18nDesc: "sidebar.automations.desc",
				badge: () => {
					// v0.51.1: Pending proactive insights + pending aliaser candidates
					try {
						const pd = (plugin as unknown as {
							proactiveDetector?: { getPendingCount?: () => number };
							autoAliaser?: { getPendingCandidatesCount?: () => number };
						});
						const insights = pd.proactiveDetector?.getPendingCount?.() ?? 0;
						const aliases = pd.autoAliaser?.getPendingCandidatesCount?.() ?? 0;
						const total = insights + aliases;
						return total > 0 ? String(total) : null;
					} catch {
						return null;
					}
				},
				render: renderAutomationsTab,
			},
			{
				id: "study",
				icon: "🃏",
				lucideIcon: "book-open",
				label: "Study",
				description: "Flashcards + papers + cursos",
				i18nLabel: "sidebar.study",
				i18nDesc: "sidebar.study.desc",
				badge: () => {
					const due = plugin.flashcards?.dueToday().length ?? 0;
					return due > 0 ? String(due) : null;
				},
				render: renderStudyTab,
			},
			{
				id: "health",
				icon: "🩺",
				lucideIcon: "stethoscope",
				label: "Health",
				description: "Workspace health score",
				i18nLabel: "sidebar.health",
				i18nDesc: "sidebar.health.desc",
				render: renderHealthTab,
			},
			{
				id: "status",
				icon: "⚙️",
				lucideIcon: "settings-2",
				label: "Status",
				description: "Diagnóstico Ollama + RAM",
				i18nLabel: "sidebar.status",
				i18nDesc: "sidebar.status.desc",
				render: renderStatusTab,
			},
		];
	}
}
