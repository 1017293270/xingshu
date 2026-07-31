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
  PhDatabase,
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
  PhSparkle,
  PhStar,
  PhTable,
  PhTextT,
  PhTrash
} from "@phosphor-icons/vue";
import type {
  LayoutPlan,
  QueryAsset,
  QueryExecution,
  QueryExecutionOutput,
  QueryParameterDefinition,
  QueryVersion,
  RefreshPolicy,
  RelativeTimePreset
} from "@/types/analytics";
import type {
  DashboardDataBinding,
  DashboardModule,
  DashboardRecord,
  DashboardSchema,
  DashboardWidget,
  DashboardWidgetMapping,
  DashboardWidgetPosition,
  DashboardWidgetType
} from "@/types/dashboardStudio";
import { queryAssetFeatureEnabled } from "@/config/features";
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
import { inferDashboardBindingColumns } from "../core/dashboardWidgetData";
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
  appendQueryAssetChart,
  removeQueryAssetChart
} from "@/services/dashboardModuleService";
import { readDataHubSession } from "@/services/dataHubSession";
import { createLayoutRequest, solveDashboardLayout, widgetSemanticRole } from "../core/dashboardLayoutSolver";
import {
  compressDashboardBackgroundImage,
  resolveCanvasBackgroundStyle
} from "../core/dashboardCanvasBackground";
import type { DashboardDesignerDataActions } from "./mountDashboardDesigner";
import ColorField from "../original/designer/ColorField.vue";
import ChartThemePicker from "../original/designer/ChartThemePicker.vue";
import ChartTypePicker from "../original/designer/ChartTypePicker.vue";
import DashboardWidgetCard from "./DashboardWidgetCard.vue";

type SaveHandler = (
  schema: DashboardSchema,
  expectedRevision: number,
  visibility: "PRIVATE" | "SPACE"
) => Promise<DashboardRecord>;
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
  initialVisibility?: "PRIVATE" | "SPACE";
  initialResourcePanel?: "assets";
  initialAssetId?: string;
  saveDraft: SaveHandler;
  publishDashboard: SaveHandler;
  dataActions: DashboardDesignerDataActions;
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
let settlingWidgetTimer: number | null = null;
const revision = ref(props.initialRevision ?? 0);
const recordStatus = ref(props.initialStatus ?? "draft");
const dashboardVisibility = ref<"PRIVATE" | "SPACE">(props.initialVisibility ?? "PRIVATE");
const currentUserId = readDataHubSession().userId;
const lifecycle = ref<DesignerLifecycle>(recordStatus.value === "published" ? "published" : "saved");
const activeSaveIntent = ref<"draft" | "publish" | null>(null);
const errorMessage = ref("");
const shouldOpenInitialAssets = queryAssetFeatureEnabled && props.initialResourcePanel === "assets";
const activeDrawer = ref<"palette" | "property" | null>(shouldOpenInitialAssets ? "palette" : null);
const paletteTab = ref<"components" | "assets">(shouldOpenInitialAssets ? "assets" : "components");
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

function markWidgetSettling(widgetId: string) {
  settlingWidgetId.value = widgetId;
  if (settlingWidgetTimer !== null) window.clearTimeout(settlingWidgetTimer);
  settlingWidgetTimer = window.setTimeout(() => {
    if (settlingWidgetId.value === widgetId) settlingWidgetId.value = "";
    settlingWidgetTimer = null;
  }, 520);
}
let suspendChanges = false;

