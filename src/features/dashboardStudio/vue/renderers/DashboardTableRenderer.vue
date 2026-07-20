<script setup lang="ts">
import { computed } from "vue";
import type { DashboardDataBinding, DashboardWidget } from "@/types/dashboardStudio";
const props = defineProps<{ widget: DashboardWidget; binding?: DashboardDataBinding }>();
const loading = computed(() => props.binding?.status === "loading");
const error = computed(() => props.binding?.status === "error" ? props.binding.error ?? "数据不可用" : "");
const panelStyle = computed(() => ({
  backgroundColor: props.widget.style.background ?? "rgba(15,23,42,.86)",
  color: props.widget.style.color ?? "#e2e8f0",
  borderColor: `color-mix(in srgb, ${props.widget.style.accent ?? "#38bdf8"} 24%, transparent)`,
  backdropFilter: props.widget.style.backgroundBlur ? `blur(${props.widget.style.backgroundBlur}px)` : undefined
}));
</script>
<template>
  <section class="table-renderer" :style="panelStyle" :aria-busy="loading">
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
.table-renderer { box-sizing:border-box; display:grid; grid-template-rows:auto 1fr; width:100%; height:100%; min-width:0; min-height:0; overflow:hidden; padding:14px; border:1px solid; border-radius:8px; }
.table-renderer__header { min-width:0; overflow:hidden; padding-bottom:10px; font-size:14px; font-weight:800; text-overflow:ellipsis; white-space:nowrap; }
.table-renderer__scroll { min-width:0; min-height:0; overflow:auto; }
table { width:100%; border-collapse:collapse; font-size:13px; }
th,td { max-width:180px; padding:9px 10px; overflow:hidden; border-bottom:1px solid rgba(148,163,184,.18); text-align:left; text-overflow:ellipsis; white-space:nowrap; }
th { color:color-mix(in srgb,currentColor 70%,transparent); font-size:12px; font-weight:800; text-transform:uppercase; }
.table-renderer__state { display:grid; place-content:center; gap:10px; width:100%; height:100%; margin:0; color:color-mix(in srgb,currentColor 72%,transparent); font-size:14px; overflow-wrap:anywhere; }
.table-renderer__skeleton { display:block; width:220px; max-width:74%; height:14px; border-radius:6px; background:color-mix(in srgb,currentColor 14%,transparent); }
.table-renderer__skeleton--short { width:150px; }
</style>
