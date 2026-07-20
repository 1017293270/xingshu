<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, toRaw, watch } from "vue";
import {
  PhAlignBottom,
  PhAlignCenterHorizontal,
  PhAlignCenterVertical,
  PhAlignLeft,
  PhAlignRight,
  PhAlignTop,
  PhArrowLeft,
  PhArrowClockwise,
  PhArrowCounterClockwise,
  PhArrowsOutSimple,
  PhChartBar,
  PhChartLine,
  PhChartPieSlice,
  PhClipboardText,
  PhCloudArrowUp,
  PhCopy,
  PhCornersOut,
  PhDotsThree,
  PhEye,
  PhFloppyDisk,
  PhGridFour,
  PhHand,
  PhLock,
  PhLockOpen,
  PhMagnifyingGlass,
  PhNumberSquareOne,
  PhPlus,
  PhScissors,
  PhSelectionAll,
  PhSidebarSimple,
  PhSlidersHorizontal,
  PhTable,
  PhTextT,
  PhTrash
} from "@phosphor-icons/vue";
import type {
  DashboardDataBinding,
  DashboardRecord,
  DashboardSchema,
  DashboardWidget,
  DashboardWidgetPosition,
  DashboardWidgetType
} from "@/types/dashboardStudio";
import {
  dashboardCanvasPresets,
  dashboardZoomLevels,
  getDashboardCanvasFitScale,
  getNextDashboardZoom,
  normalizeDashboardCanvasDimension,
  resolveDashboardCanvasPreset
} from "../core/dashboardCanvas";
import {
  getDashboardDropPosition,
  moveDashboardWidgetPosition,
  resizeDashboardWidgetPosition
} from "../core/dashboardDesignerGeometry";
import { clampDashboardWidgetPosition } from "../core/dashboardFreeLayout";
import {
  dashboardChartWidgetTypes,
  dashboardComponentDefinitions,
  getDashboardComponentDefinition
} from "../core/dashboardComponentRegistry";
import {
  applyDashboardStudioPreset,
  dashboardStudioPresets
} from "../core/dashboardPresets";
import { dashboardChartVariants, getDashboardChartVariantGroups } from "../core/dashboardChartPresets";
import {
  dashboardChartThemes,
  getDashboardChartTheme,
  getMatchingDashboardChartThemeId
} from "../core/dashboardChartThemes";
import {
  createDashboardMockBinding,
  dashboardMockDataSources,
  getDashboardMockMapping,
  getDashboardMockSource,
  getFirstDashboardMockDimensionId,
  getFirstDashboardMockMetricId,
  isDashboardMockDimensionAllowed,
  isDashboardMockMetricAllowed
} from "../core/dashboardMockData";
import ColorField from "../original/designer/ColorField.vue";
import ChartThemePicker from "../original/designer/ChartThemePicker.vue";
import ChartTypePicker from "../original/designer/ChartTypePicker.vue";
import DashboardWidgetCard from "./DashboardWidgetCard.vue";

type SaveHandler = (schema: DashboardSchema, expectedRevision: number) => Promise<DashboardRecord>;
type DesignerLifecycle = "saved" | "dirty" | "saving" | "published" | "error";
type DesignerPropertyTab = "basic" | "layout" | "data" | "style";
type PointerDragState = {
  mode: "move" | "resize";
  widgetId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  startScrollTop: number;
  origin: DashboardWidgetPosition;
  candidate: DashboardWidgetPosition;
  offsetX: number;
  offsetY: number;
};
type CanvasPanState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  startScrollTop: number;
};

const props = defineProps<{
  initialSchema: DashboardSchema;
  initialRevision?: number;
  initialStatus?: "draft" | "published";
  saveDraft: SaveHandler;
  publishDashboard: SaveHandler;
  exit: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onChange?: (schema: DashboardSchema) => void;
}>();

const emit = defineEmits<{ ready: [] }>();

const paletteItems = dashboardComponentDefinitions.map((definition) => ({
  type: definition.type,
  label: definition.title,
  description: `${definition.defaultSize.w} × ${definition.defaultSize.h}`
}));
const propertyTabs: Array<{ id: DesignerPropertyTab; label: string }> = [
  { id: "basic", label: "基础" },
  { id: "layout", label: "布局" },
  { id: "data", label: "数据" },
  { id: "style", label: "样式" }
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

const schema = reactive<DashboardSchema>(clone(props.initialSchema));
const selectedWidgetId = ref("");
const settlingWidgetId = ref("");
const revision = ref(props.initialRevision ?? 0);
const recordStatus = ref(props.initialStatus ?? "draft");
const lifecycle = ref<DesignerLifecycle>(recordStatus.value === "published" ? "published" : "saved");
const activeSaveIntent = ref<"draft" | "publish" | null>(null);
const errorMessage = ref("");
const activeDrawer = ref<"palette" | "property" | null>(null);
const activePropertyTab = ref<DesignerPropertyTab>("basic");
const paletteSearch = ref("");
const showCanvasGrid = ref(true);
const isPanMode = ref(false);
const clipboardWidget = ref<DashboardWidget | null>(null);
const initialCanvasPreset = resolveDashboardCanvasPreset(schema.canvas.width, schema.canvas.height);
const resolutionMode = ref(initialCanvasPreset?.id ?? "custom");
const customCanvasWidth = ref(schema.canvas.width);
const customCanvasHeight = ref(schema.canvas.height);
const canvasScroll = ref<HTMLElement | null>(null);
const canvasSurface = ref<HTMLElement | null>(null);
const fitCanvasScale = ref(1);
const canvasZoom = ref(1);
const isFitZoom = ref(false);
const pointerDrag = ref<PointerDragState | null>(null);
const canvasPan = ref<CanvasPanState | null>(null);
const canvasScale = computed(() => (isFitZoom.value ? fitCanvasScale.value : canvasZoom.value));
let canvasResizeObserver: ResizeObserver | null = null;
let pendingHistoryOrigin: DashboardSchema | null = null;
let lastCommittedSchema = clone(props.initialSchema);
let lastInteractionFinishedAt = 0;
let suspendChanges = false;

const historyPast = ref<DashboardSchema[]>([]);
const historyFuture = ref<DashboardSchema[]>([]);
const hasPendingHistory = ref(false);

const selectedWidget = computed(() => schema.widgets.find((widget) => widget.id === selectedWidgetId.value));
const isSelectedWidgetLocked = computed(() => selectedWidget.value?.style.locked === true);
const isPropertyEditingDisabled = computed(() => lifecycle.value === "saving" || isSelectedWidgetLocked.value);
const chartVariantGroups = getDashboardChartVariantGroups();
const selectedChartVariantId = computed(() => {
  const widget = selectedWidget.value;
  if (!widget || !dashboardChartWidgetTypes.includes(widget.type)) return "";
  const current = dashboardChartVariants.find(
    (variant) => variant.id === widget.style.chartVariant && variant.type === widget.type
  );
  return current?.id ?? dashboardChartVariants.find((variant) => variant.type === widget.type)?.id ?? "";
});
const selectedChartTheme = computed(() => getDashboardChartTheme(selectedWidget.value?.style.chartTheme));
const selectedChartThemeId = computed(() => getMatchingDashboardChartThemeId(selectedWidget.value?.style));
const selectedChartThemeColors = computed(() => {
  const colors = selectedWidget.value?.style.seriesColors;
  if (colors?.length) return colors;
  return selectedWidget.value?.style.accent ? [selectedWidget.value.style.accent] : [];
});
const colorSwatches = computed(() => [
  ...(schema.theme?.colors ?? []),
  ...selectedChartTheme.value.seriesColors,
  "#ffffff",
  "#0f172a",
  "transparent"
].filter((color, index, colors) => colors.indexOf(color) === index));
const selectedBinding = computed(() =>
  selectedWidget.value?.bindingId ? schema.dataBindings[selectedWidget.value.bindingId] : undefined
);
const dataBindings = computed(() => Object.values(schema.dataBindings));
const selectedMockSource = computed(() => getDashboardMockSource(selectedBinding.value?.sourceId));
const selectedMockDimensionId = computed(() => {
  if (selectedBinding.value?.sourceId) return selectedBinding.value.dimensionId ?? "";
  const widget = selectedWidget.value;
  return widget ? getFirstDashboardMockDimensionId(widget.type, selectedMockSource.value) : "";
});
const selectedMockMetricId = computed(() => {
  if (selectedBinding.value?.sourceId && selectedBinding.value.metricId) return selectedBinding.value.metricId;
  const widget = selectedWidget.value;
  return widget
    ? getFirstDashboardMockMetricId(widget.type, selectedMockSource.value, selectedMockDimensionId.value)
    : "";
});
const paletteGroups = computed(() => [{ label: "组件", items: paletteItems }]);
const allColumns = computed(() => selectedBinding.value?.table.columns ?? []);
const numericColumns = computed(() =>
  allColumns.value.filter((column) => {
    const descriptor = `${column.key} ${column.title} ${column.type ?? ""}`;
    if (/int|float|double|decimal|numeric|number|count|amount|ratio|percent|金额|数量|占比|比例|率/i.test(descriptor)) {
      return true;
    }
    const rows = selectedBinding.value?.table.rows.slice(0, 8) ?? [];
    return rows.length > 0 && rows.every((row) => Number.isFinite(Number(row[column.key])));
  })
);
const dimensionColumns = computed(() =>
  allColumns.value.filter((column) => !numericColumns.value.some((numeric) => numeric.key === column.key))
);
const orderedWidgets = computed(() =>
  [...schema.widgets].sort((left, right) => (left.style.zIndex ?? 0) - (right.style.zIndex ?? 0))
);
const canvasStyle = computed(() => ({
  width: `${schema.canvas.width}px`,
  height: `${schema.canvas.height}px`,
  backgroundColor: schema.canvas.background,
  transform: `scale(${canvasScale.value})`
}));
const canvasStageStyle = computed(() => ({
  width: `${Math.round(schema.canvas.width * canvasScale.value)}px`,
  height: `${Math.round(schema.canvas.height * canvasScale.value)}px`
}));
const canvasScaleLabel = computed(() => `${Math.round(canvasScale.value * 100)}%`);
const horizontalRulerTicks = computed(() =>
  Array.from({ length: Math.floor(schema.canvas.width / 200) + 1 }, (_, index) => ({
    value: index * 200,
    position: (index * 200) / schema.canvas.width * 100
  }))
);
const verticalRulerTicks = computed(() =>
  Array.from({ length: Math.floor(schema.canvas.height / 100) + 1 }, (_, index) => ({
    value: index * 100,
    position: (index * 100) / schema.canvas.height * 100
  }))
);
const canUndo = computed(() => historyPast.value.length > 0 && lifecycle.value !== "saving");
const canRedo = computed(() => historyFuture.value.length > 0 && lifecycle.value !== "saving");
const canPreviewPublished = computed(
  () => recordStatus.value === "published" && lifecycle.value !== "dirty" && lifecycle.value !== "saving"
);
const runtimePreviewHref = computed(() => canPreviewPublished.value
  ? `/dashboard-view?dashboard=${encodeURIComponent(schema.id)}`
  : undefined
);
const hasValidName = computed(() => schema.title.trim().length > 0);
const statusLabel = computed(() => {
  if (lifecycle.value === "saving" && activeSaveIntent.value === "publish") return "发布中";
  if (lifecycle.value === "saving") return "正在保存草稿";
  if (lifecycle.value === "dirty") return "有未保存改动";
  if (lifecycle.value === "error") return errorMessage.value || "保存失败";
  return "草稿已就绪";
});

function plainSchema() {
  return clone(toRaw(schema));
}

async function replaceSchema(nextSchema: DashboardSchema) {
  suspendChanges = true;
  Object.assign(schema, clone(nextSchema));
  await nextTick();
  suspendChanges = false;
}

function clearHistoryTimer() {
  pendingHistoryOrigin = null;
  hasPendingHistory.value = false;
}

function commitPendingHistory() {
  clearHistoryTimer();
}

function historySignature(value: DashboardSchema) {
  const comparable = clone(value);
  comparable.title = "";
  comparable.updatedAt = "";
  return JSON.stringify(comparable);
}

async function restoreHistorySnapshot(snapshot: DashboardSchema) {
  clearHistoryTimer();
  const restored = { ...clone(snapshot), title: schema.title, updatedAt: schema.updatedAt };
  await replaceSchema(restored);
  lastCommittedSchema = clone(restored);
  lifecycle.value = "dirty";
  props.onDirtyChange?.(true);
  props.onChange?.(plainSchema());
}

async function undoChange() {
  const previous = historyPast.value.at(-1);
  if (!previous) return;
  historyPast.value = historyPast.value.slice(0, -1);
  historyFuture.value = [...historyFuture.value, plainSchema()].slice(-100);
  await restoreHistorySnapshot(previous);
}

async function redoChange() {
  commitPendingHistory();
  const next = historyFuture.value.at(-1);
  if (!next) return;
  historyFuture.value = historyFuture.value.slice(0, -1);
  historyPast.value = [...historyPast.value, plainSchema()].slice(-100);
  await restoreHistorySnapshot(next);
}

watch(
  schema,
  () => {
    if (suspendChanges) {
      return;
    }
    const current = plainSchema();
    if (historySignature(lastCommittedSchema) !== historySignature(current)) {
      historyPast.value = [
        ...historyPast.value,
        { ...clone(lastCommittedSchema), title: current.title }
      ].slice(-100);
      historyFuture.value = [];
    }
    lastCommittedSchema = clone(current);
    lifecycle.value = "dirty";
    errorMessage.value = "";
    props.onDirtyChange?.(true);
    props.onChange?.(plainSchema());
  },
  { deep: true }
);

function beforeUnload(event: BeforeUnloadEvent) {
  if (lifecycle.value === "dirty") {
    event.preventDefault();
    event.returnValue = "";
  }
}

function updateCanvasScale() {
  const viewport = canvasScroll.value;
  if (!viewport) return;

  const availableWidth = Math.max(1, viewport.clientWidth - 36);
  const availableHeight = Math.max(1, viewport.clientHeight - 36);
  const fittedScale = getDashboardCanvasFitScale(
    schema.canvas.width,
    schema.canvas.height,
    availableWidth,
    availableHeight
  );
  const minimumScale = window.innerWidth < 600 ? 0.25 : window.innerWidth < 1000 ? 0.4 : 0.5;
  fitCanvasScale.value = Math.min(0.75, Math.max(minimumScale, fittedScale));
}

function setCanvasZoom(value: number) {
  isFitZoom.value = false;
  canvasZoom.value = Math.round(Math.min(2, Math.max(0.25, value)) * 100) / 100;
}

function stepCanvasZoom(direction: -1 | 1) {
  setCanvasZoom(canvasScale.value + direction * 0.1);
}

function handleZoomChange(event: Event) {
  setCanvasZoom(Number((event.target as HTMLSelectElement).value));
}

function fitCanvasToViewport() {
  isFitZoom.value = true;
  updateCanvasScale();
}

function handleResolutionChange(event: Event) {
  const nextMode = (event.target as HTMLSelectElement).value;
  resolutionMode.value = nextMode as typeof resolutionMode.value;
  const preset = dashboardCanvasPresets.find((item) => item.id === nextMode);
  if (!preset) return;

  schema.canvas.width = preset.width;
  schema.canvas.height = preset.height;
  customCanvasWidth.value = preset.width;
  customCanvasHeight.value = preset.height;
}

function applyCustomCanvasSize() {
  resolutionMode.value = "custom";
  const width = normalizeDashboardCanvasDimension(customCanvasWidth.value, "width");
  const height = normalizeDashboardCanvasDimension(customCanvasHeight.value, "height");
  customCanvasWidth.value = width;
  customCanvasHeight.value = height;
  schema.canvas.width = width;
  schema.canvas.height = height;
}

function handlePresetChange(event: Event) {
  const select = event.target as HTMLSelectElement;
  const preset = dashboardStudioPresets.find((item) => item.id === select.value);
  select.value = "";
  if (!preset || lifecycle.value === "saving") return;

  const nextSchema = applyDashboardStudioPreset(plainSchema(), preset);
  Object.assign(schema, clone(nextSchema));
  selectedWidgetId.value = "";
  settlingWidgetId.value = "";
}

watch(
  () => [schema.canvas.width, schema.canvas.height],
  () => void nextTick(updateCanvasScale)
);

onMounted(() => {
  window.addEventListener("beforeunload", beforeUnload);
  if (typeof ResizeObserver !== "undefined" && canvasScroll.value) {
    canvasResizeObserver = new ResizeObserver(updateCanvasScale);
    canvasResizeObserver.observe(canvasScroll.value);
  }
  void nextTick(updateCanvasScale);
  emit("ready");
});

onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", beforeUnload);
  clearHistoryTimer();
  canvasResizeObserver?.disconnect();
  window.removeEventListener("pointermove", handleWidgetPointerMove);
  window.removeEventListener("pointerup", finishWidgetPointerDrag);
  window.removeEventListener("pointercancel", cancelWidgetPointerDrag);
  window.removeEventListener("pointermove", handleCanvasPanMove);
  window.removeEventListener("pointerup", finishCanvasPan);
  window.removeEventListener("pointercancel", finishCanvasPan);
});

