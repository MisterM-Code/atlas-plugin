import { TFile } from "obsidian";
import type AtlasPlugin from "../../../../main";

/**
 * Mood Timeline sub-view — radar + line de mood/energy ao longo do tempo.
 * Lê frontmatter `mood` e `energy` (1-5) dos daily logs.
 */
export async function renderAnalyticsMood(
	container: HTMLElement,
	plugin: AtlasPlugin
): Promise<void> {
	container.empty();

	const intro = container.createDiv();
	intro.style.fontSize = "11px";
	intro.style.opacity = "0.7";
	intro.style.marginBottom = "12px";
	intro.setText(
		"Bem-estar ao longo do tempo. Lê frontmatter mood + energy (1-5) dos daily logs."
	);

	// Coletar mood + energy dos últimos 90 daily logs
	const dailyFolder = plugin.settings.folders.daily;
	const allDailies = plugin.app.vault
		.getMarkdownFiles()
		.filter((f: TFile) => f.path.startsWith(dailyFolder))
		.sort((a, b) => b.stat.mtime - a.stat.mtime)
		.slice(0, 90);

	interface Datum {
		date: string;
		mood: number | null;
		energy: number | null;
	}
	const data: Datum[] = [];
	for (const f of allDailies) {
		const cache = plugin.app.metadataCache.getFileCache(f);
		const fm = cache?.frontmatter ?? {};
		const mood = parseNum(fm.mood);
		const energy = parseNum(fm.energy);
		const date = (fm.date as string) ?? f.basename.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? "";
		if (!date) continue;
		data.push({ date, mood, energy });
	}
	data.sort((a, b) => a.date.localeCompare(b.date));

	if (data.length === 0) {
		const empty = container.createDiv();
		empty.style.padding = "32px";
		empty.style.textAlign = "center";
		empty.style.opacity = "0.6";
		empty.setText(
			"📭 Nenhum daily log com mood/energy ainda. Adicione frontmatter `mood: 4` e `energy: 3` aos daily logs."
		);
		return;
	}

	// Stats
	const stats = container.createDiv();
	stats.style.display = "grid";
	stats.style.gridTemplateColumns = "repeat(4, 1fr)";
	stats.style.gap = "8px";
	stats.style.marginBottom = "16px";

	const moodValues = data.map((d) => d.mood).filter((v): v is number => v !== null);
	const energyValues = data.map((d) => d.energy).filter((v): v is number => v !== null);
	const avgMood = moodValues.length > 0 ? moodValues.reduce((s, v) => s + v, 0) / moodValues.length : 0;
	const avgEnergy = energyValues.length > 0 ? energyValues.reduce((s, v) => s + v, 0) / energyValues.length : 0;

	statBlock(stats, "🌡️ Mood médio", avgMood.toFixed(1));
	statBlock(stats, "⚡ Energy média", avgEnergy.toFixed(1));
	statBlock(stats, "📅 Logs analisados", String(data.length));
	statBlock(
		stats,
		"📊 Tendência",
		computeTrend(moodValues)
	);

	// Chart line
	const chartEl = container.createDiv();
	chartEl.style.width = "100%";
	chartEl.style.height = "320px";
	chartEl.style.background = "var(--background-secondary)";
	chartEl.style.borderRadius = "6px";
	chartEl.style.padding = "8px";
	chartEl.style.marginBottom = "12px";

	try {
		const { getEcharts } = await import("./echarts-bundle");
		const echarts = getEcharts();
		const chart = echarts.init(chartEl, undefined, { renderer: "canvas" });
		chart.setOption({
			title: { text: "🌡️ Mood + Energy (últimos 90 daily logs)", textStyle: { fontSize: 12 }, left: 8, top: 4 },
			tooltip: { trigger: "axis" },
			legend: { data: ["Mood", "Energy"], top: 28, textStyle: { fontSize: 10 } },
			grid: { left: 36, right: 20, top: 60, bottom: 30 },
			xAxis: {
				type: "category",
				data: data.map((d) => d.date.substring(5)), // MM-DD
				axisLabel: { fontSize: 9, rotate: 30 },
			},
			yAxis: {
				type: "value",
				min: 1,
				max: 5,
				axisLabel: { fontSize: 10 },
			},
			series: [
				{
					name: "Mood",
					type: "line",
					smooth: true,
					data: data.map((d) => d.mood),
					connectNulls: true,
					lineStyle: { color: "#3b82f6" },
					itemStyle: { color: "#3b82f6" },
					areaStyle: { opacity: 0.2 },
				},
				{
					name: "Energy",
					type: "line",
					smooth: true,
					data: data.map((d) => d.energy),
					connectNulls: true,
					lineStyle: { color: "#f97316" },
					itemStyle: { color: "#f97316" },
					areaStyle: { opacity: 0.2 },
				},
			],
		});
		new ResizeObserver(() => chart.resize()).observe(chartEl);

		// Radar chart (mensal médio)
		const radarEl = container.createDiv();
		radarEl.style.width = "100%";
		radarEl.style.height = "300px";
		radarEl.style.background = "var(--background-secondary)";
		radarEl.style.borderRadius = "6px";
		radarEl.style.padding = "8px";

		const monthly = aggregateByMonth(data);
		const radarChart = echarts.init(radarEl, undefined, { renderer: "canvas" });
		radarChart.setOption({
			title: { text: "📊 Mood por mês (radar)", textStyle: { fontSize: 12 }, left: 8, top: 4 },
			tooltip: {},
			radar: {
				indicator: monthly.map((m) => ({ name: m.month, max: 5 })),
				radius: 100,
				center: ["50%", "60%"],
				name: { textStyle: { fontSize: 10 } },
			},
			series: [
				{
					type: "radar",
					data: [
						{
							name: "Mood médio",
							value: monthly.map((m) => m.avgMood),
							itemStyle: { color: "#3b82f6" },
							areaStyle: { opacity: 0.3 },
						},
						{
							name: "Energy média",
							value: monthly.map((m) => m.avgEnergy),
							itemStyle: { color: "#f97316" },
							areaStyle: { opacity: 0.3 },
						},
					],
				},
			],
			legend: { data: ["Mood médio", "Energy média"], top: 28, textStyle: { fontSize: 10 } },
		});
		new ResizeObserver(() => radarChart.resize()).observe(radarEl);
	} catch (e) {
		chartEl.setText(`Atlas: erro ao carregar ECharts — ${String(e)}`);
		chartEl.style.color = "var(--color-red)";
	}
}

