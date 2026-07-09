import type { EChartsOption, EChartsType } from "echarts";
import { useEffect, useRef } from "react";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

type XsEChartProps = {
  option: EChartsOption;
  label: string;
  className?: string;
};

const setOptionOptions = {
  notMerge: false,
  lazyUpdate: true,
  replaceMerge: ["series", "xAxis", "yAxis"]
};

export function XsEChart({ option, label, className = "" }: XsEChartProps) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef = useRef<EChartsType | null>(null);
  const latestOptionRef = useRef(option);
  const reducedMotion = usePrefersReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);

  latestOptionRef.current = option;
  reducedMotionRef.current = reducedMotion;

  useEffect(() => {
    if (!chartRef.current || import.meta.env.MODE === "test") {
      return undefined;
    }

    let chart: EChartsType | null = null;
    let disposed = false;
    let resizeFrame: number | null = null;
    const element = chartRef.current;
    const handleResize = () => {
      if (resizeFrame !== null) {
        return;
      }

      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        chart?.resize();
      });
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(handleResize);

    void import("echarts").then((echarts) => {
      if (disposed) {
        return;
      }

      chart = echarts.init(element, null, { renderer: "canvas" });
      chartInstanceRef.current = chart;
      chart.setOption(
        reducedMotionRef.current
          ? { ...latestOptionRef.current, animation: false }
          : latestOptionRef.current,
        setOptionOptions
      );
      element.dataset.echartsReady = "true";
      element.dataset.echartsRenderer = "canvas";
      observer?.observe(element);
    });

    return () => {
      disposed = true;
      observer?.disconnect();
      if (resizeFrame !== null) {
        window.cancelAnimationFrame(resizeFrame);
      }
      if (chartInstanceRef.current === chart) {
        chartInstanceRef.current = null;
      }
      chart?.dispose();
    };
  }, []);

  useEffect(() => {
    const chart = chartInstanceRef.current;
    if (!chart) {
      return;
    }

    chart.setOption(reducedMotion ? { ...option, animation: false } : option, setOptionOptions);
  }, [option, reducedMotion]);

  return (
    <div className={`xs-echart ${className}`} role="img" aria-label={label}>
      <div ref={chartRef} className="xs-echart__canvas" />
    </div>
  );
}
