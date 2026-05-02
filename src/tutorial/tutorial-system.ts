/**
 * Atlas Tutorial System — overlay-based step-by-step tour.
 *
 * Sem dependência externa (driver.js seria 8 KB extra). Implementação
 * própria com SVG cutout overlay + popover posicionado.
 */

import { App, Notice } from "obsidian";
import type AtlasPlugin from "../../main";

export interface TutorialStep {
	/** CSS selector OU função que retorna elemento alvo. Se null, popup centralizado. */
	target?: string | (() => HTMLElement | null);
	title: string;
	body: string; // markdown leve (suporta **bold**, *italic*, `code`, [text](url))
	position?: "top" | "bottom" | "left" | "right" | "center";
	cta?: { label: string; action: () => void | Promise<void> };
	skipable?: boolean;
}

export interface Tutorial {
	id: string;
	name: string;
	description: string;
	estimatedMinutes: number;
	steps: TutorialStep[];
	onComplete?: (plugin: AtlasPlugin) => void;
}

interface TutorialState {
	completed: string[];
	skipped: string[];
}

const STATE_KEY = "atlas-tutorial-state";

export class TutorialSystem {
	private overlayEl: HTMLDivElement | null = null;
	private popoverEl: HTMLDivElement | null = null;
	private currentTutorial: Tutorial | null = null;
	private currentStepIdx = 0;
	private resizeHandler: (() => void) | null = null;
	private state: TutorialState = { completed: [], skipped: [] };

	constructor(private app: App, private plugin: AtlasPlugin) {
		this.loadState();
	}

	private loadState(): void {
		try {
			const raw = window.localStorage.getItem(STATE_KEY);
			if (raw) this.state = JSON.parse(raw);
		} catch {
			// noop
		}
	}

	private saveState(): void {
		try {
			window.localStorage.setItem(STATE_KEY, JSON.stringify(this.state));
		} catch {
			// noop
		}
	}

	hasCompleted(tutorialId: string): boolean {
		return this.state.completed.includes(tutorialId);
	}

	hasSkipped(tutorialId: string): boolean {
		return this.state.skipped.includes(tutorialId);
	}

	async start(tutorial: Tutorial): Promise<void> {
		if (this.currentTutorial) {
			this.cleanup();
		}
		this.currentTutorial = tutorial;
		this.currentStepIdx = 0;
		this.createOverlay();
		await this.showCurrentStep();
	}

