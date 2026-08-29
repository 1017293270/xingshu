<script setup lang="ts">
import { computed } from "vue";
import type { DashboardDataBinding, DashboardWidget } from "@/types/dashboardStudio";
import { isLightDashboardSurface, resolveDashboardWidgetStyle } from "../../core/dashboardChartThemes";

const props = defineProps<{ widget: DashboardWidget; binding?: DashboardDataBinding }>();
const style = computed(() => resolveDashboardWidgetStyle(props.widget.style));
const light = computed(() => isLightDashboardSurface(style.value.background, style.value.color));
const loading = computed(() => props.binding?.status === "loading");
const error = computed(() => props.binding?.status === "error" ? props.binding.error ?? "数据不可用" : "");
const panelStyle = computed(() => ({
  backgroundColor: style.value.background ?? "#FFFFFF",
  color: style.value.color ?? "#294469",
  borderColor: style.value.borderColor ?? `color-mix(in srgb, ${style.value.accent ?? "#1677FF"} 24%, transparent)`,
  borderRadius: `${style.value.borderRadius ?? 12}px`,
  "--table-accent": style.value.accent ?? "#1677FF",
  backdropFilter: style.value.backgroundBlur ? `blur(${style.value.backgroundBlur}px)` : undefined
}));
</script>
<template>
  <section class="table-renderer" :class="{ 'is-light': light }" :style="panelStyle" :aria-busy="loading">
    <header class="table-renderer__header">{{ widget.title }}</header>
    <div v-if="loading" class="table-renderer__state">
      <span class="table-renderer__skeleton" />
      <span class="table-renderer__skeleton" />
      <span class="table-renderer__skeleton table-renderer__skeleton--short" />
    </div>
    <p v-else-if="error" class="table-renderer__state">表格不可用：{{ error }}</p>
    <p v-else-if="!binding || binding.table.rows.length === 0" class="table-renderer__state">暂无表格行</p>
    <div v-else class="table-renderer__scroll"><table><thead><tr><th v-for="column in binding.table.columns" :key="column.key">{{ column.title }}</th></tr></thead><tbody><tr v-for="(row,rowIndex) in binding.table.rows" :key="rowIndex"><td v-for="column in binding.table.columns" :key="column.key">{{ row[column.key] ?? '' }}</td></tr></tbody></table></div>
  </section>
</template>
<style scoped>
.table-renderer { box-sizing:border-box; display:grid; grid-template-rows:auto 1fr; width:100%; height:100%; min-width:0; min-height:0; overflow:hidden; padding:16px; border:1px solid; border-radius:12px; }
.table-renderer.is-light { box-shadow:0 10px 28px rgba(22, 119, 255, 0.08); }
.table-renderer__header { display:flex; min-width:0; align-items:center; gap:8px; overflow:hidden; padding-bottom:10px; font-size:14px; font-weight:600; text-overflow:ellipsis; white-space:nowrap; }
.table-renderer__header::before { width:3px; height:12px; flex:0 0 auto; border-radius:2px; background:var(--table-accent); content:""; }
.table-renderer__scroll { min-width:0; min-height:0; overflow:auto; }
table { width:100%; border-collapse:collapse; font-size:13px; }
th,td { max-width:180px; padding:9px 10px; overflow:hidden; border-bottom:1px solid color-mix(in srgb, currentColor 12%, transparent); text-align:left; text-overflow:ellipsis; white-space:nowrap; }
th { color:color-mix(in srgb,currentColor 70%,transparent); font-size:12px; font-weight:600; }
.table-renderer__state { display:grid; place-content:center; gap:10px; width:100%; height:100%; margin:0; color:color-mix(in srgb,currentColor 72%,transparent); font-size:14px; overflow-wrap:anywhere; }
.table-renderer__skeleton { display:block; width:220px; max-width:74%; height:14px; border-radius:6px; background:color-mix(in srgb,currentColor 14%,transparent); }
.table-renderer__skeleton--short { width:150px; }
</style>
