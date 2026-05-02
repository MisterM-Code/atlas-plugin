/**
 * Atlas v0.17 — Spend Dashboard sub-view (Status tab).
 *
 * Renders cost tracking data: total today/this month, by provider, by feature, by day.
 * ECharts: line (daily spend), pie (by provider), bar (by feature).
 * Recent calls log table.
 */

import type AtlasPlugin from "../../../../main";
import type { SpendAggregate, SpendEntry } from "../../../providers/cost-tracker";

export async function renderSpendDashboard(container: HTMLElement, plugin: AtlasPlugin): Promise<void> {
	container.empty();

	const router = plugin.providerRouter;
	if (!router) {
		container.createDiv({ cls: "atlas-empty-state-text" }).setText("Provider router não inicializado.");
		return;
	}

	const cost = router.getCostTracker();
	const budget = plugin.settings.providers?.budget;

	// Header com total spent
	const header = container.createDiv({ cls: "atlas-spend-header" });

	const todaySpend = await cost.getSpend({ window: "day" });
	const monthSpend = await cost.getSpend({ window: "month" });
	const allSpend = await cost.getSpend({ window: "all" });

	const stat = (parent: HTMLElement, label: string, value: string, accent = false): void => {
		const card = parent.createDiv({ cls: accent ? "atlas-spend-stat is-accent" : "atlas-spend-stat" });
		card.createDiv({ cls: "atlas-spend-stat-value", text: value });
		card.createDiv({ cls: "atlas-spend-stat-label", text: label });
	};

	const grid = header.createDiv({ cls: "atlas-spend-stats-grid" });
	stat(grid, "Hoje", `$${todaySpend.totalUSD.toFixed(4)}`, true);
	stat(grid, "Este mês", `$${monthSpend.totalUSD.toFixed(4)}`);
	stat(grid, "Total all-time", `$${allSpend.totalUSD.toFixed(4)}`);
	stat(grid, "Calls hoje", String(todaySpend.callCount));
	stat(grid, "Calls mês", String(monthSpend.callCount));

	// Budget bar
	if (budget?.enabled && budget.monthlyUSD && budget.monthlyUSD > 0) {
		const bb = container.createDiv({ cls: "atlas-spend-budget-bar" });
		const pct = Math.min(1, monthSpend.totalUSD / budget.monthlyUSD);
		const pctLabel = (pct * 100).toFixed(0);
		bb.createDiv({ cls: "atlas-spend-budget-label", text: `Budget mensal: ${pctLabel}% ($${monthSpend.totalUSD.toFixed(4)} / $${budget.monthlyUSD})` });
		const barEl = bb.createDiv({ cls: "atlas-spend-budget-track" });
		const fill = barEl.createDiv({ cls: pct >= 0.95 ? "atlas-spend-budget-fill is-danger" : pct >= 0.8 ? "atlas-spend-budget-fill is-warn" : "atlas-spend-budget-fill" });
		fill.style.width = `${pct * 100}%`;
	}

	if (allSpend.callCount === 0) {
		const empty = container.createDiv({ cls: "atlas-spend-empty" });
		empty.createDiv({ cls: "atlas-spend-empty-emoji", text: "💎" });
		empty.createEl("h4", { text: "Nenhum gasto registrado ainda" });
		empty.createEl("p", {
			text: "Atlas roda 100% local com Ollama por default. Configure cloud providers em Settings → Cloud AI Providers para usar GPT-4o, Claude, Gemini, etc.",
		});
		return;
	}

	// Charts row
	const chartsRow = container.createDiv({ cls: "atlas-spend-charts-row" });

	// Spend over time chart
	const dailyEl = chartsRow.createDiv({ cls: "atlas-spend-chart" });
	dailyEl.createEl("h5", { text: "📈 Gasto por dia (últimos 30 dias)" });
	const dailyChartEl = dailyEl.createDiv({ cls: "atlas-spend-chart-canvas" });

	// By provider
	const providerEl = chartsRow.createDiv({ cls: "atlas-spend-chart" });
	providerEl.createEl("h5", { text: "🎨 Por provider (este mês)" });
	const providerChartEl = providerEl.createDiv({ cls: "atlas-spend-chart-canvas" });

	// By feature
	const featureEl = chartsRow.createDiv({ cls: "atlas-spend-chart" });
	featureEl.createEl("h5", { text: "⚡ Por feature (este mês)" });
	const featureChartEl = featureEl.createDiv({ cls: "atlas-spend-chart-canvas" });

	try {
		const { getEcharts } = await import("../analytics-sub/echarts-bundle");
		const echarts = getEcharts();

		// Daily line
		const last30 = await cost.getSpend({ window: "month" });
		const days30 = generateLast30Days();
		const dataMap = new Map(last30.byDay.map((d) => [d.date, d.usd]));
		const dailyData = days30.map((d) => [d, Number((dataMap.get(d) ?? 0).toFixed(6))]);
		const dailyChart = echarts.init(dailyChartEl, undefined, { renderer: "canvas" });
		dailyChart.setOption({
			tooltip: { trigger: "axis", formatter: (params: { value: [string, number] }[]) => {
				const p = params[0];
				return `${p.value[0]}<br/>$${p.value[1].toFixed(4)}`;
			} },
			grid: { top: 20, left: 50, right: 20, bottom: 30 },
			xAxis: { type: "category", data: days30, axisLabel: { fontSize: 9 } },
			yAxis: { type: "value", axisLabel: { formatter: "${value}", fontSize: 9 } },
			series: [{ type: "line", data: dailyData.map((d) => d[1]), smooth: true, areaStyle: { opacity: 0.3 }, lineStyle: { color: "#6366f1" }, itemStyle: { color: "#6366f1" } }],
		});

		// Provider pie
		const providerChart = echarts.init(providerChartEl, undefined, { renderer: "canvas" });
		providerChart.setOption({
			tooltip: { trigger: "item", formatter: "{b}: ${c}" },
			series: [{
				type: "pie",
				radius: ["40%", "70%"],
				data: Object.entries(monthSpend.byProvider).map(([k, v]) => ({ name: k, value: Number(v.toFixed(6)) })),
				label: { fontSize: 10 },
			}],
		});

		// Feature bar
		const featureChart = echarts.init(featureChartEl, undefined, { renderer: "canvas" });
		const featuresOrdered = Object.entries(monthSpend.byFeature).sort((a, b) => b[1] - a[1]).slice(0, 8);
		featureChart.setOption({
			tooltip: { trigger: "axis" },
			grid: { top: 20, left: 100, right: 20, bottom: 30 },
			xAxis: { type: "value", axisLabel: { formatter: "${value}", fontSize: 9 } },
			yAxis: { type: "category", data: featuresOrdered.map(([k]) => k), axisLabel: { fontSize: 9 } },
			series: [{ type: "bar", data: featuresOrdered.map(([, v]) => Number(v.toFixed(6))), itemStyle: { color: "#10b981" } }],
		});

		const ro = new ResizeObserver(() => {
			dailyChart.resize();
			providerChart.resize();
			featureChart.resize();
		});
		ro.observe(dailyChartEl);
	} catch (e) {
		dailyChartEl.setText(`Charts indisponíveis: ${String(e)}`);
	}

	// By model breakdown table
	container.createEl("h5", { text: "🤖 Por modelo (este mês)" });
	const modelTable = container.createEl("table", { cls: "atlas-spend-table" });
	const thead = modelTable.createEl("thead").createEl("tr");
	thead.createEl("th", { text: "Modelo" });
	thead.createEl("th", { text: "Provider" });
	thead.createEl("th", { text: "Gasto" });
	const tbody = modelTable.createEl("tbody");
	const modelsOrdered = Object.entries(monthSpend.byModel).sort((a, b) => b[1] - a[1]);
	for (const [model, usd] of modelsOrdered) {
		const tr = tbody.createEl("tr");
		tr.createEl("td", { text: model });
		// Find provider for this model
		const entry = (await cost.getRecentEntries(200)).find((e) => e.model === model);
		tr.createEl("td", { text: entry?.provider ?? "—" });
		tr.createEl("td", { text: `$${usd.toFixed(4)}` });
	}

	// v0.52.1: Failed calls section (chamadas com success: false — provider pode ter cobrado)
	const recentRaw = await cost.getRecentEntries(50);
	const failedCalls = recentRaw.filter((e) => e.success === false);
	if (failedCalls.length > 0) {
		const failSection = container.createDiv({ cls: "atlas-spend-failures" });
		failSection.createEl("h5", { text: `⚠️ Chamadas falhadas (${failedCalls.length}) — provider pode ter cobrado` });
		failSection.createEl("p", {
			cls: "atlas-spend-failures-desc",
			text: "5xx errors podem ter cobrado mesmo sem entregar resposta. Auth (401) e rate-limit (429) tipicamente NÃO cobram. Use os errorCodes pra distinguir.",
		});
		const failTable = failSection.createEl("table", { cls: "atlas-spend-table is-failures" });
		const fh = failTable.createEl("thead").createEl("tr");
		["Quando", "Provider", "Modelo", "Erro", "Feature", "Tokens (estimados)"].forEach((h) =>
			fh.createEl("th", { text: h })
		);
		const fb = failTable.createEl("tbody");
		for (const e of failedCalls.slice(0, 15)) {
			const tr = fb.createEl("tr", { cls: "atlas-spend-row-fail" });
			tr.createEl("td", { text: new Date(e.ts).toLocaleString() });
			tr.createEl("td", { text: e.provider });
			tr.createEl("td", { text: e.model });
			tr.createEl("td", { text: e.errorCode ?? "unknown", cls: `atlas-spend-error-code is-${e.errorCode ?? "unknown"}` });
			tr.createEl("td", { text: e.feature ?? "—" });
			tr.createEl("td", { text: `${e.usage.totalTokens}` });
		}
	}

	// Recent calls log (success only)
	container.createEl("h5", { text: "📜 Últimas 30 chamadas (sucesso)" });
	const log = container.createEl("table", { cls: "atlas-spend-table" });
	const lh = log.createEl("thead").createEl("tr");
	["Quando", "Provider", "Modelo", "Feature", "Tokens", "Custo"].forEach((h) => lh.createEl("th", { text: h }));
	const lb = log.createEl("tbody");
	const successOnly = recentRaw.filter((e) => e.success !== false).slice(0, 30);
	for (const e of successOnly) {
		const tr = lb.createEl("tr");
		const time = new Date(e.ts).toLocaleString();
		tr.createEl("td", { text: time });
		tr.createEl("td", { text: e.provider });
		tr.createEl("td", { text: e.model });
		tr.createEl("td", { text: e.feature ?? "—" });
		tr.createEl("td", { text: `${e.usage.totalTokens}` });
		tr.createEl("td", { text: `$${e.costUSD.toFixed(6)}` });
	}
}

function generateLast30Days(): string[] {
	const out: string[] = [];
	const today = new Date();
	for (let i = 29; i >= 0; i--) {
		const d = new Date(today.getTime() - i * 86_400_000);
		out.push(d.toISOString().split("T")[0]);
	}
	return out;
}
