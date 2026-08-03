import type { EChartsOption } from "echarts";
import type { EChartsType } from "echarts/core";
import { useEffect, useRef } from "react";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

type XsEChartProps = {
  option: EChartsOption;
  label: string;
  summary?: string;
  className?: string;
  motionPreset?: "inherit" | "subtle" | "none";
  renderPolicy?: "visible" | "eager";
};

const setOptionOptions = {
  notMerge: false,
  lazyUpdate: true,
  replaceMerge: ["series", "xAxis", "yAxis"]
};

export function resolveEChartMotionOption(
  option: EChartsOption,
  motionPreset: "inherit" | "subtle" | "none",
  reducedMotion: boolean
) {
  if (reducedMotion || motionPreset === "none") {
    return { ...option, animation: false };
  }
  if (motionPreset === "inherit") {
    return option;
  }

  return {
    ...option,
    animation: option.animation ?? true,
    animationDuration: option.animationDuration ?? 420,
    animationEasing: option.animationEasing ?? "cubicOut",
    animationDurationUpdate: option.animationDurationUpdate ?? 260,
    animationEasingUpdate: option.animationEasingUpdate ?? "cubicOut"
  };
}

export function XsEChart({
  option,
  label,
  summary,
  className = "",
  motionPreset = "inherit",
  renderPolicy = "visible"
}: XsEChartProps) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef = useRef<EChartsType | null>(null);
  const latestOptionRef = useRef(option);
  const latestMotionPresetRef = useRef(motionPreset);
  const reducedMotion = usePrefersReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);

  latestOptionRef.current = option;
  latestMotionPresetRef.current = motionPreset;
  reducedMotionRef.current = reducedMotion;

  useEffect(() => {
    if (!chartRef.current || (import.meta.env.MODE === "test" && renderPolicy !== "eager")) {
      return undefined;
    }

    let chart: EChartsType | null = null;
    let disposed = false;
    let isIntersecting = renderPolicy === "eager";
    let runtimeLoading = false;
    let resizeFrame: number | null = null;
    const element = chartRef.current;
    const observedElement = element.parentElement ?? element;
    const hasUsableSize = () => {
      const bounds = element.getBoundingClientRect();
      const parentBounds = observedElement.getBoundingClientRect();
      return (
        Math.max(bounds.width, element.clientWidth, parentBounds.width, observedElement.clientWidth) > 0 &&
        Math.max(bounds.height, element.clientHeight, parentBounds.height, observedElement.clientHeight) > 0
      );
    };
    const canRender = () =>
      document.visibilityState !== "hidden" &&
      (renderPolicy === "eager" || isIntersecting) &&
      hasUsableSize();
    const initializeChart = () => {
      if (chart || runtimeLoading || disposed || !canRender()) {
        return;
      }

      runtimeLoading = true;
      void import("@/services/echartsRuntime")
        .then((echarts) => {
          if (disposed || !canRender()) {
            return;
          }

          chart = echarts.init(element, null, { renderer: "canvas" });
          chartInstanceRef.current = chart;
          chart.setOption(
            resolveEChartMotionOption(
              latestOptionRef.current,
              latestMotionPresetRef.current,
              reducedMotionRef.current
            ),
            setOptionOptions
          );
          element.dataset.echartsReady = "true";
          element.dataset.echartsRenderer = "canvas";
        })
        .finally(() => {
          runtimeLoading = false;
        });
    };
    const handleResize = () => {
      if (resizeFrame !== null) {
        return;
      }

      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        if (!chart) {
          initializeChart();
          return;
        }
        if (canRender()) {
          chart.resize();
        }
      });
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(handleResize);
    const intersectionObserver =
      renderPolicy === "visible" && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((entries) => {
            isIntersecting = entries.some((entry) => entry.isIntersecting);
            if (isIntersecting) {
              initializeChart();
              handleResize();
            }
          }, { rootMargin: "160px" })
        : null;
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "hidden") {
        initializeChart();
        handleResize();
      }
    };

    /* ECharts 会给画布写入内联宽高，因此观察稳定的外层容器。只有容器可见且
       宽高有效时才加载运行时和初始化实例，避免隐藏区域产生零尺寸警告。 */
    observer?.observe(observedElement);
    intersectionObserver?.observe(observedElement);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (!intersectionObserver) {
      isIntersecting = true;
      initializeChart();
    }

    return () => {
      disposed = true;
      observer?.disconnect();
      intersectionObserver?.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (resizeFrame !== null) {
        window.cancelAnimationFrame(resizeFrame);
      }
      if (chartInstanceRef.current === chart) {
        chartInstanceRef.current = null;
      }
      chart?.dispose();
    };
  }, [renderPolicy]);

  useEffect(() => {
    const chart = chartInstanceRef.current;
    if (!chart) {
      return;
    }

    chart.setOption(resolveEChartMotionOption(option, motionPreset, reducedMotion), setOptionOptions);
  }, [motionPreset, option, reducedMotion]);

  return (
    <div
      className={`xs-echart ${className}`}
      role="img"
      aria-label={summary ? `${label}。${summary}` : label}
    >
      <div ref={chartRef} className="xs-echart__canvas" />
    </div>
  );
}
