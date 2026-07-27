import type { CSSProperties } from "react";
import "./styles/star-convergence.css";

/**
 * 登录页中央动效「繁星汇聚成星簇」：
 * 散落的数据繁星（散）→ 被星数汇聚（聚）→ 收拢成有序环绕的星簇（序，有序可治理）。
 * 纯视觉装饰，对辅助技术隐藏；动画本体在 styles/star-convergence.css。
 */

type ParticleSpec = {
  /** 散落位（相对舞台中心，px） */
  sx: number;
  sy: number;
  /** 星簇槽位（相对舞台中心，px） */
  ox: number;
  oy: number;
  /** 汇聚循环错峰 delay（s，负值） */
  d: number;
  /** 闪烁错峰 delay（s，负值） */
  td: number;
  tone?: "cyan" | "sky";
  size?: "sm" | "lg";
  star?: boolean;
};

const INNER_RADIUS = 52;
const OUTER_RADIUS = 104;

/** 内环 4 槽位（90° 间隔），供 SVG 连线与粒子共用 */
const innerSlots = [
  { x: 0, y: -INNER_RADIUS },
  { x: INNER_RADIUS, y: 0 },
  { x: 0, y: INNER_RADIUS },
  { x: -INNER_RADIUS, y: 0 }
];

/** 外环 8 槽位（45° 间隔） */
const outerSlots = [
  { x: 0, y: -OUTER_RADIUS },
  { x: 74, y: -74 },
  { x: OUTER_RADIUS, y: 0 },
  { x: 74, y: 74 },
  { x: 0, y: OUTER_RADIUS },
  { x: -74, y: 74 },
  { x: -OUTER_RADIUS, y: 0 },
  { x: -74, y: -74 }
];

const particles: ParticleSpec[] = [
  // 内环
  { ...innerSlots[0], ox: innerSlots[0].x, oy: innerSlots[0].y, sx: -96, sy: 34, d: 0, td: -0.6, tone: "sky", size: "sm" },
  { ...innerSlots[1], ox: innerSlots[1].x, oy: innerSlots[1].y, sx: 18, sy: -98, d: -0.14, td: -2.1 },
  { ...innerSlots[2], ox: innerSlots[2].x, oy: innerSlots[2].y, sx: 104, sy: -12, d: -0.28, td: -1.4, tone: "cyan", star: true },
  { ...innerSlots[3], ox: innerSlots[3].x, oy: innerSlots[3].y, sx: 6, sy: 96, d: -0.42, td: -2.8, size: "lg" },
  // 外环
  { ...outerSlots[0], ox: outerSlots[0].x, oy: outerSlots[0].y, sx: -122, sy: -44, d: -0.1, td: -1.1, tone: "cyan" },
  { ...outerSlots[1], ox: outerSlots[1].x, oy: outerSlots[1].y, sx: -28, sy: 118, d: -0.24, td: -2.5 },
  { ...outerSlots[2], ox: outerSlots[2].x, oy: outerSlots[2].y, sx: 128, sy: 58, d: -0.38, td: -0.9, tone: "sky", size: "sm" },
  { ...outerSlots[3], ox: outerSlots[3].x, oy: outerSlots[3].y, sx: -60, sy: -8, d: -0.52, td: -1.9, size: "lg" },
  { ...outerSlots[4], ox: outerSlots[4].x, oy: outerSlots[4].y, sx: 66, sy: -128, d: -0.16, td: -3.1, tone: "cyan", star: true },
  { ...outerSlots[5], ox: outerSlots[5].x, oy: outerSlots[5].y, sx: 30, sy: 8, d: -0.3, td: -1.6 },
  { ...outerSlots[6], ox: outerSlots[6].x, oy: outerSlots[6].y, sx: -128, sy: -86, d: -0.44, td: -2.3, tone: "sky" },
  { ...outerSlots[7], ox: outerSlots[7].x, oy: outerSlots[7].y, sx: 48, sy: 92, d: -0.06, td: -0.4, size: "sm" }
];

const CENTER = 160;

/**
 * 坐标以 320px 设计舞台为基准书写（与 SVG viewBox 一致），
 * 输出时换算为 cqi（320px ≙ 100cqi），整幅构图随舞台实际宽度等比缩放。
 */
function toCqi(value: number) {
  return `${(value / 3.2).toFixed(2)}cqi`;
}

function particleStyle(spec: ParticleSpec): CSSProperties {
  return {
    "--sx": toCqi(spec.sx),
    "--sy": toCqi(spec.sy),
    "--ox": toCqi(spec.ox),
    "--oy": toCqi(spec.oy),
    "--d": `${spec.d}s`,
    "--td": `${spec.td}s`
  } as CSSProperties;
}

function particleClass(spec: ParticleSpec) {
  return [
    "login-star-convergence__p",
    spec.tone ? `login-star-convergence__p--${spec.tone}` : "",
    spec.size ? `login-star-convergence__p--${spec.size}` : "",
    spec.star ? "login-star-convergence__p--star" : ""
  ]
    .filter(Boolean)
    .join(" ");
}

export function LoginStarConvergence({ className = "" }: { className?: string }) {
  const links = [...innerSlots, ...outerSlots];

  return (
    <div className={`login-star-convergence ${className}`.trim()} aria-hidden="true">
      <div className="login-star-convergence__stage">
        <svg className="login-star-convergence__map" viewBox="0 0 320 320" focusable="false">
          <g className="login-star-convergence__rings">
            <circle
              className="login-star-convergence__ring login-star-convergence__ring--outer"
              cx={CENTER}
              cy={CENTER}
              r={OUTER_RADIUS}
            />
            <circle
              className="login-star-convergence__ring login-star-convergence__ring--inner"
              cx={CENTER}
              cy={CENTER}
              r={INNER_RADIUS}
            />
          </g>
          <g className="login-star-convergence__links">
            {links.map((slot) => (
              <line
                key={`${slot.x}-${slot.y}`}
                x1={CENTER}
                y1={CENTER}
                x2={CENTER + slot.x}
                y2={CENTER + slot.y}
                pathLength={100}
              />
            ))}
          </g>
          <g className="login-star-convergence__core">
            <circle className="login-star-convergence__core-halo" cx={CENTER} cy={CENTER} r={9} />
            <circle className="login-star-convergence__core-glow" cx={CENTER} cy={CENTER} r={12} />
            <circle className="login-star-convergence__core-dot" cx={CENTER} cy={CENTER} r={6} />
            <circle className="login-star-convergence__core-spark" cx={CENTER} cy={CENTER} r={2.2} />
          </g>
        </svg>
        {particles.map((spec, index) => (
          <span className={particleClass(spec)} style={particleStyle(spec)} key={index}>
            <i />
          </span>
        ))}
      </div>
    </div>
  );
}
