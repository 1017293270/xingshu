<script setup lang="ts">
import type { EChartsOption, EChartsType } from "echarts";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{
  option: EChartsOption;
  label: string;
}>();

const chartElement = ref<HTMLDivElement | null>(null);
let chart: EChartsType | null = null;
let resizeObserver: ResizeObserver | null = null;
let resizeFrame: number | null = null;
let disposed = false;
const reducedMotion =
  import.meta.env.MODE === "test" ||
  (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

function optionWithMotion(option: EChartsOption, updating = false): EChartsOption {
  if (reducedMotion) return { ...option, animation: false };
  return {
    ...option,
    animation: option.animation ?? true,
    animationDuration: option.animationDuration ?? (updating ? 260 : 420),
    animationEasing: option.animationEasing ?? "cubicOut",
    animationDurationUpdate: option.animationDurationUpdate ?? 260,
    animationEasingUpdate: option.animationEasingUpdate ?? "cubicOut"
  };
}

function resizeChart() {
  if (resizeFrame !== null) {
    return;
  }
  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = null;
    chart?.resize();
  });
}

onMounted(async () => {
  if (!chartElement.value) {
    return;
  }
  const echarts = await import("echarts");
  if (disposed || !chartElement.value) {
    return;
  }
  chart = echarts.init(chartElement.value, null, { renderer: "canvas" });
  chart.setOption(optionWithMotion(props.option), { notMerge: true, lazyUpdate: false });
  chartElement.value.dataset.echartsReady = "true";
  resizeObserver = new ResizeObserver(resizeChart);
  resizeObserver.observe(chartElement.value);
});

watch(
  () => props.option,
  (option) => {
    chart?.setOption(optionWithMotion(option, true), {
      notMerge: true,
      lazyUpdate: false
    });
  },
  { deep: true }
);

onBeforeUnmount(() => {
  disposed = true;
  resizeObserver?.disconnect();
  if (resizeFrame !== null) {
    window.cancelAnimationFrame(resizeFrame);
  }
  chart?.dispose();
  chart = null;
});
</script>

<template>
  <div ref="chartElement" class="vue-echart" role="img" :aria-label="label" />
</template>

<style scoped>
.vue-echart {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
</style>
