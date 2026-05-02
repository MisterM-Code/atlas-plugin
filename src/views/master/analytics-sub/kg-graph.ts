import { TFile } from "obsidian";
import type AtlasPlugin from "../../../../main";

/**
 * KG Graph sub-view — visualização force-directed do Knowledge Graph.
 *
 * Render via ECharts graph series (nativo, zero dep extra).
 * Nodes: pessoas (azul), projetos (verde), temas (laranja), sistemas (roxo).
 * Edges: sessions (pessoa→pessoa), ownership (pessoa→projeto), mentions (pessoa→tema).
 */
export async function renderAnalyticsKgGraph(
	container: HTMLElement,
	plugin: AtlasPlugin
): Promise<void> {
	container.empty();
	// v0.22 Sprint G: cleanup any previous ResizeObserver attached to old container
	// (prevents memory leak when switching sub-tabs back-and-forth)
	const prevRO = (container as HTMLElement & { __atlasRO?: ResizeObserver }).__atlasRO;
	if (prevRO) {
		prevRO.disconnect();
	}

	container.addClass("atlas-analytics-kg-graph");

	const intro = container.createDiv({ cls: "atlas-analytics-intro" });
	intro.setText(
		"Knowledge Graph force-directed. Nodes: 👤 pessoas (azul), 🚀 projetos (verde), 🏷️ temas (laranja), 🖥️ sistemas (roxo). Click pra abrir nota."
	);

	// Filter bar
	const filters = container.createDiv({ cls: "atlas-analytics-filter-bar" });

	const types = [
		{ id: "people", label: "👤 Pessoas", color: "#3b82f6" },
		{ id: "projects", label: "🚀 Projetos", color: "#10b981" },
		{ id: "themes", label: "🏷️ Temas", color: "#f97316" },
		{ id: "systems", label: "🖥️ Sistemas", color: "#a855f7" },
	];
	const enabled = new Set(types.map((t) => t.id));

	const typeButtons: HTMLButtonElement[] = [];
	for (const t of types) {
		const btn = filters.createEl("button", { cls: "atlas-analytics-filter-pill", text: t.label });
		btn.style.setProperty("--pill-color", t.color);
		btn.addEventListener("click", () => {
			if (enabled.has(t.id)) {
				enabled.delete(t.id);
				btn.addClass("is-disabled");
			} else {
				enabled.add(t.id);
				btn.removeClass("is-disabled");
			}
			void renderGraph();
		});
		typeButtons.push(btn);
	}

	// Stats
	const stats = container.createDiv({ cls: "atlas-analytics-stats-row" });

	// Chart
	const chartEl = container.createDiv({ cls: "atlas-analytics-kg-chart" });

	const renderGraph = async () => {
		try {
			const { getEcharts } = await import("./echarts-bundle");
			const echarts = getEcharts();

			interface Node {
				id: string;
				name: string;
				category: number;
				symbolSize: number;
				notePath?: string;
			}
			interface Link {
				source: string;
				target: string;
				value?: number;
			}

			const nodes: Node[] = [];
			const links: Link[] = [];
			const categories = [
				{ name: "Pessoas", itemStyle: { color: "#3b82f6" } },
				{ name: "Projetos", itemStyle: { color: "#10b981" } },
				{ name: "Temas", itemStyle: { color: "#f97316" } },
				{ name: "Sistemas", itemStyle: { color: "#a855f7" } },
			];

			const nodeIds = new Set<string>();

			if (enabled.has("people")) {
				for (const p of plugin.kg.data.people) {
					const sessions = plugin.kg.listSessionsByPerson(p.id).length;
					nodes.push({
						id: `person-${p.id}`,
						name: p.name,
						category: 0,
						symbolSize: Math.min(40, 10 + sessions * 1.5),
						notePath: p.notePath,
					});
					nodeIds.add(`person-${p.id}`);
				}
			}

			if (enabled.has("projects")) {
				for (const p of plugin.kg.data.projects) {
					nodes.push({
						id: `project-${p.id}`,
						name: p.name,
						category: 1,
						symbolSize: 20,
						notePath: p.notePath,
					});
					nodeIds.add(`project-${p.id}`);
				}
			}

			if (enabled.has("themes")) {
				for (const t of plugin.kg.data.themes) {
					nodes.push({
						id: `theme-${t.id}`,
						name: t.name,
						category: 2,
						symbolSize: Math.min(35, 8 + t.frequency * 1.2),
					});
					nodeIds.add(`theme-${t.id}`);

					// Edge: theme → pessoas que mencionaram
					for (const personId of t.personIds.slice(0, 5)) {
						if (nodeIds.has(`person-${personId}`)) {
							links.push({
								source: `theme-${t.id}`,
								target: `person-${personId}`,
								value: 1,
							});
						}
					}
				}
			}

			if (enabled.has("systems")) {
				for (const s of plugin.kg.data.systems ?? []) {
					nodes.push({
						id: `system-${s.id}`,
						name: s.name,
						category: 3,
						symbolSize: 18,
						notePath: s.notePath,
					});
					nodeIds.add(`system-${s.id}`);
				}
			}

			stats.setText(
				`${nodes.length} nodes · ${links.length} edges · ${categories.filter((_, i) => enabled.has(types[i].id)).length} tipos`
			);

			if (nodes.length === 0) {
				chartEl.empty();
				chartEl.setText("📭 KG vazio. Indexe vault primeiro.");
				chartEl.style.padding = "60px";
				chartEl.style.textAlign = "center";
				chartEl.style.opacity = "0.6";
				return;
			}

			const chart = echarts.init(chartEl, undefined, { renderer: "canvas" });
			chart.setOption({
				tooltip: {
					formatter: (p: { dataType: string; data: { name: string; category?: number } }) => {
						if (p.dataType === "node") {
							const cat = p.data.category !== undefined ? categories[p.data.category].name : "";
							return `<strong>${p.data.name}</strong><br/>${cat}`;
						}
						return "";
					},
				},
				legend: {
					data: categories.map((c) => c.name),
					top: 8,
					textStyle: { fontSize: 11 },
				},
				series: [
					{
						type: "graph",
						layout: "force",
						roam: true,
						focusNodeAdjacency: true,
						categories,
						data: nodes,
						links,
						label: {
							show: true,
							position: "right",
							fontSize: 10,
							color: "var(--text-normal)",
						},
						labelLayout: { hideOverlap: true },
						emphasis: {
							focus: "adjacency",
							label: { fontSize: 12, fontWeight: "bold" },
						},
						force: {
							repulsion: 100,
							edgeLength: [50, 150],
							gravity: 0.1,
							layoutAnimation: true,
						},
						lineStyle: {
							color: "source",
							curveness: 0.1,
							opacity: 0.4,
						},
					},
				],
			});

			chart.on("click", (params) => {
				if (params.dataType !== "node") return;
				const data = params.data as { notePath?: string } | undefined;
				const path = data?.notePath;
				if (!path) return;
				const f = plugin.app.vault.getAbstractFileByPath(path);
				if (f instanceof TFile) {
					void plugin.app.workspace.getLeaf().openFile(f);
				}
			});

			// v0.22 Sprint G: track observer pra disconnect quando container re-renderizar
			const ro = new ResizeObserver(() => chart.resize());
			ro.observe(chartEl);
			(container as HTMLElement & { __atlasRO?: ResizeObserver }).__atlasRO = ro;
		} catch (e) {
			chartEl.setText(`Atlas: erro ao carregar ECharts — ${String(e)}`);
			chartEl.style.color = "var(--color-red)";
		}
	};

	void renderGraph();
}
