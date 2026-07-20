<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { PhCheckCircle, PhClock, PhDatabase, PhSparkle } from "@phosphor-icons/vue";
import type { DashboardRecord, DashboardWidget } from "@/types/dashboardStudio";
import { calculateDashboardRuntimeScale } from "../core/dashboardRuntimeScale";
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
const isPublished = computed(() => props.record.status === "published" && Boolean(props.record.publishedSchema));
const visibleWidgets = computed(() => runtimeSchema.value
  ? [...runtimeSchema.value.widgets]
      .filter((item) => item.style.visible !== false)
      .sort((left, right) => (left.style.zIndex ?? 0) - (right.style.zIndex ?? 0))
  : []
);
const canvasViewport = ref<HTMLElement | null>(null);
const canvasScale = ref(1);
let canvasResizeObserver: ResizeObserver | null = null;
const canvasStyle = computed(() => ({
  width: `${runtimeSchema.value?.canvas.width ?? 1}px`,
  height: `${runtimeSchema.value?.canvas.height ?? 1}px`,
  backgroundColor: runtimeSchema.value?.canvas.background ?? "#F5F9FF",
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

  const inset = props.fullscreen ? 0 : 28;
  canvasScale.value = calculateDashboardRuntimeScale(
    activeSchema.canvas.scaleMode ?? "fit-screen",
    activeSchema.canvas.width,
    activeSchema.canvas.height,
    Math.max(1, viewport.clientWidth - inset),
    Math.max(1, viewport.clientHeight - inset)
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
    <section v-if="!runtimeSchema" class="runtime-unavailable" role="alert">
      <h1>运行态暂不可用</h1>
      <p>未找到运行态大屏</p>
    </section>
    <template v-else>
    <header v-if="!fullscreen" class="runtime-header">
      <div class="runtime-header__title">
        <span class="runtime-header__mark" aria-hidden="true"><PhSparkle :size="20" weight="duotone" /></span>
        <div>
          <span class="runtime-header__eyebrow">星数 · 可信数据智能</span>
          <h2>{{ runtimeSchema.title }}</h2>
          <p>{{ runtimeSchema.description }}</p>
        </div>
      </div>
      <div class="runtime-header__meta">
        <span :class="{ 'is-draft': !isPublished }">
          <PhCheckCircle v-if="isPublished" :size="16" aria-hidden="true" />
          <PhClock v-else :size="16" aria-hidden="true" />
          {{ isPublished ? '已发布' : '草稿预览' }}
        </span>
        <span>
          <PhDatabase :size="16" aria-hidden="true" />
          {{ runtimeSchema.source.kind === 'ask-data' ? '智能问数' : '手动配置' }}
        </span>
        <time :datetime="record.updatedAt">更新于 {{ new Date(record.updatedAt).toLocaleString('zh-CN', { hour12: false }) }}</time>
      </div>
    </header>

    <div ref="canvasViewport" class="runtime-canvas-viewport">
      <div class="runtime-canvas-stage" :style="canvasStageStyle">
        <div class="runtime-canvas" :style="canvasStyle">
          <DashboardWidgetCard
            v-for="widget in visibleWidgets"
            :key="widget.id"
            :widget="widget"
            :binding="bindingForWidget(widget)"
            :selected="false"
            readonly
          />
          <div v-if="visibleWidgets.length === 0" class="runtime-empty">
            <strong>暂无可见组件</strong>
            <span>这个运行态大屏没有可见模块。</span>
          </div>
        </div>
      </div>
    </div>
    </template>
  </main>
</template>

<style scoped>
.xs-dashboard-runtime {
  --runtime-border: var(--xs-border, #dce8fb);
  --runtime-text: var(--xs-text, #081a3a);
  --runtime-text-2: var(--xs-text-2, #294469);
  --runtime-text-3: var(--xs-text-3, #5f7391);
  display: grid;
  gap: 14px;
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--runtime-border);
  border-radius: 14px;
  background: #edf5ff;
  box-shadow: 0 14px 36px rgba(22, 119, 255, .08);
  container-type: inline-size;
  font-family: Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
}

.xs-dashboard-runtime.is-fullscreen {
  width: 100vw;
  height: 100dvh;
  min-height: 100dvh;
  gap: 0;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: linear-gradient(180deg, #07111f 0%, #030712 100%);
  box-shadow: none;
}

.runtime-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 13px 16px;
  border: 1px solid var(--runtime-border);
  border-radius: 14px;
  background: rgba(255, 255, 255, .94);
}

.runtime-header__title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.runtime-header__mark {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid #d9e8ff;
  border-radius: 14px;
  color: #1677ff;
  background: #edf5ff;
}

.runtime-header__title div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.runtime-header__eyebrow {
  color: #2563eb;
  font-size: 10px;
  font-weight: 760;
  letter-spacing: .08em;
}

.runtime-header h2,
.runtime-header p {
  margin: 0;
}

.runtime-header h2 {
  overflow: hidden;
  color: var(--runtime-text);
  font-size: 17px;
  font-weight: 790;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runtime-header p {
  overflow: hidden;
  max-width: 680px;
  color: var(--runtime-text-3);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runtime-header__meta {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 7px;
}

.runtime-header__meta span,
.runtime-header__meta time {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  gap: 5px;
  padding: 0 9px;
  border: 1px solid #dce8fb;
  border-radius: 999px;
  color: #294469;
  background: #f8fbff;
  font-size: 10px;
  font-weight: 680;
}

.runtime-header__meta span:first-child {
  border-color: rgba(22, 163, 122, .2);
  color: #087b5a;
  background: #f1fbf7;
}

.runtime-header__meta span:first-child.is-draft {
  border-color: rgba(255, 176, 32, .24);
  color: #9f6400;
  background: #fffaf0;
}

.runtime-canvas-viewport {
  display: flex;
  width: 100%;
  height: min(76vh, 900px);
  min-height: 560px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: linear-gradient(180deg, #07111f 0%, #030712 100%);
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
  border: 1px solid #d8e6f9;
  border-radius: 14px;
  box-shadow: 0 16px 32px rgba(24, 77, 145, .08);
  transform-origin: top left;
}

.is-fullscreen .runtime-canvas {
  border: 0;
  border-radius: 0;
  box-shadow: 0 24px 90px rgba(0, 0, 0, .42);
}

.runtime-empty {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: grid;
  place-content: center;
  gap: 6px;
  color: rgba(226, 232, 240, .72);
  pointer-events: none;
  text-align: center;
}

.runtime-empty strong {
  color: #f8fafc;
  font-size: 28px;
}

.runtime-empty span {
  font-size: 15px;
  font-weight: 700;
}

.runtime-unavailable {
  display: grid;
  width: 100%;
  height: 100%;
  place-content: center;
  gap: 14px;
  padding: 24px;
  background: #07111f;
  color: #dbeafe;
  text-align: center;
}

.runtime-unavailable h1,
.runtime-unavailable p { margin: 0; }

.runtime-unavailable h1 { color: #f8fafc; font-size: 24px; }
.runtime-unavailable p { color: rgba(219, 234, 254, .74); font-size: 14px; }

</style>