function bindingForWidget(widget: DashboardWidget) {
  return widget.bindingId ? schema.dataBindings[widget.bindingId] : undefined;
}

function availablePosition(widgetId: string, desired: DashboardWidgetPosition) {
  void widgetId;
  return clampDashboardWidgetPosition(desired, schema.canvas);
}

function defaultMapping(type: DashboardWidgetType, binding?: DashboardDataBinding) {
  const columns = binding?.table.columns ?? [];
  const metrics = columns.filter((column) =>
    /int|float|double|decimal|numeric|number|count|amount|ratio|percent|金额|数量|占比|比例|率/i.test(
      `${column.key} ${column.title} ${column.type ?? ""}`
    )
  );
  const dimension = columns.find((column) => !metrics.some((metric) => metric.key === column.key));

  if (type === "metric") {
    return { metricKeys: metrics.slice(0, 1).map((column) => column.key), valueMode: "latest" as const };
  }
  if (dashboardChartWidgetTypes.includes(type)) {
    return {
      dimensionKey: dimension?.key,
      metricKeys: metrics.slice(0, type === "pie" ? 1 : 2).map((column) => column.key)
    };
  }
  return {};
}

function getDefaultWidgetSize(type: DashboardWidgetType) {
  return getDashboardComponentDefinition(type).defaultSize;
}

function addWidget(type: DashboardWidgetType, desiredPosition?: DashboardWidgetPosition) {
  if (lifecycle.value === "saving") return;
  const binding = dataBindings.value[0];
  const definition = getDashboardComponentDefinition(type);
  const size = definition.defaultSize;
  const index = schema.widgets.length;
  const defaultPosition = {
    x: 64 + (index % 8) * 36,
    y: 64 + (index % 6) * 36,
    ...size
  };
  const nextZIndex = schema.widgets.reduce((maximum, item) => Math.max(maximum, item.style.zIndex ?? 0), 0) + 1;
  const nextWidget: DashboardWidget = {
    id: createId("widget"),
    type,
    name: definition.title,
    title: definition.defaultTitle ?? definition.title,
    subtitle: binding?.label,
    content: definition.defaultContent,
    props: clone(definition.defaultProps ?? {}),
    bindingId: ["text", "image", "decoration"].includes(type) ? undefined : binding?.id,
    mapping: defaultMapping(type, binding),
    position: availablePosition("", desiredPosition ?? defaultPosition),
    style: {
      ...definition.defaultStyle,
      locked: false,
      visible: true,
      zIndex: nextZIndex
    }
  };
  schema.widgets = [...schema.widgets, nextWidget];
  selectedWidgetId.value = nextWidget.id;
  settlingWidgetId.value = nextWidget.id;
  activePropertyTab.value = "layout";
  activeDrawer.value = "property";
}

function duplicateSelected() {
  if (!selectedWidget.value) return;
  const copy = clone(selectedWidget.value);
  copy.id = createId("widget");
  copy.title = `${copy.title} 副本`;
  copy.position = availablePosition(copy.id, {
    ...copy.position,
    x: copy.position.x + 36,
    y: copy.position.y + 36
  });
  copy.style = {
    ...copy.style,
    locked: false,
    visible: true,
    zIndex: schema.widgets.reduce((maximum, item) => Math.max(maximum, item.style.zIndex ?? 0), 0) + 1
  };
  schema.widgets = [...schema.widgets, copy];
  selectedWidgetId.value = copy.id;
  settlingWidgetId.value = copy.id;
}

function deleteSelected() {
  if (!selectedWidget.value || selectedWidget.value.style.locked || lifecycle.value === "saving") return;
  const deletedWidgetId = selectedWidget.value.id;
  if (!schema.widgets.some((widget) => widget.id === deletedWidgetId)) return;
  schema.widgets = schema.widgets.filter((widget) => widget.id !== deletedWidgetId);
  selectedWidgetId.value = "";
  if (settlingWidgetId.value === deletedWidgetId) settlingWidgetId.value = "";
}

function copySelected() {
  if (!selectedWidget.value) return;
  clipboardWidget.value = clone(selectedWidget.value);
}

function cutSelected() {
  copySelected();
  deleteSelected();
}

function pasteWidget() {
  if (!clipboardWidget.value) return;
  const copy = clone(clipboardWidget.value);
  copy.id = createId("widget");
  copy.title = `${copy.title} 副本`;
  copy.style = { ...copy.style, locked: false };
  copy.position = availablePosition(copy.id, {
    ...copy.position,
    x: copy.position.x + 36,
    y: copy.position.y + 36
  });
  copy.style.visible = true;
  copy.style.zIndex = schema.widgets.reduce((maximum, item) => Math.max(maximum, item.style.zIndex ?? 0), 0) + 1;
  schema.widgets = [...schema.widgets, copy];
  selectedWidgetId.value = copy.id;
  settlingWidgetId.value = copy.id;
}

function clearCanvas() {
  if (schema.widgets.length === 0) return;
  if (!window.confirm("确认清空画布中的全部组件吗？此操作可通过撤销恢复。")) return;
  schema.widgets = [];
  selectedWidgetId.value = "";
}

function toggleSelectedLock() {
  if (!selectedWidget.value) return;
  selectedWidget.value.style = {
    ...selectedWidget.value.style,
    locked: !selectedWidget.value.style.locked
  };
}

function alignSelected(direction: "left" | "center" | "right" | "top" | "middle" | "bottom") {
  if (!selectedWidget.value || selectedWidget.value.style.locked) return;
  const widget = selectedWidget.value;
  const nextPosition = { ...widget.position };

  if (direction === "left") nextPosition.x = 0;
  if (direction === "center") nextPosition.x = Math.round((schema.canvas.width - nextPosition.w) / 2);
  if (direction === "right") nextPosition.x = schema.canvas.width - nextPosition.w;
  if (direction === "top") nextPosition.y = 0;
  if (direction === "middle") nextPosition.y = Math.round((schema.canvas.height - nextPosition.h) / 2);
  if (direction === "bottom") nextPosition.y = Math.max(0, schema.canvas.height - nextPosition.h);

  widget.position = nextPosition;
}

function handleCanvasKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement;
  const isFormControl = /INPUT|TEXTAREA|SELECT/.test(target.tagName);
  if ((event.key === "Delete" || event.key === "Backspace") && selectedWidget.value) {
    if (!isFormControl) {
      event.preventDefault();
      deleteSelected();
    }
    return;
  }
  if (!isFormControl && selectedWidget.value && !selectedWidget.value.style.locked && /^Arrow/.test(event.key)) {
    const step = event.shiftKey ? 10 : 1;
    const deltas: Record<string, { x: number; y: number }> = {
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 }
    };
    const delta = deltas[event.key];
    if (delta) {
      event.preventDefault();
      selectedWidget.value.position = clampDashboardWidgetPosition(
        {
          ...selectedWidget.value.position,
          x: selectedWidget.value.position.x + delta.x,
          y: selectedWidget.value.position.y + delta.y
        },
        schema.canvas
      );
    }
  }
}

function startPaletteDrag(type: DashboardWidgetType, event: DragEvent) {
  event.dataTransfer?.setData("application/x-xingshu-widget-type", type);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
}

function startCanvasPan(event: PointerEvent) {
  const target = event.target as HTMLElement;
  const viewport = canvasScroll.value;
  if (!isPanMode.value || !viewport || event.button !== 0 || target.closest(".dashboard-widget-card")) return;

  canvasPan.value = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startScrollLeft: viewport.scrollLeft,
    startScrollTop: viewport.scrollTop
  };
  window.addEventListener("pointermove", handleCanvasPanMove, { passive: false });
  window.addEventListener("pointerup", finishCanvasPan);
  window.addEventListener("pointercancel", finishCanvasPan);
  event.preventDefault();
}

function handleCanvasPanMove(event: PointerEvent) {
  const state = canvasPan.value;
  const viewport = canvasScroll.value;
  if (!state || !viewport || state.pointerId !== event.pointerId) return;
  viewport.scrollLeft = state.startScrollLeft - (event.clientX - state.startClientX);
  viewport.scrollTop = state.startScrollTop - (event.clientY - state.startClientY);
  event.preventDefault();
}

function finishCanvasPan(event: PointerEvent) {
  if (!canvasPan.value || canvasPan.value.pointerId !== event.pointerId) return;
  canvasPan.value = null;
  window.removeEventListener("pointermove", handleCanvasPanMove);
  window.removeEventListener("pointerup", finishCanvasPan);
  window.removeEventListener("pointercancel", finishCanvasPan);
}

function dropOnCanvas(event: DragEvent) {
  event.preventDefault();
  const paletteType = event.dataTransfer?.getData("application/x-xingshu-widget-type") as DashboardWidgetType;
  if (paletteType && paletteItems.some((item) => item.type === paletteType)) {
    const surface = canvasSurface.value;
    const size = getDefaultWidgetSize(paletteType);
    if (!surface) {
      addWidget(paletteType);
      return;
    }
    const bounds = surface.getBoundingClientRect();
    const position = getDashboardDropPosition(
      event,
      { left: bounds.left, top: bounds.top },
      canvasScale.value,
      size,
      schema.canvas
    );
    addWidget(paletteType, position);
    return;
  }
}

function getDragGeometry(drag: PointerDragState, clientX: number, clientY: number) {
  const viewport = canvasScroll.value;
  const scrollDeltaX = (viewport?.scrollLeft ?? 0) - drag.startScrollLeft;
  const scrollDeltaY = (viewport?.scrollTop ?? 0) - drag.startScrollTop;
  const visualDeltaX = clientX - drag.startClientX + scrollDeltaX;
  const visualDeltaY = clientY - drag.startClientY + scrollDeltaY;
  const logicalDeltaX = visualDeltaX / canvasScale.value;
  const logicalDeltaY = visualDeltaY / canvasScale.value;
  const candidate =
    drag.mode === "resize"
      ? resizeDashboardWidgetPosition(drag.origin, visualDeltaX, visualDeltaY, canvasScale.value, schema.canvas)
      : moveDashboardWidgetPosition(drag.origin, visualDeltaX, visualDeltaY, canvasScale.value, schema.canvas);

  return {
    offsetX: logicalDeltaX,
    offsetY: logicalDeltaY,
    candidate
  };
}

function autoScrollCanvas(clientX: number, clientY: number) {
  const viewport = canvasScroll.value;
  if (!viewport) return;
  const bounds = viewport.getBoundingClientRect();
  const edge = 48;
  const speed = 18;
  if (clientX < bounds.left + edge) viewport.scrollLeft -= speed;
  if (clientX > bounds.right - edge) viewport.scrollLeft += speed;
  if (clientY < bounds.top + edge) viewport.scrollTop -= speed;
  if (clientY > bounds.bottom - edge) viewport.scrollTop += speed;
}

function startWidgetInteraction(widgetId: string, event: PointerEvent, mode: "move" | "resize") {
  const target = schema.widgets.find((widget) => widget.id === widgetId);
  if (!target || target.style.locked || lifecycle.value === "saving") return;
  event.preventDefault();
  selectedWidgetId.value = widgetId;
  const viewport = canvasScroll.value;
  pointerDrag.value = {
    mode,
    widgetId,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startScrollLeft: viewport?.scrollLeft ?? 0,
    startScrollTop: viewport?.scrollTop ?? 0,
    origin: clone(target.position),
    candidate: clone(target.position),
    offsetX: 0,
    offsetY: 0
  };
  window.addEventListener("pointermove", handleWidgetPointerMove, { passive: false });
  window.addEventListener("pointerup", finishWidgetPointerDrag);
  window.addEventListener("pointercancel", cancelWidgetPointerDrag);
}

function startWidgetPointerDrag(widgetId: string, event: PointerEvent) {
  startWidgetInteraction(widgetId, event, "move");
}

function startWidgetResize(widgetId: string, event: PointerEvent) {
  startWidgetInteraction(widgetId, event, "resize");
}

function handleWidgetPointerMove(event: PointerEvent) {
  const drag = pointerDrag.value;
  if (!drag || event.pointerId !== drag.pointerId) return;
  event.preventDefault();
  const geometry = getDragGeometry(drag, event.clientX, event.clientY);
  pointerDrag.value = { ...drag, ...geometry };
}

function releasePointerDragListeners() {
  window.removeEventListener("pointermove", handleWidgetPointerMove);
  window.removeEventListener("pointerup", finishWidgetPointerDrag);
  window.removeEventListener("pointercancel", cancelWidgetPointerDrag);
}

function clearCanvasSelection() {
  if (performance.now() - lastInteractionFinishedAt < 220) return;
  selectedWidgetId.value = "";
}

function finishWidgetPointerDrag(event: PointerEvent) {
  const drag = pointerDrag.value;
  if (!drag || event.pointerId !== drag.pointerId) return;
  const target = schema.widgets.find((widget) => widget.id === drag.widgetId);
  const hasChanged =
    drag.candidate.x !== drag.origin.x ||
    drag.candidate.y !== drag.origin.y ||
    drag.candidate.w !== drag.origin.w ||
    drag.candidate.h !== drag.origin.h;
  if (target && hasChanged) {
    target.position = drag.candidate;
  }
  pointerDrag.value = null;
  lastInteractionFinishedAt = performance.now();
  releasePointerDragListeners();
}

function cancelWidgetPointerDrag(event: PointerEvent) {
  if (pointerDrag.value && event.pointerId === pointerDrag.value.pointerId) {
    pointerDrag.value = null;
    releasePointerDragListeners();
  }
}

function dragOffsetFor(widgetId: string) {
  if (pointerDrag.value?.widgetId !== widgetId || pointerDrag.value.mode !== "move") return undefined;
  return { x: pointerDrag.value.offsetX, y: pointerDrag.value.offsetY };
}

function previewPositionFor(widgetId: string) {
  if (pointerDrag.value?.widgetId !== widgetId) return undefined;
  return pointerDrag.value.candidate;
}

function applyMockDataSelection(sourceId: string, dimensionId: string, metricId: string) {
  const widget = selectedWidget.value;
  if (!widget || isPropertyEditingDisabled.value) return;
  const source = getDashboardMockSource(sourceId);
  const nextDimensionId = isDashboardMockDimensionAllowed(widget.type, source, dimensionId)
    ? dimensionId
    : getFirstDashboardMockDimensionId(widget.type, source);
  const nextMetricId = isDashboardMockMetricAllowed(widget.type, source, nextDimensionId, metricId)
    ? metricId
    : getFirstDashboardMockMetricId(widget.type, source, nextDimensionId);
  if (!nextMetricId) return;

  let bindingId = widget.bindingId;
  if (!bindingId) {
    const baseId = `${widget.id.slice(0, 64)}-data`;
    bindingId = baseId;
    for (let index = 2; Object.prototype.hasOwnProperty.call(schema.dataBindings, bindingId) && index < 100; index += 1) {
      bindingId = `${baseId}-${index}`;
    }
  }
  const binding = createDashboardMockBinding({
    id: bindingId,
    sourceId: source.id,
    dimensionId: nextDimensionId,
    metricId: nextMetricId
  });
  schema.dataBindings = { ...schema.dataBindings, [bindingId]: binding };
  widget.bindingId = bindingId;
  widget.mapping = getDashboardMockMapping(binding);
}

function handleBindingChange(event: Event) {
  const widget = selectedWidget.value;
  if (!widget || isPropertyEditingDisabled.value) return;
  const bindingId = (event.target as HTMLSelectElement).value;
  widget.bindingId = bindingId || undefined;
  const binding = bindingId ? schema.dataBindings[bindingId] : undefined;
  widget.mapping = binding ? { ...widget.mapping, ...getDashboardMockMapping(binding) } : {};
}

function handleMockSourceChange(event: Event) {
  const widget = selectedWidget.value;
  if (!widget) return;
  const source = getDashboardMockSource((event.target as HTMLSelectElement).value);
  const dimensionId = getFirstDashboardMockDimensionId(widget.type, source);
  const metricId = getFirstDashboardMockMetricId(widget.type, source, dimensionId);
  applyMockDataSelection(source.id, dimensionId, metricId);
}

function handleMockDimensionChange(event: Event) {
  const widget = selectedWidget.value;
  if (!widget) return;
  const dimensionId = (event.target as HTMLSelectElement).value;
  const metricId = getFirstDashboardMockMetricId(widget.type, selectedMockSource.value, dimensionId);
  applyMockDataSelection(selectedMockSource.value.id, dimensionId, metricId);
}

function handleMockMetricChange(event: Event) {
  applyMockDataSelection(
    selectedMockSource.value.id,
    selectedMockDimensionId.value,
    (event.target as HTMLSelectElement).value
  );
}

function updateMetricSelection(event: Event) {
  if (!selectedWidget.value) return;
  const select = event.target as HTMLSelectElement;
  selectedWidget.value.mapping.metricKeys = Array.from(select.selectedOptions).map((option) => option.value);
}

function updateWidgetType(event: Event) {
  if (!selectedWidget.value) return;
  const type = (event.target as HTMLSelectElement).value as DashboardWidgetType;
  selectedWidget.value.type = type;
  selectedWidget.value.mapping = defaultMapping(type, selectedBinding.value);
}

function updateWidgetName(event: Event) {
  if (!selectedWidget.value || isPropertyEditingDisabled.value) return;
  const fallback = getDashboardComponentDefinition(selectedWidget.value.type).title;
  selectedWidget.value.name = (event.target as HTMLInputElement).value.trim() || fallback;
}

