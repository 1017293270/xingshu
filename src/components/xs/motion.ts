import type { CSSProperties } from "react";

/**
 * 模块入场阶梯：一屏最多 5 档，超出的模块不再延迟。
 * 配合 .xs-page-enter（enter 260ms + stagger 32ms），首屏 420ms 内全部稳定。
 */
export function xsEnterStep(step: number): CSSProperties {
  return { "--xs-enter-step": Math.max(0, Math.min(Math.round(step), 5)) } as CSSProperties;
}
