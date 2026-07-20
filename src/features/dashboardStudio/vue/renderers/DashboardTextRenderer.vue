<script setup lang="ts">
import { computed } from "vue";
import type { DashboardWidget } from "@/types/dashboardStudio";
const props = defineProps<{ widget: DashboardWidget }>();
const textStyle = computed(() => ({
  backgroundColor: props.widget.style.background ?? "transparent",
  color: props.widget.style.color ?? "#f8fafc",
  fontSize: `${Math.min(96, Math.max(10, props.widget.style.fontSize ?? 28))}px`,
  fontWeight: props.widget.style.fontWeight ?? 700,
  textAlign: props.widget.style.textAlign ?? "left",
  justifyContent: props.widget.style.textAlign === "center" ? "center" : props.widget.style.textAlign === "right" ? "flex-end" : "flex-start",
  backdropFilter: props.widget.style.backgroundBlur ? `blur(${props.widget.style.backgroundBlur}px)` : undefined
}));
</script>
<template><div class="text-renderer" :style="textStyle">{{ widget.props?.text ?? widget.content ?? widget.title }}</div></template>
<style scoped>
.text-renderer { box-sizing:border-box; display:flex; align-items:center; width:100%; height:100%; min-width:0; min-height:0; overflow:hidden; padding:8px; line-height:1.15; overflow-wrap:anywhere; }
</style>