const historyPast = ref<DashboardSchema[]>([]);
const historyFuture = ref<DashboardSchema[]>([]);
const hasPendingHistory = ref(false);
const assetSearch = ref("");
const assetScope = ref<"ALL" | "PRIVATE" | "SPACE">("ALL");
const assetState = ref<"idle" | "loading" | "success" | "error">("idle");
const assetError = ref("");
const queryAssets = ref<QueryAsset[]>([]);
const selectedAssetId = ref("");
const selectedAssetParameters = reactive<Record<string, unknown>>({});
const selectedOutputKey = ref("");
const assetPreview = ref<QueryExecution | null>(null);
const assetAction = ref<"preview" | "add" | "visibility" | null>(null);
const moduleAction = ref<"refresh" | "reask" | "upgrade" | "schedule" | null>(null);
const versionAsset = ref<QueryAsset | null>(null);
const reaskQuestion = ref("");
const showVersionDialog = ref(false);
const candidateColumnMappings = reactive<Record<string, Record<string, string>>>({});
const candidateOutputKeys = reactive<Record<string, string>>({});
const schedulePolicy = ref<RefreshPolicy>("MANUAL");
const scheduleTime = ref("08:00");
const scheduleDayOfWeek = ref(1);
const showScheduleDialog = ref(false);
const layoutPlan = ref<LayoutPlan | null>(null);
const layoutPreviewSchema = ref<DashboardSchema | null>(null);
const showLayoutDialog = ref(false);
const layoutPlanning = ref(false);
const canvasNotice = ref("");
const canvasBackgroundUploading = ref(false);
const canvasBackgroundInput = ref<HTMLInputElement | null>(null);
const relativeTimeOptions: Array<{ value: RelativeTimePreset; label: string }> = [
  { value: "TODAY", label: "今天" },
  { value: "YESTERDAY", label: "昨天" },
  { value: "THIS_WEEK", label: "本周" },
  { value: "LAST_WEEK", label: "上周" },
  { value: "THIS_MONTH", label: "本月" },
  { value: "LAST_MONTH", label: "上月" },
  { value: "LAST_30_DAYS", label: "近 30 天" },
  { value: "THIS_YEAR", label: "今年" },
  { value: "LAST_YEAR", label: "去年" }
];

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
type QueryAssetChartEntry = {
  widget: DashboardWidget;
  module: DashboardModule;
};
const queryAssetCharts = computed<QueryAssetChartEntry[]>(() => {
  const modules = Object.values(schema.modules ?? {}).filter((module) => module.source.kind === "query-asset");
  return schema.widgets.flatMap((widget) => {
    const module = modules.find((item) =>
      item.id === widget.moduleId || item.widgetIds.includes(widget.id)
    );
    return module ? [{ widget, module }] : [];
  });
});
const selectedAsset = computed(() => queryAssets.value.find((asset) => asset.id === selectedAssetId.value));
const selectedModuleAsset = computed(() => {
  const assetId = selectedBinding.value?.sourceRef?.assetId;
  return assetId ? queryAssets.value.find((asset) => asset.id === assetId) : undefined;
});
const candidateVersions = computed(() =>
  (versionAsset.value?.versions ?? []).filter((version) => version.status === "CANDIDATE")
);
const usedModuleColumns = computed(() => {
  const bindingId = selectedWidget.value?.bindingId;
  const binding = selectedBinding.value;
  if (!bindingId || !binding) return [];
  const ids = new Set<string>();
  const addKey = (key?: string) => {
    const id = binding.table.columns.find((column) => column.key === key)?.columnId;
    if (id) ids.add(id);
  };
  schema.widgets.filter((widget) => widget.bindingId === bindingId).forEach((widget) => {
    const mapping = widget.mapping;
    if (mapping.dimensionColumnId) ids.add(mapping.dimensionColumnId); else addKey(mapping.dimensionKey);
    if (mapping.metricColumnIds?.length) mapping.metricColumnIds.forEach((id) => ids.add(id));
    else mapping.metricKeys?.forEach(addKey);
  });
  return Array.from(ids).map((columnId) => {
    const column = binding.table.columns.find((item) => item.columnId === columnId);
    return { columnId, key: column?.key ?? columnId, label: column?.title ?? column?.key ?? columnId };
  });
});
const paletteGroups = computed(() => [{ label: "组件", items: paletteItems }]);
const allColumns = computed(() => selectedBinding.value?.table.columns ?? []);
const selectedBindingColumns = computed(() => inferDashboardBindingColumns(selectedBinding.value));
const numericColumns = computed(() => selectedBindingColumns.value.numericColumns);
const dimensionColumns = computed(() => selectedBindingColumns.value.dimensionColumns);
const selectedDimensionColumnId = computed(() => {
  const mapping = selectedWidget.value?.mapping;
  if (!mapping) return "";
  return mapping.dimensionColumnId
    ?? allColumns.value.find((column) => column.key === mapping.dimensionKey)?.columnId
    ?? "";
});
const selectedMetricColumnIds = computed(() => {
  const mapping = selectedWidget.value?.mapping;
  if (!mapping) return [];
  return mapping.metricColumnIds?.length
    ? mapping.metricColumnIds
    : (mapping.metricKeys ?? []).map((key) => allColumns.value.find((column) => column.key === key)?.columnId)
      .filter((id): id is string => Boolean(id));
});
const orderedWidgets = computed(() =>
  [...schema.widgets].sort((left, right) => (left.style.zIndex ?? 0) - (right.style.zIndex ?? 0))
);
const canvasStyle = computed(() => ({
  width: `${schema.canvas.width}px`,
  height: `${schema.canvas.height}px`,
  ...resolveCanvasBackgroundStyle(schema.canvas),
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

async function applySchemaChange(nextSchema: DashboardSchema) {
  const current = plainSchema();
  if (historySignature(current) === historySignature(nextSchema)) return;
  clearHistoryTimer();
  historyPast.value = [...historyPast.value, clone(current)].slice(-100);
  historyFuture.value = [];
  await replaceSchema(nextSchema);
  lastCommittedSchema = clone(nextSchema);
  lifecycle.value = "dirty";
  errorMessage.value = "";
  props.onDirtyChange?.(true);
  props.onChange?.(plainSchema());
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
  if (selectedWidgetId.value) markWidgetSettling(selectedWidgetId.value);
}

async function redoChange() {
  commitPendingHistory();
  const next = historyFuture.value.at(-1);
  if (!next) return;
  historyFuture.value = historyFuture.value.slice(0, -1);
  historyPast.value = [...historyPast.value, plainSchema()].slice(-100);
  await restoreHistorySnapshot(next);
  if (selectedWidgetId.value) markWidgetSettling(selectedWidgetId.value);
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
  setCanvasZoom(getNextDashboardZoom(canvasScale.value, direction));
}

function handleZoomChange(event: Event) {
  setCanvasZoom(Number((event.target as HTMLSelectElement).value));
}

function fitCanvasToViewport() {
  isFitZoom.value = true;
  updateCanvasScale();
}

function clampWidgetsToCanvas() {
  let adjusted = 0;
  for (const widget of schema.widgets) {
    const next = clampDashboardWidgetPosition(widget.position, schema.canvas);
    if (JSON.stringify(next) !== JSON.stringify(widget.position)) {
      widget.position = next;
      adjusted += 1;
    }
  }
  canvasNotice.value = adjusted > 0 ? `已将 ${adjusted} 个越界组件移回画布` : "";
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
  clampWidgetsToCanvas();
}

function applyCustomCanvasSize() {
  resolutionMode.value = "custom";
  const width = normalizeDashboardCanvasDimension(customCanvasWidth.value, "width");
  const height = normalizeDashboardCanvasDimension(customCanvasHeight.value, "height");
  customCanvasWidth.value = width;
  customCanvasHeight.value = height;
  schema.canvas.width = width;
  schema.canvas.height = height;
  clampWidgetsToCanvas();
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
  () => {
    customCanvasWidth.value = schema.canvas.width;
    customCanvasHeight.value = schema.canvas.height;
    resolutionMode.value = resolveDashboardCanvasPreset(schema.canvas.width, schema.canvas.height)?.id ?? "custom";
    void nextTick(updateCanvasScale);
  }
);

onMounted(() => {
  window.addEventListener("beforeunload", beforeUnload);
  if (typeof ResizeObserver !== "undefined" && canvasScroll.value) {
    canvasResizeObserver = new ResizeObserver(updateCanvasScale);
    canvasResizeObserver.observe(canvasScroll.value);
  }
  void nextTick(updateCanvasScale);
  if (queryAssetFeatureEnabled) {
    void loadAssets().then(() => {
      const initialAsset = props.initialAssetId
        ? queryAssets.value.find((asset) => asset.id === props.initialAssetId)
        : undefined;
      if (initialAsset) void chooseAsset(initialAsset);
    });
  }
  emit("ready");
});

onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", beforeUnload);
  clearHistoryTimer();
  if (settlingWidgetTimer !== null) window.clearTimeout(settlingWidgetTimer);
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

function assetChartCount(assetId: string) {
  return queryAssetCharts.value.filter((entry) => entry.module.source.assetId === assetId).length;
}

function selectQueryAssetChart(widgetId: string) {
  if (!schema.widgets.some((widget) => widget.id === widgetId)) return;
  selectedWidgetId.value = widgetId;
  markWidgetSettling(widgetId);
}

async function removeDashboardQueryChart(widgetId: string) {
  const widget = schema.widgets.find((item) => item.id === widgetId);
  if (!widget || lifecycle.value === "saving") return;
  if (widget.style.locked) {
    assetError.value = "该收藏组件已锁定，请先解锁后再移除";
    return;
  }
  if (!window.confirm(`确认从当前看板移除“${widget.title}”吗？此操作可撤销。`)) return;
  await applySchemaChange(removeQueryAssetChart(plainSchema(), widgetId));
  if (selectedWidgetId.value === widgetId) selectedWidgetId.value = "";
}

function availablePosition(widgetId: string, desired: DashboardWidgetPosition) {
  void widgetId;
  return clampDashboardWidgetPosition(desired, schema.canvas);
}

function defaultMapping(
  type: DashboardWidgetType,
  binding?: DashboardDataBinding,
  previous: DashboardWidgetMapping = {}
) {
  const { numericColumns: metrics, dimensionColumns: dimensions } = inferDashboardBindingColumns(binding);
  const columns = binding?.table.columns ?? [];
  const resolveColumn = (columnId?: string, key?: string) =>
    columns.find((column) => (columnId && column.columnId === columnId) || (key && column.key === key));
  const previousMetrics = (
    previous.metricColumnIds?.length
      ? previous.metricColumnIds.map((columnId) => resolveColumn(columnId))
      : previous.metricKeys?.map((key) => resolveColumn(undefined, key))
  )?.filter((column): column is (typeof metrics)[number] =>
    Boolean(column && metrics.some((metric) => metric.key === column.key))
  ) ?? [];
  const metricCandidates = [...previousMetrics, ...metrics.filter((metric) =>
    !previousMetrics.some((previousMetric) => previousMetric.key === metric.key)
  )];
  const previousDimension = resolveColumn(previous.dimensionColumnId, previous.dimensionKey);
  const dimension = previousDimension && dimensions.some((column) => column.key === previousDimension.key)
    ? previousDimension
    : dimensions[0];

  if (type === "metric") {
    const metric = metricCandidates[0];
    return {
      metricColumnIds: metric?.columnId ? [metric.columnId] : [],
      metricKeys: metric ? [metric.key] : [],
      valueMode: previous.valueMode ?? "latest" as const,
      displayUnit: previousMetrics[0]?.key === metric?.key ? previous.displayUnit : undefined
    };
  }
  if (dashboardChartWidgetTypes.includes(type)) {
    const metricLimit = ["pie", "radar", "funnel"].includes(type) ? 1 : 2;
    const selectedMetrics = metricCandidates.slice(0, metricLimit);
    return {
      dimensionColumnId: dimension?.columnId,
      dimensionKey: dimension?.key,
      metricColumnIds: selectedMetrics
        .map((column) => column.columnId).filter((id): id is string => Boolean(id)),
      metricKeys: selectedMetrics.map((column) => column.key)
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
  markWidgetSettling(nextWidget.id);
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
  if (copy.moduleId && schema.modules?.[copy.moduleId]) {
    const module = schema.modules[copy.moduleId];
    schema.modules = {
      ...schema.modules,
      [copy.moduleId]: { ...module, widgetIds: [...module.widgetIds, copy.id] }
    };
  }
  selectedWidgetId.value = copy.id;
  markWidgetSettling(copy.id);
}

function deleteSelected() {
  if (!selectedWidget.value || selectedWidget.value.style.locked || lifecycle.value === "saving") return;
  const deletedWidget = clone(selectedWidget.value);
  const deletedWidgetId = deletedWidget.id;
  if (!schema.widgets.some((widget) => widget.id === deletedWidgetId)) return;
  schema.widgets = schema.widgets.filter((widget) => widget.id !== deletedWidgetId);
  if (deletedWidget.moduleId && schema.modules?.[deletedWidget.moduleId]) {
    const module = schema.modules[deletedWidget.moduleId];
    const remainingWidgetIds = schema.widgets
      .filter((widget) => widget.moduleId === deletedWidget.moduleId)
      .map((widget) => widget.id);
    const modules = { ...schema.modules };
    if (remainingWidgetIds.length > 0) {
      modules[deletedWidget.moduleId] = { ...module, widgetIds: remainingWidgetIds };
    } else {
      delete modules[deletedWidget.moduleId];
      const bindingStillUsed = schema.widgets.some((widget) => widget.bindingId === module.bindingId)
        || Object.values(modules).some((item) => item.bindingId === module.bindingId);
      if (!bindingStillUsed) {
        const dataBindings = { ...schema.dataBindings };
        delete dataBindings[module.bindingId];
        schema.dataBindings = dataBindings;
      }
    }
    schema.modules = modules;
  }
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
  if (copy.moduleId && schema.modules?.[copy.moduleId]) {
    const module = schema.modules[copy.moduleId];
    schema.modules = {
      ...schema.modules,
      [copy.moduleId]: { ...module, widgetIds: [...module.widgetIds, copy.id] }
    };
  }
  selectedWidgetId.value = copy.id;
  markWidgetSettling(copy.id);
}

function clearCanvas() {
  if (schema.widgets.length === 0) return;
  if (!window.confirm("确认清空画布中的全部组件吗？此操作可通过撤销恢复。")) return;
  schema.widgets = [];
  schema.modules = {};
  schema.dataBindings = {};
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

function synchronizeWidgetModuleBinding(
  widget: DashboardWidget,
  previousBindingId: string | undefined,
  binding: DashboardDataBinding | undefined
) {
  const modules = { ...(schema.modules ?? {}) };
  const currentModule = widget.moduleId
    ? modules[widget.moduleId]
    : Object.values(modules).find((module) => module.widgetIds.includes(widget.id));
  const source = binding?.sourceRef;

  if (currentModule) {
    const otherWidgetIds = schema.widgets
      .filter((item) =>
        item.id !== widget.id
        && (item.moduleId === currentModule.id || currentModule.widgetIds.includes(item.id))
      )
      .map((item) => item.id);

    if (source && binding) {
      if (otherWidgetIds.length === 0) {
        modules[currentModule.id] = {
          ...currentModule,
          title: binding.label,
          bindingId: binding.id,
          widgetIds: [widget.id],
          source: clone(toRaw(source))
        };
        widget.moduleId = currentModule.id;
      } else {
        modules[currentModule.id] = { ...currentModule, widgetIds: otherWidgetIds };
        const moduleId = createId("module");
        modules[moduleId] = {
          id: moduleId,
          title: binding.label,
          bindingId: binding.id,
          widgetIds: [widget.id],
          source: clone(toRaw(source))
        };
        widget.moduleId = moduleId;
      }
    } else {
      if (otherWidgetIds.length > 0) {
        modules[currentModule.id] = { ...currentModule, widgetIds: otherWidgetIds };
      } else {
        delete modules[currentModule.id];
      }
      widget.moduleId = undefined;
    }
  } else if (source && binding) {
    const moduleId = createId("module");
    modules[moduleId] = {
      id: moduleId,
      title: binding.label,
      bindingId: binding.id,
      widgetIds: [widget.id],
      source: clone(toRaw(source))
    };
    widget.moduleId = moduleId;
  }

  schema.modules = modules;
  if (
    previousBindingId
    && previousBindingId !== binding?.id
    && !schema.widgets.some((item) => item.bindingId === previousBindingId)
    && !Object.values(modules).some((module) => module.bindingId === previousBindingId)
  ) {
    const bindings = { ...schema.dataBindings };
    delete bindings[previousBindingId];
    schema.dataBindings = bindings;
  }
}

function handleBindingChange(event: Event) {
  const widget = selectedWidget.value;
  if (!widget || isPropertyEditingDisabled.value) return;
  const previousBindingId = widget.bindingId;
  const bindingId = (event.target as HTMLSelectElement).value;
  widget.bindingId = bindingId || undefined;
  const binding = bindingId ? schema.dataBindings[bindingId] : undefined;
  widget.mapping = binding ? defaultMapping(widget.type, binding, widget.mapping) : {};
  synchronizeWidgetModuleBinding(widget, previousBindingId, binding);
}

async function loadAssets() {
  assetState.value = "loading";
  assetError.value = "";
  try {
    queryAssets.value = await props.dataActions.listAssets({
      keyword: assetSearch.value,
      scope: assetScope.value === "ALL" ? undefined : assetScope.value
    });
    assetState.value = "success";
  } catch (error) {
    assetState.value = "error";
    assetError.value = error instanceof Error ? error.message : "收藏问数加载失败";
  }
}

async function chooseAsset(asset: QueryAsset) {
  selectedAssetId.value = asset.id;
  assetPreview.value = null;
  Object.keys(selectedAssetParameters).forEach((key) => delete selectedAssetParameters[key]);
  for (const parameter of asset.stableVersion?.parameters ?? []) {
    selectedAssetParameters[parameter.key] = parameter.defaultMode === "RELATIVE"
      ? relativeParameter(parameter,
        (typeof parameter.defaultValue === "string" ? parameter.defaultValue : parameter.relativePreset ?? "THIS_MONTH") as RelativeTimePreset)
      : parameter.defaultValue ?? "";
  }
  selectedOutputKey.value = "";
  await previewSelectedAsset(false);
}

function parameterMode(parameter: QueryParameterDefinition) {
  const value = selectedAssetParameters[parameter.key];
  if (isRelativeParameter(value)) return value.preset;
  return "FIXED";
}

function setParameterMode(parameter: QueryParameterDefinition, event: Event) {
  const mode = (event.target as HTMLSelectElement).value;
  selectedAssetParameters[parameter.key] = mode === "FIXED"
    ? ""
    : relativeParameter(parameter, mode as RelativeTimePreset);
}

function fixedParameterValue(parameter: QueryParameterDefinition) {
  const value = selectedAssetParameters[parameter.key];
  return isRelativeParameter(value) ? "" : String(value ?? "");
}

function setFixedParameterValue(parameter: QueryParameterDefinition, event: Event) {
  selectedAssetParameters[parameter.key] = (event.target as HTMLInputElement).value;
}

function relativeParameter(parameter: QueryParameterDefinition, preset: RelativeTimePreset) {
  return {
    mode: "RELATIVE" as const,
    preset,
    boundary: parameter.relativeBoundary ?? inferRelativeBoundary(parameter.key)
  };
}

function isRelativeParameter(value: unknown): value is { mode: "RELATIVE"; preset: RelativeTimePreset } {
  return typeof value === "object" && value !== null
    && (value as { mode?: string }).mode === "RELATIVE"
    && typeof (value as { preset?: unknown }).preset === "string";
}

function inferRelativeBoundary(key: string): "START" | "END" {
  return /(end|to|until|max|stop|截止|结束)/i.test(key) ? "END" : "START";
}

function formatModuleUpdatedAt(value?: string) {
  if (!value) return "尚无成功快照";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  }).format(date);
}

function queryOutputLabel(outputKey: string) {
  return selectedAsset.value?.stableVersion?.outputs.find((output) => output.outputKey === outputKey)?.label
    || outputKey;
}

function isNumericQueryOutputColumn(type?: string) {
  return typeof type === "string"
    && /^(number|numeric|decimal|integer|int|bigint|float|double|real|long|short)$/i.test(type.trim());
}

function defaultQueryOutputKey(outputs: QueryExecutionOutput[]) {
  const ranked = outputs.map((output, index) => {
    const rowCount = Math.max(output.totalRows ?? 0, output.rows.length);
    const numericColumnCount = output.columns.filter((column) =>
      isNumericQueryOutputColumn(column.type)
    ).length;
    return {
      output,
      index,
      rowCount,
      numericColumnCount,
      informationScore: rowCount * Math.max(output.columns.length, 1)
    };
  });
  const byRichness = (left: typeof ranked[number], right: typeof ranked[number]) =>
    right.informationScore - left.informationScore
    || right.numericColumnCount - left.numericColumnCount
    || left.index - right.index;

  return ranked
    .filter((candidate) => candidate.rowCount > 0 && candidate.numericColumnCount > 0)
    .sort(byRichness)[0]?.output.outputKey
    ?? ranked
      .filter((candidate) => candidate.rowCount > 0)
      .sort(byRichness)[0]?.output.outputKey
    ?? ranked.find((candidate) => candidate.output.columns.length > 0)?.output.outputKey
    ?? outputs[0]?.outputKey
    ?? "";
}

async function previewSelectedAsset(force = false) {
  const asset = selectedAsset.value;
  if (!asset?.stableVersionId) return;
  assetAction.value = "preview";
  assetError.value = "";
  try {
    assetPreview.value = await props.dataActions.previewAsset(asset.id, {
      versionId: asset.stableVersionId,
      parameters: clone(toRaw(selectedAssetParameters)),
      force
    });
    if (!selectedOutputKey.value) {
      selectedOutputKey.value = defaultQueryOutputKey(assetPreview.value.outputs);
    }
  } catch (error) {
    assetError.value = error instanceof Error ? error.message : "查询预览失败";
  } finally {
    assetAction.value = null;
  }
}

async function addSelectedAsset() {
  const asset = selectedAsset.value;
  if (!asset) return;
  assetAction.value = "add";
  assetError.value = "";
  try {
    const preview = assetPreview.value ?? await props.dataActions.previewAsset(asset.id, {
      versionId: asset.stableVersionId,
      parameters: clone(toRaw(selectedAssetParameters))
    });
    const outputKey = selectedOutputKey.value || defaultQueryOutputKey(preview.outputs);
    if (!outputKey) throw new Error("该查询资产没有可用输出");
    const result = appendQueryAssetChart(plainSchema(), asset, clone(toRaw(preview)), outputKey,
      clone(toRaw(selectedAssetParameters)));
    await applySchemaChange(result.schema);
    selectedWidgetId.value = result.widgetId;
    markWidgetSettling(result.widgetId);
    paletteTab.value = "assets";
    activePropertyTab.value = "data";
    activeDrawer.value = "property";
  } catch (error) {
    assetError.value = error instanceof Error ? error.message : "添加收藏组件失败";
  } finally {
    assetAction.value = null;
  }
}

async function toggleSelectedAssetVisibility() {
  const asset = selectedAsset.value;
  if (!asset || asset.ownerUserId !== currentUserId) return;
  assetAction.value = "visibility";
  assetError.value = "";
  try {
    const visibility = asset.visibility === "SPACE" ? "PRIVATE" : "SPACE";
    const updated = await props.dataActions.changeAssetVisibility(asset.id, visibility);
    queryAssets.value = queryAssets.value.map((item) => item.id === updated.id ? updated : item);
  } catch (error) {
    assetError.value = error instanceof Error ? error.message : "查询资产可见性修改失败";
  } finally {
    assetAction.value = null;
  }
}

async function refreshSelectedModule() {
  const binding = selectedBinding.value;
  if (!binding?.sourceRef || !selectedWidget.value?.bindingId) return;
  if (lifecycle.value === "dirty") {
    errorMessage.value = "请先保存当前布局，再刷新固定查询版本";
    return;
  }
  moduleAction.value = "refresh";
  try {
    const record = await props.dataActions.refreshModule(selectedWidget.value.bindingId);
    await replaceSchema(record.schema);
    revision.value = record.revision;
    recordStatus.value = record.status;
    lastCommittedSchema = clone(record.schema);
    lifecycle.value = record.status === "published" ? "published" : "saved";
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "刷新模块失败";
    lifecycle.value = "error";
  } finally {
    moduleAction.value = null;
  }
}

async function openReaskDialog() {
  const source = selectedBinding.value?.sourceRef;
  if (!source || source.kind !== "query-asset") return;
  if (!queryAssets.value.some((asset) => asset.id === source.assetId)) await loadAssets();
  const asset = queryAssets.value.find((item) => item.id === source.assetId);
  if (!asset) {
    errorMessage.value = "当前账号无法读取该查询资产";
    return;
  }
  versionAsset.value = asset;
  Object.keys(candidateColumnMappings).forEach((key) => delete candidateColumnMappings[key]);
  Object.keys(candidateOutputKeys).forEach((key) => delete candidateOutputKeys[key]);
  reaskQuestion.value = asset.resolvedQuestion;
  showVersionDialog.value = true;
}

async function generateCandidateVersion() {
  const source = selectedBinding.value?.sourceRef;
  if (!source || !versionAsset.value) return;
  moduleAction.value = "reask";
  try {
    versionAsset.value = await props.dataActions.reaskAsset(versionAsset.value.id, {
      baseVersionId: source.queryVersionId,
      resolvedQuestion: reaskQuestion.value,
      parameters: clone(source.parameterValues)
    });
    candidateVersions.value.forEach(ensureCandidateColumnMapping);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "重新问数失败";
  } finally {
    moduleAction.value = null;
  }
}

function ensureCandidateOutputKey(candidate: QueryVersion) {
  if (candidateOutputKeys[candidate.id]) return candidateOutputKeys[candidate.id];
  const currentOutputKey = selectedBinding.value?.sourceRef?.outputKey;
  const output = candidate.outputs.find((item) => item.outputKey === currentOutputKey) ?? candidate.outputs[0];
  candidateOutputKeys[candidate.id] = output?.outputKey ?? "";
  return candidateOutputKeys[candidate.id];
}

function candidateOutputColumns(candidate: QueryVersion) {
  const outputKey = ensureCandidateOutputKey(candidate);
  return candidate.outputs.find((output) => output.outputKey === outputKey)?.columns ?? [];
}

function updateCandidateOutput(candidate: QueryVersion, event: Event) {
  candidateOutputKeys[candidate.id] = (event.target as HTMLSelectElement).value;
  delete candidateColumnMappings[candidate.id];
  ensureCandidateColumnMapping(candidate);
}

function ensureCandidateColumnMapping(candidate: QueryVersion) {
  if (candidateColumnMappings[candidate.id]) return;
  const targetColumns = candidateOutputColumns(candidate);
  candidateColumnMappings[candidate.id] = Object.fromEntries(usedModuleColumns.value.map((source) => {
    const target = targetColumns.find((column) => column.columnId === source.columnId)
      ?? targetColumns.find((column) => column.key === source.key);
    return [source.columnId, target?.columnId ?? ""];
  }));
}

function updateCandidateColumnMapping(candidate: QueryVersion, sourceColumnId: string, event: Event) {
  ensureCandidateColumnMapping(candidate);
  candidateColumnMappings[candidate.id]![sourceColumnId] = (event.target as HTMLSelectElement).value;
}

async function promoteAndUpgrade(candidate: QueryVersion) {
  const bindingId = selectedWidget.value?.bindingId;
  const source = selectedBinding.value?.sourceRef;
  if (!bindingId || !source || !versionAsset.value) return;
  const currentVersion = versionAsset.value.versions?.find((version) => version.id === source.queryVersionId)
    ?? versionAsset.value.stableVersion;
  const schemaChanged = currentVersion?.schemaHash !== candidate.schemaHash;
  ensureCandidateColumnMapping(candidate);
  const columnMapping = candidateColumnMappings[candidate.id] ?? {};
  const targetOutputKey = ensureCandidateOutputKey(candidate);
  if (!targetOutputKey) {
    errorMessage.value = "候选版本没有可用于当前模块的输出";
    return;
  }
  if (schemaChanged && usedModuleColumns.value.some((column) => !columnMapping[column.columnId])) {
    errorMessage.value = "请先为所有正在使用的字段选择新版本映射";
    return;
  }
  if (schemaChanged && !window.confirm("新版本字段结构发生变化，确认查看差异并升级当前草稿模块吗？")) return;
  moduleAction.value = "upgrade";
  try {
    await props.dataActions.promoteVersion(versionAsset.value.id, candidate.id);
    const record = await props.dataActions.upgradeModule(bindingId, {
      queryVersionId: candidate.id,
      outputKey: targetOutputKey,
      confirmedSchemaChange: schemaChanged,
      columnMapping: schemaChanged ? clone(columnMapping) : undefined
    });
    await replaceSchema(record.schema);
    revision.value = record.revision;
    recordStatus.value = record.status;
    lastCommittedSchema = clone(record.schema);
    lifecycle.value = record.status === "published" ? "published" : "saved";
    showVersionDialog.value = false;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "版本升级失败";
  } finally {
    moduleAction.value = null;
  }
}

function openScheduleDialog() {
  if (!selectedBinding.value?.sourceRef || !selectedBinding.value.refreshable) return;
  schedulePolicy.value = "MANUAL";
  scheduleTime.value = "08:00";
  scheduleDayOfWeek.value = 1;
  showScheduleDialog.value = true;
}

async function saveModuleSchedule() {
  const bindingId = selectedWidget.value?.bindingId;
  const source = selectedBinding.value?.sourceRef;
  if (!bindingId || !source) return;
  moduleAction.value = "schedule";
  try {
    await props.dataActions.saveSchedule(bindingId, {
      assetId: source.assetId,
      queryVersionId: source.queryVersionId,
      policy: schedulePolicy.value,
      dailyTime: scheduleTime.value,
      dayOfWeek: schedulePolicy.value === "WEEKLY" ? scheduleDayOfWeek.value : undefined,
      timezone: "Asia/Shanghai",
      parameters: clone(source.parameterValues)
    });
    selectedBinding.value!.refreshPolicy = {
      mode: schedulePolicy.value === "MANUAL" ? "manual" : "scheduled",
      policy: schedulePolicy.value === "MANUAL" ? undefined : schedulePolicy.value,
      timezone: "Asia/Shanghai"
    };
    showScheduleDialog.value = false;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "刷新计划保存失败";
  } finally {
    moduleAction.value = null;
  }
}

async function previewAiLayout() {
  if (layoutPlanning.value || schema.widgets.length === 0) return;
  layoutPlanning.value = true;
  try {
    const request = createLayoutRequest(plainSchema());
    let plan: LayoutPlan;
    try {
      plan = await props.dataActions.planLayout(request);
      if (plan.intents.length !== schema.widgets.length) throw new Error("AI 排版缺少组件");
    } catch {
      // 本地兜底构图：KPI 总览带 + 首图 hero（其后最多两个组件作侧轨）+ 明细表通栏。
      let heroAssigned = false;
      let railCount = 0;
      plan = {
        source: "LOCAL",
        message: "AI 暂不可用，已使用本地整齐排版",
        intents: request.widgets.map((widget, rank) => {
          if (widget.semanticRole === "kpi") {
            return { widgetId: widget.id, section: "summary", rank, emphasis: "compact" as const };
          }
          if (widget.semanticRole === "detail") {
            return { widgetId: widget.id, section: "detail", rank, emphasis: "wide" as const };
          }
          if (widget.semanticRole === "narrative") {
            return { widgetId: widget.id, section: "main", rank, emphasis: "wide" as const, heightTier: "slim" as const };
          }
          if (!heroAssigned) {
            heroAssigned = true;
            return { widgetId: widget.id, section: "main", rank, emphasis: "hero" as const };
          }
          if (railCount < 2) {
            railCount += 1;
            return { widgetId: widget.id, section: "main", rank, emphasis: "compact" as const, placement: "rail" as const };
          }
          return { widgetId: widget.id, section: "main", rank, emphasis: "normal" as const };
        })
      };
    }
    layoutPlan.value = plan;
    layoutPreviewSchema.value = solveDashboardLayout(plainSchema(), plan.intents);
    showLayoutDialog.value = true;
  } finally {
    layoutPlanning.value = false;
  }
}

function layoutPreviewBlockStyle(widget: DashboardWidget, canvas: DashboardSchema["canvas"]) {
  return {
    left: `${widget.position.x / canvas.width * 100}%`,
    top: `${widget.position.y / canvas.height * 100}%`,
    width: `${widget.position.w / canvas.width * 100}%`,
    height: `${widget.position.h / canvas.height * 100}%`
  };
}

function layoutPreviewBlockClass(widget: DashboardWidget) {
  return `layout-preview__block--${widgetSemanticRole(widget)}`;
}

function layoutPreviewAspectRatio(source: DashboardSchema) {
  return `${source.canvas.width} / ${source.canvas.height}`;
}

function triggerCanvasBackgroundUpload() {
  canvasBackgroundInput.value?.click();
}

async function handleCanvasBackgroundUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || canvasBackgroundUploading.value) return;
  canvasBackgroundUploading.value = true;
  try {
    const dataUrl = await compressDashboardBackgroundImage(file, schema.canvas.width);
    schema.canvas.backgroundImage = { dataUrl, fit: schema.canvas.backgroundImage?.fit ?? "cover" };
    canvasNotice.value = "";
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "背景图上传失败";
    lifecycle.value = "error";
  } finally {
    canvasBackgroundUploading.value = false;
  }
}

function updateCanvasBackgroundFit(event: Event) {
  const fit = (event.target as HTMLSelectElement).value as "cover" | "contain" | "fill";
  if (schema.canvas.backgroundImage) {
    schema.canvas.backgroundImage = { ...schema.canvas.backgroundImage, fit };
  }
}

function removeCanvasBackground() {
  delete schema.canvas.backgroundImage;
}

async function applyLayoutPreview() {
  if (!layoutPreviewSchema.value) return;
  await applySchemaChange(layoutPreviewSchema.value);
  showLayoutDialog.value = false;
}

function updateMetricSelection(event: Event) {
  if (!selectedWidget.value) return;
  const select = event.target as HTMLSelectElement;
  const columnIds = Array.from(select.selectedOptions).map((option) => option.value);
  selectedWidget.value.mapping.metricColumnIds = columnIds;
  selectedWidget.value.mapping.metricKeys = columnIds
    .map((columnId) => allColumns.value.find((column) => column.columnId === columnId)?.key)
    .filter((key): key is string => Boolean(key));
}

function updateDimensionSelection(event: Event) {
  if (!selectedWidget.value) return;
  const columnId = (event.target as HTMLSelectElement).value;
  const column = allColumns.value.find((item) => item.columnId === columnId);
  selectedWidget.value.mapping.dimensionColumnId = columnId || undefined;
  selectedWidget.value.mapping.dimensionKey = column?.key;
}

function updateWidgetType(event: Event) {
  if (!selectedWidget.value) return;
  const type = (event.target as HTMLSelectElement).value as DashboardWidgetType;
  selectedWidget.value.type = type;
  selectedWidget.value.mapping = defaultMapping(type, selectedBinding.value, selectedWidget.value.mapping);
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
  selectedWidget.value.mapping = defaultMapping(variant.type, selectedBinding.value, selectedWidget.value.mapping);
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

function markDashboardVisibilityDirty() {
  if (lifecycle.value === "saving") return;
  lifecycle.value = "dirty";
  errorMessage.value = "";
  props.onDirtyChange?.(true);
}

async function save() {
  activeSaveIntent.value = "draft";
  lifecycle.value = "saving";
  errorMessage.value = "";
  try {
    const record = await props.saveDraft(plainSchema(), revision.value, dashboardVisibility.value);
    await replaceSchema(record.schema);
    revision.value = record.revision;
    recordStatus.value = record.status;
    dashboardVisibility.value = record.visibility ?? dashboardVisibility.value;
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
    const record = await props.publishDashboard(plainSchema(), revision.value, dashboardVisibility.value);
    await replaceSchema(record.schema);
    revision.value = record.revision;
    recordStatus.value = record.status;
    dashboardVisibility.value = record.visibility ?? dashboardVisibility.value;
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
          >
            <i aria-hidden="true" />
            <span :key="lifecycle" class="designer-toolbar__status-text">{{ statusLabel }}</span>
          </span>
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
        <select v-model="dashboardVisibility" class="designer-toolbar__preset-select" aria-label="看板访问范围" :disabled="lifecycle === 'saving'" @change="markDashboardVisibilityDirty">
          <option value="PRIVATE">仅自己</option>
          <option value="SPACE">空间可用</option>
        </select>
        <button
          v-if="queryAssetFeatureEnabled"
          type="button"
          class="designer-toolbar__icon-button designer-toolbar__panel-button"
          aria-label="打开收藏问数"
          :aria-pressed="activeDrawer === 'palette' && paletteTab === 'assets'"
          @click="paletteTab = 'assets'; activeDrawer = activeDrawer === 'palette' ? null : 'palette'"
        >
          <PhDatabase :size="19" aria-hidden="true" />
        </button>
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
        <button
          type="button"
          class="designer-toolbar__button designer-toolbar__layout-button"
          :disabled="layoutPlanning || lifecycle === 'saving' || schema.widgets.length === 0"
          :title="schema.widgets.length === 0 ? '先向画布添加组件' : '让 AI 将组件重新排列整齐'"
          @click="previewAiLayout"
        >
          <PhSparkle :size="15" aria-hidden="true" />
          <span>{{ layoutPlanning ? '排版中…' : 'AI 排版' }}</span>
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
          <p>{{ paletteTab === 'assets' ? '查询资产' : '组件' }}</p>
          <h2>{{ paletteTab === 'assets' ? '收藏问数' : '构建模块' }}</h2>
        </header>
        <nav class="designer-palette__tabs" aria-label="资源类型">
          <button type="button" :class="{ 'is-active': paletteTab === 'components' }" @click="paletteTab = 'components'">组件</button>
          <button v-if="queryAssetFeatureEnabled" type="button" :class="{ 'is-active': paletteTab === 'assets' }" @click="paletteTab = 'assets'; loadAssets()">收藏问数</button>
        </nav>
        <div v-if="paletteTab === 'components'" class="designer-palette__list">
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
        <div v-else class="query-asset-panel">
          <div class="query-asset-panel__browser">
            <div class="query-asset-panel__intro">
              <span>
                <strong>添加收藏组件</strong>
                <small>每次选择一条收藏和一张结果表，只添加一个可编辑组件。</small>
              </span>
              <b>{{ queryAssetCharts.length }}</b>
            </div>
            <section v-if="queryAssetCharts.length > 0" class="query-asset-panel__current">
              <header>
                <strong>当前看板组件</strong>
                <span>{{ queryAssetCharts.length }} 个</span>
              </header>
              <div class="query-asset-panel__module-list">
                <article v-for="entry in queryAssetCharts" :key="entry.widget.id">
                  <button type="button" class="query-asset-panel__module-main" @click="selectQueryAssetChart(entry.widget.id)">
                    <strong>{{ entry.widget.title }}</strong>
                    <small>
                      {{ getDashboardComponentDefinition(entry.widget.type).title }}
                      · {{ entry.module.source.outputKey }}
                      · 固定版本
                      · {{ formatModuleUpdatedAt(schema.dataBindings[entry.module.bindingId]?.lastUpdatedAt) }}
                    </small>
                  </button>
                  <button
                    type="button"
                    class="query-asset-panel__module-remove"
                    :aria-label="`移除收藏组件 ${entry.widget.title}`"
                    :disabled="lifecycle === 'saving'"
                    @click="removeDashboardQueryChart(entry.widget.id)"
                  >
                    <PhTrash :size="15" aria-hidden="true" />
                  </button>
                </article>
              </div>
            </section>
            <div class="query-asset-panel__filters">
              <label class="query-asset-panel__search-field">
                <PhMagnifyingGlass :size="14" aria-hidden="true" />
                <input v-model="assetSearch" aria-label="搜索收藏问数" placeholder="搜索问题或名称" @keyup.enter="loadAssets" />
              </label>
              <select v-model="assetScope" aria-label="收藏范围" @change="loadAssets">
                <option value="ALL">全部</option><option value="PRIVATE">仅自己</option><option value="SPACE">空间可用</option>
              </select>
              <button type="button" :disabled="assetState === 'loading'" @click="loadAssets">{{ assetState === 'loading' ? '加载中' : '搜索' }}</button>
            </div>
            <p v-if="assetError" class="query-asset-panel__error" role="alert">{{ assetError }}</p>
            <div v-if="assetState === 'success' && queryAssets.length === 0" class="query-asset-panel__empty">暂无收藏问数，请先在问数结果中收藏。</div>
            <div class="query-asset-panel__list">
              <button
                v-for="asset in queryAssets"
                :key="asset.id"
                type="button"
                :class="{ 'is-active': selectedAssetId === asset.id }"
                @click="chooseAsset(asset)"
              >
                <span class="query-asset-panel__asset-icon" aria-hidden="true"><PhStar :size="15" weight="fill" /></span>
                <span class="query-asset-panel__asset-body">
                  <strong>{{ asset.name }}</strong>
                  <span>{{ asset.resolvedQuestion }}</span>
                  <small>
                    <i>{{ asset.visibility === 'SPACE' ? '空间可用' : '仅自己' }}</i>
                    <i>v{{ asset.stableVersion?.versionNo ?? 1 }}</i>
                    <b v-if="assetChartCount(asset.id) > 0">已加入 {{ assetChartCount(asset.id) }} 个组件</b>
                  </small>
                </span>
              </button>
            </div>
          </div>
          <section v-if="selectedAsset" class="query-asset-panel__preview">
            <header><strong>组件配置</strong><span>固定 v{{ selectedAsset.stableVersion?.versionNo ?? 1 }}</span></header>
            <div class="query-asset-panel__preview-body">
              <label v-for="parameter in selectedAsset.stableVersion?.parameters ?? []" :key="parameter.key">
                <span>{{ parameter.label }}</span>
                <template v-if="parameter.type === 'DATE' || parameter.type === 'DATETIME'">
                  <div class="query-asset-panel__time-parameter">
                    <select :value="parameterMode(parameter)" :aria-label="`${parameter.label}时间模式`" @change="setParameterMode(parameter, $event)">
                      <option value="FIXED">固定日期</option>
                      <option v-for="option in relativeTimeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                    </select>
                    <input
                      v-if="parameterMode(parameter) === 'FIXED'"
                      :value="fixedParameterValue(parameter)"
                      :type="parameter.type === 'DATETIME' ? 'datetime-local' : 'date'"
                      :required="parameter.required"
                      @input="setFixedParameterValue(parameter, $event)"
                    />
                    <small v-else>由服务端按空间时区在每次刷新时重新计算</small>
                  </div>
                </template>
                <input v-else v-model="selectedAssetParameters[parameter.key]" type="text" :required="parameter.required" />
              </label>
              <label v-if="(assetPreview?.outputs.length ?? 0) > 1">
                <span>结果表</span>
                <select v-model="selectedOutputKey">
                  <option v-for="output in assetPreview?.outputs ?? []" :key="output.outputKey" :value="output.outputKey">{{ queryOutputLabel(output.outputKey) }}</option>
                </select>
              </label>
              <div v-if="assetPreview" class="query-asset-panel__summary">
                <strong>{{ assetPreview.outputs.find(output => output.outputKey === selectedOutputKey)?.totalRows ?? 0 }} 行</strong>
                <span>{{ assetPreview.durationMs }} ms · {{ assetPreview.status }}</span>
              </div>
              <details v-if="selectedAsset.stableVersion?.sqlPreview"><summary>查看只读脱敏 SQL</summary><pre>{{ selectedAsset.stableVersion.sqlPreview }}</pre></details>
            </div>
            <div class="query-asset-panel__actions">
              <button v-if="selectedAsset.ownerUserId === currentUserId" type="button" :disabled="assetAction !== null" @click="toggleSelectedAssetVisibility">{{ assetAction === 'visibility' ? '更新中' : selectedAsset.visibility === 'SPACE' ? '设为仅自己' : '共享到空间' }}</button>
              <button type="button" :disabled="assetAction !== null" @click="previewSelectedAsset(true)">{{ assetAction === 'preview' ? '刷新中' : '预览数据' }}</button>
              <button type="button" class="is-primary" :disabled="assetAction !== null || !assetPreview" @click="addSelectedAsset">
                {{ assetAction === 'add' ? '添加中' : assetChartCount(selectedAsset.id) > 0 ? '再次添加' : '添加到画布' }}
              </button>
            </div>
          </section>
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
                  <span>从“收藏问数”连续加入一个或多个问题，或从组件库添加模块。</span>
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
                  <option v-for="binding in dataBindings" :key="binding.id" :value="binding.id">{{ binding.label }}</option>
                </select>
              </label>
              <div v-if="selectedBinding?.sourceRef" class="property-source-card">
                <span>来源</span><strong>{{ selectedModuleAsset?.name ?? selectedBinding.label }}</strong>
                <span>固定版本</span><strong>{{ selectedBinding.sourceRef.queryVersionId.slice(0, 8) }}</strong>
                <span>输出</span><strong>{{ selectedBinding.sourceRef.outputKey }}</strong>
                <span>最近更新</span><strong>{{ formatModuleUpdatedAt(selectedBinding.lastUpdatedAt) }}</strong>
                <span>刷新状态</span><strong :data-status="selectedBinding.status">{{ selectedBinding.error ?? selectedBinding.status ?? '等待刷新' }}</strong>
              </div>
              <label v-if="dimensionColumns.length > 0" class="property-field">
                <span>维度</span>
                <select :value="selectedDimensionColumnId" :disabled="isPropertyEditingDisabled" @change="updateDimensionSelection">
                  <option value="">无维度</option>
                  <option v-for="column in dimensionColumns" :key="column.columnId ?? column.key" :value="column.columnId">{{ column.title }}</option>
                </select>
              </label>
              <label v-if="numericColumns.length > 0" class="property-field">
                <span>指标</span>
                <select :value="selectedMetricColumnIds" multiple :disabled="isPropertyEditingDisabled" @change="updateMetricSelection">
                  <option v-for="column in numericColumns" :key="column.columnId ?? column.key" :value="column.columnId">{{ column.title }}</option>
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

        <div v-else class="property-form designer-canvas-settings">
          <section class="property-section">
            <h3>画布尺寸</h3>
            <label class="property-field">
              <span>分辨率</span>
              <select :value="resolutionMode" :disabled="lifecycle === 'saving'" @change="handleResolutionChange">
                <option value="custom">自定义（{{ schema.canvas.width }} × {{ schema.canvas.height }}）</option>
                <option v-for="preset in dashboardCanvasPresets" :key="preset.id" :value="preset.id">{{ preset.label }} · {{ preset.width }}×{{ preset.height }}</option>
              </select>
            </label>
            <div v-if="resolutionMode === 'custom'" class="canvas-size-grid">
              <label><span>宽</span><input v-model.number="customCanvasWidth" type="number" min="960" max="7680" step="8" :disabled="lifecycle === 'saving'" aria-label="画布宽度" @keydown.enter="applyCustomCanvasSize" /></label>
              <label><span>高</span><input v-model.number="customCanvasHeight" type="number" min="540" max="4320" step="8" :disabled="lifecycle === 'saving'" aria-label="画布高度" @keydown.enter="applyCustomCanvasSize" /></label>
              <button type="button" :disabled="lifecycle === 'saving'" @click="applyCustomCanvasSize">应用尺寸</button>
            </div>
            <p class="property-hint">范围 960–7680 × 540–4320；缩小画布时越界组件会自动移回。</p>
          </section>

          <section class="property-section">
            <h3>背景</h3>
            <label class="property-field">
              <span>背景色</span>
              <input v-model="schema.canvas.background" type="color" :disabled="lifecycle === 'saving'" aria-label="画布背景色" />
            </label>
            <div class="property-field">
              <span>背景图</span>
              <input ref="canvasBackgroundInput" type="file" accept="image/*" class="sr-only" aria-hidden="true" tabindex="-1" @change="handleCanvasBackgroundUpload" />
              <div v-if="schema.canvas.backgroundImage" class="canvas-background-preview">
                <img :src="schema.canvas.backgroundImage.dataUrl" alt="画布背景图预览" />
                <div class="canvas-background-preview__meta">
                  <select :value="schema.canvas.backgroundImage.fit" :disabled="lifecycle === 'saving'" aria-label="背景图填充方式" @change="updateCanvasBackgroundFit">
                    <option value="cover">铺满</option>
                    <option value="contain">完整显示</option>
                    <option value="fill">拉伸填满</option>
                  </select>
                  <button type="button" :disabled="lifecycle === 'saving'" @click="removeCanvasBackground">移除</button>
                </div>
              </div>
              <button type="button" class="canvas-background-upload" :disabled="lifecycle === 'saving' || canvasBackgroundUploading" @click="triggerCanvasBackgroundUpload">
                {{ canvasBackgroundUploading ? '压缩上传中…' : (schema.canvas.backgroundImage ? '更换图片' : '上传背景图') }}
              </button>
            </div>
            <p v-if="canvasNotice" class="property-hint" role="status">{{ canvasNotice }}</p>
          </section>

          <div class="designer-properties__empty">
            <strong>未选择组件</strong>
            <span>选中画布中的组件可编辑其属性；此处为画布级设置。</span>
          </div>
        </div>
      </aside>
    </div>

    <div v-if="showVersionDialog" class="designer-modal-backdrop" role="presentation" @click.self="showVersionDialog = false">
      <section class="designer-modal" role="dialog" aria-modal="true" aria-labelledby="version-dialog-title">
        <header><div><p>查询版本</p><h2 id="version-dialog-title">重新问数并预览差异</h2></div><button type="button" aria-label="关闭" @click="showVersionDialog = false">×</button></header>
        <label class="designer-modal__field"><span>完整语义问题</span><textarea v-model="reaskQuestion" rows="3" maxlength="1000" /></label>
        <p class="designer-modal__hint">重新问数只会生成候选版本；当前草稿和已发布看板都不会被静默替换。</p>
        <button type="button" class="designer-modal__primary" :disabled="moduleAction !== null || !reaskQuestion.trim()" @click="generateCandidateVersion">{{ moduleAction === 'reask' ? '生成中' : '生成候选版本' }}</button>
        <div v-if="candidateVersions.length > 0" class="version-candidate-list">
          <article v-for="candidate in candidateVersions" :key="candidate.id">
            <header><strong>候选 v{{ candidate.versionNo }}</strong><span>{{ candidate.engine }} · {{ candidate.schemaHash === versionAsset?.stableVersion?.schemaHash ? '结构一致' : '结构变化' }}</span></header>
            <p class="designer-modal__candidate-question">{{ candidate.resolvedQuestion }}</p>
            <div class="version-candidate-grid">
              <span>参数</span><strong>{{ candidate.parameters.length }} 个</strong>
              <span>输出</span><strong>{{ candidate.outputs.length }} 个</strong>
              <span>字段</span><strong>{{ candidate.outputs.reduce((total, output) => total + output.columns.length, 0) }} 个</strong>
            </div>
            <label v-if="candidate.outputs.length > 0" class="designer-modal__field"><span>升级使用的输出</span><select :value="ensureCandidateOutputKey(candidate)" @change="updateCandidateOutput(candidate, $event)"><option v-for="output in candidate.outputs" :key="output.outputKey" :value="output.outputKey">{{ output.label || output.outputKey }} · {{ output.columns.length }} 字段</option></select></label>
            <details v-if="candidate.sqlPreview"><summary>只读脱敏 SQL</summary><pre>{{ candidate.sqlPreview }}</pre></details>
            <details><summary>输出字段差异</summary><ul><li v-for="output in candidate.outputs" :key="output.outputKey"><strong>{{ output.outputKey }}</strong>：{{ output.columns.map(column => column.label).join('、') }}</li></ul></details>
            <div v-if="candidate.schemaHash !== versionAsset?.stableVersion?.schemaHash && usedModuleColumns.length > 0" class="version-column-mapping">
              <strong>确认组件字段映射</strong>
              <label v-for="sourceColumn in usedModuleColumns" :key="sourceColumn.columnId">
                <span>{{ sourceColumn.label }}</span>
                <select :value="candidateColumnMappings[candidate.id]?.[sourceColumn.columnId] ?? ''" @change="updateCandidateColumnMapping(candidate, sourceColumn.columnId, $event)">
                  <option value="">请选择新字段</option>
                  <option v-for="column in candidateOutputColumns(candidate)" :key="column.columnId" :value="column.columnId">{{ column.label }}</option>
                </select>
              </label>
            </div>
            <button type="button" class="designer-modal__primary" :disabled="moduleAction !== null" @click="promoteAndUpgrade(candidate)">{{ moduleAction === 'upgrade' ? '升级中' : '确认晋升并升级草稿模块' }}</button>
          </article>
        </div>
      </section>
    </div>

    <div v-if="showScheduleDialog" class="designer-modal-backdrop" role="presentation" @click.self="showScheduleDialog = false">
      <section class="designer-modal designer-modal--compact" role="dialog" aria-modal="true" aria-labelledby="schedule-dialog-title">
        <header><div><p>刷新策略</p><h2 id="schedule-dialog-title">设置模块刷新计划</h2></div><button type="button" aria-label="关闭" @click="showScheduleDialog = false">×</button></header>
        <label class="designer-modal__field"><span>频率</span><select v-model="schedulePolicy"><option value="MANUAL">仅手动</option><option value="INTERVAL_15">每 15 分钟</option><option value="HOURLY">每小时</option><option value="DAILY">每日</option><option value="WEEKLY">每周</option></select></label>
        <label v-if="schedulePolicy === 'DAILY' || schedulePolicy === 'WEEKLY'" class="designer-modal__field"><span>执行时间</span><input v-model="scheduleTime" type="time" /></label>
        <label v-if="schedulePolicy === 'WEEKLY'" class="designer-modal__field"><span>星期</span><select v-model.number="scheduleDayOfWeek"><option :value="1">周一</option><option :value="2">周二</option><option :value="3">周三</option><option :value="4">周四</option><option :value="5">周五</option><option :value="6">周六</option><option :value="7">周日</option></select></label>
        <p class="designer-modal__hint">计划固定当前已验证查询版本，并以创建者身份重新校验权限。</p>
        <button type="button" class="designer-modal__primary" :disabled="moduleAction !== null" @click="saveModuleSchedule">{{ moduleAction === 'schedule' ? '保存中' : '保存计划' }}</button>
      </section>
    </div>

    <div v-if="showLayoutDialog && layoutPreviewSchema" class="designer-modal-backdrop" role="presentation" @click.self="showLayoutDialog = false">
      <section class="designer-modal designer-modal--layout" role="dialog" aria-modal="true" aria-labelledby="layout-dialog-title">
        <header><div><p>{{ layoutPlan?.source === 'AI' ? 'AI 语义规划' : '本地规则' }}</p><h2 id="layout-dialog-title">预览整齐排版</h2></div><button type="button" aria-label="关闭" @click="showLayoutDialog = false">×</button></header>
        <p class="designer-modal__hint">{{ layoutPlan?.message }}。只调整位置、尺寸和阅读顺序；标题、图表类型、字段绑定和锁定组件保持不变。</p>
        <div class="layout-preview-summary"><strong>{{ layoutPreviewSchema.widgets.length }}</strong><span>个组件参与排版</span><strong>{{ layoutPreviewSchema.widgets.filter(widget => widget.style.locked).length }}</strong><span>个锁定组件原位保留</span></div>
        <div class="layout-preview-compare">
          <figure class="layout-preview__pane">
            <figcaption>当前布局</figcaption>
            <div class="layout-preview__canvas" :style="{ aspectRatio: layoutPreviewAspectRatio(schema) }">
              <span
                v-for="widget in schema.widgets"
                :key="widget.id"
                class="layout-preview__block"
                :class="[layoutPreviewBlockClass(widget), { 'layout-preview__block--locked': widget.style.locked }]"
                :style="layoutPreviewBlockStyle(widget, schema.canvas)"
                :title="widget.name || widget.title"
              ></span>
            </div>
          </figure>
          <figure class="layout-preview__pane">
            <figcaption>排版后</figcaption>
            <div class="layout-preview__canvas" :style="{ aspectRatio: layoutPreviewAspectRatio(layoutPreviewSchema) }">
              <span
                v-for="widget in layoutPreviewSchema.widgets"
                :key="widget.id"
                class="layout-preview__block"
                :class="[layoutPreviewBlockClass(widget), { 'layout-preview__block--locked': widget.style.locked }]"
                :style="layoutPreviewBlockStyle(widget, layoutPreviewSchema.canvas)"
                :title="widget.name || widget.title"
              ></span>
            </div>
          </figure>
        </div>
        <div class="designer-modal__actions"><button type="button" @click="showLayoutDialog = false">取消</button><button type="button" class="designer-modal__primary" @click="applyLayoutPreview">应用排版</button></div>
      </section>
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 170px;
  color: var(--studio-text-3);
}

.designer-toolbar__status > i {
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

.designer-toolbar__status[data-state="dirty"] > i,
.designer-toolbar__status[data-state="saving"] > i {
  background: #ffb020;
  box-shadow: 0 0 0 4px rgba(255, 176, 32, .12);
}

.designer-toolbar__status[data-state="saving"] > i {
  animation: studio-pulse 800ms cubic-bezier(.37, 0, .63, 1) infinite alternate;
}

.designer-toolbar__status[data-state="error"] > i {
  background: #ff4d4f;
  box-shadow: 0 0 0 4px rgba(255, 77, 79, .1);
}

.designer-toolbar__status-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  animation: studio-status-text-enter 160ms cubic-bezier(.2, 0, 0, 1) backwards;
}

@keyframes studio-status-text-enter {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: translateY(0); }
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
  animation: property-form-enter 160ms cubic-bezier(.2, 0, 0, 1) backwards;
}

@keyframes property-form-enter {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
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

.designer-canvas-settings .property-hint {
  margin: 0;
  color: var(--studio-text-3);
  font-size: 10px;
  line-height: 1.6;
}

.canvas-size-grid {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
  align-items: end;
}

.canvas-size-grid label {
  display: grid;
  gap: 6px;
  color: var(--studio-text-2);
  font-size: 11px;
  font-weight: 740;
}

.canvas-size-grid input {
  width: 100%;
  min-height: 36px;
  padding: 7px 10px;
  border: 1px solid var(--studio-border);
  border-radius: 10px;
  color: var(--studio-text);
  background: var(--studio-surface);
}

.canvas-size-grid button,
.canvas-background-upload {
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--studio-border);
  border-radius: 10px;
  color: var(--studio-text-2);
  background: #fff;
  font-size: 11px;
  font-weight: 720;
  cursor: pointer;
  white-space: nowrap;
}

.canvas-size-grid button:hover:not(:disabled),
.canvas-background-upload:hover:not(:disabled),
.canvas-background-preview__meta button:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--studio-primary) 48%, var(--studio-border));
}