function updateTextContent(event: Event) {
  if (!selectedWidget.value || isPropertyEditingDisabled.value) return;
  const value = (event.target as HTMLTextAreaElement).value;
  selectedWidget.value.content = value;
  selectedWidget.value.props = { ...(selectedWidget.value.props ?? {}), text: value };
}

function updateImageSource(event: Event) {
  if (!selectedWidget.value || isPropertyEditingDisabled.value) return;
  const value = (event.target as HTMLInputElement).value;
  selectedWidget.value.content = value;
  selectedWidget.value.props = { ...(selectedWidget.value.props ?? {}), src: value };
}

function selectChartVariant(variantId: string) {
  const widget = selectedWidget.value;
  if (!widget || isPropertyEditingDisabled.value) return;
  const variant = dashboardChartVariants.find((item) => item.id === variantId);
  if (!variant) return;

  const currentDefinition = getDashboardComponentDefinition(widget.type);
  const targetDefinition = getDashboardComponentDefinition(variant.type);
  const shouldUseTargetTitle = !widget.title || widget.title === currentDefinition.defaultTitle;
  const shouldUseTargetName = !widget.name || widget.name === currentDefinition.title;
  widget.type = variant.type;
  widget.name = shouldUseTargetName ? targetDefinition.title : widget.name;
  widget.title = shouldUseTargetTitle ? (targetDefinition.defaultTitle ?? targetDefinition.title) : widget.title;
  widget.props = {
    ...(targetDefinition.defaultProps ?? {}),
    ...(widget.props ?? {})
  };
  widget.style = {
    ...targetDefinition.defaultStyle,
    ...widget.style,
    chartVariant: variant.id,
    accent: variant.accent
  };
  if (selectedBinding.value?.sourceId) {
    const source = getDashboardMockSource(selectedBinding.value.sourceId);
    const dimensionId = getFirstDashboardMockDimensionId(variant.type, source);
    const metricId = getFirstDashboardMockMetricId(variant.type, source, dimensionId);
    applyMockDataSelection(source.id, dimensionId, metricId);
  } else {
    selectedWidget.value.mapping = defaultMapping(variant.type, selectedBinding.value);
  }
}

function applyChartTheme(themeId: string) {
  if (!selectedWidget.value || isPropertyEditingDisabled.value) return;
  const theme = getDashboardChartTheme(themeId);
  selectedWidget.value.style = {
    ...selectedWidget.value.style,
    chartTheme: theme.id,
    background: theme.background,
    color: theme.color,
    accent: theme.seriesColors[0],
    borderColor: theme.border,
    seriesColors: [...theme.seriesColors]
  };
}

function updateStyleValue(
  key: "background" | "color" | "accent" | "borderColor",
  value: string
) {
  if (!selectedWidget.value || isPropertyEditingDisabled.value) return;
  selectedWidget.value.style[key] = value;
}

function updateBackgroundBlur(value: number) {
  if (!selectedWidget.value || isPropertyEditingDisabled.value) return;
  selectedWidget.value.style.backgroundBlur = Math.min(100, Math.max(0, Math.round(value)));
}

function selectedDefaultStyleValue(
  key: "background" | "color" | "accent" | "borderColor",
  fallback: string
) {
  const widget = selectedWidget.value;
  if (!widget) return fallback;
  const value = getDashboardComponentDefinition(widget.type).defaultStyle[key];
  return typeof value === "string" ? value : fallback;
}

function updateFontSize(event: Event) {
  if (!selectedWidget.value || isPropertyEditingDisabled.value) return;
  const input = event.target as HTMLInputElement;
  if (!input.value.trim()) {
    delete selectedWidget.value.style.fontSize;
    return;
  }
  const fallback = selectedWidget.value.style.fontSize ?? 24;
  const parsed = Number(input.value);
  selectedWidget.value.style.fontSize = Math.min(120, Math.max(8, Math.round(Number.isFinite(parsed) ? parsed : fallback)));
}

function updateLayoutField(
  field: "x" | "y" | "w" | "h",
  event: Event
) {
  if (!selectedWidget.value || isPropertyEditingDisabled.value) return;
  const input = event.target as HTMLInputElement;
  const fallback = selectedWidget.value.position[field];
  const parsed = input.value.trim() ? Number(input.value) : fallback;
  const next = clampDashboardWidgetPosition(
    { ...selectedWidget.value.position, [field]: Number.isFinite(parsed) ? parsed : fallback },
    schema.canvas
  );
  selectedWidget.value.position = next;
  input.value = String(next[field]);
}

function updateZIndex(event: Event) {
  if (!selectedWidget.value || isPropertyEditingDisabled.value) return;
  const value = Number((event.target as HTMLInputElement).value);
  selectedWidget.value.style.zIndex = Math.min(10000, Math.max(0, Math.round(Number.isFinite(value) ? value : 1)));
}

async function save() {
  activeSaveIntent.value = "draft";
  lifecycle.value = "saving";
  errorMessage.value = "";
  try {
    const record = await props.saveDraft(plainSchema(), revision.value);
    await replaceSchema(record.schema);
    revision.value = record.revision;
    recordStatus.value = record.status;
    lastCommittedSchema = clone(record.schema);
    pendingHistoryOrigin = null;
    hasPendingHistory.value = false;
    clearHistoryTimer();
    lifecycle.value = record.status === "published" ? "published" : "saved";
    props.onDirtyChange?.(false);
  } catch (error) {
    lifecycle.value = "error";
    errorMessage.value = error instanceof Error ? error.message : "保存失败，请稍后重试";
  } finally {
    activeSaveIntent.value = null;
  }
}

async function publish() {
  activeSaveIntent.value = "publish";
  lifecycle.value = "saving";
  errorMessage.value = "";
  try {
    const record = await props.publishDashboard(plainSchema(), revision.value);
    await replaceSchema(record.schema);
    revision.value = record.revision;
    recordStatus.value = record.status;
    lastCommittedSchema = clone(record.schema);
    pendingHistoryOrigin = null;
    hasPendingHistory.value = false;
    clearHistoryTimer();
    lifecycle.value = "published";
    props.onDirtyChange?.(false);
  } catch (error) {
    lifecycle.value = "error";
    errorMessage.value = error instanceof Error ? error.message : "发布失败，请稍后重试";
  } finally {
    activeSaveIntent.value = null;
  }
}

function exitDesigner() {
  if (lifecycle.value === "dirty" && !window.confirm("当前修改尚未保存，确认返回吗？")) {
    return;
  }
  props.exit();
}
</script>

