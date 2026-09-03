import type {
  DashboardDesignArchetype,
  DashboardDesignEmphasis,
  DashboardDesignOp,
  DashboardDesignOps,
  DashboardDesignRejection,
  DashboardDesignRole,
  DashboardDesignSpec,
  DashboardDesignSpecWidget,
  DashboardDesignValueMode
} from "@/types/dashboardDesign";
import { dashboardDesignArchetypes, dashboardDesignRoles } from "@/types/dashboardDesign";

/**
 * 模型输出的形状归一：只做「长什么样」的检查，不碰「指的东西存不存在」。
 * 资产、列、变体族这些语义校验在 dashboardDesignApply 里做——那里才拿得到数据与当前板。
 */

const EMPHASIS_VALUES: DashboardDesignEmphasis[] = ["compact", "normal", "wide", "hero"];
const VALUE_MODES: DashboardDesignValueMode[] = ["first", "latest", "sum", "max", "average"];

const OP_NAMES = [
  "set_theme",
  "set_archetype",
  "set_canvas",
  "set_board_title",
  "add_widget",
  "remove_widget",
  "retype_widget",
  "set_emphasis",
  "retitle",
  "set_text",
  "set_kpi",
  "set_mapping",
  "reorder"
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return items.length > 0 ? items.map((item) => item.trim()) : undefined;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeWidget(
  raw: unknown,
  index: number,
  rejected: DashboardDesignRejection[]
): DashboardDesignSpecWidget | null {
  if (!isRecord(raw)) {
    rejected.push({ target: `组件 ${index + 1}`, reason: "组件不是对象，已忽略" });
    return null;
  }

  const ref = readString(raw.ref) ?? `widget-${index + 1}`;
  const role = dashboardDesignRoles.find((item) => item === raw.role);
  if (!role) {
    rejected.push({
      target: readString(raw.title) ?? ref,
      reason: `角色「${String(raw.role ?? "缺失")}」不在支持范围，已忽略该组件`
    });
    return null;
  }

  const emphasisRaw = raw.emphasis;
  const emphasis = EMPHASIS_VALUES.find((item) => item === emphasisRaw);
  if (emphasisRaw !== undefined && !emphasis) {
    rejected.push({ target: readString(raw.title) ?? ref, reason: `强调级别「${String(emphasisRaw)}」不认识，已按默认排布` });
  }

  const valueModeRaw = raw.valueMode;
  const valueMode = VALUE_MODES.find((item) => item === valueModeRaw);
  if (valueModeRaw !== undefined && !valueMode) {
    rejected.push({ target: readString(raw.title) ?? ref, reason: `取值方式「${String(valueModeRaw)}」不认识，已按数据形状推断` });
  }

  return {
    ref,
    role: role as DashboardDesignRole,
    ...(readString(raw.assetId) ? { assetId: readString(raw.assetId)! } : {}),
    ...(readString(raw.outputKey) ? { outputKey: readString(raw.outputKey)! } : {}),
    ...(readString(raw.variant) ? { variant: readString(raw.variant)! } : {}),
    ...(readString(raw.dimensionKey) ? { dimensionKey: readString(raw.dimensionKey)! } : {}),
    ...(readStringArray(raw.metricKeys) ? { metricKeys: readStringArray(raw.metricKeys)! } : {}),
    ...(readString(raw.metricKey) ? { metricKey: readString(raw.metricKey)! } : {}),
    ...(valueMode ? { valueMode } : {}),
    ...(readBoolean(raw.showTrend) === undefined ? {} : { showTrend: readBoolean(raw.showTrend)! }),
    title: readString(raw.title) ?? "",
    ...(readString(raw.subtitle) ? { subtitle: readString(raw.subtitle)! } : {}),
    ...(typeof raw.content === "string" && raw.content.length > 0 ? { content: raw.content } : {}),
    ...(emphasis ? { emphasis } : {}),
    ...(raw.placement === "rail" ? { placement: "rail" as const } : {})
  };
}

export function parseDashboardDesignSpec(raw: unknown): {
  spec: DashboardDesignSpec | null;
  rejected: DashboardDesignRejection[];
} {
  const rejected: DashboardDesignRejection[] = [];
  if (!isRecord(raw)) {
    return { spec: null, rejected: [{ target: "设计稿", reason: "模型没有返回设计稿对象" }] };
  }
  if (!Array.isArray(raw.widgets) || raw.widgets.length === 0) {
    return { spec: null, rejected: [{ target: "设计稿", reason: "设计稿里没有组件清单" }] };
  }

  const archetypeRaw = raw.archetype;
  const archetype = dashboardDesignArchetypes.find((item) => item === archetypeRaw);
  if (archetypeRaw !== undefined && !archetype) {
    rejected.push({ target: "构图原型", reason: `原型「${String(archetypeRaw)}」不认识，已改用指标总览` });
  }

  const widgets = raw.widgets
    .map((widget, index) => normalizeWidget(widget, index, rejected))
    .filter((widget): widget is DashboardDesignSpecWidget => widget !== null);
  if (widgets.length === 0) {
    return { spec: null, rejected: [...rejected, { target: "设计稿", reason: "组件清单里没有一条可用" }] };
  }

  return {
    spec: {
      narrative: typeof raw.narrative === "string" ? raw.narrative : "",
      title: readString(raw.title) ?? "",
      ...(readString(raw.subtitle) ? { subtitle: readString(raw.subtitle)! } : {}),
      ...(readString(raw.insight) ? { insight: readString(raw.insight)! } : {}),
      themeId: readString(raw.themeId) ?? "",
      archetype: (archetype ?? "kpi-led") as DashboardDesignArchetype,
      ...(readString(raw.canvasPreset) ? { canvasPreset: readString(raw.canvasPreset)! } : {}),
      widgets
    },
    rejected
  };
}

function normalizeOp(raw: unknown, index: number, rejected: DashboardDesignRejection[]): DashboardDesignOp | null {
  const label = `修改 ${index + 1}`;
  if (!isRecord(raw)) {
    rejected.push({ target: label, reason: "修改项不是对象，已忽略" });
    return null;
  }
  const name = OP_NAMES.find((item) => item === raw.op);
  if (!name) {
    rejected.push({ target: label, reason: `不认识的操作「${String(raw.op ?? "缺失")}」，已忽略` });
    return null;
  }

  const widgetId = readString(raw.widgetId);
  const needsWidget = ["remove_widget", "retype_widget", "set_emphasis", "retitle", "set_text", "set_kpi", "set_mapping"];
  if (needsWidget.includes(name) && !widgetId) {
    rejected.push({ target: label, reason: `${name} 没有指明组件，已忽略` });
    return null;
  }

  switch (name) {
    case "set_theme": {
      const themeId = readString(raw.themeId);
      if (!themeId) {
        rejected.push({ target: label, reason: "换主题没有给出主题 id，已忽略" });
        return null;
      }
      return { op: "set_theme", themeId };
    }
    case "set_archetype": {
      const archetype = dashboardDesignArchetypes.find((item) => item === raw.archetype);
      if (!archetype) {
        rejected.push({ target: label, reason: `构图原型「${String(raw.archetype ?? "缺失")}」不认识，已忽略` });
        return null;
      }
      return { op: "set_archetype", archetype: archetype as DashboardDesignArchetype };
    }
    case "set_canvas": {
      const preset = readString(raw.preset);
      if (!preset) {
        rejected.push({ target: label, reason: "换画布没有给出尺寸档，已忽略" });
        return null;
      }
      return { op: "set_canvas", preset };
    }
    case "set_board_title": {
      const title = readString(raw.title);
      if (!title) {
        rejected.push({ target: label, reason: "改标题没有给出标题文案，已忽略" });
        return null;
      }
      return {
        op: "set_board_title",
        title,
        ...(readString(raw.subtitle) ? { subtitle: readString(raw.subtitle)! } : {}),
        ...(readString(raw.insight) ? { insight: readString(raw.insight)! } : {})
      };
    }
    case "add_widget": {
      const widget = normalizeWidget(raw.widget, index, rejected);
      return widget ? { op: "add_widget", widget } : null;
    }
    case "remove_widget":
      return { op: "remove_widget", widgetId: widgetId! };
    case "retype_widget": {
      const variant = readString(raw.variant);
      if (!variant) {
        rejected.push({ target: label, reason: "换图种没有给出变体 id，已忽略" });
        return null;
      }
      return { op: "retype_widget", widgetId: widgetId!, variant };
    }
    case "set_emphasis": {
      const emphasis = EMPHASIS_VALUES.find((item) => item === raw.emphasis);
      if (!emphasis) {
        rejected.push({ target: label, reason: `强调级别「${String(raw.emphasis ?? "缺失")}」不认识，已忽略` });
        return null;
      }
      return {
        op: "set_emphasis",
        widgetId: widgetId!,
        emphasis,
        ...(raw.placement === "rail" ? { placement: "rail" as const } : {})
      };
    }
    case "retitle": {
      const title = readString(raw.title);
      if (!title) {
        rejected.push({ target: label, reason: "改组件标题没有给出文案，已忽略" });
        return null;
      }
      return {
        op: "retitle",
        widgetId: widgetId!,
        title,
        ...(readString(raw.subtitle) ? { subtitle: readString(raw.subtitle)! } : {})
      };
    }
    case "set_text": {
      if (typeof raw.content !== "string") {
        rejected.push({ target: label, reason: "改文本没有给出正文，已忽略" });
        return null;
      }
      return { op: "set_text", widgetId: widgetId!, content: raw.content };
    }
    case "set_kpi": {
      const valueModeRaw = raw.valueMode;
      const valueMode = VALUE_MODES.find((item) => item === valueModeRaw);
      if (valueModeRaw !== undefined && !valueMode) {
        rejected.push({ target: label, reason: `取值方式「${String(valueModeRaw)}」不认识，已保留原取值` });
      }
      return {
        op: "set_kpi",
        widgetId: widgetId!,
        ...(readString(raw.metricKey) ? { metricKey: readString(raw.metricKey)! } : {}),
        ...(valueMode ? { valueMode } : {}),
        ...(readBoolean(raw.showTrend) === undefined ? {} : { showTrend: readBoolean(raw.showTrend)! })
      };
    }
    case "set_mapping": {
      const dimensionKey = readString(raw.dimensionKey);
      const metricKeys = readStringArray(raw.metricKeys);
      if (!dimensionKey && !metricKeys) {
        rejected.push({ target: label, reason: "改数据映射没有给出维度或指标，已忽略" });
        return null;
      }
      return {
        op: "set_mapping",
        widgetId: widgetId!,
        ...(dimensionKey ? { dimensionKey } : {}),
        ...(metricKeys ? { metricKeys } : {})
      };
    }
    default: {
      const widgetIds = readStringArray(raw.widgetIds);
      if (!widgetIds) {
        rejected.push({ target: label, reason: "调整顺序没有给出组件清单，已忽略" });
        return null;
      }
      return { op: "reorder", widgetIds };
    }
  }
}

export function parseDashboardDesignOps(raw: unknown): {
  ops: DashboardDesignOps | null;
  rejected: DashboardDesignRejection[];
} {
  if (!isRecord(raw)) {
    return { ops: null, rejected: [{ target: "修改清单", reason: "模型没有返回修改清单对象" }] };
  }
  if (!Array.isArray(raw.ops)) {
    return { ops: null, rejected: [{ target: "修改清单", reason: "修改清单不是数组" }] };
  }

  const rejected: DashboardDesignRejection[] = [];
  const ops = raw.ops
    .map((op, index) => normalizeOp(op, index, rejected))
    .filter((op): op is DashboardDesignOp => op !== null);

  return {
    ops: { narrative: typeof raw.narrative === "string" ? raw.narrative : "", ops },
    rejected
  };
}