.canvas-size-grid button:disabled,
.canvas-background-upload:disabled {
  cursor: not-allowed;
  opacity: .55;
}

.property-field input[type="color"] {
  height: 36px;
  padding: 4px 6px;
  cursor: pointer;
}

.canvas-background-preview {
  display: grid;
  gap: 8px;
}

.canvas-background-preview img {
  width: 100%;
  height: 96px;
  object-fit: cover;
  border: 1px solid var(--studio-border);
  border-radius: 10px;
  background: #f3f7fc;
}

.canvas-background-preview__meta {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}

.canvas-background-preview__meta select {
  min-width: 0;
  min-height: 36px;
  padding: 7px 10px;
  border: 1px solid var(--studio-border);
  border-radius: 10px;
  color: var(--studio-text);
  background: var(--studio-surface);
}

.canvas-background-preview__meta button {
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid #f3c2c2;
  border-radius: 10px;
  color: #c53030;
  background: #fff;
  font-size: 11px;
  font-weight: 720;
  cursor: pointer;
}

.canvas-background-upload {
  width: 100%;
  border-style: dashed;
  color: var(--studio-primary);
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

.designer-palette__tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin: 0 12px 10px;
  padding: 3px;
  border: 1px solid var(--studio-border);
  border-radius: 10px;
  background: #f5f8fc;
}

