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
				label: "📥 CAPTURAR",
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
				label: "➕ CRIAR",
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
				label: "🛠️ TOOLS IA",
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
				],
			},
		];
	}

	private openPopover(): void {
		if (!this.fabEl) return;

		const categories = this.buildCategories();

		const popover = document.createElement("div");
		popover.addClass("atlas-fab-popover");
		popover.style.position = "absolute";
		popover.style.bottom = "70px";
		popover.style.right = "16px";
		popover.style.width = "280px";
		popover.style.maxHeight = "min(70vh, 560px)";
		popover.style.overflowY = "auto";
		popover.style.background = "var(--background-primary)";
		popover.style.border = "1px solid var(--background-modifier-border)";
		popover.style.borderRadius = "10px";
		popover.style.boxShadow = "0 12px 32px rgba(0,0,0,0.24)";
		popover.style.padding = "6px";
		popover.style.zIndex = "101";
		popover.style.opacity = "0";
		popover.style.transform = "translateY(8px) scale(0.97)";
		popover.style.transformOrigin = "bottom right";
		popover.style.transition = "opacity 180ms ease, transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1)";

		const header = popover.createDiv();
		header.style.padding = "8px 10px 6px";
		header.style.fontSize = "11px";
		header.style.fontWeight = "600";
		header.style.opacity = "0.5";
		header.style.letterSpacing = "0.5px";
		header.setText("ATLAS — Adicionar");

		categories.forEach((cat, catIdx) => {
			if (catIdx > 0) {
				const sep = popover.createDiv();
				sep.style.height = "1px";
				sep.style.background = "var(--background-modifier-border)";
				sep.style.margin = "4px 8px";
				sep.style.opacity = "0.5";
			}
			const catTitle = popover.createDiv();
			catTitle.style.padding = "8px 10px 4px";
			catTitle.style.fontSize = "10px";
			catTitle.style.fontWeight = "700";
			catTitle.style.opacity = "0.55";
			catTitle.style.letterSpacing = "0.6px";
			catTitle.setText(cat.label);

			cat.items.forEach((item) => {
				const row = popover.createDiv();
				row.addClass("atlas-fab-row");
				row.style.display = "flex";
				row.style.alignItems = "center";
				row.style.gap = "10px";
				row.style.padding = "8px 10px";
				row.style.cursor = "pointer";
				row.style.borderRadius = "6px";
				row.style.transition = "background 120ms ease, transform 120ms ease";
				row.addEventListener("mouseenter", () => {
					row.style.background = "var(--background-modifier-hover)";
					row.style.transform = "translateX(2px)";
				});
				row.addEventListener("mouseleave", () => {
					row.style.background = "transparent";
					row.style.transform = "translateX(0)";
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
			});
		});

		// Insert popover after FAB
		this.fabEl.parentElement?.appendChild(popover);
		this.popoverEl = popover;

		requestAnimationFrame(() => {
			popover.style.opacity = "1";
			popover.style.transform = "translateY(0) scale(1)";
		});

		// Rotate FAB while popover open
		if (this.fabEl) this.fabEl.style.transform = "rotate(45deg)";

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
			this.popoverEl.style.transform = "translateY(8px) scale(0.97)";
			setTimeout(() => {
				this.popoverEl?.remove();
				this.popoverEl = null;
			}, 150);
		}
		if (this.fabEl) this.fabEl.style.transform = "rotate(0deg)";
		if (this.clickOutsideHandler) {
			document.removeEventListener("click", this.clickOutsideHandler);
			this.clickOutsideHandler = null;
		}
	}

}
