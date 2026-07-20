<script setup lang="ts">
import { computed } from "vue";
import type { DashboardDataBinding, DashboardWidget, DashboardWidgetPosition } from "@/types/dashboardStudio";
import DashboardChartRenderer from "./renderers/DashboardChartRenderer.vue";
import DashboardDecorationRenderer from "./renderers/DashboardDecorationRenderer.vue";
import DashboardImageRenderer from "./renderers/DashboardImageRenderer.vue";
import DashboardMetricRenderer from "./renderers/DashboardMetricRenderer.vue";
import DashboardTableRenderer from "./renderers/DashboardTableRenderer.vue";
import DashboardTextRenderer from "./renderers/DashboardTextRenderer.vue";

const props = defineProps<{
  widget: DashboardWidget;
  binding?: DashboardDataBinding;
  selected: boolean;
  readonly?: boolean;
  settling?: boolean;
  dragging?: boolean;
  resizing?: boolean;
  previewPosition?: DashboardWidgetPosition;
}>();

const emit = defineEmits<{
  select: [widgetId: string];
  pointerstart: [widgetId: string, event: PointerEvent];
  resizestart: [widgetId: string, event: PointerEvent];
}>();

const renderedPosition = computed(() => props.previewPosition ?? props.widget.position);
const isChart = computed(() => ["line", "area", "bar", "pie", "radar", "funnel"].includes(props.widget.type));

function selectWidget() {
  if (!props.readonly) emit("select", props.widget.id);
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.readonly && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    selectWidget();
  }
}

function handlePointerDown(event: PointerEvent) {
  if (!props.readonly && !props.widget.style.locked && event.button === 0) {
    emit("pointerstart", props.widget.id, event);
  } else if (!props.readonly) {
    selectWidget();
  }
}

function handleResizePointerDown(event: PointerEvent) {
  if (!props.readonly && !props.widget.style.locked && event.button === 0) {
    emit("resizestart", props.widget.id, event);
  }
}
</script>

<template>
  <article
    class="dashboard-widget-card"
    :role="readonly ? undefined : 'button'"
    :class="{
      'is-selected': selected,
      'is-readonly': readonly,
      'is-settling': settling,
      'is-dragging': dragging,
      'is-resizing': resizing,
      'is-locked': widget.style.locked,
      'is-hidden': widget.style.visible === false
    }"
    :style="{
      left: `${renderedPosition.x}px`,
      top: `${renderedPosition.y}px`,
      width: `${renderedPosition.w}px`,
      height: `${renderedPosition.h}px`,
      zIndex: widget.style.zIndex,
      opacity: widget.style.opacity
    }"
    :tabindex="readonly ? undefined : 0"
    :aria-label="widget.name ?? widget.title"
    :aria-pressed="readonly ? undefined : selected"
    @click.stop="selectWidget"
    @keydown="handleKeydown"
    @pointerdown.stop="handlePointerDown"
  >
    <div
      class="dashboard-widget-card__renderer"
      :class="{ 'dashboard-widget-card__renderer--interactive': isChart }"
      aria-hidden="false"
    >
      <DashboardTextRenderer v-if="widget.type === 'text'" :widget="widget" />
      <DashboardMetricRenderer v-else-if="widget.type === 'metric'" :widget="widget" :binding="binding" />
      <DashboardTableRenderer v-else-if="widget.type === 'table'" :widget="widget" :binding="binding" />
      <DashboardImageRenderer v-else-if="widget.type === 'image'" :widget="widget" />
      <DashboardDecorationRenderer v-else-if="widget.type === 'decoration'" :widget="widget" />
      <DashboardChartRenderer v-else-if="isChart" :widget="widget" :binding="binding" />
    </div>

    <template v-if="selected && !readonly">
      <span class="dashboard-widget-card__corner dashboard-widget-card__corner--nw" aria-hidden="true" />
      <span class="dashboard-widget-card__corner dashboard-widget-card__corner--ne" aria-hidden="true" />
      <span class="dashboard-widget-card__corner dashboard-widget-card__corner--sw" aria-hidden="true" />
      <button
        v-if="!widget.style.locked"
        type="button"
        tabindex="-1"
        class="dashboard-widget-card__resize-handle"
        aria-label="调整组件大小"
        @click.stop
        @pointerdown.stop="handleResizePointerDown"
      />
    </template>
  </article>
</template>

<style scoped>
.dashboard-widget-card {
  position: absolute;
  z-index: 1;
  box-sizing: border-box;
  min-width: 24px;
  min-height: 24px;
  border: 1px solid transparent;
  outline: none;
  cursor: move;
  transition: border-color 120ms cubic-bezier(.16,1,.3,1), box-shadow 120ms cubic-bezier(.16,1,.3,1), opacity 120ms cubic-bezier(.16,1,.3,1);
}
.dashboard-widget-card__renderer { width:100%; height:100%; min-width:0; min-height:0; pointer-events:none; }
.dashboard-widget-card__renderer--interactive { pointer-events:auto; }
.dashboard-widget-card:not(.is-readonly):hover { border-color:rgba(125,211,252,.7); }
.dashboard-widget-card:focus-visible { border-color:#fbbf24; box-shadow:0 0 0 3px rgba(251,191,36,.28); }
.dashboard-widget-card.is-selected { border-color:#38bdf8; box-shadow:0 0 0 1px rgba(56,189,248,.7),0 0 0 4px rgba(56,189,248,.18); }
.dashboard-widget-card.is-dragging,.dashboard-widget-card.is-resizing { opacity:.86; transition:none; }
.dashboard-widget-card.is-hidden { opacity:.38 !important; }
.dashboard-widget-card.is-locked { cursor:default; }
.dashboard-widget-card.is-readonly { border:0; cursor:default; }
.dashboard-widget-card.is-locked.is-selected { border-style:dashed; }
.dashboard-widget-card__corner,.dashboard-widget-card__resize-handle { position:absolute; z-index:2; box-sizing:border-box; width:10px; height:10px; border:2px solid #38bdf8; border-radius:0; background:#f8fafc; box-shadow:0 2px 8px rgba(15,23,42,.22); }
.dashboard-widget-card__corner--nw { top:-6px; left:-6px; }
.dashboard-widget-card__corner--ne { top:-6px; right:-6px; }
.dashboard-widget-card__corner--sw { bottom:-6px; left:-6px; }
.dashboard-widget-card__resize-handle { right:-6px; bottom:-6px; padding:0; border-radius:2px; cursor:nwse-resize; pointer-events:auto; }
@media (prefers-reduced-motion:reduce) { .dashboard-widget-card { transition:none; } }
</style>
