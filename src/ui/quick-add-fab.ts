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
import { Notice } from "obsidian";
import { t } from "../i18n";

export interface QuickAddItem {
	icon: string;
	label: string;
	description: string;
	onClick: () => void | Promise<void>;
}

export interface QuickAddCategory {
	id: string;
	label: string;
	items: QuickAddItem[];
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
		fab.title = "Quick Add — criar entidade ou nota";
		fab.setText("+");
		fab.addEventListener("click", (ev) => {
			ev.stopPropagation();
			this.togglePopover();
		});

		parent.addClass("atlas-fab-parent");
		parent.appendChild(fab);
		this.fabEl = fab;

		// v0.43: align FAB to parent's right edge using getBoundingClientRect
		// (since position is fixed, we need to compute right offset relative to viewport)
		this.updateFabPosition();
		const ro = new ResizeObserver(() => this.updateFabPosition());
		ro.observe(parent);
		// Track parent for scroll/resize updates
		(this.fabEl as HTMLElement & { _atlasRO?: ResizeObserver })._atlasRO = ro;
	}

	private updateFabPosition(): void {
		if (!this.fabEl) return;
		const parent = this.fabEl.parentElement;
		if (!parent) return;
		const r = parent.getBoundingClientRect();
		// Anchor to parent's right edge with 16px margin
		this.fabEl.style.right = `${Math.max(16, window.innerWidth - r.right + 16)}px`;
		// Anchor bottom: parent's bottom edge (or viewport bottom if smaller)
		this.fabEl.style.bottom = `${Math.max(20, window.innerHeight - r.bottom + 20)}px`;
	}

	unmount(): void {
		const ro = (this.fabEl as (HTMLElement & { _atlasRO?: ResizeObserver }) | null)?._atlasRO;
		ro?.disconnect();
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

	private buildCategories(): QuickAddCategory[] {
		const close = () => this.closePopover();
		const exec = (id: string) => {
			close();
			const apiAny = this.plugin.app as unknown as {
				commands?: { executeCommandById?: (id: string) => void };
			};
			if (!apiAny.commands?.executeCommandById?.(id)) {
				new Notice(`Comando "${id}" não disponível.`);
			}
		};

		return [
			{
				id: "capturar",
				label: t("fab.cat.capture"),
				items: [
					{
						icon: "🎯",
						label: "Quick capture",
						description: "Captura inline com data parsed",
						onClick: () => {
							close();
							new QuickCaptureModal(this.plugin.app, this.plugin).open();
						},
					},
					{
						icon: "🎙️",
						label: "Voice note",
						description: "Gravar voz → whisper.cpp → texto",
						onClick: () => exec("atlas:voice-capture"),
					},
					{
						icon: "📓",
						label: "Daily log",
						description: "Abrir/criar daily de hoje",
						onClick: () => {
							close();
							void openOrCreateDailyLog(this.plugin);
						},
					},
					{
						icon: "👁️",
						label: "Vision (imagem)",
						description: "Analisar screenshot/whiteboard",
						onClick: () => exec("atlas:vision"),
					},
				],
			},
			{
				id: "criar",
				label: t("fab.cat.create"),
				items: [
					{
						icon: "👤",
						label: "Pessoa",
						description: "Cadastrar pessoa no KG",
						onClick: () => {
							close();
							renderPersonEditForm(this.plugin, null);
						},
					},
					{
						icon: "🖥️",
						label: "Sistema",
						description: "PIX, Stripe, app interno",
						onClick: () => {
							close();
							renderSystemEditForm(this.plugin, null);
						},
					},
					{
						icon: "📦",
						label: "Produto",
						description: "Pagamentos, Antifraude",
						onClick: () => {
							close();
							renderProductEditForm(this.plugin, null);
						},
					},
					{
						icon: "🎓",
						label: "Cargo",
						description: "Tech Lead, Senior, etc",
						onClick: () => {
							close();
							renderRoleEditForm(this.plugin, null);
						},
					},
					{
						icon: "📚",
						label: "Curso",
						description: "Track de estudo / certificação",
						onClick: () => exec("atlas:create-course"),
					},
					{
						icon: "🔔",
						label: "Reminder",
						description: "Lembrete com data/hora + notification",
						onClick: () => exec("atlas:create-reminder"),
					},
					{
						icon: "📧",
						label: "Email",
						description: "Compose email avulso (SMTP)",
						onClick: () => exec("atlas:compose-email"),
					},
					{
						icon: "🤝",
						label: "1:1 (GROW)",
						description: "Iniciar sessão com pessoa",
						onClick: () => exec("atlas:prepare-1on1"),
					},
					{
						icon: "🕰️",
						label: "Time capsule",
						description: "Nota que abre no futuro",
						onClick: () => {
							close();
							new TimeCapsuleModal(this.plugin.app, this.plugin).open();
						},
					},
				],
			},
			{
				id: "tools",
				label: t("fab.cat.tools"),
				items: [
					{
						icon: "📐",
						label: "Templates Atlas",
						description: "Escolher / usar / editar template",
						onClick: () => {
							close();
							new TemplatePickerModal(this.plugin.app, this.plugin).open();
						},
					},
					{
						icon: "🧠",
						label: "Reasoning (CoT)",
						description: "Pensar comigo via chain-of-thought",
						onClick: () => exec("atlas:reasoning"),
					},
					{
						icon: "⚰️",
						label: "Pre-mortem",
						description: "Análise de risco de iniciativa",
						onClick: () => exec("atlas:premortem-oracle"),
					},
					{
						icon: "📥",
						label: "Importar vault externo",
						description: "Migrar notas de outro vault pra estrutura Atlas",
						onClick: () => exec("atlas:import-vault"),
					},
				],
			},
		];
	}

	private openPopover(): void {
		if (!this.fabEl) return;

		const categories = this.buildCategories();

		const popover = document.createElement("div");
		popover.addClass("atlas-fab-popover");

		popover.createDiv({ cls: "atlas-fab-header", text: "ATLAS — Adicionar" });

		categories.forEach((cat, catIdx) => {
			if (catIdx > 0) {
				popover.createDiv({ cls: "atlas-fab-separator" });
			}
			popover.createDiv({ cls: "atlas-fab-category-title", text: cat.label });

			cat.items.forEach((item) => {
				const row = popover.createDiv({ cls: "atlas-fab-row" });

				row.createEl("span", { cls: "atlas-fab-row-icon", text: item.icon });
				const wrap = row.createDiv({ cls: "atlas-fab-row-text" });
				wrap.createEl("div", { cls: "atlas-fab-row-label", text: item.label });
				wrap.createEl("div", { cls: "atlas-fab-row-desc", text: item.description });

				row.addEventListener("click", () => void item.onClick());
			});
		});

		// Insert popover after FAB
		this.fabEl.parentElement?.appendChild(popover);
		this.popoverEl = popover;

		requestAnimationFrame(() => popover.addClass("is-open"));

		// Rotate FAB while popover open (CSS class handles transform)
		if (this.fabEl) this.fabEl.addClass("is-popover-open");

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
			this.popoverEl.removeClass("is-open");
			setTimeout(() => {
				this.popoverEl?.remove();
				this.popoverEl = null;
			}, 150);
		}
		if (this.fabEl) this.fabEl.removeClass("is-popover-open");
		if (this.clickOutsideHandler) {
			document.removeEventListener("click", this.clickOutsideHandler);
			this.clickOutsideHandler = null;
		}
	}

}
