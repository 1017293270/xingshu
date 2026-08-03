<script setup lang="ts">
import type { EChartsOption } from "echarts";
import type { EChartsType } from "echarts/core";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{
  option: EChartsOption;
  label: string;
  summary?: string;
}>();

const chartElement = ref<HTMLDivElement | null>(null);
let chart: EChartsType | null = null;
let resizeObserver: ResizeObserver | null = null;
let intersectionObserver: IntersectionObserver | null = null;
let resizeFrame: number | null = null;
let disposed = false;
let isIntersecting = false;
let runtimeLoading = false;
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
    if (chart && document.visibilityState !== "hidden") {
      chart.resize();
      return;
    }
    void initializeChart();
  });
}

function hasUsableSize(element: HTMLElement) {
  const bounds = element.getBoundingClientRect();
  return Math.max(bounds.width, element.clientWidth) > 0 && Math.max(bounds.height, element.clientHeight) > 0;
}

async function initializeChart() {
  const element = chartElement.value;
  if (
    chart ||
    runtimeLoading ||
    disposed ||
    !element ||
    !isIntersecting ||
    document.visibilityState === "hidden" ||
    !hasUsableSize(element)
  ) {
    return;
  }

  runtimeLoading = true;
  try {
    const echarts = await import("@/services/echartsRuntime");
    if (disposed || !chartElement.value || !hasUsableSize(chartElement.value)) {
      return;
    }
    chart = echarts.init(chartElement.value, null, { renderer: "canvas" });
    chart.setOption(optionWithMotion(props.option), { notMerge: true, lazyUpdate: false });
    chartElement.value.dataset.echartsReady = "true";
  } finally {
    runtimeLoading = false;
  }
}

function handleVisibilityChange() {
  if (document.visibilityState !== "hidden") {
    void initializeChart();
    resizeChart();
  }
}

onMounted(() => {
  if (!chartElement.value || import.meta.env.MODE === "test") {
    return;
  }

  resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resizeChart);
  resizeObserver?.observe(chartElement.value);
  intersectionObserver =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver((entries) => {
          isIntersecting = entries.some((entry) => entry.isIntersecting);
          if (isIntersecting) {
            void initializeChart();
          }
        }, { rootMargin: "160px" });
  intersectionObserver?.observe(chartElement.value);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  if (!intersectionObserver) {
    isIntersecting = true;
    void initializeChart();
  }
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
  intersectionObserver?.disconnect();
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  if (resizeFrame !== null) {
    window.cancelAnimationFrame(resizeFrame);
  }
  chart?.dispose();
  chart = null;
});
</script>

<template>
  <div
    ref="chartElement"
    class="vue-echart"
    role="img"
    :aria-label="summary ? `${label}。${summary}` : label"
  />
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