.designer-palette__tabs button {
  min-height: 32px;
  border: 0;
  border-radius: 8px;
  color: var(--studio-text-3);
  background: transparent;
  font-size: 12px;
  font-weight: 700;
}

.designer-palette__tabs button.is-active {
  color: var(--studio-primary);
  background: #fff;
  box-shadow: 0 2px 8px rgba(29, 78, 216, .08);
}

.query-asset-panel {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-height: 0;
  overflow: hidden;
}

.query-asset-panel__browser {
  display: grid;
  min-height: 0;
  align-content: start;
  gap: 14px;
  padding: 2px 10px 12px 14px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;
}

.query-asset-panel button {
  cursor: pointer;
}

.query-asset-panel button:disabled {
  cursor: not-allowed;
  opacity: .55;
}

.query-asset-panel__intro {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--studio-border);
  border-radius: 12px;
  background: var(--studio-surface-soft);
}

.query-asset-panel__intro > span {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.query-asset-panel__intro strong {
  color: var(--studio-text);
  font-size: 13px;
  font-weight: 700;
}

.query-asset-panel__intro small {
  color: var(--studio-text-3);
  font-size: 11px;
  line-height: 1.5;
}

.query-asset-panel__intro > b {
  display: inline-flex;
  flex: 0 0 auto;
  min-width: 26px;
  height: 22px;
  align-items: center;
  justify-content: center;
  padding: 0 8px;
  border-radius: 999px;
  color: var(--studio-primary);
  background: #eaf3ff;
  font-size: 11px;
  font-weight: 700;
}

.query-asset-panel__current {
  display: grid;
  gap: 8px;
}

.query-asset-panel__current > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--studio-text-2);
  font-size: 12px;
  font-weight: 700;
}

