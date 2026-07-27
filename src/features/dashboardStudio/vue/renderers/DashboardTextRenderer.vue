<script setup lang="ts">
import { computed } from "vue";
import type { DashboardWidget } from "@/types/dashboardStudio";
const props = defineProps<{ widget: DashboardWidget }>();
const hasSubtitle = computed(() => Boolean(props.widget.subtitle?.trim()));
const textStyle = computed(() => ({
  backgroundColor: props.widget.style.background ?? "transparent",
  color: props.widget.style.color ?? "#f8fafc",
  fontSize: `${Math.min(96, Math.max(10, props.widget.style.fontSize ?? 28))}px`,
  fontWeight: props.widget.style.fontWeight ?? 700,
  textAlign: props.widget.style.textAlign ?? "left",
  justifyContent: props.widget.style.textAlign === "center" ? "center" : props.widget.style.textAlign === "right" ? "flex-end" : "flex-start",
  alignItems: hasSubtitle.value
    ? props.widget.style.textAlign === "center"
      ? "center"
      : props.widget.style.textAlign === "right"
        ? "flex-end"
        : "flex-start"
    : undefined,
  "--text-accent": props.widget.style.accent ?? "#1677FF",
  backdropFilter: props.widget.style.backgroundBlur ? `blur(${props.widget.style.backgroundBlur}px)` : undefined
}));
</script>
<template>
  <div class="text-renderer" :class="{ 'text-renderer--header': hasSubtitle }" :style="textStyle">
    <span class="text-renderer__main">{{ widget.props?.text ?? widget.content ?? widget.title }}</span>
    <template v-if="hasSubtitle">
      <span class="text-renderer__rule" aria-hidden="true" />
      <span class="text-renderer__subtitle">{{ widget.subtitle }}</span>
    </template>
  </div>
</template>
<style scoped>
.text-renderer { box-sizing:border-box; display:flex; align-items:center; width:100%; height:100%; min-width:0; min-height:0; overflow:hidden; padding:8px; line-height:1.15; overflow-wrap:anywhere; }
.text-renderer__main { min-width:0; }
/* 生成大屏标题头部：主标题 + 品牌色装饰线 + 副标题（洞察） */
.text-renderer--header { flex-direction:column; justify-content:center; gap:10px; overflow-wrap:normal; }
.text-renderer--header .text-renderer__main { max-width:100%; overflow:hidden; line-height:1.2; text-overflow:ellipsis; white-space:nowrap; }
.text-renderer__rule { width:46px; height:3px; flex:0 0 auto; border-radius:2px; background:linear-gradient(90deg,var(--text-accent),color-mix(in srgb,var(--text-accent) 38%,transparent)); }
.text-renderer__subtitle { max-width:100%; overflow:hidden; color:color-mix(in srgb,currentColor 58%,transparent); font-size:13px; font-weight:500; letter-spacing:.02em; line-height:1.4; text-overflow:ellipsis; white-space:nowrap; }
</style>
