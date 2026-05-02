import type AtlasPlugin from "../../../../main";

/**
 * Trends sub-view — multiple line charts mostrando tendências temporais.
 *
 * Charts:
 *   1. KG growth (people, projects, themes ao longo do tempo)
 *   2. Sessions per week (1on1, meeting, coaching stacked)
 *   3. Themes top 5 frequência por mês
 *   4. Commitments status (open/closed/overdue área empilhada)
 */
export async function renderAnalyticsTrends(
	container: HTMLElement,
	plugin: AtlasPlugin
): Promise<void> {
	container.empty();
	container.addClass("atlas-analytics-trends");

	const intro = container.createDiv({ cls: "atlas-analytics-intro" });
	intro.setText(
		"Tendências temporais: KG growth, sessões por semana, top temas, commitments. Toggle período abaixo."
	);

	// Period selector
	const periodBar = container.createDiv({ cls: "atlas-analytics-period-bar" });

	type PeriodId = "30d" | "90d" | "1y";
	// v0.22 Sprint G: persist period selector entre sessions via localStorage
	const STORAGE_KEY = "atlas-trends-period";
	const stored = (() => {
		try {
			const v = localStorage.getItem(STORAGE_KEY);
			if (v === "30d" || v === "90d" || v === "1y") return v as PeriodId;
		} catch {
			// ignore
		}
		return "90d" as PeriodId;
	})();
	let activePeriod: PeriodId = stored;
	const periods: { id: PeriodId; label: string; days: number }[] = [
		{ id: "30d", label: "30 dias", days: 30 },
		{ id: "90d", label: "90 dias", days: 90 },
		{ id: "1y", label: "1 ano", days: 365 },
	];

	const periodButtons: { btn: HTMLButtonElement; id: PeriodId }[] = [];
	for (const p of periods) {
		const btn = periodBar.createEl("button", { cls: "atlas-analytics-period-btn", text: p.label });
		periodButtons.push({ btn, id: p.id });
		btn.addEventListener("click", () => {
			activePeriod = p.id;
			try {
				localStorage.setItem(STORAGE_KEY, p.id);
			} catch {
				// ignore quota errors
			}
			updateButtons();
			void renderCharts();
		});
	}

	const updateButtons = () => {
		periodButtons.forEach(({ btn, id }) => {
			if (id === activePeriod) btn.addClass("mod-cta");
			else btn.removeClass("mod-cta");
		});
	};
	updateButtons();

	// Charts grid
	const grid = container.createDiv({ cls: "atlas-analytics-charts-grid" });

	const chart1 = grid.createDiv({ cls: "atlas-analytics-chart" });
	const chart2 = grid.createDiv({ cls: "atlas-analytics-chart" });
	const chart3 = grid.createDiv({ cls: "atlas-analytics-chart" });
	const chart4 = grid.createDiv({ cls: "atlas-analytics-chart" });

	const renderCharts = async () => {
		const days = periods.find((p) => p.id === activePeriod)?.days ?? 90;
		try {
			const { getEcharts } = await import("./echarts-bundle");
			const echarts = getEcharts();
			renderKgGrowth(chart1, plugin, days, echarts);
			renderSessionsPerWeek(chart2, plugin, days, echarts);
			renderTopThemes(chart3, plugin, days, echarts);
			renderCommitmentsStatus(chart4, plugin, days, echarts);
		} catch (e) {
			grid.setText(`Atlas: erro ao carregar ECharts — ${String(e)}`);
		}
	};

	void renderCharts();
}

