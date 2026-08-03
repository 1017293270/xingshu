import { Button, Modal } from "antd";
import type { EChartsOption } from "echarts";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
import { XsEChart } from "@/components/xs/XsEChart";
import { useCountUp } from "@/hooks/useCountUp";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import { useUiStore } from "@/stores/uiStore";
/* 弹窗外壳（视觉区 / 文案 / 底部操作）与首页新手引导共用 home-onboarding__* 样式 */
import "../home/home-onboarding.css";
import "./dashboard-onboarding.css";

const DASHBOARD_ONBOARDING_FLAG_KEY = "xingshu_dashboard_onboarding_v2";

export function dashboardOnboardingStorageKey(userId: number | null | undefined) {
  return `${DASHBOARD_ONBOARDING_FLAG_KEY}:${userId ?? "anonymous"}`;
}

export function hasCompletedDashboardOnboarding(userId: number | null | undefined) {
  try {
    return window.localStorage.getItem(dashboardOnboardingStorageKey(userId)) === "done";
  } catch {
    return true;
  }
}

const slides = [
  {
    id: "gather",
    title: "数据繁星，汇聚成屏",
    description: "收藏的问数结果与企业数据资产，一键汇聚成一张有序的大屏。"
  },
  {
    id: "arrange",
    title: "拖拽编排，布局由你",
    description: "图表与指标卡自由拖放，网格自动对齐，布局与查询独立发布。"
  },
  {
    id: "present",
    title: "一键放映，经营尽览",
    description: "全屏放映实时刷新，一条分享链接让每块屏幕看到同一份数据。"
  }
] as const;

type SlideId = (typeof slides)[number]["id"];

/* ---------- S1 汇聚：散落的数据星点落位，大屏线框随之点亮（循环） ---------- */

type ConvergeParticle = {
  /** 散落位（相对舞台中心，px，320×208 设计舞台） */
  sx: number;
  sy: number;
  /** 大屏槽位（相对舞台中心，px） */
  ox: number;
  oy: number;
  /** 汇聚循环错峰 delay（s，负值） */
  d: number;
  tone?: "cyan" | "sky";
  size?: "sm" | "lg";
  star?: boolean;
};

/**
 * 槽位与大屏线框一一对应：4 张 KPI 卡、2 个图表面板、标题栏、右上角操作点、
 * 以及屏幕四角（相对 320×208 舞台中心 160,104）。
 */
const convergeParticles: ConvergeParticle[] = [
  // KPI 卡槽位
  { ox: -75, oy: -31, sx: -146, sy: 22, d: 0, tone: "sky", size: "sm" },
  { ox: -25, oy: -31, sx: -54, sy: -96, d: -0.14 },
  { ox: 25, oy: -31, sx: 58, sy: -98, d: -0.28, tone: "cyan", star: true },
  { ox: 75, oy: -31, sx: 150, sy: 36, d: -0.42, size: "lg" },
  // 图表面板槽位
  { ox: -37, oy: 20, sx: -134, sy: 74, d: -0.1, tone: "cyan" },
  { ox: 63, oy: 20, sx: 138, sy: 86, d: -0.24 },
  // 标题栏与操作点
  { ox: -64, oy: -58, sx: -18, sy: -100, d: -0.38, tone: "sky", size: "sm" },
  { ox: 90, oy: -58, sx: 154, sy: -54, d: -0.52, size: "lg" },
  // 屏幕四角
  { ox: -108, oy: -76, sx: -152, sy: -72, d: -0.16, tone: "cyan" },
  { ox: 108, oy: -76, sx: 98, sy: -102, d: -0.3 },
  { ox: -108, oy: 60, sx: -94, sy: 100, d: -0.44, tone: "sky" },
  { ox: 108, oy: 60, sx: 90, sy: 102, d: -0.06, size: "sm" }
];

/** 坐标以 320px 设计舞台为基准书写，输出换算为 cqi 随舞台等比缩放（同登录页星汇聚） */
function toCqi(value: number) {
  return `${(value / 3.2).toFixed(2)}cqi`;
}

function particleStyle(spec: ConvergeParticle): CSSProperties {
  return {
    "--sx": toCqi(spec.sx),
    "--sy": toCqi(spec.sy),
    "--ox": toCqi(spec.ox),
    "--oy": toCqi(spec.oy),
    "--d": `${spec.d}s`
  } as CSSProperties;
}

function particleClass(spec: ConvergeParticle) {
  return [
    "db-converge__p",
    spec.tone ? `db-converge__p--${spec.tone}` : "",
    spec.size ? `db-converge__p--${spec.size}` : "",
    spec.star ? "db-converge__p--star" : ""
  ]
    .filter(Boolean)
    .join(" ");
}

/** 线框元素错峰 delay（s，负值）：屏体 → 标题/KPI → 图表面板 → 内容填充 → 柱/环 */
function drawDelay(value: number): CSSProperties {
  return { "--dd": `${value}s` } as CSSProperties;
}

const KPI_TILE_X = [64, 114, 164, 214];
const CHART_BARS = [
  { x: 76, y: 120, h: 20 },
  { x: 98, y: 108, h: 32 },
  { x: 120, y: 126, h: 14 },
  { x: 142, y: 114, h: 26 }
];

