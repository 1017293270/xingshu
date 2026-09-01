<script setup lang="ts">
import { computed } from "vue";
import type { DashboardDataBinding, DashboardWidget } from "@/types/dashboardStudio";
import { isLightDashboardSurface, resolveDashboardWidgetStyle } from "../../core/dashboardChartThemes";

const props = defineProps<{ widget: DashboardWidget; binding?: DashboardDataBinding }>();
/*
 * resolveDashboardWidgetStyle 的旧指挥屏兜底有一支是「chartTheme === command-default 且底色偏深
 * → 判定成遗留白卡，整张改写回冰蓝浅底」。表格卡根本不画 ECharts 面板，chartTheme 只是组件默认样式
 * 留下的历史字段，而任何深色整板主题给表格上的卡面正好长这个样子，于是深色板上会突兀地跳出一张白表格。
 * 这里在交给 resolve 之前摘掉这枚无用字段；真正的遗留底色黑名单（legacyCommandBackgrounds）不受影响。
 */
const style = computed(() => {
  const { chartTheme: _chartTheme, ...rest } = props.widget.style;
  return resolveDashboardWidgetStyle(rest);
});
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
    <p v-else-if="error" class="table-renderer__state">
      <span class="table-renderer__notice">
        <span class="table-renderer__notice-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.6v5" /><path d="M12 16.1h.01" /></svg>
        </span>
        <span class="table-renderer__notice-text">表格不可用：{{ error }}</span>
      </span>
    </p>
    <p v-else-if="!binding || binding.table.rows.length === 0" class="table-renderer__state">
      <span class="table-renderer__notice">
        <span class="table-renderer__notice-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17" /><path d="M9.5 9.5v10" /></svg>
        </span>
        <span class="table-renderer__notice-text">这张表暂时没有数据行</span>
      </span>
    </p>
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
/* 与图表卡同一套中性空态：底/描边都由卡面墨色调出，深浅两档主题下都可读 */
.table-renderer__notice {
  display:flex;
  max-width:100%;
  align-items:center;
  gap:9px;
  padding:11px 14px;
  border:1px solid color-mix(in srgb, currentColor 20%, transparent);
  border-radius:10px;
  /* 卡面墨色已经被外层压到 72%，提示卡里再补回来，深色档下才不会糊成一团 */
  color:color-mix(in srgb, currentColor 92%, transparent);
  background:color-mix(in srgb, currentColor 8%, transparent);
  font-size:13px;
  line-height:1.5;
  text-align:left;
}
.table-renderer__notice-icon { display:grid; width:18px; height:18px; flex:0 0 auto; place-items:center; opacity:.68; }
.table-renderer__notice-icon svg { width:18px; height:18px; }
.table-renderer__notice-text { min-width:0; }
</style>