.query-asset-panel__current > header span {
  padding: 1px 8px;
  border-radius: 999px;
  color: var(--studio-primary);
  background: #eaf3ff;
  font-size: 10px;
  font-weight: 700;
}

.query-asset-panel__module-list {
  display: grid;
  gap: 6px;
}

.query-asset-panel__module-list article {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid var(--studio-border);
  border-radius: 10px;
  background: #fff;
  transition: border-color .15s ease;
}

.query-asset-panel__module-list article:hover {
  border-color: var(--studio-border-strong);
}

.query-asset-panel__module-main {
  display: grid;
  min-width: 0;
  gap: 2px;
  padding: 0;
  border: 0;
  color: var(--studio-text-2);
  background: transparent;
  text-align: left;
}

.query-asset-panel__module-main strong,
.query-asset-panel__module-main small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.query-asset-panel__module-main strong { color: var(--studio-text); font-size: 12px; font-weight: 600; }
.query-asset-panel__module-main small { color: var(--studio-text-3); font-size: 10px; }

.query-asset-panel__module-remove {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 0;
  border-radius: 8px;
  color: var(--studio-text-3);
  background: transparent;
  transition: color .15s ease, background .15s ease;
}

.query-asset-panel__module-remove:hover {
  color: #dc2626;
  background: #fef2f2;
}

