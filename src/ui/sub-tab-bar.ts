/**
 * Sub-tab bar reusable — barra horizontal de sub-abas dentro de uma tab principal.
 * Usada por Reports (Timeline/Composer/Templates), Lab (4 sub-views), Auto (4 cards).
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
 *
 * @param parent  Elemento onde a barra + content serão criados
 * @param tabs    Lista de sub-tabs
 * @param opts    Configurações
 * @returns Função para ativar uma tab programaticamente
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
	const bar = parent.createDiv();
	bar.addClass("atlas-sub-tab-bar");
	bar.style.display = "flex";
	bar.style.gap = "4px";
	bar.style.borderBottom = "1px solid var(--background-modifier-border)";
	bar.style.marginBottom = "12px";
	bar.style.flexWrap = "wrap";

	// Content container
	const contentEl = parent.createDiv();
	contentEl.addClass("atlas-sub-tab-content");

	const buttons = new Map<TId, HTMLDivElement>();

	const renderBar = (): void => {
		bar.empty();
		buttons.clear();
		for (const tab of tabs) {
			const btn = bar.createDiv();
			btn.style.padding = "8px 14px";
			btn.style.cursor = "pointer";
			btn.style.fontSize = "12px";
			btn.style.fontWeight = "500";
			btn.style.borderRadius = "6px 6px 0 0";
			btn.style.transition = "background 120ms";
			btn.style.position = "relative";
			btn.style.display = "flex";
			btn.style.alignItems = "center";
			btn.style.gap = "6px";

			if (tab.id === current) {
				btn.style.background = "var(--background-modifier-hover)";
				btn.style.borderBottom = "2px solid var(--interactive-accent)";
				btn.style.color = "var(--text-normal)";
				btn.style.marginBottom = "-1px";
			} else {
				btn.style.background = "transparent";
				btn.style.color = "var(--text-muted)";
				btn.addEventListener("mouseenter", () => {
					btn.style.background = "var(--background-secondary)";
				});
				btn.addEventListener("mouseleave", () => {
					btn.style.background = "transparent";
				});
			}

			const iconEl = btn.createEl("span", { text: tab.icon });
			iconEl.style.fontSize = "14px";
			btn.createEl("span", { text: tab.label });

			const badge = tab.badge?.();
			if (badge) {
				const b = btn.createEl("span", { text: badge });
				b.style.background = "var(--color-red)";
				b.style.color = "white";
				b.style.fontSize = "9px";
				b.style.padding = "1px 5px";
				b.style.borderRadius = "8px";
				b.style.marginLeft = "4px";
				b.style.fontWeight = "bold";
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
			const err = contentEl.createDiv();
			err.style.padding = "12px";
			err.style.color = "var(--color-red)";
			err.style.fontSize = "12px";
			err.setText(`Atlas: erro em sub-tab "${tab.label}" — ${String(e)}`);
		}
		opts.onChange?.(id);
	};

	renderBar();
	void activate(current);

	return { activate, getCurrent: () => current };
}
