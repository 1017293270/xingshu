import { useEffect, useState } from "react";

/**
 * 以固定间隔返回当前时间戳，用于运行中耗时等实时读数。
 * active 为 false 时暂停计时，避免空闲轮次持续重渲染。
 */
export function useNow(intervalMs: number, active = true): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, active]);

  return now;
}
