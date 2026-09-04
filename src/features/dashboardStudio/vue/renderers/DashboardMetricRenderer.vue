<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { DashboardDataBinding, DashboardWidget } from "@/types/dashboardStudio";
import { parseNumericCell } from "../../core/dashboardColumnSemantics";
import { formatDashboardMetric, resolveDashboardMetric } from "../../core/dashboardWidgetData";
import { isLightDashboardSurface, resolveDashboardWidgetStyle } from "../../core/dashboardChartThemes";

const props = defineProps<{ widget: DashboardWidget; binding?: DashboardDataBinding }>();

const loading = computed(() => props.binding?.status === "loading");
const error = computed(() => props.binding?.status === "error" ? props.binding.error ?? "数据不可用" : "");
const rawMetric = computed(() => resolveDashboardMetric(props.widget, props.binding));
const displayedRawMetric = ref<number | null>(null);
let countFrame: number | null = null;
const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

watch(rawMetric, (nextValue, previousValue) => {
  if (countFrame !== null) window.cancelAnimationFrame(countFrame);
  if (nextValue === null || reducedMotion || import.meta.env.MODE === "test") {
    displayedRawMetric.value = nextValue;
    return;
  }
  const from = previousValue ?? displayedRawMetric.value ?? 0;
  const startedAt = performance.now();
  const tick = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / 700);
    const eased = 1 - Math.pow(1 - progress, 3);
    displayedRawMetric.value = from + (nextValue - from) * eased;
    if (progress < 1) countFrame = window.requestAnimationFrame(tick);
  };
  countFrame = window.requestAnimationFrame(tick);
}, { immediate: true });

onBeforeUnmount(() => {
  if (countFrame !== null) window.cancelAnimationFrame(countFrame);
});

const metric = computed(() => formatDashboardMetric(displayedRawMetric.value, props.widget.mapping.displayUnit));
const valueText = computed(() => {
  if (displayedRawMetric.value === null) return "";
  if (props.binding?.resultKind !== "metric") return `${metric.value.value}${metric.value.unit}`;
  const precisionValue = props.widget.props?.precision;
  const precision = typeof precisionValue === "number" && Number.isFinite(precisionValue)
    ? Math.max(0, Math.min(8, Math.round(precisionValue)))
    : 0;
  const prefix = typeof props.widget.props?.valuePrefix === "string" ? props.widget.props.valuePrefix : "";
  const suffix = typeof props.widget.props?.valueSuffix === "string" ? props.widget.props.valueSuffix : "";
  return `${prefix}${displayedRawMetric.value.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision
  })}${suffix}`;
});
const trend = computed(() => {
  if (typeof props.binding?.trend === "number" && Number.isFinite(props.binding.trend)) {
    return props.binding.trend;
  }
  const key = props.widget.mapping.metricKeys?.[0];
  const rows = props.binding?.table.rows ?? [];
  if (!key || rows.length < 2) return 0;
  /* 与取数同一把尺子：「1,200.50」「￥12,000」「3.5万」都要算得出环比，算不出就不显示涨跌。 */
  const previous = parseNumericCell(rows.at(-2)?.[key]);
  const current = parseNumericCell(rows.at(-1)?.[key]);
  return previous !== null && previous !== 0 && current !== null
    ? ((current - previous) / Math.abs(previous)) * 100
    : 0;
});
/* 非时序数据不展示趋势：生成器可显式关闭，避免把排名差值误读为趋势 */
const showTrendChip = computed(() => props.widget.style.showTrend !== false);
/* 同表格卡：指标卡不画 ECharts 面板，摘掉残留的 chartTheme 再解析，避免深色整板主题下被兜底改回白卡 */
const style = computed(() => {
  const { chartTheme: _chartTheme, ...rest } = props.widget.style;
  return resolveDashboardWidgetStyle(rest);
});
const light = computed(() => isLightDashboardSurface(style.value.background, style.value.color));
const cardStyle = computed(() => ({
  backgroundColor: style.value.background ?? "#FFFFFF",
  color: style.value.color ?? "#294469",
  borderColor: style.value.borderColor ?? `color-mix(in srgb, ${style.value.accent ?? "#1677FF"} 34%, transparent)`,
  borderRadius: `${style.value.borderRadius ?? 12}px`,
  "--metric-accent": style.value.accent ?? "#1677FF",
  backdropFilter: style.value.backgroundBlur ? `blur(${style.value.backgroundBlur}px)` : undefined
}));
</script>

<template>
  <section class="metric-card-renderer" :class="{ 'is-light': light }" :style="cardStyle" :aria-busy="loading">
    <template v-if="loading">
      <div class="metric-card-renderer__skeleton metric-card-renderer__skeleton--title" />
      <div class="metric-card-renderer__skeleton metric-card-renderer__skeleton--value" />
      <div class="metric-card-renderer__skeleton metric-card-renderer__skeleton--trend" />
    </template>
    <template v-else-if="error">
      <p class="metric-card-renderer__label">数据不可用</p>
      <p class="metric-card-renderer__state">{{ error }}</p>
    </template>
    <template v-else-if="binding && rawMetric !== null">
      <p class="metric-card-renderer__label">{{ widget.title }}</p>
      <p class="metric-card-renderer__value">{{ valueText }}</p>
      <p v-if="showTrendChip" class="metric-card-renderer__trend" :class="{ 'is-negative': trend < 0 }">
        {{ trend > 0 ? '+' : '' }}{{ trend.toFixed(1) }}%
      </p>
    </template>
    <template v-else>
      <p class="metric-card-renderer__label">{{ widget.title }}</p>
      <p class="metric-card-renderer__state">暂无指标数据</p>
    </template>
  </section>
</template>

<style scoped>
.metric-card-renderer { box-sizing:border-box; display:grid; align-content:space-between; width:100%; height:100%; min-width:0; min-height:0; overflow:hidden; padding:18px; border:1px solid; border-radius:12px; }
.metric-card-renderer.is-light { box-shadow:0 10px 28px rgba(22, 119, 255, 0.08); }
.metric-card-renderer p { min-width:0; margin:0; overflow-wrap:anywhere; }
.metric-card-renderer__label { display:flex; align-items:center; gap:7px; color:color-mix(in srgb,currentColor 72%,transparent); font-size:13px; font-weight:600; }
.metric-card-renderer__label::before { width:3px; height:12px; flex:0 0 auto; border-radius:2px; background:var(--metric-accent); content:""; }
.metric-card-renderer__value { font-size:34px; font-weight:700; line-height:1.05; }
.metric-card-renderer__trend { width:fit-content; max-width:100%; padding:4px 8px; border-radius:6px; background:color-mix(in srgb,var(--metric-accent) 18%,transparent); color:var(--metric-accent); font-size:13px; font-weight:600; }
.metric-card-renderer__trend.is-negative { color:#f87171; }
.metric-card-renderer__state { color:color-mix(in srgb,currentColor 74%,transparent); font-size:14px; }
.metric-card-renderer__skeleton { border-radius:6px; background:color-mix(in srgb,currentColor 14%,transparent); }
.metric-card-renderer__skeleton--title { width:48%; height:14px; }
.metric-card-renderer__skeleton--value { width:72%; height:38px; }
.metric-card-renderer__skeleton--trend { width:34%; height:24px; }
</style>