function renderKgGrowth(
	el: HTMLElement,
	plugin: AtlasPlugin,
	days: number,
	echarts: { init: (el: HTMLElement, theme?: unknown, opts?: { renderer?: "canvas" | "svg" }) => { setOption: (opt: unknown) => void; resize: () => void; on: (ev: string, handler: (params: unknown) => void) => void; } }
): void {
	el.empty();
	const today = Date.now();
	const cutoff = today - days * 86_400_000;

	const buckets = bucketByWeek(days);
	const peopleCount: number[] = [];
	const projectCount: number[] = [];
	const themeCount: number[] = [];

	for (const bucket of buckets) {
		peopleCount.push(plugin.kg.data.people.filter((p) => new Date(p.createdAt).getTime() <= bucket.endMs).length);
		projectCount.push(plugin.kg.data.projects.filter((p) => new Date(p.createdAt).getTime() <= bucket.endMs).length);
		themeCount.push(plugin.kg.data.themes.filter((t) => new Date(t.createdAt).getTime() <= bucket.endMs).length);
	}
	void cutoff;

	const chart = echarts.init(el, undefined, { renderer: "canvas" });
	chart.setOption({
		title: { text: "📈 KG Growth", textStyle: { fontSize: 12 }, left: 8, top: 4 },
		tooltip: { trigger: "axis" },
		legend: { data: ["Pessoas", "Projetos", "Temas"], top: 24, textStyle: { fontSize: 10 } },
		grid: { left: 40, right: 20, top: 60, bottom: 30 },
		xAxis: {
			type: "category",
			data: buckets.map((b) => b.label),
			axisLabel: { fontSize: 9, rotate: 30 },
		},
		yAxis: { type: "value", axisLabel: { fontSize: 10 } },
		series: [
			{ name: "Pessoas", type: "line", smooth: true, data: peopleCount, areaStyle: { opacity: 0.3 }, lineStyle: { color: "#3b82f6" }, itemStyle: { color: "#3b82f6" } },
			{ name: "Projetos", type: "line", smooth: true, data: projectCount, areaStyle: { opacity: 0.3 }, lineStyle: { color: "#10b981" }, itemStyle: { color: "#10b981" } },
			{ name: "Temas", type: "line", smooth: true, data: themeCount, areaStyle: { opacity: 0.3 }, lineStyle: { color: "#f97316" }, itemStyle: { color: "#f97316" } },
		],
	});
	new ResizeObserver(() => chart.resize()).observe(el);
}

function renderSessionsPerWeek(
	el: HTMLElement,
	plugin: AtlasPlugin,
	days: number,
	echarts: { init: (el: HTMLElement, theme?: unknown, opts?: { renderer?: "canvas" | "svg" }) => { setOption: (opt: unknown) => void; resize: () => void; on: (ev: string, handler: (params: unknown) => void) => void; } }
): void {
	el.empty();
	const buckets = bucketByWeek(days);

	const oneonOne: number[] = buckets.map(() => 0);
	const meeting: number[] = buckets.map(() => 0);
	const coaching: number[] = buckets.map(() => 0);

	for (const s of plugin.kg.data.sessions) {
		const sMs = new Date(s.date).getTime();
		const idx = buckets.findIndex((b) => sMs >= b.startMs && sMs <= b.endMs);
		if (idx === -1) continue;
		if (s.type === "1on1") oneonOne[idx]++;
		else if (s.type === "coaching") coaching[idx]++;
		else meeting[idx]++;
	}

	const chart = echarts.init(el, undefined, { renderer: "canvas" });
	chart.setOption({
		title: { text: "🤝 Sessões / semana", textStyle: { fontSize: 12 }, left: 8, top: 4 },
		tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
		legend: { data: ["1:1", "Reunião", "Coaching"], top: 24, textStyle: { fontSize: 10 } },
		grid: { left: 40, right: 20, top: 60, bottom: 30 },
		xAxis: {
			type: "category",
			data: buckets.map((b) => b.label),
			axisLabel: { fontSize: 9, rotate: 30 },
		},
		yAxis: { type: "value", axisLabel: { fontSize: 10 } },
		series: [
			{ name: "1:1", type: "bar", stack: "total", data: oneonOne, itemStyle: { color: "#6366f1" } },
			{ name: "Reunião", type: "bar", stack: "total", data: meeting, itemStyle: { color: "#8b5cf6" } },
			{ name: "Coaching", type: "bar", stack: "total", data: coaching, itemStyle: { color: "#ec4899" } },
		],
	});
	new ResizeObserver(() => chart.resize()).observe(el);
}

