import type { EChartsOption } from "echarts";
import type { DashboardDataBinding, DashboardWidget } from "@/types/dashboardStudio";

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().replace(/,/g, "").replace(/%$/, "");
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveDashboardMetric(widget: DashboardWidget, binding?: DashboardDataBinding) {
  const metricKey = widget.mapping.metricKeys?.[0];
  if (!binding || !metricKey || binding.table.rows.length === 0) {
    return null;
  }

  const values = binding.table.rows.map((row) => toFiniteNumber(row[metricKey]));
  const validValues = values.filter((value): value is number => value !== null);
  if (validValues.length === 0) {
    return null;
  }

  if (widget.mapping.valueMode === "sum") {
    return validValues.reduce((total, value) => total + value, 0);
  }
  if (widget.mapping.valueMode === "max") {
    return Math.max(...validValues);
  }
  if (widget.mapping.valueMode === "average") {
    return validValues.reduce((total, value) => total + value, 0) / validValues.length;
  }
  if (widget.mapping.valueMode === "first") {
    return values.find((value): value is number => value !== null) ?? null;
  }
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] !== null) {
      return values[index];
    }
  }
  return null;
}

export function formatDashboardMetric(value: number | null, displayUnit?: string) {
  if (value === null) {
    return { value: "—", unit: "" };
  }

  if (displayUnit) {
    return {
      value: new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value),
      unit: displayUnit
    };
  }

  const absolute = Math.abs(value);
  if (absolute >= 100_000_000) {
    return { value: (value / 100_000_000).toFixed(2).replace(/\.00$/, ""), unit: "亿" };
  }
  if (absolute >= 10_000) {
    return { value: (value / 10_000).toFixed(2).replace(/\.00$/, ""), unit: "万" };
  }
  return {
    value: new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value),
    unit: ""
  };
}

function metricName(binding: DashboardDataBinding, key: string) {
  return binding.table.columns.find((column) => column.key === key)?.title || key;
}

const defaultSeriesColors = ["#22c55e", "#f59e0b", "#f87171", "#a78bfa", "#38bdf8"];

function chartPalette(widget: DashboardWidget) {
  const colors = widget.style.seriesColors?.filter(Boolean) ?? [];
  return colors.length > 0
    ? colors
    : [widget.style.accent ?? "#38bdf8", ...defaultSeriesColors];
}

function isCompatibleChartBinding(widget: DashboardWidget, binding: DashboardDataBinding) {
  if (!binding.resultKind) return true;
  if (widget.type === "line" || widget.type === "area") return binding.resultKind === "time-series";
  if (widget.type === "bar") return binding.resultKind === "time-series" || binding.resultKind === "category";
  if (widget.type === "pie" || widget.type === "radar" || widget.type === "funnel") {
    return binding.resultKind === "category";
  }
  return false;
}

