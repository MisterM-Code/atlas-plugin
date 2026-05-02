/**
 * Sub-tab bar reusable — barra horizontal de sub-abas dentro de uma tab principal.
 * Usada por Reports (Timeline/Composer/Templates), Lab (4 sub-views), Auto (4 cards), Study, Hub, Status.
 *
 * v0.28: polish premium com utility classes + cyan accent active state + smooth transitions.
 */

export interface SubTabDef<TId extends string = string> {
	id: TId;
	icon: string;
	label: string;
	description?: string;
	render: (container: HTMLElement) => Promise<void> | void;
	badge?: () => string | null;
}

export interface SubTabBarOptions<TId extends string> {
	/** Stable key para persistir tab ativa em localStorage. Ex: "atlas-reports-subtab" */
	storageKey?: string;
	defaultId?: TId;
	onChange?: (id: TId) => void;
}

/**
 * Renderiza a barra de sub-tabs + container de conteúdo.
 */
export function renderSubTabBar<TId extends string>(
	parent: HTMLElement,
	tabs: SubTabDef<TId>[],
	opts: SubTabBarOptions<TId> = {}
): { activate: (id: TId) => Promise<void>; getCurrent: () => TId } {
	if (tabs.length === 0) {
		throw new Error("renderSubTabBar: pelo menos 1 tab obrigatória");
	}

	// Resolve tab inicial: localStorage > defaultId > primeira tab
	let current: TId = (() => {
		if (opts.storageKey) {
			try {
				const stored = window.localStorage.getItem(opts.storageKey);
				if (stored && tabs.find((t) => t.id === stored)) {
					return stored as TId;
				}
			} catch {
				// ignore
			}
		}
		return opts.defaultId ?? tabs[0].id;
	})();

	// Bar
	const bar = parent.createDiv({ cls: "atlas-sub-tab-bar" });

	// Content container
	const contentEl = parent.createDiv({ cls: "atlas-sub-tab-content" });

	const buttons = new Map<TId, HTMLDivElement>();

	const renderBar = (): void => {
		bar.empty();
		buttons.clear();
		for (const tab of tabs) {
			const isActive = tab.id === current;
			const btn = bar.createDiv({
				cls: `atlas-sub-tab-btn ${isActive ? "is-active" : ""}`.trim(),
			});

			btn.createEl("span", { cls: "atlas-sub-tab-icon", text: tab.icon });
			btn.createEl("span", { cls: "atlas-sub-tab-label", text: tab.label });

			const badge = tab.badge?.();
			if (badge) {
				btn.createEl("span", { cls: "atlas-sub-tab-badge", text: badge });
			}

			if (tab.description) {
				btn.title = tab.description;
			}

			btn.addEventListener("click", () => {
				void activate(tab.id);
			});

			buttons.set(tab.id, btn);
		}
	};

	const activate = async (id: TId): Promise<void> => {
		const tab = tabs.find((t) => t.id === id);
		if (!tab) return;
		current = id;
		if (opts.storageKey) {
			try {
				window.localStorage.setItem(opts.storageKey, id);
			} catch {
				// ignore
			}
		}
		renderBar();
		contentEl.empty();
		try {
			await tab.render(contentEl);
		} catch (e) {
			contentEl.empty();
			const err = contentEl.createDiv({ cls: "atlas-sub-tab-error" });
			err.setText(`Atlas: erro em sub-tab "${tab.label}" — ${String(e)}`);
		}
		opts.onChange?.(id);
	};

	renderBar();
	void activate(current);

	return { activate, getCurrent: () => current };
}