	private async showCurrentStep(): Promise<void> {
		if (!this.currentTutorial) return;
		const step = this.currentTutorial.steps[this.currentStepIdx];
		if (!step) {
			this.complete();
			return;
		}

		// Resolve target
		let targetRect: DOMRect | null = null;
		if (step.target) {
			const el =
				typeof step.target === "function"
					? step.target()
					: document.querySelector(step.target);
			if (el) {
				targetRect = (el as HTMLElement).getBoundingClientRect();
				(el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
				// Wait for scroll
				await new Promise((r) => setTimeout(r, 300));
				targetRect = (el as HTMLElement).getBoundingClientRect();
			}
		}

		this.updateOverlay(targetRect);
		this.updatePopover(step, targetRect);
	}

	private createOverlay(): void {
		this.removeOverlay();

		const overlay = document.createElement("div");
		overlay.addClass("atlas-tutorial-overlay");
		overlay.style.position = "fixed";
		overlay.style.top = "0";
		overlay.style.left = "0";
		overlay.style.width = "100%";
		overlay.style.height = "100%";
		overlay.style.zIndex = "9999";
		overlay.style.pointerEvents = "none";

		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("width", "100%");
		svg.setAttribute("height", "100%");
		svg.style.position = "absolute";
		svg.style.top = "0";
		svg.style.left = "0";

		const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
		const mask = document.createElementNS("http://www.w3.org/2000/svg", "mask");
		mask.setAttribute("id", "atlas-tutorial-mask");

		const fullRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		fullRect.setAttribute("x", "0");
		fullRect.setAttribute("y", "0");
		fullRect.setAttribute("width", "100%");
		fullRect.setAttribute("height", "100%");
		fullRect.setAttribute("fill", "white");
		mask.appendChild(fullRect);

		const cutout = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		cutout.setAttribute("id", "atlas-tutorial-cutout");
		cutout.setAttribute("fill", "black");
		cutout.setAttribute("rx", "8");
		mask.appendChild(cutout);

		defs.appendChild(mask);
		svg.appendChild(defs);

		const dim = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		dim.setAttribute("x", "0");
		dim.setAttribute("y", "0");
		dim.setAttribute("width", "100%");
		dim.setAttribute("height", "100%");
		dim.setAttribute("fill", "rgba(0,0,0,0.55)");
		dim.setAttribute("mask", "url(#atlas-tutorial-mask)");
		svg.appendChild(dim);

		overlay.appendChild(svg);
		document.body.appendChild(overlay);
		this.overlayEl = overlay;

		// Popover container
		const popover = document.createElement("div");
		popover.addClass("atlas-tutorial-popover");
		popover.style.position = "fixed";
		popover.style.zIndex = "10000";
		popover.style.maxWidth = "360px";
		popover.style.minWidth = "280px";
		popover.style.padding = "16px";
		popover.style.background = "var(--background-primary)";
		popover.style.border = "1px solid var(--background-modifier-border)";
		popover.style.borderRadius = "8px";
		popover.style.boxShadow = "0 8px 32px rgba(0,0,0,0.3)";
		popover.style.pointerEvents = "auto";
		popover.style.fontSize = "13px";
		document.body.appendChild(popover);
		this.popoverEl = popover;

		// Re-render on resize
		this.resizeHandler = () => void this.showCurrentStep();
		window.addEventListener("resize", this.resizeHandler);
	}

	private updateOverlay(targetRect: DOMRect | null): void {
		const cutout = document.getElementById("atlas-tutorial-cutout");
		if (!cutout) return;
		if (targetRect) {
			const padding = 6;
			cutout.setAttribute("x", String(targetRect.left - padding));
			cutout.setAttribute("y", String(targetRect.top - padding));
			cutout.setAttribute("width", String(targetRect.width + padding * 2));
			cutout.setAttribute("height", String(targetRect.height + padding * 2));
		} else {
			cutout.setAttribute("x", "0");
			cutout.setAttribute("y", "0");
			cutout.setAttribute("width", "0");
			cutout.setAttribute("height", "0");
		}
	}

	private updatePopover(step: TutorialStep, targetRect: DOMRect | null): void {
		if (!this.popoverEl || !this.currentTutorial) return;

		this.popoverEl.empty();

		// Header
		const header = this.popoverEl.createDiv();
		header.style.display = "flex";
		header.style.justifyContent = "space-between";
		header.style.alignItems = "center";
		header.style.marginBottom = "8px";

		const title = header.createEl("div", { text: step.title });
		title.style.fontWeight = "bold";
		title.style.fontSize = "14px";

		const progress = header.createEl("span");
		progress.style.fontSize = "10px";
		progress.style.opacity = "0.6";
		progress.setText(`${this.currentStepIdx + 1}/${this.currentTutorial.steps.length}`);

		// Body
		const body = this.popoverEl.createDiv();
		body.style.marginBottom = "12px";
		body.style.lineHeight = "1.5";
		body.innerHTML = renderInline(step.body);

		// Footer
		const footer = this.popoverEl.createDiv();
		footer.style.display = "flex";
		footer.style.justifyContent = "space-between";
		footer.style.alignItems = "center";
		footer.style.gap = "8px";

		const leftBtns = footer.createDiv();
		leftBtns.style.display = "flex";
		leftBtns.style.gap = "6px";

		if (step.skipable !== false) {
			const skipBtn = leftBtns.createEl("button", { text: "Pular tour" });
			skipBtn.style.fontSize = "11px";
			skipBtn.style.opacity = "0.6";
			skipBtn.addEventListener("click", () => this.skip());
		}

		const rightBtns = footer.createDiv();
		rightBtns.style.display = "flex";
		rightBtns.style.gap = "6px";

		if (this.currentStepIdx > 0) {
			const back = rightBtns.createEl("button", { text: "← Voltar" });
			back.style.fontSize = "11px";
			back.addEventListener("click", () => void this.previous());
		}

		if (step.cta) {
			const ctaBtn = rightBtns.createEl("button", { text: step.cta.label });
			ctaBtn.addClass("mod-cta");
			ctaBtn.style.fontSize = "12px";
			ctaBtn.addEventListener("click", async () => {
				if (step.cta) await step.cta.action();
				void this.next();
			});
		} else {
			const next = rightBtns.createEl("button", {
				text:
					this.currentStepIdx < this.currentTutorial.steps.length - 1
						? "Próximo →"
						: "Concluir 🎉",
			});
			next.addClass("mod-cta");
			next.style.fontSize = "12px";
			next.addEventListener("click", () => void this.next());
		}

		// Position popover
		this.positionPopover(step.position, targetRect);
	}

	private positionPopover(
		preferred: "top" | "bottom" | "left" | "right" | "center" | undefined,
		targetRect: DOMRect | null
	): void {
		if (!this.popoverEl) return;
		const padding = 12;
		const popoverRect = this.popoverEl.getBoundingClientRect();
		const w = popoverRect.width || 320;
		const h = popoverRect.height || 200;
		const winW = window.innerWidth;
		const winH = window.innerHeight;

		if (!targetRect || preferred === "center") {
			this.popoverEl.style.left = `${(winW - w) / 2}px`;
			this.popoverEl.style.top = `${(winH - h) / 2}px`;
			return;
		}

		const positions = {
			bottom: {
				left: targetRect.left + targetRect.width / 2 - w / 2,
				top: targetRect.bottom + padding,
			},
			top: {
				left: targetRect.left + targetRect.width / 2 - w / 2,
				top: targetRect.top - h - padding,
			},
			right: {
				left: targetRect.right + padding,
				top: targetRect.top + targetRect.height / 2 - h / 2,
			},
			left: {
				left: targetRect.left - w - padding,
				top: targetRect.top + targetRect.height / 2 - h / 2,
			},
		};

		// preferred é "top" | "bottom" | "left" | "right" aqui (já saímos cedo se "center")
		const order: Array<"bottom" | "top" | "right" | "left"> = ["bottom", "right", "top", "left"];
		if (preferred && preferred !== ("center" as string)) {
			order.unshift(preferred as "bottom" | "top" | "right" | "left");
		}

		for (const pos of order) {
			const p = positions[pos];
			if (
				p.left >= padding &&
				p.left + w <= winW - padding &&
				p.top >= padding &&
				p.top + h <= winH - padding
			) {
				this.popoverEl.style.left = `${p.left}px`;
				this.popoverEl.style.top = `${p.top}px`;
				return;
			}
		}

		// Fallback: clamp to viewport
		this.popoverEl.style.left = `${Math.max(padding, Math.min(winW - w - padding, positions.bottom.left))}px`;
		this.popoverEl.style.top = `${Math.max(padding, Math.min(winH - h - padding, positions.bottom.top))}px`;
	}

	private async next(): Promise<void> {
		if (!this.currentTutorial) return;
		this.currentStepIdx++;
		if (this.currentStepIdx >= this.currentTutorial.steps.length) {
			this.complete();
		} else {
			await this.showCurrentStep();
		}
	}

	private async previous(): Promise<void> {
		if (!this.currentTutorial) return;
		this.currentStepIdx = Math.max(0, this.currentStepIdx - 1);
		await this.showCurrentStep();
	}

	private skip(): void {
		if (!this.currentTutorial) return;
		const id = this.currentTutorial.id;
		if (!this.state.skipped.includes(id)) this.state.skipped.push(id);
		this.saveState();
		this.cleanup();
		new Notice("Atlas: tour pulado. Volte em Settings → Atlas → Tours.");
	}

	private complete(): void {
		if (!this.currentTutorial) return;
		const id = this.currentTutorial.id;
		const cb = this.currentTutorial.onComplete;
		if (!this.state.completed.includes(id)) this.state.completed.push(id);
		this.saveState();
		this.cleanup();
		if (cb) cb(this.plugin);
		new Notice(`✨ Tour "${this.currentTutorial?.name}" concluído!`);
	}

	private cleanup(): void {
		this.removeOverlay();
		this.currentTutorial = null;
		this.currentStepIdx = 0;
	}

	private removeOverlay(): void {
		if (this.overlayEl) {
			this.overlayEl.remove();
			this.overlayEl = null;
		}
		if (this.popoverEl) {
			this.popoverEl.remove();
			this.popoverEl = null;
		}
		if (this.resizeHandler) {
			window.removeEventListener("resize", this.resizeHandler);
			this.resizeHandler = null;
		}
	}

	listAvailable(): { tutorial: Tutorial; status: "completed" | "skipped" | "new" }[] {
		const all = this.plugin.tutorialSystem ? getAllTutorials(this.plugin) : [];
		return all.map((t) => ({
			tutorial: t,
			status: this.state.completed.includes(t.id)
				? "completed"
				: this.state.skipped.includes(t.id)
					? "skipped"
					: "new",
		}));
	}

	resetState(): void {
		this.state = { completed: [], skipped: [] };
		this.saveState();
	}
}

function renderInline(text: string): string {
	const escape = (s: string) =>
		s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	let html = escape(text);
	html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
	html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
	html = html.replace(/`([^`]+)`/g, "<code style='background:var(--background-secondary);padding:1px 4px;border-radius:3px;'>$1</code>");
	html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
	html = html.replace(/\n\n+/g, "<br/><br/>");
	html = html.replace(/\n/g, "<br/>");
	return html;
}

// ─── Tutorial library (importado por main.ts) ───
// (definido em tours.ts pra evitar circular)

import { getAllTutorials } from "./tours";
export { getAllTutorials };