.query-asset-panel__filters {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
}

.query-asset-panel__search-field {
  grid-column: 1 / -1;
  position: relative;
  display: flex;
  min-width: 0;
  align-items: center;
}

.query-asset-panel__search-field > svg {
  position: absolute;
  left: 10px;
  color: var(--studio-text-3);
  pointer-events: none;
}

.query-asset-panel__filters input,
.query-asset-panel__filters select,
.query-asset-panel__preview input,
.query-asset-panel__preview select {
  width: 100%;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--studio-border);
  border-radius: 10px;
  color: var(--studio-text-2);
  background: #fff;
  font-size: 12px;
  transition: border-color .15s ease, box-shadow .15s ease;
}

.query-asset-panel__filters select {
  width: 100%;
}

.query-asset-panel__search-field input {
  padding-left: 30px;
}

.query-asset-panel__filters input:focus-visible,
.query-asset-panel__filters select:focus-visible,
.query-asset-panel__preview input:focus-visible,
.query-asset-panel__preview select:focus-visible {
  outline: none;
  border-color: var(--studio-primary);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, .12);
}

.query-asset-panel__filters button {
  height: 34px;
  padding: 0 12px;
  border: 1px solid #cfe0fb;
  border-radius: 10px;
  color: var(--studio-primary);
  background: #f4f8ff;
  font-size: 12px;
  font-weight: 600;
  transition: border-color .15s ease, background .15s ease;
}

