/**
 * Quick Add FAB — floating action button bottom-right.
 * Click → popover com opções de criar entidade nova.
 */

import type AtlasPlugin from "../../main";
import { QuickCaptureModal } from "../commands/quick-capture";
import { openOrCreateDailyLog } from "../commands/daily-log";
import { TimeCapsuleModal } from "../tools/time-capsule";
import { renderSystemEditForm } from "../views/master/tab-systems";
import { renderProductEditForm } from "../views/master/tab-products";
import { renderRoleEditForm } from "../views/master/tab-roles";
import { renderPersonEditForm } from "../views/master/person-form";
import { TemplatePickerModal } from "../templates/visual-editor/editor-ui";

export interface QuickAddItem {
	icon: string;
	label: string;
	description: string;
	onClick: () => void | Promise<void>;
}

export class QuickAddFab {
	private fabEl: HTMLDivElement | null = null;
	private popoverEl: HTMLDivElement | null = null;
	private mounted = false;
	private clickOutsideHandler: ((e: MouseEvent) => void) | null = null;

	constructor(private plugin: AtlasPlugin) {}

	mount(parent: HTMLElement): void {
		if (this.mounted) return;
		this.mounted = true;

		const fab = document.createElement("div");
		fab.addClass("atlas-fab");
		fab.style.position = "absolute";
		fab.style.bottom = "16px";
		fab.style.right = "16px";
		fab.style.width = "44px";
		fab.style.height = "44px";
		fab.style.borderRadius = "50%";
		fab.style.background = "var(--interactive-accent)";
		fab.style.color = "var(--text-on-accent)";
		fab.style.display = "flex";
		fab.style.alignItems = "center";
		fab.style.justifyContent = "center";
		fab.style.fontSize = "22px";
		fab.style.cursor = "pointer";
		fab.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
		fab.style.zIndex = "100";
		fab.style.transition = "transform 150ms";
		fab.title = "Quick Add — criar entidade ou nota";
		fab.setText("+");

		fab.addEventListener("mouseenter", () => {
			fab.style.transform = "scale(1.05)";
		});
		fab.addEventListener("mouseleave", () => {
			fab.style.transform = "scale(1)";
		});
		fab.addEventListener("click", (ev) => {
			ev.stopPropagation();
			this.togglePopover();
		});

		parent.style.position = "relative";
		parent.appendChild(fab);
		this.fabEl = fab;
	}

	unmount(): void {
		this.fabEl?.remove();
		this.popoverEl?.remove();
		if (this.clickOutsideHandler) {
			document.removeEventListener("click", this.clickOutsideHandler);
			this.clickOutsideHandler = null;
		}
		this.fabEl = null;
		this.popoverEl = null;
		this.mounted = false;
	}

	private togglePopover(): void {
		if (this.popoverEl) {
			this.closePopover();
		} else {
			this.openPopover();
		}
	}

