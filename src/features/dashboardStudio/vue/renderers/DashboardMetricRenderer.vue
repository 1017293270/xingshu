<script setup lang="ts">
import { computed } from "vue";
import type { DashboardDataBinding, DashboardWidget } from "@/types/dashboardStudio";
import { formatDashboardMetric, resolveDashboardMetric } from "../../core/dashboardWidgetData";

const props = defineProps<{ widget: DashboardWidget; binding?: DashboardDataBinding }>();

const loading = computed(() => props.binding?.status === "loading");
const error = computed(() => props.binding?.status === "error" ? props.binding.error ?? "数据不可用" : "");
const rawMetric = computed(() => resolveDashboardMetric(props.widget, props.binding));
const metric = computed(() => formatDashboardMetric(rawMetric.value, props.widget.mapping.displayUnit));
const valueText = computed(() => {
  if (rawMetric.value === null) return "";
  if (props.binding?.resultKind !== "metric") return `${metric.value.value}${metric.value.unit}`;
  const precisionValue = props.widget.props?.precision;
  const precision = typeof precisionValue === "number" && Number.isFinite(precisionValue)
    ? Math.max(0, Math.min(8, Math.round(precisionValue)))
    : 0;
  const prefix = typeof props.widget.props?.valuePrefix === "string" ? props.widget.props.valuePrefix : "";
  const suffix = typeof props.widget.props?.valueSuffix === "string" ? props.widget.props.valueSuffix : "";
  return `${prefix}${rawMetric.value.toLocaleString(undefined, {
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
  const previous = Number(rows.at(-2)?.[key]);
  const current = Number(rows.at(-1)?.[key]);
  return Number.isFinite(previous) && previous !== 0 && Number.isFinite(current)
    ? ((current - previous) / Math.abs(previous)) * 100
    : 0;
});
const cardStyle = computed(() => ({
  backgroundColor: props.widget.style.background ?? "rgba(15, 23, 42, 0.86)",
  color: props.widget.style.color ?? "#e5f0ff",
  borderColor: `color-mix(in srgb, ${props.widget.style.accent ?? "#38bdf8"} 34%, transparent)`,
  "--metric-accent": props.widget.style.accent ?? "#38bdf8",
  backdropFilter: props.widget.style.backgroundBlur ? `blur(${props.widget.style.backgroundBlur}px)` : undefined
}));
</script>

<template>
  <section class="metric-card-renderer" :style="cardStyle" :aria-busy="loading">
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
      <p class="metric-card-renderer__trend" :class="{ 'is-negative': trend < 0 }">
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
.metric-card-renderer { box-sizing:border-box; display:grid; align-content:space-between; width:100%; height:100%; min-width:0; min-height:0; overflow:hidden; padding:18px; border:1px solid; border-radius:8px; }
.metric-card-renderer p { min-width:0; margin:0; overflow-wrap:anywhere; }
.metric-card-renderer__label { color:color-mix(in srgb,currentColor 72%,transparent); font-size:13px; font-weight:700; text-transform:uppercase; }
.metric-card-renderer__value { font-size:34px; font-weight:800; line-height:1.05; }
.metric-card-renderer__trend { width:fit-content; max-width:100%; padding:4px 8px; border-radius:6px; background:color-mix(in srgb,var(--metric-accent) 18%,transparent); color:var(--metric-accent); font-size:13px; font-weight:700; }
.metric-card-renderer__trend.is-negative { color:#f87171; }
.metric-card-renderer__state { color:color-mix(in srgb,currentColor 74%,transparent); font-size:14px; }
.metric-card-renderer__skeleton { border-radius:6px; background:color-mix(in srgb,currentColor 14%,transparent); }
.metric-card-renderer__skeleton--title { width:48%; height:14px; }
.metric-card-renderer__skeleton--value { width:72%; height:38px; }
.metric-card-renderer__skeleton--trend { width:34%; height:24px; }
</style>