<template>
  <section class="xs-dashboard-designer" aria-label="星数大屏设计器">
    <header class="designer-toolbar">
      <button type="button" class="designer-toolbar__icon-button designer-toolbar__back" aria-label="返回上一页" @click="exitDesigner">
        <PhArrowLeft :size="18" aria-hidden="true" />
      </button>

      <div class="designer-toolbar__identity">
        <label class="designer-toolbar__name-field">
          <span class="sr-only">大屏名称</span>
           <input v-model="schema.title" class="designer-toolbar__name-input" aria-label="大屏名称" maxlength="120" :disabled="lifecycle === 'saving'" />
        </label>
        <span class="designer-toolbar__status-group">
          <span class="designer-toolbar__record-status">{{ recordStatus === 'published' ? '已发布' : '草稿' }}</span>
          <span
            class="designer-toolbar__status"
            :class="{ 'is-saving': lifecycle === 'saving' }"
            :data-state="lifecycle"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            :aria-busy="lifecycle === 'saving'"
            :title="statusLabel"
          >{{ statusLabel }}</span>
        </span>
      </div>

      <div class="designer-toolbar__cluster" aria-label="历史操作">
        <button type="button" class="designer-toolbar__button" aria-label="撤销" :disabled="!canUndo" @click="undoChange">撤销</button>
        <button type="button" class="designer-toolbar__button" aria-label="重做" :disabled="!canRedo" @click="redoChange">重做</button>
        <select class="designer-toolbar__preset-select" aria-label="应用大屏模板" value="" :disabled="lifecycle === 'saving'" @change="handlePresetChange">
          <option value="">模板</option>
          <option v-for="preset in dashboardStudioPresets" :key="preset.id" :value="preset.id">{{ preset.title }}</option>
        </select>
      </div>

      <div class="designer-toolbar__cluster designer-toolbar__cluster--zoom" aria-label="缩放控制">
        <button type="button" class="designer-toolbar__icon-button" aria-label="缩小" :disabled="canvasScale <= .25 || lifecycle === 'saving'" @click="stepCanvasZoom(-1)">-</button>
        <select :value="isFitZoom ? 'fit' : canvasZoom" aria-label="缩放" :disabled="lifecycle === 'saving'" @change="handleZoomChange">
          <option v-if="isFitZoom" value="fit" disabled>{{ canvasScaleLabel }}</option>
          <option v-for="level in dashboardZoomLevels" :key="level" :value="level">{{ Math.round(level * 100) }}%</option>
        </select>
        <button type="button" class="designer-toolbar__icon-button" aria-label="放大" :disabled="canvasScale >= 2 || lifecycle === 'saving'" @click="stepCanvasZoom(1)">+</button>
      </div>

      <div class="designer-toolbar__actions" aria-label="大屏操作">
        <button
          type="button"
          class="designer-toolbar__icon-button designer-toolbar__panel-button"
          aria-label="打开组件库"
          :aria-pressed="activeDrawer === 'palette'"
          @click="activeDrawer = activeDrawer === 'palette' ? null : 'palette'"
        >
          <PhSidebarSimple :size="19" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="designer-toolbar__icon-button designer-toolbar__panel-button"
          aria-label="打开属性面板"
          :aria-pressed="activeDrawer === 'property'"
          @click="activeDrawer = activeDrawer === 'property' ? null : 'property'"
        >
          <PhSlidersHorizontal :size="19" aria-hidden="true" />
        </button>
        <a
          class="designer-toolbar__button designer-toolbar__link-button"
          :class="{ 'is-disabled': !canPreviewPublished }"
          :href="runtimePreviewHref"
          target="_blank"
          rel="noreferrer"
          :aria-disabled="!canPreviewPublished"
          :tabindex="canPreviewPublished ? 0 : -1"
          :title="canPreviewPublished ? '打开已发布运行态预览' : '请先发布已保存的改动再预览'"
          @click="!canPreviewPublished && $event.preventDefault()"
        >预览</a>
        <button type="button" class="designer-toolbar__button designer-toolbar__button--primary" :disabled="lifecycle === 'saving' || !hasValidName" @click="save">{{ lifecycle === 'saving' && activeSaveIntent === 'draft' ? '保存中' : '保存' }}</button>
        <button type="button" class="designer-toolbar__button" :disabled="lifecycle === 'saving' || !hasValidName" @click="publish">{{ lifecycle === 'saving' && activeSaveIntent === 'publish' ? '发布中' : '发布' }}</button>
      </div>
    </header>

    <div class="designer-workspace" @keydown="handleCanvasKeydown">
      <aside class="designer-panel designer-palette" :class="{ 'is-drawer-open': activeDrawer === 'palette' }" aria-label="组件库">
        <header class="designer-palette__header">
          <p>组件</p>
          <h2>构建模块</h2>
        </header>
        <div class="designer-palette__list">
          <button
            v-for="item in paletteItems"
            :key="item.type"
            type="button"
            class="designer-palette__item"
            :disabled="lifecycle === 'saving'"
            :aria-label="`${item.label} ${item.description}`"
            :title="item.description"
            @click="addWidget(item.type)"
          >
            <span class="designer-palette__icon" aria-hidden="true">{{ item.label.slice(0, 1) }}</span>
            <span class="designer-palette__copy">
              <strong>{{ item.label }}</strong>
              <small>{{ item.description }}</small>
            </span>
          </button>
        </div>
      </aside>

      <section class="designer-canvas-viewport" aria-label="设计画布">
        <div class="designer-canvas-ruler designer-canvas-ruler--horizontal" aria-hidden="true">
          <span>{{ schema.canvas.width }} × {{ schema.canvas.height }}</span>
          <span>{{ canvasScaleLabel }}</span>
        </div>
        <div
          ref="canvasScroll"
          class="designer-canvas-scroll"
          :class="{ 'is-pan-mode': isPanMode, 'is-panning': canvasPan }"
          @pointerdown="startCanvasPan"
        >
          <div class="designer-canvas-stage-shell">
            <div class="designer-canvas-stage" :style="canvasStageStyle">
              <div
                ref="canvasSurface"
                class="designer-canvas"
                :class="{ 'is-grid-visible': showCanvasGrid }"
                :style="canvasStyle"
                role="application"
                aria-label="大屏组件画布"
                @dragover.prevent
                @drop="dropOnCanvas"
                @click="clearCanvasSelection"
              >
                <DashboardWidgetCard
                  v-for="item in orderedWidgets"
                  :key="item.id"
                  :widget="item"
                  :binding="bindingForWidget(item)"
                  :selected="item.id === selectedWidgetId"
                  :settling="item.id === settlingWidgetId"
                  :dragging="pointerDrag?.widgetId === item.id && pointerDrag.mode === 'move'"
                  :resizing="pointerDrag?.widgetId === item.id && pointerDrag.mode === 'resize'"
                  :preview-position="previewPositionFor(item.id)"
                  @select="selectedWidgetId = $event"
                  @pointerstart="startWidgetPointerDrag"
                  @resizestart="startWidgetResize"
                />

                <div v-if="schema.widgets.length === 0" class="designer-canvas__empty">
                  <strong>还没有组件</strong>
                  <span>从左侧组件库选择一个模块。</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <aside class="designer-panel designer-properties" :class="{ 'is-drawer-open': activeDrawer === 'property' }" aria-label="属性">
        <header class="designer-properties__header">
          <p>属性</p>
          <h2>{{ selectedWidget ? (selectedWidget.name ?? selectedWidget.title) : '未选择组件' }}</h2>
        </header>

        <div v-if="selectedWidget" :key="selectedWidget.id" class="property-form">
          <section class="property-section">
            <h3>基础</h3>
            <label class="property-field">
              <span>名称</span>
              <input :value="selectedWidget.name ?? selectedWidget.title" :disabled="isPropertyEditingDisabled" maxlength="120" @change="updateWidgetName" />
            </label>
            <label v-if="!['text', 'image', 'decoration'].includes(selectedWidget.type)" class="property-field">
              <span>标题</span>
              <input v-model="selectedWidget.title" :disabled="isPropertyEditingDisabled" maxlength="160" />
            </label>
            <div v-if="dashboardChartWidgetTypes.includes(selectedWidget.type)" class="property-field">
              <span>图表类型</span>
              <ChartTypePicker
                :groups="chartVariantGroups"
                :selected-preset-id="selectedChartVariantId"
                :disabled="isPropertyEditingDisabled"
                @select="selectChartVariant"
              />
            </div>
            <label v-if="selectedWidget.type === 'text'" class="property-field">
              <span>文本</span>
              <textarea :value="selectedWidget.props?.text ?? selectedWidget.content ?? ''" :disabled="isPropertyEditingDisabled" rows="3" maxlength="500" @change="updateTextContent" />
            </label>
            <label v-if="selectedWidget.type === 'image'" class="property-field">
              <span>图片地址</span>
              <input :value="selectedWidget.props?.src ?? selectedWidget.content ?? ''" :disabled="isPropertyEditingDisabled" maxlength="1000" @change="updateImageSource" />
            </label>
            <div class="property-readonly-grid">
              <span>类型</span><strong>{{ getDashboardComponentDefinition(selectedWidget.type).title }}</strong>
              <span>ID</span><strong>{{ selectedWidget.id }}</strong>
            </div>
            <label class="property-lock-row">
              <input v-model="selectedWidget.style.locked" type="checkbox" :disabled="lifecycle === 'saving'" />
              <span>锁定</span>
            </label>
          </section>

          <section class="property-section">
            <h3>布局</h3>
            <div class="property-layout">
              <label><span>X</span><input :value="selectedWidget.position.x" :disabled="isPropertyEditingDisabled" aria-label="X" type="number" min="0" @change="updateLayoutField('x', $event)" /></label>
              <label><span>Y</span><input :value="selectedWidget.position.y" :disabled="isPropertyEditingDisabled" aria-label="Y" type="number" min="0" @change="updateLayoutField('y', $event)" /></label>
              <label><span>W</span><input :value="selectedWidget.position.w" :disabled="isPropertyEditingDisabled" aria-label="W" type="number" min="24" @change="updateLayoutField('w', $event)" /></label>
              <label><span>H</span><input :value="selectedWidget.position.h" :disabled="isPropertyEditingDisabled" aria-label="H" type="number" min="24" @change="updateLayoutField('h', $event)" /></label>
              <label><span>Z</span><input :value="selectedWidget.style.zIndex" :disabled="isPropertyEditingDisabled" aria-label="Z" type="number" min="0" max="10000" @change="updateZIndex" /></label>
              <label class="property-check"><input v-model="selectedWidget.style.visible" type="checkbox" :disabled="isPropertyEditingDisabled" /><span>显示</span></label>
            </div>
          </section>

          <section class="property-section">
            <h3>数据</h3>
            <div v-if="['text', 'image', 'decoration'].includes(selectedWidget.type)" class="property-empty-state">该组件无需绑定数据。</div>
            <template v-else>
              <label class="property-field">
                <span>绑定</span>
                <select :value="selectedWidget.bindingId ?? ''" :disabled="isPropertyEditingDisabled" @change="handleBindingChange">
                  <option value="">不绑定</option>
                  <option v-for="binding in dataBindings" :key="binding.id" :value="binding.id">{{ binding.id }}</option>
                </select>
              </label>
              <label class="property-field">
                <span>数据源</span>
                <select :value="selectedMockSource.id" :disabled="isPropertyEditingDisabled" @change="handleMockSourceChange">
                  <option v-for="source in dashboardMockDataSources" :key="source.id" :value="source.id">{{ source.name }}</option>
                </select>
              </label>
              <label class="property-field">
                <span>维度</span>
                <select :value="selectedMockDimensionId" :disabled="isPropertyEditingDisabled" @change="handleMockDimensionChange">
                  <option value="">无维度</option>
                  <option
                    v-for="dimension in selectedMockSource.dimensions"
                    :key="dimension.id"
                    :value="dimension.id"
                    :disabled="!isDashboardMockDimensionAllowed(selectedWidget.type, selectedMockSource, dimension.id)"
                  >{{ dimension.label }}{{ isDashboardMockDimensionAllowed(selectedWidget.type, selectedMockSource, dimension.id) ? '' : '（不适用）' }}</option>
                </select>
              </label>
              <label class="property-field">
                <span>指标</span>
                <select :value="selectedMockMetricId" :disabled="isPropertyEditingDisabled" @change="handleMockMetricChange">
                  <option
                    v-for="metric in selectedMockSource.metrics"
                    :key="metric.id"
                    :value="metric.id"
                    :disabled="!isDashboardMockMetricAllowed(selectedWidget.type, selectedMockSource, selectedMockDimensionId, metric.id)"
                  >{{ metric.label }}{{ metric.unit ? ` (${metric.unit})` : '' }}{{ isDashboardMockMetricAllowed(selectedWidget.type, selectedMockSource, selectedMockDimensionId, metric.id) ? '' : '（不适用）' }}</option>
                </select>
              </label>
            </template>
          </section>

          <section class="property-section">
            <h3>样式</h3>
            <div v-if="dashboardChartWidgetTypes.includes(selectedWidget.type)" class="property-field">
              <span>主题</span>
              <ChartThemePicker
                :themes="dashboardChartThemes"
                :selected-theme-id="selectedChartThemeId"
                :current-colors="selectedChartThemeColors"
                :disabled="isPropertyEditingDisabled"
                @select="applyChartTheme"
              />
            </div>
            <ColorField name="backgroundColor" label="背景" :value="selectedWidget.style.background ?? ''" :default-value="selectedDefaultStyleValue('background', 'transparent')" :swatches="colorSwatches" :disabled="isPropertyEditingDisabled" show-background-blur :background-blur="selectedWidget.style.backgroundBlur ?? 0" :default-blur="0" @change="updateStyleValue('background', $event)" @blur-change="updateBackgroundBlur" />
            <ColorField name="fontColor" label="文字色" :value="selectedWidget.style.color ?? ''" :default-value="selectedDefaultStyleValue('color', '#f8fafc')" :swatches="colorSwatches" :disabled="isPropertyEditingDisabled" @change="updateStyleValue('color', $event)" />
            <ColorField name="accentColor" label="强调色" :value="selectedWidget.style.accent ?? ''" :default-value="selectedDefaultStyleValue('accent', '#38bdf8')" :swatches="colorSwatches" :disabled="isPropertyEditingDisabled" @change="updateStyleValue('accent', $event)" />
            <ColorField name="borderColor" label="边框" :value="selectedWidget.style.borderColor ?? ''" :default-value="selectedDefaultStyleValue('borderColor', 'transparent')" :swatches="colorSwatches" :disabled="isPropertyEditingDisabled" @change="updateStyleValue('borderColor', $event)" />
            <label v-if="selectedWidget.type === 'text' || selectedWidget.style.fontSize" class="property-field">
              <span>字号</span>
              <input :value="selectedWidget.style.fontSize ?? ''" type="number" min="8" max="120" :disabled="isPropertyEditingDisabled" @change="updateFontSize" />
            </label>
          </section>

          <button type="button" class="property-danger" :disabled="isPropertyEditingDisabled" @click="deleteSelected">删除组件</button>
        </div>

        <div v-else class="designer-properties__empty">
          <strong>未选择组件</strong>
          <span>可以从组件库和工具栏继续编辑画布。</span>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.xs-dashboard-designer {
  --studio-bg: #eef2f7;
  --studio-surface: #ffffff;
  --studio-surface-soft: #f8fafc;
  --studio-border: #d8e2f3;
  --studio-border-strong: #c5d3e8;
  --studio-primary: #2563eb;
  --studio-primary-strong: #2563eb;
  --studio-cyan: #38bdf8;
  --studio-text: #0f172a;
  --studio-text-2: #334155;
  --studio-text-3: #64748b;
  --color-page: #eef2f7;
  --color-panel: #ffffff;
  --color-panel-muted: #f8fafc;
  --color-border: #d8e2f3;
  --color-text: #0f172a;
  --color-text-muted: #64748b;
  --color-accent: #2563eb;
  --color-accent-soft: #dbeafe;
  --color-danger: #dc2626;
  --motion-fast: 120ms;
  --ease-enter: cubic-bezier(.16, 1, .3, 1);
  position: relative;
  display: flex;
  width: 100%;
  height: 100vh;
  min-width: 0;
  min-height: 640px;
  flex-direction: column;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  color: var(--studio-text);
  background: var(--studio-bg);
  box-shadow: none;
  container-type: inline-size;
}

button,
input,
select,
textarea {
  font: inherit;
}

button:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: 2px solid var(--studio-primary-strong);
  outline-offset: 2px;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, .2);
}

.designer-toolbar {
  position: relative;
  z-index: 10;
  display: grid;
  grid-template-columns: minmax(210px, 1fr) auto minmax(310px, 1fr);
  align-items: center;
  gap: 18px;
  min-height: 62px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--studio-border);
  background: rgba(255, 255, 255, .97);
}