export function buildDashboardChartOption(
  widget: DashboardWidget,
  binding?: DashboardDataBinding,
  options: { animation?: boolean } = {}
): EChartsOption | null {
  if (!binding || !widget.mapping.dimensionKey || !widget.mapping.metricKeys?.length) {
    return null;
  }
  if (!isCompatibleChartBinding(widget, binding)) return null;

  const dimensionKey = widget.mapping.dimensionKey;
  const categories = binding.table.rows.map((row) => String(row[dimensionKey] ?? "—"));
  const metrics = widget.mapping.metricKeys.map((key) => ({
    key,
    name: metricName(binding, key),
    values: binding.table.rows.map((row) => toFiniteNumber(row[key]))
  }));

  if (metrics.every((metric) => metric.values.every((value) => value === null))) {
    return null;
  }

  const fontColor = widget.style.color ?? "#dbeafe";
  const accentColor = widget.style.accent ?? "#38bdf8";
  const palette = chartPalette(widget);
  const primaryColor = palette[0] ?? accentColor;
  const variant = widget.style.chartVariant ?? "";
  const base: EChartsOption = {
    color: palette,
    animation: options.animation === false ? false : undefined,
    textStyle: { color: fontColor }
  };

  if (widget.type === "pie" && binding.resultKind !== "time-series") {
    const metric = metrics[0];
    const isRose = variant === "pie-rose";
    const isSolid = variant === "pie-solid";
    return {
      ...base,
      tooltip: { trigger: "item" },
      legend: isSolid
        ? { right: 4, top: "middle", orient: "vertical", textStyle: { color: fontColor } }
        : { bottom: 0, textStyle: { color: fontColor } },
      series: [
        {
          name: widget.title,
          type: "pie",
          radius: isSolid ? ["0%", "64%"] : isRose ? ["24%", "68%"] : ["42%", "68%"],
          center: isSolid ? ["42%", "48%"] : ["50%", "44%"],
          roseType: isRose ? "radius" : undefined,
          label: { color: fontColor },
          data: categories.flatMap((name, index) => {
            const value = metric.values[index];
            return value === null ? [] : [{ name, value }];
          })
        }
      ]
    };
  }

  if (widget.type === "radar" && binding.resultKind !== "time-series") {
    const values = metrics[0]?.values.map((value) => value ?? 0) ?? [];
    const maximum = Math.max(...values, 1);
    const isOutline = variant === "radar-outline";
    const isCompact = variant === "radar-compact";
    return {
      ...base,
      color: [primaryColor],
      tooltip: { trigger: "item" },
      radar: {
        radius: isCompact ? "56%" : "64%",
        center: ["50%", "50%"],
        indicator: categories.map((name) => ({ name, max: Math.ceil(maximum * 1.25) })),
        axisName: { color: fontColor, fontSize: isCompact ? 10 : 12 },
        splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.2)" } },
        splitArea: { areaStyle: { color: ["rgba(148, 163, 184, 0.04)", "rgba(148, 163, 184, 0.08)"] } }
      },
      series: [{
        type: "radar",
        name: widget.title,
        data: [{
          name: widget.title,
          value: values,
          areaStyle: { opacity: isOutline ? 0 : 0.18 },
          lineStyle: { width: isOutline ? 3 : 2 }
        }]
      }]
    } as EChartsOption;
  }

  if (widget.type === "funnel" && binding.resultKind !== "time-series") {
    const metric = metrics[0];
    const isPipeline = variant === "funnel-pipeline";
    const isMinimal = variant === "funnel-minimal";
    const data = categories.flatMap((name, index) => {
      const value = metric?.values[index];
      return value === null || value === undefined ? [] : [{ name, value }];
    });
    return {
      ...base,
      tooltip: { trigger: "item" },
      legend: isMinimal ? undefined : { bottom: 0, textStyle: { color: fontColor } },
      series: [{
        name: widget.title,
        type: "funnel",
        left: isPipeline ? "6%" : "10%",
        top: isMinimal ? 24 : 20,
        bottom: isMinimal ? 24 : 48,
        width: isPipeline ? "88%" : "80%",
        sort: isPipeline ? "none" : "descending",
        gap: isMinimal ? 1 : 3,
        label: { color: fontColor, position: isPipeline ? "inside" : "outer" },
        data
      }]
    } as EChartsOption;
  }

  const chartType = widget.type === "line" || widget.type === "area" ? "line" : "bar";
  const isCategory = binding.resultKind === "category";
  const horizontal = widget.type === "bar" && isCategory && variant === "bar-horizontal";

  if (widget.type === "bar" && isCategory) {
    const metric = metrics[0];
    const values = categories.map((name, index) => ({
      name,
      value: metric.values[index],
      itemStyle: { color: palette[index % palette.length] }
    })).filter((item) => item.value !== null);

    if (horizontal) {
      return {
        ...base,
        tooltip: { trigger: "axis" },
        grid: { left: 88, right: 20, top: 28, bottom: 30 },
        xAxis: {
          type: "value",
          axisLabel: { color: fontColor },
          splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.16)" } }
        },
        yAxis: {
          type: "category",
          data: categories,
          axisLabel: { color: fontColor },
          axisLine: { lineStyle: { color: "rgba(148, 163, 184, 0.42)" } }
        },
        series: [{ type: "bar", name: widget.title, data: values, barWidth: "46%" }]
      } as EChartsOption;
    }

    return {
      ...base,
      tooltip: { trigger: "axis" },
      grid: { left: 44, right: 20, top: 32, bottom: 42 },
      xAxis: {
        type: "category",
        data: categories,
        axisLabel: { color: fontColor },
        axisLine: { lineStyle: { color: "rgba(148, 163, 184, 0.42)" } }
      },
      yAxis: {
        type: "value",
        axisLabel: { color: fontColor },
        splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.16)" } }
      },
      series: [{
        type: "bar",
        name: widget.title,
        data: values,
        barWidth: variant === "bar-compact" ? "42%" : undefined
      }]
    } as EChartsOption;
  }

  return {
    ...base,
    color: [primaryColor],
    tooltip: { trigger: "axis" },
    grid: { left: 44, right: 20, top: 32, bottom: 32 },
    xAxis: {
      type: "category",
      data: categories,
      axisLabel: { color: fontColor },
      axisLine: { lineStyle: { color: "rgba(148, 163, 184, 0.42)" } }
    },
    yAxis: {
      type: "value",
      axisLabel: { color: fontColor },
      splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.16)" } }
    },
    series: metrics.map((metric, index) => ({
      name: widget.title,
      type: chartType,
      data: metric.values,
      smooth: chartType === "line" && variant !== "line-stepped",
      step: variant === "line-stepped" ? "middle" : undefined,
      showSymbol: variant !== "line-minimal",
      barWidth: variant === "bar-compact" ? "42%" : undefined,
      areaStyle:
        chartType === "line" && variant !== "line-minimal" && variant !== "line-stepped"
          ? { opacity: widget.type === "area" ? (variant === "area-wire" ? 0.12 : variant === "area-soft" ? 0.22 : 0.32) : 0.16 }
          : undefined,
      lineStyle: widget.type === "area" ? { width: variant === "area-wire" ? 2 : 3 } : undefined
    }))
  } as EChartsOption;
}
