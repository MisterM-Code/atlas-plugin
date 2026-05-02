/**
 * Atlas ECharts bundle — tree-shaken: importa só componentes usados.
 *
 * ECharts full = ~880 KB minified. Tree-shaken só com o que usamos = ~250 KB.
 */

import * as echarts from "echarts/core";
import {
	HeatmapChart,
	LineChart,
	BarChart,
	PieChart,
	GraphChart,
	RadarChart,
} from "echarts/charts";
import {
	CalendarComponent,
	GridComponent,
	TooltipComponent,
	LegendComponent,
	TitleComponent,
	VisualMapComponent,
	DatasetComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

let registered = false;

export function getEcharts(): typeof echarts {
	if (!registered) {
		echarts.use([
			HeatmapChart,
			LineChart,
			BarChart,
			PieChart,
			GraphChart,
			RadarChart,
			CalendarComponent,
			GridComponent,
			TooltipComponent,
			LegendComponent,
			TitleComponent,
			VisualMapComponent,
			DatasetComponent,
			CanvasRenderer,
		]);
		registered = true;
	}
	return echarts;
}