.designer-toolbar__identity,
.designer-toolbar__actions,
.designer-toolbar__status {
  display: flex;
  align-items: center;
}

.designer-toolbar__identity {
  min-width: 0;
  gap: 10px;
}

.designer-toolbar__title {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.designer-toolbar__eyebrow {
  color: var(--studio-text-3);
  font-size: 10px;
  font-weight: 740;
  letter-spacing: .08em;
}

.designer-toolbar__title input {
  width: min(100%, 320px);
  height: 29px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  color: var(--studio-text);
  background: transparent;
  font-size: 15px;
  font-weight: 780;
}

.designer-toolbar__title input:hover,
.designer-toolbar__title input:focus {
  padding-inline: 7px;
  background: var(--studio-surface-soft);
}

.designer-toolbar__status {
  justify-content: center;
  gap: 8px;
  min-width: 170px;
  color: var(--studio-text-3);
}

.designer-toolbar__status > span {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #16a37a;
  box-shadow: 0 0 0 4px rgba(22, 163, 122, .1);
  transition:
    background-color 120ms cubic-bezier(.2, 0, 0, 1),
    box-shadow 120ms cubic-bezier(.2, 0, 0, 1);
}

.designer-toolbar__status[data-state="dirty"] > span,
.designer-toolbar__status[data-state="saving"] > span {
  background: #ffb020;
  box-shadow: 0 0 0 4px rgba(255, 176, 32, .12);
}

.designer-toolbar__status[data-state="saving"] > span {
  animation: studio-pulse 800ms cubic-bezier(.37, 0, .63, 1) infinite alternate;
}

.designer-toolbar__status[data-state="error"] > span {
  background: #ff4d4f;
  box-shadow: 0 0 0 4px rgba(255, 77, 79, .1);
}

.designer-toolbar__status div {
  display: grid;
  gap: 1px;
}

.designer-toolbar__status strong {
  color: var(--studio-text-2);
  font-size: 11px;
  font-weight: 750;
}

.designer-toolbar__status small {
  min-width: 112px;
  max-width: 260px;
  overflow: hidden;
  color: var(--studio-text-3);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
  animation: studio-status-in 120ms cubic-bezier(.2, 0, 0, 1) backwards;
}

.designer-toolbar__actions {
  justify-content: flex-end;
  gap: 8px;
}

.icon-button,
.studio-button {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 720;
  transition: background 120ms cubic-bezier(.2, 0, 0, 1), border-color 120ms cubic-bezier(.2, 0, 0, 1);
}

.icon-button {
  width: 38px;
  padding: 0;
  color: var(--studio-text-2);
  background: var(--studio-surface-soft);
}

.icon-button:hover {
  border-color: var(--studio-border-strong);
  color: var(--studio-primary-strong);
  background: #eef5ff;
}

.studio-button {
  padding: 0 13px;
  font-size: 12px;
}

.studio-button--secondary {
  border-color: var(--studio-border);
  color: var(--studio-text-2);
  background: var(--studio-surface);
}

.studio-button--secondary:hover {
  border-color: var(--studio-border-strong);
  color: var(--studio-primary-strong);
  background: var(--studio-surface-soft);
}

.studio-button--primary {
  color: #fff;
  background: linear-gradient(135deg, var(--studio-primary), var(--studio-primary-strong));
  box-shadow: 0 8px 16px rgba(22, 119, 255, .17);
}

.studio-button:disabled {
  cursor: wait;
  opacity: .58;
}

.designer-toolbar__panel-button {
  display: none;
}

.designer-workspace {
  position: relative;
  display: grid;
  grid-template-columns: 216px minmax(540px, 1fr) 292px;
  min-height: 0;
  flex: 1;
  gap: 12px;
  padding: 12px;
}

.designer-panel {
  position: relative;
  z-index: 4;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--studio-border);
  border-radius: 14px;
  background: var(--studio-surface);
}

.designer-panel__heading {
  display: flex;
  min-height: 60px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--studio-border);
}

.designer-panel__heading div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.designer-panel__heading span {
  color: var(--studio-text);
  font-size: 13px;
  font-weight: 780;
}

.designer-panel__heading small {
  overflow: hidden;
  color: var(--studio-text-3);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.designer-panel__count {
  display: inline-flex;
  min-width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: var(--studio-primary-strong) !important;
  background: #eaf3ff;
  font-size: 11px !important;
}

.designer-palette__list {
  display: grid;
  gap: 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  padding: 12px;
}

.designer-palette__item {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 9px;
  min-height: 58px;
  padding: 9px;
  border: 1px solid var(--studio-border);
  border-radius: 12px;
  color: var(--studio-text-2);
  background: var(--studio-surface);
  cursor: grab;
  text-align: left;
}

.designer-palette__item:hover {
  border-color: var(--studio-border-strong);
  color: var(--studio-primary-strong);
  background: var(--studio-surface-soft);
}

.designer-palette__icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid #d9e8ff;
  border-radius: 12px;
  color: var(--studio-primary-strong);
  background: #edf5ff;
}

.designer-palette__copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.designer-palette__copy strong {
  color: currentColor;
  font-size: 12px;
}

.designer-palette__copy small {
  overflow: hidden;
  color: var(--studio-text-3);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.designer-palette__plus {
  color: var(--studio-text-3);
}

.designer-palette__source {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: auto 12px 12px;
  padding: 12px;
  border: 1px solid #d9e8ff;
  border-radius: 12px;
  background: #f7fbff;
}

.source-node {
  position: relative;
  width: 11px;
  height: 11px;
  flex: 0 0 auto;
  border: 3px solid #d9f6ff;
  border-radius: 50%;
  background: var(--studio-cyan);
  box-shadow: 0 0 0 1px rgba(0, 194, 255, .28);
}

.source-node::after {
  position: absolute;
  width: 16px;
  height: 1px;
  top: 50%;
  left: 10px;
  content: "";
  background: linear-gradient(90deg, rgba(0, 194, 255, .5), transparent);
}

.designer-palette__source div {
  display: grid;
  gap: 2px;
}

.designer-palette__source strong {
  color: var(--studio-text-2);
  font-size: 10px;
}

.designer-palette__source small {
  color: var(--studio-text-3);
  font-size: 9px;
}

.designer-canvas-viewport {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--studio-border);
  border-radius: 14px;
  background: #eaf2fc;
}

.designer-canvas-meta {
  display: flex;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--studio-border);
  background: rgba(255, 255, 255, .82);
}

.designer-canvas-meta__resolution {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.designer-canvas-meta__resolution select,
.designer-canvas-meta__custom input {
  min-height: 30px;
  border: 1px solid var(--studio-border-strong);
  border-radius: 9px;
  color: var(--studio-text-2);
  background: #fff;
  font-size: 10px;
  font-weight: 680;
}

.designer-canvas-meta__resolution select {
  max-width: 250px;
  padding: 0 28px 0 10px;
}

.designer-canvas-meta__custom {
  display: flex;
  align-items: center;
  gap: 5px;
}

.designer-canvas-meta__custom input {
  width: 72px;
  padding: 0 7px;
}

.designer-canvas-meta__zoom {
  display: flex;
  align-items: center;
  gap: 6px;
}

.designer-canvas-meta__zoom button,
.designer-canvas-meta__zoom select {
  min-height: 32px;
  border: 1px solid var(--studio-border-strong);
  border-radius: 9px;
  color: var(--studio-text-2);
  background: #fff;
  font: inherit;
  font-size: 11px;
  font-weight: 720;
}

.designer-canvas-meta__zoom button {
  display: grid;
  min-width: 32px;
  place-items: center;
  padding: 0 8px;
  cursor: pointer;
}

.designer-canvas-meta__zoom select {
  min-width: 76px;
  padding: 0 24px 0 9px;
}

.designer-canvas-meta__zoom button:hover,
.designer-canvas-meta__zoom .is-active {
  border-color: #a9cfff;
  color: var(--studio-primary-strong);
  background: #edf5ff;
}

.designer-canvas-meta__zoom .designer-canvas-meta__fit {
  min-width: 72px;
  white-space: nowrap;
}

.designer-canvas-meta__scale {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  padding: 0 7px;
  border-radius: 7px;
  color: var(--studio-primary-strong) !important;
  background: #eaf3ff;
  font-weight: 720;
  white-space: nowrap;
}

.designer-canvas-meta strong {
  color: var(--studio-text-2);
  font-size: 11px;
}

.designer-canvas-meta span {
  color: var(--studio-text-3);
  font-size: 9px;
}

.designer-canvas-scroll {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  align-items: flex-start;
  justify-content: flex-start;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable both-edges;
  padding: 18px;
  background:
    radial-gradient(circle, rgba(103, 148, 211, .22) 1px, transparent 1px) 0 0 / 18px 18px,
    #edf5ff;
}

.designer-canvas-stage {
  position: relative;
  flex: 0 0 auto;
  margin: 0 auto;
}

.designer-canvas {
  position: relative;
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  box-sizing: border-box;
  gap: 10px;
  padding: 14px;
  border: 1px solid #d8e6f9;
  border-radius: 14px;
  box-shadow: 0 18px 36px rgba(24, 77, 145, .1);
  transform-origin: top left;
}

.designer-canvas::before {
  position: absolute;
  z-index: 0;
  inset: 14px;
  border: 1px dashed rgba(83, 132, 199, .18);
  border-radius: 10px;
  content: "";
  pointer-events: none;
}

.designer-canvas > * {
  z-index: 1;
}

.designer-canvas__empty {
  position: absolute;
  inset: 50% auto auto 50%;
  display: grid;
  width: min(360px, calc(100% - 48px));
  justify-items: center;
  gap: 8px;
  padding: 26px;
  border: 1px dashed var(--studio-border-strong);
  border-radius: 14px;
  color: var(--studio-text-2);
  background: rgba(255, 255, 255, .76);
  cursor: pointer;
  transform: translate(-50%, -50%);
}

.designer-canvas__empty > span,
.designer-properties__empty > span {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 14px;
  color: var(--studio-primary-strong);
  background: #eaf3ff;
}

.designer-canvas__empty strong {
  font-size: 13px;
}

.designer-canvas__empty small {
  color: var(--studio-text-3);
  font-size: 10px;
  text-align: center;
}

.property-form {
  display: grid;
  gap: 15px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  padding: 14px;
}

.property-field {
  display: grid;
  gap: 7px;
}

.property-field > span,
.property-layout legend,
.property-colors legend {
  color: var(--studio-text-2);
  font-size: 11px;
  font-weight: 740;
}

.property-field > small {
  color: var(--studio-text-3);
  font-size: 9px;
  line-height: 1.4;
}

.property-field input,
.property-field select,
.property-field textarea,
.property-layout input {
  width: 100%;
  min-height: 36px;
  padding: 7px 10px;
  border: 1px solid var(--studio-border);
  border-radius: 10px;
  color: var(--studio-text);
  background: var(--studio-surface);
}

.property-field select[multiple] {
  min-height: 76px;
}

.property-field textarea {
  resize: vertical;
  line-height: 1.5;
}

.property-layout,
.property-colors {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
  padding: 12px;
  border: 1px solid var(--studio-border);
  border-radius: 12px;
}

.property-layout legend,
.property-colors legend {
  padding: 0 5px;
}

.property-layout label,
.property-colors label {
  display: grid;
  gap: 5px;
  color: var(--studio-text-3);
  font-size: 9px;
}

.property-layout input {
  min-width: 0;
}

.color-control {
  display: flex;
  min-height: 34px;
  align-items: center;
  gap: 7px;
  padding: 5px 7px;
  border: 1px solid var(--studio-border);
  border-radius: 10px;
}

.color-control input {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
}

.color-control code {
  overflow: hidden;
  color: var(--studio-text-3);
  font-size: 9px;
  text-overflow: ellipsis;
}

.property-colors .property-check {
  display: flex;
  grid-column: span 2;
  min-height: 30px;
  align-items: center;
  gap: 8px;
}

.property-check input {
  width: 15px;
  height: 15px;
  accent-color: var(--studio-primary);
}

.property-actions {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  padding-top: 3px;
}

.property-actions button {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid var(--studio-border);
  border-radius: 10px;
  color: var(--studio-text-2);
  background: var(--studio-surface);
  cursor: pointer;
  font-size: 10px;
  font-weight: 720;
}

.property-actions button:hover {
  border-color: var(--studio-border-strong);
  color: var(--studio-primary-strong);
  background: var(--studio-surface-soft);
}

.property-actions .is-danger {
  color: #d9363e;
}

.designer-properties__empty {
  display: grid;
  flex: 1;
  align-content: center;
  justify-items: center;
  gap: 8px;
  padding: 24px;
  color: var(--studio-text-3);
  text-align: center;
}

.designer-properties__empty strong {
  color: var(--studio-text-2);
  font-size: 12px;
}

.designer-properties__empty p {
  margin: 0;
  font-size: 10px;
  line-height: 1.5;
}

.designer-preview {
  position: absolute;
  z-index: 100;
  inset: 0;
  width: 100vw;
  height: 100dvh;
  overflow: hidden;
  background: #eaf2fc;
}

.designer-preview__back {
  position: fixed;
  z-index: 130;
  top: 18px;
  left: 18px;
  display: inline-flex;
  width: 42px;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid rgba(199, 217, 246, .92);
  border-radius: 12px;
  color: #16345d;
  background: rgba(255, 255, 255, .94);
  box-shadow: 0 10px 26px rgba(18, 62, 119, .14);
  backdrop-filter: blur(12px);
  cursor: pointer;
}

.designer-preview__back:hover {
  border-color: #a9cfff;
  color: #1677ff;
  background: #fff;
}

@keyframes studio-pulse {
  to { opacity: .42; transform: scale(.78); }
}

@keyframes studio-status-in {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: translateY(0); }
}