function ConvergeVisual() {
  return (
    <div className="db-converge" aria-hidden="true">
      <div className="db-converge__stage">
        <svg className="db-converge__screen" viewBox="0 0 320 208" focusable="false">
          {/* 屏体底板与边框 */}
          <rect className="db-converge__fill db-converge__fill--screen" x={52} y={28} width={216} height={136} rx={10} style={drawDelay(-0.2)} />
          <rect className="db-converge__draw db-converge__draw--frame" x={52} y={28} width={216} height={136} rx={10} pathLength={100} style={drawDelay(-0.1)} />
          {/* 标题（大屏名示例）与右上角操作点 */}
          <text className="db-converge__fill db-converge__title-text" x={64} y={49} style={drawDelay(-0.9)}>
            经营分析大屏
          </text>
          <circle className="db-converge__draw" cx={238} cy={46} r={3} pathLength={100} style={drawDelay(-0.45)} />
          <circle className="db-converge__draw" cx={250} cy={46} r={3} pathLength={100} style={drawDelay(-0.55)} />
          {/* 4 张 KPI 卡：线框 → 底板 → 数值条 */}
          {KPI_TILE_X.map((x, index) => (
            <g key={`kpi-${x}`}>
              <rect className="db-converge__draw" x={x} y={58} width={42} height={30} rx={6} pathLength={100} style={drawDelay(-0.5 - index * 0.1)} />
              <rect className="db-converge__fill" x={x} y={58} width={42} height={30} rx={6} style={drawDelay(-1.2 - index * 0.1)} />
              <rect className="db-converge__fill db-converge__fill--value" x={x + 9} y={68} width={24} height={5} rx={2.5} style={drawDelay(-1.5 - index * 0.1)} />
              <rect className="db-converge__fill db-converge__fill--sub" x={x + 9} y={77} width={15} height={4} rx={2} style={drawDelay(-1.6 - index * 0.1)} />
            </g>
          ))}
          {/* 左：柱状图面板 */}
          <rect className="db-converge__draw" x={64} y={96} width={118} height={56} rx={6} pathLength={100} style={drawDelay(-0.9)} />
          <rect className="db-converge__fill" x={64} y={96} width={118} height={56} rx={6} style={drawDelay(-1.4)} />
          {CHART_BARS.map((bar, index) => (
            <rect
              key={`bar-${bar.x}`}
              className={`db-converge__bar${index % 2 === 1 ? " db-converge__bar--cyan" : ""}`}
              x={bar.x}
              y={bar.y}
              width={12}
              height={bar.h}
              rx={2.5}
              style={drawDelay(-1.6 - index * 0.15)}
            />
          ))}
          {/* 右：环图面板 */}
          <rect className="db-converge__draw" x={190} y={96} width={66} height={56} rx={6} pathLength={100} style={drawDelay(-1.0)} />
          <rect className="db-converge__fill" x={190} y={96} width={66} height={56} rx={6} style={drawDelay(-1.5)} />
          <circle className="db-converge__donut" cx={223} cy={124} r={13} pathLength={100} style={drawDelay(-1.7)} />
          <circle className="db-converge__fill db-converge__fill--dot" cx={223} cy={124} r={3.5} style={drawDelay(-2.0)} />
        </svg>
        {convergeParticles.map((spec, index) => (
          <span className={particleClass(spec)} style={particleStyle(spec)} key={index}>
            <i />
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------- S2 编排：图表卡片从四处拖入网格，自动吸附对齐（循环） ---------- */

function ArrangeVisual() {
  return (
    <div className="db-arrange" aria-hidden="true">
      <div className="db-arrange__toolbar">
        <i />
        <i />
        <i />
        <span className="db-arrange__name">经营分析大屏</span>
      </div>
      <div className="db-arrange__canvas">
        <span className="db-arrange__slot db-arrange__slot--a" />
        <span className="db-arrange__slot db-arrange__slot--b" />
        <span className="db-arrange__slot db-arrange__slot--c" />
        <div className="db-arrange__card db-arrange__card--a">
          <span className="db-arrange__card-title" />
          <div className="db-arrange__bars">
            <i style={{ height: "38%" }} />
            <i style={{ height: "64%" }} />
            <i style={{ height: "30%" }} />
            <i style={{ height: "52%" }} />
          </div>
        </div>
        <div className="db-arrange__card db-arrange__card--b">
          <span className="db-arrange__card-title" />
          <svg className="db-arrange__line" viewBox="0 0 60 24" focusable="false">
            <polyline points="0,20 12,14 24,16 36,8 48,11 60,4" pathLength={100} />
          </svg>
        </div>
        <div className="db-arrange__card db-arrange__card--c">
          <span className="db-arrange__kpi-label">指标完成率</span>
          <strong className="db-arrange__kpi-value">98.2%</strong>
          <small className="db-arrange__kpi-trend">↑ 1.6%</small>
        </div>
      </div>
    </div>
  );
}

/* ---------- S3 放映：迷你大屏实时放映（KPI 滚动 + 实时图表 + 投影扫光） ---------- */

const presentChartOption: EChartsOption = {
  color: ["#1677FF", "#29B8ED"],
  animationDuration: 900,
  animationEasing: "cubicOut",
  grid: { top: 18, right: 10, bottom: 22, left: 36 },
  xAxis: {
    type: "category",
    data: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
    axisTick: { show: false },
    axisLine: { lineStyle: { color: "#DCE8FB" } },
    axisLabel: { color: "#6B7F9D", fontSize: 10 }
  },
  yAxis: {
    type: "value",
    axisLabel: { color: "#6B7F9D", fontSize: 10 },
    splitLine: { lineStyle: { color: "#EDF2FB" } }
  },
  series: [
    {
      name: "访问量",
      type: "bar",
      barWidth: 12,
      itemStyle: { borderRadius: [4, 4, 0, 0] },
      data: [320, 452, 390, 534, 490, 610, 568]
    },
    {
      name: "在线终端",
      type: "line",
      smooth: true,
      symbol: "circle",
      symbolSize: 5,
      lineStyle: { width: 2.5 },
      areaStyle: { opacity: 0.1 },
      data: [210, 332, 301, 434, 420, 530, 509]
    }
  ]
};

function PresentVisual() {
  const assetTotal = useCountUp("12,846");
  const todayQueries = useCountUp("3,209");
  const onlineScreens = useCountUp("28");
  return (
    <div className="db-present" aria-hidden="true">
      <span className="db-present__orbit" />
      <div className="db-present__screen">
        <div className="db-present__head">
          <span className="db-present__title">经营分析大屏</span>
          <span className="db-present__live">
            <i />
            LIVE
          </span>
        </div>
        <div className="db-present__kpis">
          <div>
            <span>数据资产总量</span>
            <strong>{assetTotal}</strong>
          </div>
          <div>
            <span>今日查询</span>
            <strong>{todayQueries}</strong>
          </div>
          <div>
            <span>在线大屏</span>
            <strong>{onlineScreens}</strong>
          </div>
        </div>
        <div className="db-present__chart">
          <XsEChart option={presentChartOption} label="大屏放映示例图" />
        </div>
        <span className="db-present__shine" />
      </div>
    </div>
  );
}

function SlideVisual({ slideId }: { slideId: SlideId }) {
  if (slideId === "gather") {
    return <ConvergeVisual />;
  }
  if (slideId === "arrange") {
    return <ArrangeVisual />;
  }
  return <PresentVisual />;
}

type DashboardOnboardingProps = {
  /** 测试与日后"重看引导"入口使用；正常首访由 localStorage 标记驱动 */
  defaultOpen?: boolean;
};

export function DashboardOnboarding({ defaultOpen = false }: DashboardOnboardingProps) {
  const userId = useDataHubAuthStore((state) => state.user?.userId);
  const storeOpen = useUiStore((state) => state.dashboardOnboardingOpen);
  const setStoreOpen = useUiStore((state) => state.setDashboardOnboardingOpen);
  const [open, setOpen] = useState(defaultOpen);
  const [index, setIndex] = useState(0);

  /* 账户菜单"大屏引导"触发：每次打开都回到第一屏 */
  useEffect(() => {
    if (storeOpen) {
      setIndex(0);
      setOpen(true);
      return;
    }
    if (!defaultOpen) {
      setOpen(false);
    }
  }, [defaultOpen, storeOpen]);

  const close = useCallback(() => {
    try {
      window.localStorage.setItem(dashboardOnboardingStorageKey(userId), "done");
    } catch {
      /* 无痕模式等场景忽略写入失败 */
    }
    setOpen(false);
    if (useUiStore.getState().dashboardOnboardingOpen) {
      setStoreOpen(false);
    }
  }, [setStoreOpen, userId]);

  const slide = slides[index];
  const isLast = index === slides.length - 1;

  return (
    <Modal
      open={open}
      onCancel={close}
      footer={null}
      closable={false}
      centered
      destroyOnHidden
      width={720}
      className="home-onboarding dashboard-onboarding"
      aria-label="星数大屏引导"
      transitionName={import.meta.env.MODE === "test" ? "" : undefined}
      maskTransitionName={import.meta.env.MODE === "test" ? "" : undefined}
    >
      <div className="home-onboarding__visual" key={slide.id}>
        <SlideVisual slideId={slide.id} />
      </div>

      <div className="home-onboarding__body">
        <h2>{slide.title}</h2>
        <p>{slide.description}</p>
      </div>

      <div className="home-onboarding__footer">
        <button className="home-onboarding__skip" type="button" onClick={close}>
          跳过
        </button>
        <div className="home-onboarding__dots" aria-hidden="true">
          {slides.map((item, itemIndex) => (
            <span key={item.id} data-active={itemIndex === index} />
          ))}
        </div>
        <div className="home-onboarding__actions">
          {index > 0 ? (
            <Button onClick={() => setIndex(index - 1)}>上一步</Button>
          ) : null}
          <Button type="primary" onClick={() => (isLast ? close() : setIndex(index + 1))}>
            {isLast ? "开始体验" : "下一步"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
