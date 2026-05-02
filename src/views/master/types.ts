import type AtlasPlugin from "../../../main";

export type TabId =
	| "today"
	| "chat"
	| "hub"
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
	badge?: () => string | null;
	render: (container: HTMLElement, plugin: AtlasPlugin) => Promise<void> | void;
	onClose?: (plugin: AtlasPlugin) => void;
}
