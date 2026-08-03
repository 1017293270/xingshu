import type {
  DashboardSchema,
  DashboardValidationIssue,
  DashboardValidationResult,
  DashboardWidget
} from "@/types/dashboardStudio";
import { parseColorValue } from "../original/designer/colorUtils";

const chartTypes = new Set(["line", "area", "bar", "pie", "radar", "funnel"]);

function relativeLuminance(color: { r: number; g: number; b: number }) {
  const channels = [color.r, color.g, color.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string) {
  const foregroundColor = parseColorValue(foreground, "#102A4C");
  const backgroundColor = parseColorValue(background, "#FFFFFF");
  if (!foregroundColor.isParsed || !backgroundColor.isParsed) return null;
  const foregroundLuminance = relativeLuminance(foregroundColor.rgb);
  const backgroundLuminance = relativeLuminance(backgroundColor.rgb);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

function widgetDisplayName(widget: DashboardWidget) {
  return widget.name?.trim() || widget.title.trim() || "未命名组件";
}

export function validateDashboardForPublish(schema: DashboardSchema): DashboardValidationResult {
  const issues: DashboardValidationIssue[] = [];
  const add = (issue: DashboardValidationIssue) => issues.push(issue);

  if (!schema.title.trim()) {
    add({ code: "missing-title", message: "请先填写大屏名称。", severity: "error" });
  }

  for (const widget of schema.widgets) {
    const { x, y, w, h } = widget.position;
    const name = widgetDisplayName(widget);
    if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > schema.canvas.width || y + h > schema.canvas.height) {
      add({
        code: "widget-out-of-bounds",
        message: `“${name}”超出画布边界，请先调整位置或尺寸。`,
        severity: "error",
        widgetId: widget.id
      });
    }

    if (chartTypes.has(widget.type) && !widget.bindingId) {
      add({
        code: "chart-without-data",
        message: `“${name}”尚未绑定数据，发布后只能展示占位状态。`,
        severity: "warning",
        widgetId: widget.id
      });
    }

    const foreground = widget.style.color;
    const background = widget.style.background || schema.canvas.background;
    if (foreground && background) {
      const ratio = contrastRatio(foreground, background);
      if (ratio !== null && ratio < 4.5) {
        add({
          code: "low-text-contrast",
          message: `“${name}”的文字与背景对比度为 ${ratio.toFixed(2)}:1，建议至少达到 4.5:1。`,
          severity: "warning",
          widgetId: widget.id
        });
      }
    }

    const colors = [widget.style.accent, ...(widget.style.seriesColors ?? [])].filter(Boolean) as string[];
    if (colors.some((color) => /^(#00ff00|#0f0|lime)$/i.test(color.trim()))) {
      add({
        code: "neon-accent",
        message: `“${name}”使用了高亮霓虹色，请改用星数主题色后再发布。`,
        severity: "warning",
        widgetId: widget.id
      });
    }
  }

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return { valid: errors.length === 0, errors, warnings };
}
