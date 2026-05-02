import { TFile } from "obsidian";
import type AtlasPlugin from "../../../../main";

/**
 * Heatmap sub-view — GitHub-style 365-day grid mostrando intensidade de notas/dailies.
 *
 * Render via ECharts calendar component.
 */
export async function renderAnalyticsHeatmap(
	container: HTMLElement,
	plugin: AtlasPlugin
): Promise<void> {
	container.empty();

	const intro = container.createDiv();
	intro.style.fontSize = "11px";
	intro.style.opacity = "0.7";
	intro.style.marginBottom = "12px";
	intro.setText(
		"Atividade do vault no último ano. Cada célula = 1 dia. Cor = intensidade (notas modificadas)."
	);

	// Build dataset
	const days = 365;
	const today = new Date();
	const data: [string, number][] = [];

	const allFiles = plugin.app.vault.getMarkdownFiles();
	const counts = new Map<string, number>();

	for (let i = 0; i < days; i++) {
		const d = new Date(today.getTime() - i * 86_400_000);
		const key = d.toISOString().split("T")[0];
		counts.set(key, 0);
	}

	for (const f of allFiles) {
		const d = new Date(f.stat.mtime);
		const key = d.toISOString().split("T")[0];
		if (counts.has(key)) {
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
	}

	for (const [date, count] of counts) {
		data.push([date, count]);
	}

	// Stats
	const stats = container.createDiv();
	stats.style.display = "grid";
	stats.style.gridTemplateColumns = "repeat(4, 1fr)";
	stats.style.gap = "8px";
	stats.style.marginBottom = "16px";

	const total = data.reduce((sum, [, c]) => sum + c, 0);
	const activeDays = data.filter(([, c]) => c > 0).length;
	const maxDay = data.reduce((max, [date, c]) => (c > max.count ? { date, count: c } : max), { date: "", count: 0 });
	const streak = computeStreak(counts);

	statBlock(stats, "📝 Total mods", String(total));
	statBlock(stats, "📅 Dias ativos", `${activeDays}/365`);
	statBlock(stats, "🔥 Streak", `${streak}d`);
	statBlock(stats, "💎 Pico", `${maxDay.count} mods`);

	// Chart container
	const chartEl = container.createDiv();
	chartEl.style.width = "100%";
	chartEl.style.height = "240px";

	// v0.16: empty-state for new vaults (no activity yet)
	if (total === 0) {
		const empty = container.createDiv();
		empty.style.textAlign = "center";
		empty.style.padding = "40px 20px";
		empty.style.opacity = "0.75";
		empty.style.fontSize = "13px";
		empty.style.lineHeight = "1.6";
		empty.createEl("div", { text: "🌱" }).style.fontSize = "32px";
		empty.createEl("div", {
			text: "Vault novo — nenhuma atividade ainda.",
		}).style.marginTop = "8px";
		empty.createEl("div", {
			text: "Use o vault por 7+ dias e o heatmap começa a preencher. Crie daily logs ou modifique notas.",
		}).style.opacity = "0.7";
		return;
	}

	try {
		const { getEcharts } = await import("./echarts-bundle");
		const echarts = getEcharts();
		const startDate = new Date(today.getTime() - days * 86_400_000).toISOString().split("T")[0];
		const endDate = today.toISOString().split("T")[0];

		const chart = echarts.init(chartEl, undefined, { renderer: "canvas" });
		chart.setOption({
			tooltip: {
				formatter: (params: { value: [string, number] }) => {
					const [date, count] = params.value;
					return `${date}<br/>${count} ${count === 1 ? "modificação" : "modificações"}`;
				},
			},
			visualMap: {
				show: false,
				min: 0,
				max: Math.max(10, maxDay.count),
				inRange: {
					color: [
						"#161b22",
						"#0e4429",
						"#006d32",
						"#26a641",
						"#39d353",
					],
				},
			},
			calendar: {
				top: 30,
				left: 30,
				right: 30,
				cellSize: ["auto", 14],
				range: [startDate, endDate],
				itemStyle: {
					borderWidth: 2,
					borderColor: "var(--background-primary)",
				},
				splitLine: { show: false },
				yearLabel: { show: false },
				monthLabel: {
					nameMap: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"],
					color: "var(--text-muted)",
					fontSize: 10,
				},
				dayLabel: {
					nameMap: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
					firstDay: 1,
					color: "var(--text-muted)",
					fontSize: 10,
				},
			},
			series: [
				{
					type: "heatmap",
					coordinateSystem: "calendar",
					data,
				},
			],
		});

		// Click pra navegar
		chart.on("click", (params) => {
			const value = params.value as [string, number] | undefined;
			if (!value) return;
			const [date] = value;
			const file = allFiles.find((f) => {
				const d = new Date(f.stat.mtime).toISOString().split("T")[0];
				return d === date;
			});
			if (file instanceof TFile) {
				void plugin.app.workspace.getLeaf().openFile(file);
			}
		});

		// Resize observer
		const ro = new ResizeObserver(() => chart.resize());
		ro.observe(chartEl);
	} catch (e) {
		chartEl.setText(`Atlas: erro ao carregar ECharts — ${String(e)}`);
		chartEl.style.color = "var(--color-red)";
	}
}

function statBlock(parent: HTMLElement, label: string, value: string): void {
	const cell = parent.createDiv();
	cell.style.padding = "10px";
	cell.style.background = "var(--background-secondary)";
	cell.style.borderRadius = "6px";
	cell.style.textAlign = "center";

	const v = cell.createEl("div", { text: value });
	v.style.fontSize = "20px";
	v.style.fontWeight = "bold";
	v.style.color = "var(--interactive-accent)";

	const l = cell.createEl("div", { text: label });
	l.style.fontSize = "10px";
	l.style.opacity = "0.7";
	l.style.marginTop = "2px";
}

function computeStreak(counts: Map<string, number>): number {
	const today = new Date();
	let streak = 0;
	for (let i = 0; i < 365; i++) {
		const d = new Date(today.getTime() - i * 86_400_000);
		const key = d.toISOString().split("T")[0];
		const count = counts.get(key) ?? 0;
		if (count > 0) {
			streak++;
		} else if (i > 0) {
			break;
		}
	}
	return streak;
}