.query-asset-panel__filters button:hover:not(:disabled) {
  border-color: var(--studio-primary);
  background: #eaf3ff;
}

.query-asset-panel__list {
  display: grid;
  gap: 8px;
}

.query-asset-panel__list > button {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--studio-border);
  border-radius: 12px;
  color: var(--studio-text-2);
  background: #fff;
  text-align: left;
  transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
}

.query-asset-panel__list > button:hover {
  border-color: var(--studio-border-strong);
  box-shadow: 0 2px 8px rgba(15, 23, 42, .05);
}

.query-asset-panel__list > button.is-active {
  border-color: var(--studio-primary);
  background: #f5f9ff;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, .1);
}

.query-asset-panel__asset-icon {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 9px;
  color: var(--studio-primary);
  background: #eaf3ff;
}

.query-asset-panel__asset-body {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.query-asset-panel__asset-body strong,
.query-asset-panel__asset-body > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.query-asset-panel__asset-body strong { color: var(--studio-text); font-size: 12px; font-weight: 600; }
.query-asset-panel__asset-body > span { color: var(--studio-text-3); font-size: 11px; }

.query-asset-panel__asset-body small {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}

.query-asset-panel__asset-body small i,
.query-asset-panel__asset-body small b {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 999px;
  color: var(--studio-text-3);
  background: var(--studio-surface-soft);
  font-size: 10px;
  font-style: normal;
  font-weight: 600;
}

.query-asset-panel__asset-body small b {
  color: var(--studio-primary);
  background: #eaf3ff;
}

.query-asset-panel__empty,
.query-asset-panel__error {
  margin: 0;
  padding: 12px 14px;
  border: 1px dashed var(--studio-border-strong);
  border-radius: 10px;
  color: var(--studio-text-3);
  background: var(--studio-surface-soft);
  font-size: 12px;
  line-height: 1.6;
}

.query-asset-panel__error {
  border: 1px solid #fecaca;
  color: #b42318;
  background: #fef2f2;
}

.query-asset-panel__preview {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: 0;
  max-height: clamp(180px, 42vh, 420px);
  gap: 10px;
  margin: 0 14px 14px;
  padding: 14px;
  overflow: hidden;
  border: 1px solid var(--studio-border);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 -8px 22px rgba(15, 23, 42, .06);
}

.query-asset-panel__preview > header,
.query-asset-panel__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.query-asset-panel__preview > header strong {
  color: var(--studio-text);
  font-size: 12px;
  font-weight: 700;
}

.query-asset-panel__preview > header span {
  padding: 1px 8px;
  border-radius: 999px;
  color: var(--studio-primary);
  background: #eaf3ff;
  font-size: 10px;
  font-weight: 700;
}

.query-asset-panel__preview-body {
  display: grid;
  min-height: 0;
  align-content: start;
  gap: 10px;
  padding-right: 2px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;
}

.query-asset-panel__preview label {
  display: grid;
  gap: 5px;
}

.query-asset-panel__preview label > span {
  color: var(--studio-text-2);
  font-size: 11px;
  font-weight: 600;
}

.query-asset-panel__time-parameter { display: grid; gap: 6px; min-width: 0; }
.query-asset-panel__time-parameter small { line-height: 1.5; color: var(--studio-text-3); font-size: 10px; }

.query-asset-panel__summary {
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--studio-surface-soft);
}

