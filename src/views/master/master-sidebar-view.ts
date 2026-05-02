import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type AtlasPlugin from "../../../main";
import { TabId, TabDef } from "./types";
import { renderAtlasHeader, AtlasHeaderHandle } from "../../ui/atlas-header";
import { renderTodayTab } from "./tab-today";
import { renderChatTab } from "./tab-chat";
import { renderHubTab } from "./tab-hub";
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
	private currentTab: TabId = "today";
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
		const c = this.containerEl.children[1];
		c.empty();
		c.addClass("atlas-master-sidebar");
		(c as HTMLElement).style.display = "flex";
		(c as HTMLElement).style.flexDirection = "row";
		(c as HTMLElement).style.height = "100%";
		(c as HTMLElement).style.padding = "0";

		// Activity bar (vertical icons)
		this.activityBarEl = c.createDiv() as HTMLDivElement;
		this.activityBarEl.style.width = "44px";
		this.activityBarEl.style.minWidth = "44px";
		this.activityBarEl.style.borderRight = "1px solid var(--background-modifier-border)";
		this.activityBarEl.style.padding = "8px 4px";
		this.activityBarEl.style.display = "flex";
		this.activityBarEl.style.flexDirection = "column";
		this.activityBarEl.style.gap = "4px";
		this.activityBarEl.style.overflow = "hidden";

		// Content area
		this.tabContentEl = c.createDiv() as HTMLDivElement;
		this.tabContentEl.style.flexGrow = "1";
		this.tabContentEl.style.overflow = "auto";
		this.tabContentEl.style.padding = "12px";
		this.tabContentEl.style.position = "relative";

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

		this.currentTab = id;
		this.renderActivityBar();
		this.tabContentEl.empty();

		// v0.7.2: Atlas header (logo breathing + profile) sempre no topo
		this.header = renderAtlasHeader(this.tabContentEl, this.plugin);

		// Tab content vai num wrapper separado (header não é re-renderizado)
		const tabBody = this.tabContentEl.createDiv();
		tabBody.style.minHeight = "0";

		try {
			await tab.render(tabBody, this.plugin);
		} catch (e) {
			tabBody.empty();
			const err = tabBody.createEl("div");
			err.style.padding = "16px";
			err.style.color = "var(--color-red)";
			err.style.fontSize = "12px";
			err.setText(`Atlas: erro ao renderizar tab "${tab.label}" — ${String(e)}`);
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
			const btn = this.activityBarEl.createDiv();
			btn.style.width = "36px";
			btn.style.height = "36px";
			btn.style.display = "flex";
			btn.style.alignItems = "center";
			btn.style.justifyContent = "center";
			btn.style.borderRadius = "6px";
			btn.style.cursor = "pointer";
			btn.style.fontSize = "16px";
			btn.style.position = "relative";
			btn.title = `${tab.label} — ${tab.description}`;

			if (tab.id === this.currentTab) {
				btn.style.background = "var(--atlas-accent, var(--interactive-accent))";
				btn.style.color = "white";
				btn.style.boxShadow = "0 0 12px var(--atlas-accent-glow, rgba(99,102,241,0.4))";
				btn.addClass("atlas-activity-tab-active");
			} else {
				btn.style.background = "transparent";
				btn.style.transition = "background var(--atlas-transition-fast, 120ms)";
				btn.addEventListener("mouseenter", () => {
					btn.style.background = "var(--background-modifier-hover)";
				});
				btn.addEventListener("mouseleave", () => {
					btn.style.background = "transparent";
				});
			}

			// v0.7.2: usa Lucide icon se disponível, senão emoji
			if (tab.lucideIcon) {
				const iconWrap = btn.createDiv();
				iconWrap.style.width = "20px";
				iconWrap.style.height = "20px";
				iconWrap.style.display = "flex";
				iconWrap.style.alignItems = "center";
				iconWrap.style.justifyContent = "center";
				try {
					setIcon(iconWrap, tab.lucideIcon);
				} catch {
					iconWrap.setText(tab.icon);
				}
			} else {
				btn.setText(tab.icon);
			}

			// Badge
			const badge = tab.badge?.();
			if (badge) {
				const b = btn.createDiv();
				b.style.position = "absolute";
				b.style.top = "0";
				b.style.right = "0";
				b.style.minWidth = "16px";
				b.style.height = "16px";
				b.style.background = "var(--color-red)";
				b.style.color = "white";
				b.style.borderRadius = "8px";
				b.style.fontSize = "9px";
				b.style.display = "flex";
				b.style.alignItems = "center";
				b.style.justifyContent = "center";
				b.style.padding = "0 4px";
				b.style.fontWeight = "bold";
				b.setText(badge);
			}

			btn.addEventListener("click", () => void this.activateTab(tab.id));
		}

		// Spacer
		const spacer = this.activityBarEl.createDiv();
		spacer.style.flexGrow = "1";

		// Settings icon at bottom
		const settings = this.activityBarEl.createDiv();
		settings.style.width = "36px";
		settings.style.height = "36px";
		settings.style.display = "flex";
		settings.style.alignItems = "center";
		settings.style.justifyContent = "center";
		settings.style.borderRadius = "6px";
		settings.style.cursor = "pointer";
		settings.style.opacity = "0.6";
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
				id: "today",
				icon: "☀️",
				lucideIcon: "sun",
				label: "Today",
				description: "Dashboard do dia",
				render: renderTodayTab,
			},
			{
				id: "chat",
				icon: "💬",
				lucideIcon: "message-circle",
				label: "Chat",
				description: "Atlas Chat com KG",
				render: renderChatTab,
			},
			{
				id: "hub",
				icon: "✅",
				lucideIcon: "check-square",
				label: "Hub",
				description: "Action Items consolidados",
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
				id: "suggest",
				icon: "🔗",
				lucideIcon: "link",
				label: "Suggest",
				description: "Smart link suggestions live",
				render: renderSuggestionsTab,
			},
			{
				id: "knowledge",
				icon: "🌐",
				lucideIcon: "network",
				label: "Knowledge",
				description: "Pessoas, projetos, temas (cards)",
				render: renderKnowledgeTab,
			},
			{
				id: "systems",
				icon: "🖥️",
				lucideIcon: "server",
				label: "Sistemas",
				description: "PIX, Stripe, apps internos — CRUD completo",
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
				render: renderProductsTab,
			},
			{
				id: "roles",
				icon: "🎓",
				lucideIcon: "graduation-cap",
				label: "Cargos",
				description: "Cargos padronizados do time",
				render: renderRolesTab,
			},
			{
				id: "reports",
				icon: "🎙️",
				lucideIcon: "file-bar-chart",
				label: "Reports",
				description: "Timeline · Composer · Templates (3 sub-tabs)",
				render: renderReportsTab,
			},
			{
				id: "analytics",
				icon: "📈",
				lucideIcon: "trending-up",
				label: "Analytics",
				description: "Heatmap · Trends · KG Graph · Mood (ECharts)",
				render: renderAnalyticsTab,
			},
			{
				id: "lab",
				icon: "🧪",
				lucideIcon: "flask-conical",
				label: "Lab",
				description: "Tools IA · Serendipity · Time Capsules · Entity Tree",
				render: renderLabTab,
			},
			{
				id: "automations",
				icon: "🤖",
				lucideIcon: "bot",
				label: "Auto",
				description: "AutoTagger · Aliaser · Rules · Atlas Percebeu (monitoramento)",
				render: renderAutomationsTab,
			},
			{
				id: "study",
				icon: "🃏",
				lucideIcon: "book-open",
				label: "Study",
				description: "Flashcards + papers + cursos",
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
				render: renderHealthTab,
			},
			{
				id: "status",
				icon: "⚙️",
				lucideIcon: "settings-2",
				label: "Status",
				description: "Diagnóstico Ollama + RAM",
				render: renderStatusTab,
			},
		];
	}
}
