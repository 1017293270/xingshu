import {
  BarChart,
  FunnelChart,
  LineChart,
  PieChart,
  RadarChart
} from "echarts/charts";
import {
  AriaComponent,
  DataZoomComponent,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  MarkPointComponent,
  RadarComponent,
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
  TransformComponent,
  VisualMapComponent
} from "echarts/components";
import { getInstanceByDom, init, use as registerEChartsModules } from "echarts/core";
import { UniversalTransition } from "echarts/features";
import { CanvasRenderer } from "echarts/renderers";

registerEChartsModules([
  BarChart,
  FunnelChart,
  LineChart,
  PieChart,
  RadarChart,
  AriaComponent,
  DataZoomComponent,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  MarkPointComponent,
  RadarComponent,
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
  TransformComponent,
  VisualMapComponent,
  UniversalTransition,
  CanvasRenderer
]);

export { getInstanceByDom, init };
