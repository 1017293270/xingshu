<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { DashboardRecord, DashboardWidget } from "@/types/dashboardStudio";
import { calculateDashboardRuntimeScale, resolveDashboardRuntimeScaleMode } from "../core/dashboardRuntimeScale";
import { resolveCanvasBackgroundStyle } from "../core/dashboardCanvasBackground";
import DashboardWidgetCard from "./DashboardWidgetCard.vue";

const props = defineProps<{
  record: DashboardRecord;
  fullscreen?: boolean;
}>();

const runtimeSchema = computed(() =>
  props.record.status === "published" && props.record.publishedSchema
    ? props.record.publishedSchema
    : null
);
const visibleWidgets = computed(() => runtimeSchema.value
  ? [...runtimeSchema.value.widgets]
      .filter((item) => item.style.visible !== false)
      .sort((left, right) => (left.style.zIndex ?? 0) - (right.style.zIndex ?? 0))
  : []
);
const canvasViewport = ref<HTMLElement | null>(null);
const canvasScale = ref(1);
let canvasResizeObserver: ResizeObserver | null = null;
const canvasBackgroundStyle = computed(() =>
  runtimeSchema.value
    ? resolveCanvasBackgroundStyle(runtimeSchema.value.canvas)
    : { backgroundColor: "#F5F9FF" }
);
const useFullscreenDefaultBackground = computed(() =>
  Boolean(props.fullscreen && runtimeSchema.value && !runtimeSchema.value.canvas.backgroundImage)
);
const canvasViewportStyle = computed(() => {
  if (!runtimeSchema.value) return {};
  // 内联舞台吃满宽度、按画布比例撑高：首帧 JS 还没量出 scale 时高度就已经是对的，画布不会闪。
  // 高度不设上限——画布比一屏高就让页面往下滚，不为了塞进一屏把画布缩窄成两侧白柱。
  if (!props.fullscreen) {
    return { aspectRatio: `${runtimeSchema.value.canvas.width} / ${runtimeSchema.value.canvas.height}` };
  }
  return useFullscreenDefaultBackground.value
    ? canvasBackgroundStyle.value
    : { backgroundColor: runtimeSchema.value.canvas.background };
});
const canvasStyle = computed(() => ({
  width: `${runtimeSchema.value?.canvas.width ?? 1}px`,
  height: `${runtimeSchema.value?.canvas.height ?? 1}px`,
  ...(useFullscreenDefaultBackground.value
    ? { backgroundColor: "transparent", backgroundImage: "none" }
    : canvasBackgroundStyle.value),
  transform: `scale(${canvasScale.value})`
}));
const canvasStageStyle = computed(() => ({
  width: `${(runtimeSchema.value?.canvas.width ?? 1) * canvasScale.value}px`,
  height: `${(runtimeSchema.value?.canvas.height ?? 1) * canvasScale.value}px`
}));

function updateCanvasScale() {
  const viewport = canvasViewport.value;
  const activeSchema = runtimeSchema.value;
  if (!viewport || !activeSchema) return;

  // 留白由外层舞台负责，画布自己吃满视口，所以这里不留 inset
  canvasScale.value = calculateDashboardRuntimeScale(
    resolveDashboardRuntimeScaleMode(Boolean(props.fullscreen), activeSchema.canvas.scaleMode),
    activeSchema.canvas.width,
    activeSchema.canvas.height,
    Math.max(1, viewport.clientWidth),
    Math.max(1, viewport.clientHeight)
  );
}

watch(runtimeSchema, () => void nextTick(updateCanvasScale));

onMounted(() => {
  if (typeof ResizeObserver !== "undefined" && canvasViewport.value) {
    canvasResizeObserver = new ResizeObserver(updateCanvasScale);
    canvasResizeObserver.observe(canvasViewport.value);
  }
  void nextTick(updateCanvasScale);
});

onBeforeUnmount(() => canvasResizeObserver?.disconnect());

function bindingForWidget(widget: DashboardWidget) {
  return widget.bindingId ? runtimeSchema.value?.dataBindings[widget.bindingId] : undefined;
}
</script>