function parseNum(v: unknown): number | null {
	if (typeof v === "number") return v;
	if (typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim())) return Number.parseFloat(v);
	return null;
}

function computeTrend(values: number[]): string {
	if (values.length < 4) return "—";
	const half = Math.floor(values.length / 2);
	const firstHalf = values.slice(0, half);
	const secondHalf = values.slice(half);
	const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
	const avgSecond = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
	const delta = avgSecond - avgFirst;
	if (delta > 0.3) return "↑ subindo";
	if (delta < -0.3) return "↓ caindo";
	return "→ estável";
}

interface MonthlyAgg {
	month: string;
	avgMood: number;
	avgEnergy: number;
}

function aggregateByMonth(data: { date: string; mood: number | null; energy: number | null }[]): MonthlyAgg[] {
	const groups = new Map<string, { moods: number[]; energies: number[] }>();
	for (const d of data) {
		const month = d.date.substring(0, 7); // YYYY-MM
		if (!groups.has(month)) groups.set(month, { moods: [], energies: [] });
		const g = groups.get(month);
		if (!g) continue;
		if (d.mood !== null) g.moods.push(d.mood);
		if (d.energy !== null) g.energies.push(d.energy);
	}
	const out: MonthlyAgg[] = [];
	for (const [month, g] of groups) {
		out.push({
			month,
			avgMood: g.moods.length > 0 ? g.moods.reduce((s, v) => s + v, 0) / g.moods.length : 0,
			avgEnergy: g.energies.length > 0 ? g.energies.reduce((s, v) => s + v, 0) / g.energies.length : 0,
		});
	}
	return out.sort((a, b) => a.month.localeCompare(b.month));
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
