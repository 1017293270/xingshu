<script setup lang="ts">
import { computed } from "vue";
import type { DashboardWidget } from "@/types/dashboardStudio";
const props = defineProps<{ widget: DashboardWidget }>();
const decorationStyle = computed(() => ({
  backgroundColor: props.widget.style.background ?? "rgba(8,13,28,.32)",
  borderColor: props.widget.style.borderColor ?? "rgba(56,189,248,.5)",
  "--decoration-accent": props.widget.style.accent ?? "#38bdf8",
  backdropFilter: props.widget.style.backgroundBlur ? `blur(${props.widget.style.backgroundBlur}px)` : undefined
}));
</script>
<template><div class="decoration-renderer" :style="decorationStyle" aria-hidden="true"><span class="decoration-renderer__rail is-top"/><span class="decoration-renderer__rail is-bottom"/></div></template>
<style scoped>
.decoration-renderer { box-sizing:border-box; position:relative; width:100%; height:100%; min-width:0; min-height:0; overflow:hidden; border:1px solid; border-radius:8px; }
.decoration-renderer::before,.decoration-renderer::after { position:absolute; width:24px; height:24px; border-color:var(--decoration-accent); content:""; }
.decoration-renderer::before { top:8px; left:8px; border-top:2px solid; border-left:2px solid; }
.decoration-renderer::after { right:8px; bottom:8px; border-right:2px solid; border-bottom:2px solid; }
.decoration-renderer__rail { position:absolute; left:16px; right:16px; height:1px; background:color-mix(in srgb,var(--decoration-accent) 52%,transparent); }
.decoration-renderer__rail.is-top { top:18px; }.decoration-renderer__rail.is-bottom { bottom:18px; }
</style>
