<script setup lang="ts">
import { computed } from "vue";
import type { DashboardDataBinding, DashboardWidget } from "@/types/dashboardStudio";
import { isLightDashboardSurface, resolveDashboardWidgetStyle } from "../../core/dashboardChartThemes";
import { buildDashboardChartOption } from "../../core/dashboardWidgetData";
import VueEChart from "../VueEChart.vue";

const props = defineProps<{ widget: DashboardWidget; binding?: DashboardDataBinding }>();
const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const style = computed(() => resolveDashboardWidgetStyle(props.widget.style));
const loading = computed(() => props.binding?.status === "loading");
const error = computed(() => props.binding?.status === "error" ? props.binding.error ?? "数据不可用" : "");
const option = computed(() =>
  buildDashboardChartOption({ ...props.widget, style: style.value }, props.binding, { animation: !reducedMotion })
);
const light = computed(() => isLightDashboardSurface(style.value.background, style.value.color));
const panelStyle = computed(() => ({
  backgroundColor: style.value.background ?? "#FFFFFF",
  color: style.value.color ?? "#294469",
  borderColor: style.value.borderColor ?? "#E3ECF9",
  borderRadius: `${style.value.borderRadius ?? 12}px`,
  "--chart-accent": style.value.accent ?? "#1677FF",
  backdropFilter: style.value.backgroundBlur ? `blur(${style.value.backgroundBlur}px)` : undefined
}));
</script>

<template>
  <section class="chart-renderer" :class="{ 'is-light': light }" :style="panelStyle" :aria-busy="loading">
    <header class="chart-renderer__header">
      <p class="chart-renderer__title">{{ widget.title }}</p>
      <p v-if="widget.subtitle" class="chart-renderer__subtitle">{{ widget.subtitle }}</p>
    </header>
    <div class="chart-renderer__body">
      <div v-if="loading" class="chart-renderer__state">
        <span class="chart-renderer__skeleton" />
        <span class="chart-renderer__skeleton chart-renderer__skeleton--short" />
      </div>
      <p v-else-if="error" class="chart-renderer__state">图表不可用：{{ error }}</p>
      <div v-else-if="option" class="chart-renderer__chart"><VueEChart :option="option" :label="`${widget.title}图表`" /></div>
      <p v-else class="chart-renderer__state">当前结果缺少可绘制的数值指标，请在右侧重新选择维度或指标。</p>
    </div>
  </section>
</template>

<style scoped>
.chart-renderer {
  box-sizing: border-box;
  display: grid;
  grid-template-rows: auto 1fr;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 16px 16px 12px;
  border: 1px solid;
  border-radius: 12px;
}
.chart-renderer.is-light { box-shadow: 0 10px 28px rgba(22, 119, 255, 0.08); }
.chart-renderer__header { display: grid; gap: 4px; min-width: 0; padding-bottom: 8px; }
.chart-renderer__title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chart-renderer__title::before {
  width: 3px;
  height: 12px;
  flex: 0 0 auto;
  border-radius: 2px;
  background: var(--chart-accent);
  content: "";
}
.chart-renderer__subtitle {
  min-width: 0;
  overflow: hidden;
  margin: 0 0 0 11px;
  color: color-mix(in srgb, currentColor 62%, transparent);
  font-size: 12px;
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chart-renderer__body { min-width: 0; min-height: 0; overflow: hidden; }
.chart-renderer__chart { width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; }
.chart-renderer__state { display: grid; place-content: center; gap: 10px; width: 100%; height: 100%; margin: 0; color: color-mix(in srgb, currentColor 72%, transparent); font-size: 14px; overflow-wrap: anywhere; }
.chart-renderer__skeleton { display: block; width: 180px; max-width: 70%; height: 16px; border-radius: 6px; background: color-mix(in srgb, currentColor 14%, transparent); }
.chart-renderer__skeleton--short { width: 120px; }
</style>
