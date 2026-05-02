/**
 * Atlas v0.14 — Memory Loop Visualization.
 *
 * Mostra como você revisita ideias/temas ao longo do tempo.
 * Não é só "tema X aparece N vezes" — é WHEN you revisit, com gaps.
 *
 * Visualização:
 * - Linha do tempo horizontal (últimos 90 dias)
 * - Para cada tema/conceito top, mostra dots em cada data de menção
 * - Insight: gaps grandes = você esqueceu; ressurgências frequentes = você está obcecado
 *
 * Uso: meta-cognição. Ver quais ideias você gira no fundo da mente.
 *
 * Render: Canvas 2D nativo (zero deps), ECharts opcional.
 */

import { App, Modal, TFile } from "obsidian";
import type AtlasPlugin from "../../main";
import { applyResponsiveModal } from "../ui/modal-helpers";

interface ThemeTimeline {
	theme: string;
	dates: string[];
	gaps: number[]; // dias entre menções consecutivas
	totalMentions: number;
	maxGap: number;
	avgGap: number;
}

export class MemoryLoopModal extends Modal {
	private daysBack = 90;

	constructor(app: App, private readonly plugin: AtlasPlugin) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		applyResponsiveModal(contentEl, { preferredWidth: 900, preferredHeight: 700 });
		contentEl.addClass("atlas-memloop-modal");

		contentEl.createEl("h3", { cls: "atlas-memloop-title", text: "🌀 Memory Loop Visualization" });
		contentEl.createEl("div", {
			cls: "atlas-memloop-subtitle",
			text: "Como você revisita ideias ao longo do tempo. Gaps grandes = esqueceu; ressurgências frequentes = mente girando.",
		});

		// Timeframe selector
		const timeRow = contentEl.createDiv({ cls: "atlas-memloop-timerange" });
		timeRow.createEl("label", { cls: "atlas-memloop-time-label", text: "Período:" });
		const presets: { days: number; label: string }[] = [
			{ days: 30, label: "30 dias" },
			{ days: 90, label: "90 dias" },
			{ days: 180, label: "6 meses" },
			{ days: 365, label: "1 ano" },
		];
		for (const p of presets) {
			const btn = timeRow.createEl("button", {
				cls: p.days === this.daysBack ? "atlas-memloop-time-btn is-active" : "atlas-memloop-time-btn",
				text: p.label,
			});
			btn.addEventListener("click", () => {
				this.daysBack = p.days;
				void this.refresh(contentEl);
			});
		}

