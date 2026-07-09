import type { EChartsOption, EChartsType } from "echarts";
import { useEffect, useRef } from "react";

type XsEChartProps = {
  option: EChartsOption;
  label: string;
  className?: string;
};

export function XsEChart({ option, label, className = "" }: XsEChartProps) {
  const chartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!chartRef.current || import.meta.env.MODE === "test") {
      return undefined;
    }

    let chart: EChartsType | null = null;
    let disposed = false;
    const element = chartRef.current;
    const handleResize = () => chart?.resize();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(handleResize);

    void import("echarts").then((echarts) => {
      if (disposed) {
        return;
      }

      chart = echarts.init(element, null, { renderer: "canvas" });
      chart.setOption(option);
      element.dataset.echartsReady = "true";
      element.dataset.echartsRenderer = "canvas";
      window.addEventListener("resize", handleResize);
      observer?.observe(element);
    });

    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener("resize", handleResize);
      chart?.dispose();
    };
  }, [option]);

  return (
    <div className={`xs-echart ${className}`} role="img" aria-label={label}>
      <div ref={chartRef} className="xs-echart__canvas" />
    </div>
  );
}