@container (max-width: 1160px) {
  .designer-workspace {
    grid-template-columns: 64px minmax(520px, 1fr) 262px;
  }

  .designer-palette__list {
    padding: 8px;
  }

  .designer-palette__item {
    display: flex;
    min-height: 46px;
    justify-content: center;
    padding: 4px;
  }

  .designer-palette__copy,
  .designer-palette__plus,
  .designer-palette__source,
  .designer-palette .designer-panel__heading div,
  .designer-palette .designer-panel__count {
    display: none;
  }

  .designer-palette .designer-panel__heading {
    min-height: 48px;
    justify-content: center;
    padding: 5px;
  }

  .designer-palette .designer-panel__heading::after {
    color: var(--studio-text-3);
    content: "组件";
    font-size: 9px;
    writing-mode: vertical-rl;
  }

  .designer-toolbar {
    grid-template-columns: minmax(180px, 1fr) auto;
  }

  .designer-toolbar__status {
    display: none;
  }
}

@container (max-width: 840px) {
  .designer-toolbar {
    grid-template-columns: minmax(160px, 1fr) auto;
    gap: 8px;
  }

  .designer-toolbar__actions .studio-button span {
    display: none;
  }

  .designer-toolbar__panel-button {
    display: inline-flex;
  }

  .designer-workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .designer-panel {
    position: absolute;
    z-index: 20;
    top: 12px;
    bottom: 12px;
    width: min(292px, calc(100% - 28px));
    visibility: hidden;
    opacity: 0;
    box-shadow: 0 18px 46px rgba(24, 77, 145, .18);
    transform: translateX(-108%);
    transition: opacity 160ms cubic-bezier(.2, 0, 0, 1), transform 160ms cubic-bezier(.2, 0, 0, 1);
  }

  .designer-palette {
    left: 12px;
  }

  .designer-properties {
    right: 12px;
    transform: translateX(108%);
  }

  .designer-panel.is-drawer-open {
    visibility: visible;
    opacity: 1;
    transform: translateX(0);
  }

  .designer-palette__copy,
  .designer-palette__plus,
  .designer-palette__source,
  .designer-palette .designer-panel__heading div,
  .designer-palette .designer-panel__count {
    display: initial;
  }

  .designer-palette__item {
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr) 16px;
    justify-content: initial;
    min-height: 58px;
    padding: 9px;
  }

  .designer-palette .designer-panel__heading {
    min-height: 60px;
    justify-content: space-between;
    padding: 11px 14px;
  }

  .designer-palette .designer-panel__heading::after {
    display: none;
  }
}

@container (max-width: 560px) {
  .xs-dashboard-designer {
    min-height: 100dvh;
    border-radius: 0;
  }

  .designer-toolbar {
    min-height: 58px;
    padding: 7px;
  }

  .designer-toolbar__eyebrow,
  .designer-toolbar__actions .studio-button--preview,
  .designer-canvas-meta__hint {
    display: none;
  }

  .designer-toolbar__title input {
    width: 105px;
    font-size: 13px;
  }

  .studio-button {
    width: 38px;
    padding: 0;
    font-size: 0;
  }

  .designer-workspace {
    gap: 8px;
    padding: 8px;
  }

  .designer-canvas-meta {
    min-height: 76px;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
    padding: 6px 8px;
  }

  .designer-canvas-meta__resolution {
    width: 100%;
  }

  .designer-canvas-meta__resolution select {
    min-width: 0;
    flex: 1;
  }

  .designer-canvas-meta__zoom {
    width: 100%;
    justify-content: flex-end;
  }

  .designer-canvas-meta__zoom .designer-canvas-meta__fit {
    margin-right: auto;
  }

  .designer-canvas-scroll {
    padding: 10px;
  }

}

@media (pointer: coarse) {
  .icon-button,
  .studio-button,
  .property-actions button,
  .property-field input,
  .property-field select {
    min-height: 44px;
  }
}

@media (max-width: 560px) {
  .designer-preview__back {
    top: 12px;
    left: 12px;
    width: 42px;
    min-height: 42px;
    justify-content: center;
    padding: 0;
  }

}

@media (prefers-reduced-motion: reduce) {
  .designer-toolbar__status[data-state="saving"] > span {
    animation: none;
  }

  .designer-panel,
  .icon-button,
  .studio-button {
    transition: none;
  }
}

/* Original workbench editor parity: dense two-level chrome, rulers and inspector tabs. */
.designer-toolbar {
  display: flex;
  min-height: 68px;
  justify-content: space-between;
  gap: 20px;
  padding: 8px 18px;
  background: rgba(255, 255, 255, .98);
}

.designer-toolbar__identity {
  flex: 1 1 auto;
  gap: 14px;
}

.designer-toolbar__back {
  flex: 0 0 auto;
  color: var(--studio-text);
  background: transparent;
}

.designer-toolbar__identity h2 {
  flex: 0 0 auto;
  margin: 0 6px 0 0;
  color: var(--studio-text);
  font-size: 18px;
  font-weight: 790;
  letter-spacing: -.02em;
  white-space: nowrap;
}

.designer-toolbar__name-field {
  display: grid;
  grid-template-columns: auto minmax(160px, 280px);
  min-width: 0;
  align-items: center;
  gap: 9px;
  padding: 4px 5px 4px 12px;
  border: 1px solid var(--studio-border);
  border-radius: 10px;
  background: var(--studio-surface-soft);
}

.designer-toolbar__name-field > span {
  color: var(--studio-text-3);
  font-size: 11px;
  font-weight: 720;
  white-space: nowrap;
}

.designer-toolbar__name-field input {
  width: 100%;
  height: 32px;
  min-width: 0;
  padding: 0 10px;
  border: 0;
  border-radius: 7px;
  color: var(--studio-text);
  background: #fff;
  box-shadow: inset 0 0 0 1px rgba(199, 217, 246, .72);
  font-size: 13px;
  font-weight: 720;
}

.designer-toolbar__status {
  min-width: 0;
  justify-content: flex-start;
  gap: 7px;
}

.designer-toolbar__status div {
  display: flex;
  align-items: center;
  gap: 7px;
}

.designer-toolbar__status strong {
  padding: 4px 7px;
  border-radius: 6px;
  color: #087f5b;
  background: #e7f8f2;
}

.designer-toolbar__status small {
  max-width: 150px;
}

.designer-toolbar__actions {
  flex: 0 0 auto;
  gap: 9px;
}

.designer-toolbar__actions .studio-button {
  min-height: 42px;
  padding-inline: 15px;
}

.designer-toolbar__more {
  margin-left: 3px;
  background: transparent;
}

.designer-commandbar {
  position: relative;
  z-index: 9;
  display: flex;
  min-width: 0;
  min-height: 50px;
  align-items: center;
  gap: 5px;
  padding: 7px 14px 7px 248px;
  border-bottom: 1px solid var(--studio-border);
  background: rgba(255, 255, 255, .96);
}

.designer-commandbar__group {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.designer-commandbar button,
.designer-commandbar select,
.designer-commandbar input {
  min-height: 34px;
  border: 1px solid transparent;
  border-radius: 7px;
  color: var(--studio-text-2);
  background: transparent;
  font-size: 11px;
  font-weight: 680;
}

.designer-commandbar button {
  display: inline-grid;
  min-width: 34px;
  place-items: center;
  padding: 0 8px;
  cursor: pointer;
}

.designer-commandbar button:hover:not(:disabled),
.designer-commandbar button.is-active {
  border-color: var(--studio-border);
  color: var(--studio-primary-strong);
  background: #eef5ff;
}

.designer-commandbar button:disabled {
  color: #aab7c8;
  cursor: not-allowed;
}

.designer-commandbar__divider {
  width: 1px;
  height: 22px;
  margin: 0 5px;
  background: var(--studio-border);
}

.designer-commandbar__spacer {
  flex: 1 1 auto;
  min-width: 8px;
}

.designer-commandbar__clear {
  min-width: 46px !important;
  border-color: var(--studio-border) !important;
  background: #fff !important;
}

.designer-commandbar__resolution select {
  width: 176px;
  padding: 0 30px 0 10px;
  border-color: var(--studio-border);
  background: #fff;
}

.designer-commandbar__custom-size {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.designer-commandbar__custom-size input {
  width: 66px;
  padding: 0 6px;
  border-color: var(--studio-border);
  background: #fff;
}

.designer-commandbar__custom-size span {
  color: var(--studio-text-3);
  font-size: 11px;
}

.designer-commandbar__grid-toggle {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 5px;
  padding: 0 7px;
  color: var(--studio-text-3);
  cursor: pointer;
  font-size: 11px;
  font-weight: 680;
  white-space: nowrap;
}

.designer-commandbar__grid-toggle input {
  width: 14px;
  min-height: 14px;
  margin: 0;
  accent-color: var(--studio-primary);
}

.designer-workspace {
  grid-template-columns: 248px minmax(480px, 1fr) 328px;
  gap: 0;
  padding: 0;
  background: #e8f0fa;
}

.designer-panel,
.designer-canvas-viewport {
  border-width: 0 1px 0 0;
  border-radius: 0;
}

.designer-properties {
  border-right: 0;
  border-left: 1px solid var(--studio-border);
}

.designer-panel__heading {
  min-height: 46px;
  padding: 0 14px;
  background: #fff;
}

.designer-panel__heading > span {
  font-size: 13px;
  font-weight: 760;
}

.designer-palette .designer-panel__heading::after {
  display: none;
  content: none;
}

.designer-palette__search {
  display: flex;
  min-height: 34px;
  align-items: center;
  gap: 7px;
  margin: 10px 12px 7px;
  padding: 0 9px;
  border: 1px solid var(--studio-border);
  border-radius: 8px;
  color: var(--studio-text-3);
  background: var(--studio-surface-soft);
}

.designer-palette__search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  color: var(--studio-text-2);
  background: transparent;
  font-size: 11px;
}

.designer-palette__list {
  display: block;
  padding: 0 11px 12px;
}

.designer-palette__group {
  padding: 6px 0 10px;
  border-bottom: 1px solid #edf3fb;
}

.designer-palette__group:last-child {
  border-bottom: 0;
}

.designer-palette__group h3 {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0 0 8px;
  color: var(--studio-text-2);
  font-size: 11px;
  font-weight: 740;
}

.designer-palette__group h3 span {
  color: var(--studio-text-3);
  font-size: 9px;
}

.designer-palette__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}