<template>
  <main class="xs-dashboard-runtime" :class="{ 'is-fullscreen': fullscreen }" aria-label="大屏运行态">
    <!-- 没有运行态有两种原因：草稿还没发布过（最常见，内联页天天遇到），或者真的取不到 -->
    <section v-if="!runtimeSchema" class="runtime-unavailable" role="alert">
      <h1>{{ record.status === 'published' ? '运行态暂不可用' : '这块看板还没有发布' }}</h1>
      <p>{{ record.status === 'published' ? '未找到运行态大屏' : '发布后即可在这里看到运行态画布。' }}</p>
    </section>
    <!-- 内联态没有自己的 header：状态 / 来源 / 更新时间由宿主页面的一条 meta 行统一承担，
         这里再画一遍就是同一份信息出现两次。全屏态本来也不渲染 header。 -->
    <div v-else ref="canvasViewport" class="runtime-canvas-viewport" :style="canvasViewportStyle">
      <div class="runtime-canvas-stage" :style="canvasStageStyle">
        <div class="runtime-canvas" :style="canvasStyle">
          <DashboardWidgetCard
            v-for="(widget, index) in visibleWidgets"
            :key="widget.id"
            :widget="widget"
            :binding="bindingForWidget(widget)"
            :selected="false"
            readonly
            :enter-index="index"
          />
          <div v-if="visibleWidgets.length === 0" class="runtime-empty">
            <strong>暂无可见组件</strong>
            <span>这个运行态大屏没有可见模块。</span>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.xs-dashboard-runtime {
  --runtime-border: var(--xs-border, #dce8fb);
  --runtime-text: var(--xs-text, #081a3a);
  --runtime-text-2: var(--xs-text-2, #294469);
  --runtime-text-3: var(--xs-text-3, #5f7391);
  display: grid;
  gap: 0;
  min-width: 0;
  /* 内联态是"裸"渲染器：边框、圆角、留白全部交给宿主页面的舞台，
     这里再包一层卡片就会和舞台叠成双层描边。 */
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  container-type: inline-size;
  font-family: Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
}

.xs-dashboard-runtime.is-fullscreen {
  width: 100vw;
  height: 100dvh;
  min-height: 100dvh;
  overflow: hidden;
  background: linear-gradient(180deg, #07111f 0%, #030712 100%);
}

.runtime-canvas-viewport {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--xs-surface, #ffffff);
}

/* 内联态用 fit-width 缩放，舞台宽高本就等于视口：贴左贴顶，
   免得 aspect-ratio 与实测宽度的亚像素差被居中摊成上下两条细缝。 */
.xs-dashboard-runtime:not(.is-fullscreen) .runtime-canvas-viewport {
  align-items: flex-start;
  justify-content: flex-start;
}

.is-fullscreen .runtime-canvas-viewport {
  height: 100dvh;
  min-height: 100dvh;
}

.runtime-canvas-stage {
  position: relative;
  flex: 0 0 auto;
}

.runtime-canvas {
  position: absolute;
  inset: 0 auto auto 0;
  box-sizing: border-box;
  min-width: 0;
  padding: 0;
  /* 画布贴满舞台，描边与圆角由舞台负责裁切，内层不再自带一圈边 */
  border: 0;
  border-radius: 0;
  box-shadow: none;
  transform-origin: top left;
  animation: runtime-canvas-enter 180ms cubic-bezier(.2, 0, 0, 1) backwards;
}

@keyframes runtime-canvas-enter {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 画布底色是用户数据，深浅都可能：空态做成一张浅色卡片，两种底上都读得出来。
   注意它长在 scale() 过的画布里，字号要按缩放前的尺度写。 */
.runtime-empty {
  position: absolute;
  z-index: 1;
  top: 50%;
  left: 50%;
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 28px 44px;
  border: 2px solid var(--runtime-border);
  border-radius: 18px;
  background: rgba(255, 255, 255, .94);
  transform: translate(-50%, -50%);
  pointer-events: none;
  text-align: center;
}

.runtime-empty strong {
  color: var(--runtime-text);
  font-size: 26px;
  font-weight: 600;
}

.runtime-empty span {
  color: var(--runtime-text-3);
  font-size: 15px;
  font-weight: 400;
}

.runtime-unavailable {
  display: grid;
  width: 100%;
  height: 100%;
  min-height: 260px;
  place-content: center;
  gap: 8px;
  padding: 32px;
  background: var(--xs-surface, #ffffff);
  color: var(--runtime-text-2);
  text-align: center;
}

.runtime-unavailable h1,
.runtime-unavailable p { margin: 0; }

.runtime-unavailable h1 { color: var(--runtime-text); font-size: 20px; font-weight: 600; }
.runtime-unavailable p { color: var(--runtime-text-3); font-size: 13px; }

/* 全屏态背后是深色渐变，缺运行态时保持原来的深色版式 */
.is-fullscreen .runtime-unavailable {
  min-height: 0;
  background: #07111f;
  color: #dbeafe;
}

.is-fullscreen .runtime-unavailable h1 { color: #f8fafc; font-size: 24px; }
.is-fullscreen .runtime-unavailable p { color: rgba(219, 234, 254, .74); font-size: 14px; }

@media (prefers-reduced-motion: reduce) {
  .runtime-canvas { animation: none; }
}

</style>
