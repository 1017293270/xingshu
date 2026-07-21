import { Button, Modal } from "antd";
import type { EChartsOption } from "echarts";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { XsAskDataDemo, XsEChart } from "@/components/xs";
import { useCountUp } from "@/hooks/useCountUp";
import { useUiStore } from "@/stores/uiStore";
import "./home-onboarding.css";

const ONBOARDING_FLAG_KEY = "xingshu_onboarding_v1";
const AUTO_OPEN_DELAY_MS = 700;

const slides = [
  {
    id: "ask",
    title: "一句话，问到可追溯的答案",
    description: "连接企业数据与权限体系，每次问数都可验证、可下钻。"
  },
  {
    id: "write",
    title: "从要点到成稿，一步之遥",
    description: "制表与写作理解业务语境，格式规范可直接使用。"
  },
  {
    id: "board",
    title: "经营全貌，一屏尽览",
    description: "看板汇聚指标、预警与管理动作。"
  }
] as const;

type SlideId = (typeof slides)[number]["id"];

const miniChartOption: EChartsOption = {
  color: ["#1677FF"],
  animationDuration: 900,
  animationEasing: "cubicOut",
  grid: { top: 14, right: 8, bottom: 22, left: 36 },
  xAxis: {
    type: "category",
    data: ["Q1", "Q2", "Q3", "Q4"],
    axisTick: { show: false },
    axisLine: { lineStyle: { color: "#DCE8FB" } },
    axisLabel: { color: "#6B7F9D", fontSize: 11 }
  },
  yAxis: {
    type: "value",
    axisLabel: { color: "#6B7F9D", fontSize: 11 },
    splitLine: { lineStyle: { color: "#EDF2FB" } }
  },
  series: [
    {
      name: "经营得分",
      type: "bar",
      barWidth: 18,
      itemStyle: { borderRadius: [5, 5, 0, 0] },
      data: [42, 58, 51, 76]
    }
  ]
};

function WritingVisual() {
  return (
    <div className="home-onboarding__doc" aria-hidden="true">
      <span className="home-onboarding__doc-title" />
      <span className="home-onboarding__doc-line home-onboarding__doc-line--1" />
      <span className="home-onboarding__doc-line home-onboarding__doc-line--2" />
      <span className="home-onboarding__doc-line home-onboarding__doc-line--3" />
      <div className="home-onboarding__doc-table">
        {Array.from({ length: 9 }, (_, index) => (
          <i key={index} />
        ))}
      </div>
    </div>
  );
}

function BoardVisual() {
  const kpiValue = useCountUp("12,846");
  return (
    <div className="home-onboarding__board" aria-hidden="true">
      <div className="home-onboarding__kpi">
        <span>数据资产总量</span>
        <strong>{kpiValue}</strong>
        <small>较昨日 ↑ 5.2%</small>
      </div>
      <div className="home-onboarding__mini-chart">
        <XsEChart option={miniChartOption} label="季度经营得分示例图" />
      </div>
    </div>
  );
}

function SlideVisual({ slideId }: { slideId: SlideId }) {
  if (slideId === "ask") {
    return <XsAskDataDemo />;
  }
  if (slideId === "write") {
    return <WritingVisual />;
  }
  return <BoardVisual />;
}

type HomeOnboardingProps = {
  /** 测试与日后"重看引导"入口使用；正常首访由 localStorage 标记驱动 */
  defaultOpen?: boolean;
};

export function HomeOnboarding({ defaultOpen = false }: HomeOnboardingProps) {
  const location = useLocation();
  const storeOpen = useUiStore((state) => state.onboardingOpen);
  const setOnboardingOpen = useUiStore((state) => state.setOnboardingOpen);
  const [open, setOpen] = useState(defaultOpen);
  const [index, setIndex] = useState(0);

  /* 账户菜单"新手引导"触发：每次打开都回到第一屏 */
  useEffect(() => {
    if (storeOpen) {
      setIndex(0);
      setOpen(true);
    }
  }, [storeOpen]);

  /* 首访自动弹出：仅应用首页 `/`，且未写过完成标记 */
  useEffect(() => {
    if (defaultOpen || storeOpen || location.pathname !== "/" || import.meta.env.MODE === "test") {
      return undefined;
    }
    try {
      if (window.localStorage.getItem(ONBOARDING_FLAG_KEY)) {
        return undefined;
      }
    } catch {
      return undefined;
    }
    const timer = window.setTimeout(() => setOpen(true), AUTO_OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [defaultOpen, storeOpen, location.pathname]);

  const close = useCallback(() => {
    try {
      window.localStorage.setItem(ONBOARDING_FLAG_KEY, "done");
    } catch {
      /* 无痕模式等场景忽略写入失败 */
    }
    setOpen(false);
    if (useUiStore.getState().onboardingOpen) {
      setOnboardingOpen(false);
    }
  }, [setOnboardingOpen]);

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
      className="home-onboarding"
      aria-label="星数新手引导"
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
