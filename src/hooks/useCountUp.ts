import { useEffect, useMemo, useState } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const countUpPattern = /^([\d,]+(?:\.\d+)?)(.*)$/;

type ParsedCountUp = {
  target: number;
  suffix: string;
  decimals: number;
};

function parseCountUpValue(rawValue: string): ParsedCountUp | null {
  const match = rawValue.match(countUpPattern);
  if (!match) {
    return null;
  }
  const numeric = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const decimals = match[1].includes(".") ? match[1].split(".")[1].length : 0;
  return { target: numeric, suffix: match[2], decimals };
}

/**
 * 数字滚动：从 0 缓动到目标值（保留原字符串的小数位、千分位与后缀）。
 * reduced-motion、测试环境或 active=false 时直接返回原字符串。
 */
export function useCountUp(rawValue: string, active = true, durationMs = 650) {
  const reducedMotion = usePrefersReducedMotion();
  const parsed = useMemo(() => parseCountUpValue(rawValue), [rawValue]);
  const enabled = active && parsed !== null && !reducedMotion && import.meta.env.MODE !== "test";
  const [display, setDisplay] = useState(rawValue);

  useEffect(() => {
    if (!enabled || !parsed) {
      setDisplay(rawValue);
      return undefined;
    }

    let frame = 0;
    const start = performance.now();
    const format = (value: number) =>
      value.toLocaleString("zh-CN", {
        minimumFractionDigits: parsed.decimals,
        maximumFractionDigits: parsed.decimals
      });

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(`${format(parsed.target * eased)}${parsed.suffix}`);
      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [enabled, parsed, rawValue, durationMs]);

  return display;
}