function renderTopThemes(
	el: HTMLElement,
	plugin: AtlasPlugin,
	days: number,
	echarts: { init: (el: HTMLElement, theme?: unknown, opts?: { renderer?: "canvas" | "svg" }) => { setOption: (opt: unknown) => void; resize: () => void; on: (ev: string, handler: (params: unknown) => void) => void; } }
): void {
	el.empty();
	void days;

	const top = [...plugin.kg.data.themes]
		.sort((a, b) => b.frequency - a.frequency)
		.slice(0, 8);

	if (top.length === 0) {
		const empty = el.createDiv();
		empty.style.padding = "60px";
		empty.style.textAlign = "center";
		empty.style.opacity = "0.6";
		empty.setText("📭 Nenhum tema no KG. Indexe vault primeiro.");
		return;
	}

	const chart = echarts.init(el, undefined, { renderer: "canvas" });
	chart.setOption({
		title: { text: "🏷️ Top 8 temas", textStyle: { fontSize: 12 }, left: 8, top: 4 },
		tooltip: {
			trigger: "item",
			formatter: (p: { name: string; value: number; data?: { sentiment?: string; scope?: string } }) =>
				`${p.name}<br/>Frequência: ${p.value}<br/>Sentiment: ${p.data?.sentiment ?? "?"}`,
		},
		grid: { left: 100, right: 20, top: 36, bottom: 20 },
		xAxis: { type: "value", axisLabel: { fontSize: 10 } },
		yAxis: {
			type: "category",
			data: top.map((t) => t.name).reverse(),
			axisLabel: { fontSize: 10, width: 90, overflow: "truncate" },
		},
		series: [
			{
				type: "bar",
				data: top
					.map((t) => ({
						value: t.frequency,
						name: t.name,
						sentiment: t.sentiment,
						itemStyle: { color: sentimentColor(t.sentiment) },
					}))
					.reverse(),
			},
		],
	});
	new ResizeObserver(() => chart.resize()).observe(el);
}

function renderCommitmentsStatus(
	el: HTMLElement,
	plugin: AtlasPlugin,
	days: number,
	echarts: { init: (el: HTMLElement, theme?: unknown, opts?: { renderer?: "canvas" | "svg" }) => { setOption: (opt: unknown) => void; resize: () => void; on: (ev: string, handler: (params: unknown) => void) => void; } }
): void {
	el.empty();
	void days;

	const today = new Date().toISOString().split("T")[0];
	const open = plugin.kg.data.commitments.filter((c) => c.status === "open" && (!c.dueDate || c.dueDate >= today)).length;
	const overdue = plugin.kg.data.commitments.filter((c) => c.status === "open" && c.dueDate && c.dueDate < today).length;
	const closed = plugin.kg.data.commitments.filter((c) => c.status === "fulfilled").length;

	if (open + overdue + closed === 0) {
		const empty = el.createDiv();
		empty.style.padding = "60px";
		empty.style.textAlign = "center";
		empty.style.opacity = "0.6";
		empty.setText("📭 Nenhum commitment ainda.");
		return;
	}

	const chart = echarts.init(el, undefined, { renderer: "canvas" });
	chart.setOption({
		title: { text: "🔁 Commitments", textStyle: { fontSize: 12 }, left: 8, top: 4 },
		tooltip: { trigger: "item" },
		series: [
			{
				type: "pie",
				radius: ["40%", "70%"],
				center: ["50%", "55%"],
				avoidLabelOverlap: true,
				itemStyle: { borderRadius: 4, borderColor: "var(--background-secondary)", borderWidth: 2 },
				label: { fontSize: 10 },
				data: [
					{ value: open, name: "Abertos", itemStyle: { color: "#3b82f6" } },
					{ value: overdue, name: "Atrasados", itemStyle: { color: "#ef4444" } },
					{ value: closed, name: "Concluídos", itemStyle: { color: "#10b981" } },
				],
			},
		],
	});
	new ResizeObserver(() => chart.resize()).observe(el);
}

interface Bucket {
	label: string;
	startMs: number;
	endMs: number;
}

function bucketByWeek(days: number): Bucket[] {
	const today = Date.now();
	const buckets: Bucket[] = [];
	const weeks = Math.max(4, Math.ceil(days / 7));
	for (let i = weeks - 1; i >= 0; i--) {
		const endMs = today - i * 7 * 86_400_000;
		const startMs = endMs - 7 * 86_400_000;
		const d = new Date(endMs);
		const label = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
		buckets.push({ label, startMs, endMs });
	}
	return buckets;
}

function sentimentColor(s: string): string {
	switch (s) {
		case "blocker":
			return "#dc2626";
		case "growth":
			return "#3b82f6";
		case "strength":
			return "#10b981";
		default:
			return "#6b7280";
	}
}