		const wrap = contentEl.createDiv({ cls: "atlas-memloop-wrap" });
		await this.render(wrap);
	}

	private async refresh(parent: HTMLElement): Promise<void> {
		// Update active buttons
		parent.querySelectorAll(".atlas-memloop-time-btn").forEach((el) => el.removeClass("is-active"));
		parent.querySelectorAll(".atlas-memloop-time-btn").forEach((el) => {
			if (el.textContent && el.textContent.includes(String(this.daysBack))) {
				el.addClass("is-active");
			}
		});

		const wrap = parent.querySelector(".atlas-memloop-wrap") as HTMLElement;
		if (wrap) await this.render(wrap);
	}

	private async render(wrap: HTMLElement): Promise<void> {
		wrap.empty();
		wrap.createDiv({ cls: "atlas-memloop-loading", text: "🌀 Analisando timeline..." });

		const timelines = await this.computeTimelines();
		wrap.empty();

		if (timelines.length === 0) {
			wrap.createDiv({
				cls: "atlas-memloop-empty",
				text: "Nenhum tema com menções suficientes para visualização.",
			});
			return;
		}

		// Stats overview
		const stats = wrap.createDiv({ cls: "atlas-memloop-stats" });
		const obsessive = timelines.filter((t) => t.avgGap < 7);
		const forgotten = timelines.filter((t) => t.maxGap > 30);
		stats.createEl("strong", { text: `${timelines.length} temas com 3+ menções` });
		stats.createEl("span", {
			text: ` · 🔄 ${obsessive.length} ressurgentes (gap médio < 7d)`,
		});
		stats.createEl("span", {
			text: ` · 🌅 ${forgotten.length} com gap > 30d`,
		});

		// Render canvas timeline
		const canvasWrap = wrap.createDiv({ cls: "atlas-memloop-canvas-wrap" });
		const canvas = canvasWrap.createEl("canvas", { cls: "atlas-memloop-canvas" });
		this.drawTimeline(canvas, timelines);

		// Theme list with insights
		const list = wrap.createDiv({ cls: "atlas-memloop-themes" });
		for (const t of timelines.slice(0, 12)) {
			const card = list.createDiv({ cls: "atlas-memloop-theme-card" });
			const header = card.createDiv({ cls: "atlas-memloop-theme-header" });
			header.createEl("strong", { text: t.theme });
			header.createEl("span", {
				cls: "atlas-memloop-theme-count",
				text: ` · ${t.totalMentions} menções`,
			});

			const insight = card.createDiv({ cls: "atlas-memloop-theme-insight" });
			if (t.avgGap < 5) {
				insight.addClass("is-obsessive");
				insight.setText(`🔄 Mente girando: gap médio ${t.avgGap.toFixed(1)}d. Você está pensando muito sobre isso.`);
			} else if (t.maxGap > 60) {
				insight.addClass("is-forgotten");
				insight.setText(`🌅 Esquecimento: maior gap ${t.maxGap}d. Você abandonou e voltou.`);
			} else if (t.avgGap > 30) {
				insight.addClass("is-rare");
				insight.setText(`✨ Esporádico: gap médio ${t.avgGap.toFixed(0)}d. Aparece quando relevante.`);
			} else {
				insight.addClass("is-balanced");
				insight.setText(`⚖️ Equilibrado: gap médio ${t.avgGap.toFixed(1)}d. Padrão saudável.`);
			}

			// Mini timeline per theme (text-based)
			const miniLine = card.createDiv({ cls: "atlas-memloop-mini-line" });
			const dotCount = Math.min(t.dates.length, 30);
			for (let i = 0; i < dotCount; i++) {
				const dot = miniLine.createEl("span", {
					cls: "atlas-memloop-mini-dot",
					text: "•",
				});
				if (i < t.gaps.length) {
					const gap = t.gaps[i];
					const spaces = Math.min(Math.ceil(gap / 5), 8);
					if (spaces > 0) {
						dot.style.setProperty("margin-right", `${spaces * 3}px`);
					}
				}
			}
		}
	}

	private async computeTimelines(): Promise<ThemeTimeline[]> {
		const cutoff = new Date();
		cutoff.setDate(cutoff.getDate() - this.daysBack);

		// Pull themes from KG
		const kg = this.plugin.kg.data;
		const result: ThemeTimeline[] = [];

		for (const t of kg.themes) {
			// Find sessions that mention this theme
			const sessions = kg.sessions.filter(
				(s) =>
					s.topics.includes(t.name) &&
					new Date(s.date).getTime() >= cutoff.getTime()
			);

			if (sessions.length < 3) continue;

			const dates = sessions.map((s) => s.date).sort();
			const gaps: number[] = [];
			for (let i = 1; i < dates.length; i++) {
				const a = new Date(dates[i - 1]);
				const b = new Date(dates[i]);
				const days = Math.floor((b.getTime() - a.getTime()) / 86_400_000);
				gaps.push(days);
			}

			const maxGap = gaps.length > 0 ? Math.max(...gaps) : 0;
			const avgGap = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;

			result.push({
				theme: t.name,
				dates,
				gaps,
				totalMentions: dates.length,
				maxGap,
				avgGap,
			});
		}

		// Also pull from daily logs (notes mentioning theme keywords)
		// (Skipped for performance — KG is enough for now)

		result.sort((a, b) => b.totalMentions - a.totalMentions);
		return result.slice(0, 15);
	}

	private drawTimeline(canvas: HTMLCanvasElement, timelines: ThemeTimeline[]): void {
		const w = canvas.parentElement?.clientWidth ?? 800;
		canvas.width = w;
		canvas.height = Math.max(220, timelines.length * 28 + 40);
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		// Background
		ctx.fillStyle = getComputedStyle(canvas).getPropertyValue("--background-secondary").trim() || "#1e1e1e";
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		// Date axis bottom
		const axisY = canvas.height - 24;
		ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(140, axisY);
		ctx.lineTo(canvas.width - 20, axisY);
		ctx.stroke();

		// X axis labels (start, middle, end)
		ctx.fillStyle = "rgba(148, 163, 184, 0.7)";
		ctx.font = "10px monospace";
		const startDate = new Date();
		startDate.setDate(startDate.getDate() - this.daysBack);
		const endDate = new Date();
		ctx.fillText(startDate.toISOString().split("T")[0], 140, axisY + 14);
		ctx.fillText(endDate.toISOString().split("T")[0], canvas.width - 90, axisY + 14);

		// Plot each theme
		const usableW = canvas.width - 160;
		const colors = [
			"#818cf8",
			"#34d399",
			"#fbbf24",
			"#f87171",
			"#22d3ee",
			"#a78bfa",
			"#fb7185",
			"#facc15",
		];

		const startMs = startDate.getTime();
		const endMs = endDate.getTime();
		const range = endMs - startMs;

		timelines.slice(0, 10).forEach((t, idx) => {
			const y = 20 + idx * 28;
			const color = colors[idx % colors.length];

			// Theme label
			ctx.fillStyle = "rgba(226, 232, 240, 0.85)";
			ctx.font = "11px sans-serif";
			ctx.fillText(t.theme.substring(0, 18), 8, y + 6);

			// Connection line
			ctx.strokeStyle = color + "40";
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(140, y);
			ctx.lineTo(canvas.width - 20, y);
			ctx.stroke();

			// Dots for each date
			ctx.fillStyle = color;
			for (const dateStr of t.dates) {
				const dateMs = new Date(dateStr).getTime();
				if (dateMs < startMs || dateMs > endMs) continue;
				const x = 140 + ((dateMs - startMs) / range) * usableW;
				ctx.beginPath();
				ctx.arc(x, y, 4, 0, Math.PI * 2);
				ctx.fill();
			}
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
