<script setup lang="ts">
import { computed } from "vue";
import type { DashboardWidget } from "@/types/dashboardStudio";
const props = defineProps<{ widget: DashboardWidget }>();
const src = computed(() => {
  const value = props.widget.props?.src;
  return (typeof value === "string" ? value : props.widget.content ?? "").trim();
});
const objectFit = computed(() => {
  const value = props.widget.props?.objectFit;
  return value === "contain" || value === "fill" || value === "cover"
    ? value
    : props.widget.style.imageFit ?? "cover";
});
const allowed = computed(() => !src.value || src.value.startsWith("/") || src.value.startsWith("https://") || src.value.startsWith("data:image/"));
const frameStyle = computed(() => ({
  backgroundColor: props.widget.style.background ?? "rgba(15,23,42,.56)",
  borderColor: props.widget.style.borderColor ?? "rgba(148,163,184,.26)",
  backdropFilter: props.widget.style.backgroundBlur ? `blur(${props.widget.style.backgroundBlur}px)` : undefined
}));
</script>
<template>
  <figure class="image-renderer" :style="frameStyle">
    <img v-if="src && allowed" :src="src" alt="" :style="{ objectFit }" />
    <figcaption v-else class="image-renderer__empty">{{ src && !allowed ? '图片不可用' : '请配置图片地址' }}</figcaption>
  </figure>
</template>
<style scoped>
.image-renderer { box-sizing:border-box; display:grid; place-items:center; width:100%; height:100%; min-width:0; min-height:0; margin:0; overflow:hidden; border:1px solid; border-radius:8px; }
img { display:block; width:100%; height:100%; }
.image-renderer__empty { padding:12px; color:rgba(226,232,240,.72); font-size:14px; overflow-wrap:anywhere; }
</style>
