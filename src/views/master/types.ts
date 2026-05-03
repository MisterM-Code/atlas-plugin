import type AtlasPlugin from "../../../main";

export type TabId =
	| "jarvis"
	| "today"
	| "chat"
	| "hub"
	| "reminders"
	| "suggest"
	| "knowledge"
	| "systems"
	| "products"
	| "roles"
	| "reports"
	| "analytics"
	| "lab"
	| "automations"
	| "study"
	| "health"
	| "status";

export interface TabDef {
	id: TabId;
	/** Emoji fallback (usado quando Lucide não disponível). */
	icon: string;
	/** Lucide icon name (preferido). v0.7.2+ */
	lucideIcon?: string;
	label: string;
	description: string;
	/** v0.55.0: i18n keys (opcional). Quando setado, renderTabs prefere t(i18nLabel). */
	i18nLabel?: string;
	i18nDesc?: string;
	badge?: () => string | null;
	render: (container: HTMLElement, plugin: AtlasPlugin) => Promise<void> | void;
	onClose?: (plugin: AtlasPlugin) => void;
}