	private openPopover(): void {
		if (!this.fabEl) return;

		const items: QuickAddItem[] = [
			{
				icon: "🖥️",
				label: "Sistema",
				description: "PIX, Stripe, app interno...",
				onClick: () => {
					this.closePopover();
					renderSystemEditForm(this.plugin, null);
				},
			},
			{
				icon: "📦",
				label: "Produto",
				description: "Pagamentos, Antifraude...",
				onClick: () => {
					this.closePopover();
					renderProductEditForm(this.plugin, null);
				},
			},
			{
				icon: "🎓",
				label: "Cargo",
				description: "Tech Lead, Senior, etc",
				onClick: () => {
					this.closePopover();
					renderRoleEditForm(this.plugin, null);
				},
			},
			{
				icon: "👤",
				label: "Pessoa",
				description: "Cadastrar pessoa no KG",
				onClick: () => {
					this.closePopover();
					renderPersonEditForm(this.plugin, null);
				},
			},
			{
				icon: "📐",
				label: "Templates Atlas",
				description: "Escolher / usar / editar template visual",
				onClick: () => {
					this.closePopover();
					new TemplatePickerModal(this.plugin.app, this.plugin).open();
				},
			},
			{
				icon: "🤝",
				label: "1:1",
				description: "Iniciar sessão GROW com pessoa",
				onClick: () => {
					this.closePopover();
					const apiAny = this.plugin.app as unknown as {
						commands?: { executeCommandById?: (id: string) => void };
					};
					apiAny.commands?.executeCommandById?.("atlas:atlas-prepare-1on1");
				},
			},
			{
				icon: "📓",
				label: "Daily log",
				description: "Abrir/criar daily de hoje",
				onClick: () => {
					this.closePopover();
					void openOrCreateDailyLog(this.plugin);
				},
			},
			{
				icon: "🎯",
				label: "Quick capture",
				description: "Captura inline com data parsed",
				onClick: () => {
					this.closePopover();
					new QuickCaptureModal(this.plugin.app, this.plugin).open();
				},
			},
			{
				icon: "🕰️",
				label: "Time capsule",
				description: "Nota agendada pra abrir no futuro",
				onClick: () => {
					this.closePopover();
					new TimeCapsuleModal(this.plugin.app, this.plugin).open();
				},
			},
		];

		const popover = document.createElement("div");
		popover.addClass("atlas-fab-popover");
		popover.style.position = "absolute";
		popover.style.bottom = "70px";
		popover.style.right = "16px";
		popover.style.width = "260px";
		popover.style.background = "var(--background-primary)";
		popover.style.border = "1px solid var(--background-modifier-border)";
		popover.style.borderRadius = "8px";
		popover.style.boxShadow = "0 8px 24px rgba(0,0,0,0.18)";
		popover.style.padding = "6px";
		popover.style.zIndex = "101";
		popover.style.opacity = "0";
		popover.style.transform = "translateY(8px)";
		popover.style.transition = "opacity 150ms, transform 150ms";

		const title = popover.createDiv();
		title.style.padding = "6px 10px";
		title.style.fontSize = "10px";
		title.style.fontWeight = "bold";
		title.style.opacity = "0.6";
		title.style.letterSpacing = "0.5px";
		title.setText("ADICIONAR");

		for (const item of items) {
			const row = popover.createDiv();
			row.style.display = "flex";
			row.style.alignItems = "center";
			row.style.gap = "10px";
			row.style.padding = "8px 10px";
			row.style.cursor = "pointer";
			row.style.borderRadius = "4px";
			row.addEventListener("mouseenter", () => {
				row.style.background = "var(--background-modifier-hover)";
			});
			row.addEventListener("mouseleave", () => {
				row.style.background = "transparent";
			});

			const iconEl = row.createEl("span", { text: item.icon });
			iconEl.style.fontSize = "16px";
			iconEl.style.minWidth = "20px";
			iconEl.style.textAlign = "center";

			const wrap = row.createDiv();
			wrap.style.flexGrow = "1";
			const lbl = wrap.createEl("div", { text: item.label });
			lbl.style.fontSize = "13px";
			lbl.style.fontWeight = "500";
			const desc = wrap.createEl("div", { text: item.description });
			desc.style.fontSize = "11px";
			desc.style.opacity = "0.6";

			row.addEventListener("click", () => void item.onClick());
		}

		// Insert popover after FAB
		this.fabEl.parentElement?.appendChild(popover);
		this.popoverEl = popover;

		requestAnimationFrame(() => {
			popover.style.opacity = "1";
			popover.style.transform = "translateY(0)";
		});

		// Click outside fecha
		setTimeout(() => {
			this.clickOutsideHandler = (e: MouseEvent) => {
				if (!this.popoverEl) return;
				if (
					!this.popoverEl.contains(e.target as Node) &&
					!this.fabEl?.contains(e.target as Node)
				) {
					this.closePopover();
				}
			};
			document.addEventListener("click", this.clickOutsideHandler);
		}, 0);
	}

	private closePopover(): void {
		if (this.popoverEl) {
			this.popoverEl.style.opacity = "0";
			this.popoverEl.style.transform = "translateY(8px)";
			setTimeout(() => {
				this.popoverEl?.remove();
				this.popoverEl = null;
			}, 150);
		}
		if (this.clickOutsideHandler) {
			document.removeEventListener("click", this.clickOutsideHandler);
			this.clickOutsideHandler = null;
		}
	}

}
