<script setup lang="ts">
import { computed } from "vue";
import type { DashboardDataBinding, DashboardWidget } from "@/types/dashboardStudio";
import { buildDashboardChartOption } from "../../core/dashboardWidgetData";
import VueEChart from "../VueEChart.vue";

const props = defineProps<{ widget: DashboardWidget; binding?: DashboardDataBinding }>();
const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const loading = computed(() => props.binding?.status === "loading");
const error = computed(() => props.binding?.status === "error" ? props.binding.error ?? "数据不可用" : "");
const option = computed(() => buildDashboardChartOption(props.widget, props.binding, { animation: !reducedMotion }));
const panelStyle = computed(() => ({
  backgroundColor: props.widget.style.background ?? "rgba(15, 23, 42, 0.82)",
  color: props.widget.style.color ?? "#dbeafe",
  borderColor: props.widget.style.borderColor ?? "color-mix(in srgb, var(--chart-accent) 26%, transparent)",
  "--chart-accent": props.widget.style.accent ?? "#38bdf8",
  backdropFilter: props.widget.style.backgroundBlur ? `blur(${props.widget.style.backgroundBlur}px)` : undefined
}));
</script>

<template>
  <section class="chart-renderer" :style="panelStyle" :aria-busy="loading">
    <header class="chart-renderer__header">{{ widget.title }}</header>
    <div class="chart-renderer__body">
      <div v-if="loading" class="chart-renderer__state">
        <span class="chart-renderer__skeleton" />
        <span class="chart-renderer__skeleton chart-renderer__skeleton--short" />
      </div>
      <p v-else-if="error" class="chart-renderer__state">图表不可用：{{ error }}</p>
      <div v-else-if="option" class="chart-renderer__chart"><VueEChart :option="option" :label="`${widget.title}图表`" /></div>
      <p v-else class="chart-renderer__state">暂无图表数据</p>
    </div>
  </section>
</template>

<style scoped>
.chart-renderer { box-sizing:border-box; display:grid; grid-template-rows:auto 1fr; width:100%; height:100%; min-width:0; min-height:0; overflow:hidden; padding:14px; border:1px solid; border-radius:8px; }
.chart-renderer__header { min-width:0; overflow:hidden; font-size:14px; font-weight:800; text-overflow:ellipsis; white-space:nowrap; }
.chart-renderer__body { min-width:0; min-height:0; }
.chart-renderer__chart { width:100%; height:100%; min-width:0; min-height:120px; }
.chart-renderer__state { display:grid; place-content:center; gap:10px; width:100%; height:100%; margin:0; color:color-mix(in srgb,currentColor 72%,transparent); font-size:14px; overflow-wrap:anywhere; }
.chart-renderer__skeleton { display:block; width:180px; max-width:70%; height:16px; border-radius:6px; background:color-mix(in srgb,currentColor 14%,transparent); }
.chart-renderer__skeleton--short { width:120px; }
</style>
