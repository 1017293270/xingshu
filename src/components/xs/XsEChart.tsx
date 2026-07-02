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

    void import("echarts").then((echarts) => {
      if (disposed) {
        return;
      }

      chart = echarts.init(element, null, { renderer: "canvas" });
      chart.setOption(option);
      element.dataset.echartsReady = "true";
      element.dataset.echartsRenderer = "canvas";
      window.addEventListener("resize", handleResize);
    });

    return () => {
      disposed = true;
      window.removeEventListener("resize", handleResize);
      chart?.dispose();
    };
  }, [option]);

  return <div ref={chartRef} className={`xs-echart ${className}`} role="img" aria-label={label} />;
}