.designer-palette__item {
  display: grid;
  grid-template-columns: 1fr;
  min-height: 68px;
  justify-items: center;
  gap: 5px;
  padding: 8px 4px 7px;
  border-radius: 8px;
  text-align: center;
}

.designer-palette__item:active {
  cursor: grabbing;
  transform: scale(.98);
}

.designer-palette__icon {
  width: 34px;
  height: 32px;
  border: 0;
  border-radius: 7px;
  background: #f1f6ff;
}

.designer-palette__item strong {
  overflow: hidden;
  width: 100%;
  color: var(--studio-text-2);
  font-size: 10px;
  font-weight: 690;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.designer-palette__empty {
  padding: 30px 10px;
  color: var(--studio-text-3);
  font-size: 11px;
  text-align: center;
}

.designer-palette__source {
  display: flex;
  margin: auto 12px 12px;
  border-radius: 8px;
}

.designer-canvas-viewport {
  position: relative;
  border-right: 0;
  background: #e8f0fa;
}

.designer-canvas-ruler--horizontal {
  display: grid;
  grid-template-columns: 118px minmax(0, 1fr);
  min-height: 30px;
  align-items: stretch;
  border-bottom: 1px solid #d7e2f1;
  color: #6d7f98;
  background: #eef4fb;
  font-size: 9px;
  font-variant-numeric: tabular-nums;
}

.designer-canvas-ruler__corner {
  display: flex;
  align-items: center;
  padding-left: 12px;
  border-right: 1px solid #d7e2f1;
  font-size: 10px;
  font-weight: 720;
}

.designer-canvas-ruler--horizontal > div {
  position: relative;
  overflow: hidden;
  background: repeating-linear-gradient(90deg, transparent 0 19px, rgba(92, 118, 151, .2) 19px 20px);
}

.designer-canvas-ruler--horizontal > div span {
  position: absolute;
  top: 5px;
  transform: translateX(-50%);
}

.designer-canvas-scroll {
  padding: 22px 22px 82px;
  background:
    linear-gradient(rgba(112, 147, 191, .08) 1px, transparent 1px) 0 0 / 20px 20px,
    linear-gradient(90deg, rgba(112, 147, 191, .08) 1px, transparent 1px) 0 0 / 20px 20px,
    #e8f0fa;
}

.designer-canvas-scroll.is-pan-mode {
  cursor: grab;
}

.designer-canvas-scroll.is-panning {
  cursor: grabbing;
  user-select: none;
}

.designer-canvas-stage-shell {
  display: flex;
  min-width: max-content;
  align-items: flex-start;
  margin: 0 auto;
}

.designer-canvas-ruler--vertical {
  position: relative;
  width: 28px;
  flex: 0 0 28px;
  margin-right: 7px;
  overflow: hidden;
  border-right: 1px solid #cddbea;
  color: #6d7f98;
  background: repeating-linear-gradient(transparent 0 19px, rgba(92, 118, 151, .22) 19px 20px);
  font-size: 8px;
}

.designer-canvas-ruler--vertical span {
  position: absolute;
  right: 5px;
  transform: translateY(-50%);
  writing-mode: vertical-rl;
}

.designer-canvas {
  border-radius: 2px;
  box-shadow: 0 18px 44px rgba(24, 77, 145, .15);
}

.designer-canvas::before {
  display: none;
}

.designer-canvas.is-grid-visible {
  background-image:
    linear-gradient(rgba(111, 151, 205, .08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(111, 151, 205, .08) 1px, transparent 1px);
  background-size: 40px 40px;
}

.designer-canvas-zoom {
  position: absolute;
  z-index: 15;
  bottom: 18px;
  left: 50%;
  display: inline-flex;
  min-height: 46px;
  align-items: center;
  gap: 4px;
  padding: 5px 7px;
  border: 1px solid rgba(199, 217, 246, .94);
  border-radius: 11px;
  background: rgba(255, 255, 255, .96);
  box-shadow: 0 12px 28px rgba(8, 26, 58, .16);
  transform: translateX(-50%);
  backdrop-filter: blur(12px);
}

.designer-canvas-zoom button,
.designer-canvas-zoom select {
  display: grid;
  min-width: 32px;
  height: 34px;
  place-items: center;
  padding: 0 8px;
  border: 0;
  border-radius: 7px;
  color: var(--studio-text-2);
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  font-weight: 720;
}

.designer-canvas-zoom select {
  min-width: 64px;
  padding: 0 5px;
  font-size: 11px;
  text-align: center;
}

.designer-canvas-zoom button:hover,
.designer-canvas-zoom button.is-active {
  color: var(--studio-primary-strong);
  background: #edf5ff;
}

.designer-canvas-zoom > span {
  width: 1px;
  height: 22px;
  margin: 0 2px;
  background: var(--studio-border);
}

.designer-canvas-zoom small {
  min-width: 0;
  color: var(--studio-primary-strong);
  font-size: 9px;
}

.property-tabs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  min-height: 48px;
  padding: 0 8px;
  border-bottom: 1px solid var(--studio-border);
  background: #fff;
}

.property-tabs button {
  position: relative;
  border: 0;
  color: var(--studio-text-3);
  background: transparent;
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
}

.property-tabs button::after {
  position: absolute;
  right: 13px;
  bottom: -1px;
  left: 13px;
  height: 2px;
  border-radius: 2px 2px 0 0;
  content: "";
  background: transparent;
}

.property-tabs button.is-active {
  color: var(--studio-primary-strong);
}

.property-tabs button.is-active::after {
  background: var(--studio-primary);
}

.property-form {
  align-content: start;
  gap: 16px;
  padding: 14px;
  animation: studio-property-in 140ms cubic-bezier(.2, 0, 0, 1) backwards;
}

.property-selection-summary {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 32px;
  align-items: center;
  gap: 9px;
  padding: 10px;
  border: 1px solid #e0eafa;
  border-radius: 9px;
  background: #f7faff;
}

.property-selection-summary > span,
.property-selection-summary > button {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 7px;
  color: var(--studio-primary-strong);
  background: #eaf3ff;
}

.property-selection-summary > button {
  cursor: pointer;
}

.property-selection-summary div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.property-selection-summary strong,
.property-selection-summary small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.property-selection-summary strong {
  color: var(--studio-text-2);
  font-size: 11px;
}

.property-selection-summary small {
  color: var(--studio-text-3);
  font-size: 9px;
}

.property-layout,
.property-colors {
  gap: 10px;
  border-radius: 9px;
  background: #fbfdff;
}

.property-align {
  display: grid;
  gap: 8px;
}

.property-align > span {
  color: var(--studio-text-2);
  font-size: 10px;
  font-weight: 720;
}

.property-align > div {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 5px;
}

.property-align button {
  display: grid;
  height: 34px;
  place-items: center;
  padding: 0;
  border: 1px solid var(--studio-border);
  border-radius: 7px;
  color: var(--studio-text-3);
  background: #fff;
  cursor: pointer;
}

.property-align button:hover {
  color: var(--studio-primary-strong);
  background: #edf5ff;
}

.property-lock-row {
  display: flex;
  min-height: 42px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 11px;
  border: 1px solid var(--studio-border);
  border-radius: 9px;
  color: var(--studio-text-2);
  background: #fff;
  font-size: 10px;
  font-weight: 680;
}

.property-lock-row span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.property-lock-row input {
  accent-color: var(--studio-primary);
}

.property-empty-state {
  padding: 26px 14px;
  border: 1px dashed var(--studio-border-strong);
  border-radius: 9px;
  color: var(--studio-text-3);
  background: var(--studio-surface-soft);
  font-size: 11px;
  text-align: center;
}

.property-actions {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid #edf3fb;
}

.designer-properties__empty {
  animation: studio-property-in 140ms cubic-bezier(.2, 0, 0, 1) backwards;
}

@keyframes studio-property-in {
  from { opacity: 0; transform: translateX(4px); }
  to { opacity: 1; transform: translateX(0); }
}

@container (max-width: 1320px) {
  .designer-toolbar__identity h2 {
    display: none;
  }

  .designer-toolbar__name-field {
    grid-template-columns: minmax(150px, 240px);
    padding-left: 5px;
  }

  .designer-toolbar__name-field > span,
  .designer-toolbar__status small,
  .designer-commandbar__align {
    display: none;
  }

  .designer-commandbar {
    padding-left: 208px;
  }

  .designer-workspace {
    grid-template-columns: 208px minmax(450px, 1fr) 292px;
  }

  .designer-palette__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container (max-width: 1040px) {
  .designer-commandbar {
    padding-left: 12px;
  }

  .designer-commandbar__grid-toggle {
    display: none;
  }

  .designer-workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .designer-toolbar__panel-button {
    display: inline-flex;
  }

  .designer-panel {
    position: absolute;
    z-index: 30;
    top: 0;
    bottom: 0;
    width: min(320px, calc(100% - 24px));
    visibility: hidden;
    opacity: 0;
    box-shadow: 0 18px 46px rgba(24, 77, 145, .2);
    transition: opacity 160ms cubic-bezier(.2, 0, 0, 1), transform 160ms cubic-bezier(.2, 0, 0, 1);
  }

  .designer-palette {
    left: 0;
    transform: translateX(-104%);
  }

  .designer-properties {
    right: 0;
    transform: translateX(104%);
  }

  .designer-panel.is-drawer-open {
    visibility: visible;
    opacity: 1;
    transform: translateX(0);
  }
}

@container (max-width: 720px) {
  .designer-toolbar {
    min-height: 60px;
    padding: 7px 8px;
  }

  .designer-toolbar__name-field {
    grid-template-columns: minmax(96px, 150px);
  }

  .designer-toolbar__status,
  .designer-toolbar__actions .studio-button--preview,
  .designer-toolbar__more,
  .designer-commandbar__divider,
  .designer-commandbar__clear,
  .designer-commandbar__custom-size {
    display: none;
  }

  .designer-toolbar__actions .studio-button {
    width: 38px;
    min-height: 38px;
    padding: 0;
    font-size: 0;
  }

  .designer-commandbar {
    min-height: 44px;
    overflow-x: auto;
    padding: 5px 8px;
  }

  .designer-canvas-scroll {
    padding: 14px 10px 78px;
  }

  .designer-canvas-ruler--horizontal {
    grid-template-columns: 92px minmax(0, 1fr);
  }

  .designer-canvas-zoom {
    bottom: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .designer-toolbar__status small,
  .property-form,
  .designer-properties__empty {
    animation: none;
  }
}
</style>

<style scoped src="./dashboardDesignerOriginal.css"></style>