.query-asset-panel__summary strong { color: var(--studio-text); font-size: 12px; font-weight: 700; }
.query-asset-panel__summary span { color: var(--studio-text-3); font-size: 10px; }

.query-asset-panel__preview details { min-width: 0; color: var(--studio-text-3); font-size: 11px; }
.query-asset-panel__preview summary { cursor: pointer; }
.query-asset-panel__preview pre, .version-candidate-list pre { max-height: 140px; margin: 8px 0 0; padding: 10px; overflow: auto; border-radius: 10px; background: #0f1d32; color: #dbeafe; font-size: 10px; line-height: 1.55; white-space: pre-wrap; }

.query-asset-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid #edf3fb;
  background: #fff;
}

.query-asset-panel__actions button {
  flex: 1 1 40%;
  min-height: 34px;
  border: 1px solid var(--studio-border);
  border-radius: 10px;
  color: var(--studio-text-2);
  background: #fff;
  font-size: 12px;
  font-weight: 600;
  transition: border-color .15s ease, background .15s ease;
}

.query-asset-panel__actions button:hover:not(:disabled) {
  border-color: var(--studio-border-strong);
}

.query-asset-panel__actions button.is-primary {
  flex-basis: 100%;
  border-color: var(--studio-primary);
  color: #fff;
  background: var(--studio-primary);
}

.query-asset-panel__actions button.is-primary:hover:not(:disabled) {
  border-color: #1d4ed8;
  background: #1d4ed8;
}

.property-module-actions button { flex: 1; min-height: 32px; border: 1px solid var(--studio-border); border-radius: 9px; color: var(--studio-text-2); background: #fff; font-size: 10px; font-weight: 720; }

.property-source-card {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 7px 10px;
  padding: 10px;
  border: 1px solid #d8e6f9;
  border-radius: 10px;
  background: #f8fbff;
  font-size: 10px;
}
.property-source-card span { color: var(--studio-text-3); }
.property-source-card strong { overflow: hidden; color: var(--studio-text-2); text-overflow: ellipsis; white-space: nowrap; }
.property-module-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }

.designer-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(15, 31, 55, .36);
  backdrop-filter: blur(4px);
  animation: designer-modal-backdrop-enter 160ms cubic-bezier(.2, 0, 0, 1) backwards;
}

.designer-modal {
  display: grid;
  width: min(720px, calc(100vw - 32px));
  max-height: min(760px, calc(100dvh - 48px));
  gap: 14px;
  padding: 20px;
  overflow: auto;
  border: 1px solid #d5e4f8;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 24px 70px rgba(23, 56, 100, .2);
  animation: designer-modal-enter 160ms cubic-bezier(.2, 0, 0, 1) backwards;
}

@keyframes designer-modal-backdrop-enter {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes designer-modal-enter {
  from { opacity: 0; transform: translateY(6px) scale(.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.designer-modal--compact { width: min(520px, calc(100vw - 32px)); }
.designer-modal > header, .version-candidate-list article > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.designer-modal > header p, .designer-modal > header h2 { margin: 0; }
.designer-modal > header p { color: #2870d6; font-size: 10px; font-weight: 760; letter-spacing: .08em; }
.designer-modal > header h2 { margin-top: 3px; color: var(--studio-text); font-size: 19px; }
.designer-modal > header > button { border: 0; color: var(--studio-text-3); background: transparent; font-size: 24px; }
.designer-modal__field { display: grid; gap: 6px; color: var(--studio-text-2); font-size: 11px; font-weight: 700; }
.designer-modal__field textarea, .designer-modal__field select, .designer-modal__field input { padding: 9px 10px; border: 1px solid var(--studio-border); border-radius: 10px; color: var(--studio-text); background: #fff; font: inherit; font-weight: 500; }
.designer-modal__hint { margin: 0; padding: 10px 12px; border-radius: 10px; color: var(--studio-text-3); background: #f5f8fc; font-size: 11px; line-height: 1.6; }
.designer-modal__primary { min-height: 36px; padding: 0 14px; border: 1px solid var(--studio-primary); border-radius: 10px; color: #fff; background: var(--studio-primary); font-weight: 760; }
.designer-modal__actions { display: flex; justify-content: flex-end; gap: 8px; }
.designer-modal__actions > button:not(.designer-modal__primary) { min-height: 36px; padding: 0 14px; border: 1px solid var(--studio-border); border-radius: 10px; color: var(--studio-text-2); background: #fff; }
.version-candidate-list { display: grid; gap: 10px; }
.version-candidate-list article { display: grid; gap: 10px; padding: 13px; border: 1px solid #d8e6f9; border-radius: 11px; background: #fbfdff; }
.version-candidate-list article header span { color: var(--studio-text-3); font-size: 10px; }
.designer-modal__candidate-question { margin: 0; color: var(--studio-text-2); font-size: 11px; line-height: 1.55; }
.version-candidate-grid, .layout-preview-summary { display: grid; grid-template-columns: auto 1fr auto 1fr auto 1fr; gap: 7px; padding: 9px; border-radius: 9px; background: #f3f7fc; font-size: 10px; }
.version-candidate-grid span, .layout-preview-summary span { color: var(--studio-text-3); }
.version-candidate-list details { color: var(--studio-text-3); font-size: 10px; }
.version-candidate-list ul { margin: 7px 0 0; padding-left: 18px; line-height: 1.7; }
.version-column-mapping { display: grid; gap: 8px; padding: 10px; border: 1px solid #dbe7f7; border-radius: 9px; background: #f7faff; }
.version-column-mapping > strong { color: var(--studio-text-2); font-size: 10px; }
.version-column-mapping label { display: grid; grid-template-columns: minmax(90px, .8fr) minmax(0, 1.2fr); align-items: center; gap: 8px; color: var(--studio-text-3); font-size: 10px; }
.version-column-mapping select { min-width: 0; }
.layout-preview-summary { grid-template-columns: auto 1fr auto 1fr; align-items: baseline; }
.layout-preview-summary strong { color: var(--studio-primary); font-size: 22px; }
.designer-modal--layout { width: min(860px, calc(100vw - 32px)); }
.layout-preview-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.layout-preview__pane { margin: 0; display: grid; gap: 7px; }
.layout-preview__pane figcaption { color: var(--studio-text-3); font-size: 10px; font-weight: 760; letter-spacing: .06em; }
.layout-preview__canvas {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--studio-border);
  border-radius: 10px;
  background: #f3f7fc;
}
.layout-preview__block {
  position: absolute;
  border-radius: 3px;
  border: 1px solid rgba(40, 112, 214, .35);
  background: rgba(40, 112, 214, .28);
}
.layout-preview__block--kpi { border-color: rgba(22, 163, 122, .45); background: rgba(22, 163, 122, .3); }
.layout-preview__block--trend { border-color: rgba(40, 112, 214, .45); background: rgba(40, 112, 214, .3); }
.layout-preview__block--comparison { border-color: rgba(134, 76, 214, .45); background: rgba(134, 76, 214, .28); }
.layout-preview__block--detail { border-color: rgba(100, 116, 139, .5); background: rgba(100, 116, 139, .28); }
.layout-preview__block--narrative { border-color: rgba(217, 145, 26, .5); background: rgba(217, 145, 26, .3); }
.layout-preview__block--locked {
  border-style: dashed;
  background-image: repeating-linear-gradient(135deg, rgba(255, 255, 255, .35) 0 4px, transparent 4px 8px);
}
@media (max-width: 720px) {
  .layout-preview-compare { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  .designer-toolbar__status[data-state="saving"] > i {
    animation: none;
  }

  .designer-panel,
  .icon-button,
  .studio-button {
    transition: none;
  }

  .designer-toolbar__status-text,
  .property-form,
  .designer-modal-backdrop,
  .designer-modal {
    animation: none;
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
