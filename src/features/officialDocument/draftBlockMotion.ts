import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import type { OfficialDocumentDraftContent } from "@/types/officialDocument";

export type DraftBlock = OfficialDocumentDraftContent["blocks"][number];

/* WAAPI 读不到 CSS 变量，这里镜像 tokens.css 的缓动与时长档位，改动请两边同步。 */
const EASE_OUT = "cubic-bezier(.2, 0, 0, 1)"; /* --xs-motion-ease-out */
const EASE_SETTLE = "cubic-bezier(0.18, 0.89, 0.32, 1.08)"; /* --xs-motion-ease-spring */
const EASE_IN = "cubic-bezier(.4, 0, 1, 1)";

/** 邻居让位/合拢走 --xs-motion-slow 档；被拖动的那张多 60ms 完成抬起-落位。 */
const SHIFT_DURATION = 260;
const LEAD_DURATION = 320;
/** 新卡片延后入场，等空位先让开再落下。 */
const ENTER_DURATION = 300;
const ENTER_DELAY = 90;
/** 删除是"扔进回收站"：卡片向删除按钮收缩，260ms 内消失。 */
const EXIT_DURATION = 260;
const GHOST_CLEANUP_SLACK = 140;

/** 单篇公文可达数百节点，视口外（±240px）的卡片直接跳位，不上动画。 */
const VIEWPORT_MARGIN = 240;

const REST_SHADOW = "0 4px 14px rgb(37 86 137 / 5%)";
const LIFT_SHADOW = "0 14px 30px rgb(23 63 115 / 18%)";

export type DraftBlockMotionPlan =
  | { kind: "add"; blockId: string }
  | { kind: "move"; blockId: string }
  | { kind: "remove"; blockId: string };

/** 已从数据里删掉、但还在做"丢进回收站"动画的残影卡片。 */
export type DraftBlockGhost = {
  key: string;
  block: DraftBlock;
  index: number;
  total: number;
  style: CSSProperties;
};

type PendingPlan = { plan: DraftBlockMotionPlan; offsets: Map<string, number> };

function shiftCard(card: HTMLElement, delta: number, lead: boolean) {
  if (!lead) {
    card.animate(
      [{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }],
      { duration: SHIFT_DURATION, easing: EASE_OUT }
    );
    return;
  }
  card.style.zIndex = "2";
  const animation = card.animate(
    [
      { transform: `translateY(${delta}px)`, boxShadow: REST_SHADOW, easing: "cubic-bezier(.3, 0, .2, 1)" },
      { transform: `translateY(${delta * 0.42}px) scale(1.02)`, boxShadow: LIFT_SHADOW, offset: 0.5, easing: EASE_SETTLE },
      { transform: "translateY(0) scale(1)", boxShadow: REST_SHADOW }
    ],
    { duration: LEAD_DURATION, easing: EASE_OUT }
  );
  const clear = () => {
    card.style.zIndex = "";
  };
  animation.onfinish = clear;
  animation.oncancel = clear;
}

function enterCard(card: HTMLElement) {
  card.style.zIndex = "1";
  const animation = card.animate(
    [
      { opacity: 0, transform: "translateY(-10px) scale(.97)" },
      { opacity: 1, transform: "none" }
    ],
    { duration: ENTER_DURATION, delay: ENTER_DELAY, easing: EASE_SETTLE, fill: "backwards" }
  );
  const clear = () => {
    card.style.zIndex = "";
  };
  animation.onfinish = clear;
  animation.oncancel = clear;
}

/**
 * 结构化草稿卡片的动效编排：新增/移动/删除都先量旧位置，再用 FLIP 把布局跳变演成位移。
 * 数据侧照常立即提交，动效只作用于 DOM，reduced-motion 或无 WAAPI 时整体静默降级。
 */
export function useDraftBlockMotion() {
  const reducedMotion = usePrefersReducedMotion();
  const blocksRef = useRef<HTMLDivElement | null>(null);
  const planRef = useRef<PendingPlan | undefined>(undefined);
  const ghostSeqRef = useRef(0);
  const startedGhostsRef = useRef(new Set<string>());
  const ghostTimersRef = useRef(new Set<number>());
  const [ghosts, setGhosts] = useState<DraftBlockGhost[]>([]);

  const motionEnabled = useCallback(
    () => !reducedMotion && typeof Element !== "undefined" && typeof Element.prototype.animate === "function",
    [reducedMotion]
  );

  const readOffsets = useCallback(() => {
    const offsets = new Map<string, number>();
    const container = blocksRef.current;
    if (!container) return offsets;
    const containerTop = container.getBoundingClientRect().top;
    container.querySelectorAll<HTMLElement>("article[data-block-id]").forEach((card) => {
      const id = card.dataset.blockId;
      if (id) offsets.set(id, card.getBoundingClientRect().top - containerTop);
    });
    return offsets;
  }, []);

  /** 在改数据之前调用：记下当前每张卡片的位置，供本次渲染后做 FLIP。 */
  const prepare = useCallback(
    (plan: DraftBlockMotionPlan) => {
      if (!motionEnabled()) return;
      planRef.current = { plan, offsets: readOffsets() };
    },
    [motionEnabled, readOffsets]
  );

  /** 删除前调用：把这张卡片的几何位置留下来，删除后继续渲染残影做收进回收站的动画。 */
  const captureGhost = useCallback(
    (block: DraftBlock, index: number, total: number) => {
      if (!motionEnabled()) return;
      const container = blocksRef.current;
      const card = container?.querySelector<HTMLElement>(`article[data-block-id="${block.id}"]`);
      if (!container || !card) return;
      const containerRect = container.getBoundingClientRect();
      const rect = card.getBoundingClientRect();
      const bin = card.querySelector<HTMLElement>('[data-block-bin="true"]')?.getBoundingClientRect();
      ghostSeqRef.current += 1;
      setGhosts((current) => [
        ...current,
        {
          key: `${block.id}-${ghostSeqRef.current}`,
          block,
          index,
          total,
          style: {
            top: rect.top - containerRect.top,
            left: rect.left - containerRect.left,
            width: rect.width,
            height: rect.height,
            /* 收缩锚点落在删除按钮上，卡片就是被"吸"进那个回收站图标 */
            transformOrigin: bin
              ? `${bin.left + bin.width / 2 - rect.left}px ${bin.top + bin.height / 2 - rect.top}px`
              : "calc(100% - 24px) 21px"
          }
        }
      ]);
    },
    [motionEnabled]
  );

  useLayoutEffect(() => {
    const pending = planRef.current;
    planRef.current = undefined;
    const container = blocksRef.current;
    if (!pending || !container) return;
    const { plan, offsets } = pending;
    const containerTop = container.getBoundingClientRect().top;
    const viewportHeight = window.innerHeight || 0;
    container.querySelectorAll<HTMLElement>("article[data-block-id]").forEach((card) => {
      const id = card.dataset.blockId;
      if (!id) return;
      const rect = card.getBoundingClientRect();
      const offscreen = rect.bottom < -VIEWPORT_MARGIN || rect.top > viewportHeight + VIEWPORT_MARGIN;
      /* 操作主体（新增/移动的那张）始终动画：它随后会被滚动进视口 */
      if (offscreen && id !== plan.blockId) return;
      const previous = offsets.get(id);
      if (previous === undefined) {
        if (plan.kind === "add" && id === plan.blockId) enterCard(card);
        return;
      }
      const delta = previous - (rect.top - containerTop);
      if (Math.abs(delta) < 1) return;
      shiftCard(card, delta, plan.kind === "move" && id === plan.blockId);
    });
  });

  useLayoutEffect(() => {
    const container = blocksRef.current;
    if (!container) return;
    const timers = ghostTimersRef.current;
    ghosts.forEach((ghost) => {
      if (startedGhostsRef.current.has(ghost.key)) return;
      startedGhostsRef.current.add(ghost.key);
      const card = container.querySelector<HTMLElement>(`article[data-ghost-key="${ghost.key}"]`);
      if (!card) return;
      const drop = () => {
        window.clearTimeout(timer);
        timers.delete(timer);
        startedGhostsRef.current.delete(ghost.key);
        setGhosts((current) => current.filter((item) => item.key !== ghost.key));
      };
      const animation = card.animate(
        [
          { transform: "scale(1) rotate(0deg)", opacity: 1 },
          { transform: "scale(.6) rotate(-2deg)", opacity: 0.55, offset: 0.45 },
          { transform: "scale(.08) rotate(-9deg)", opacity: 0 }
        ],
        { duration: EXIT_DURATION, easing: EASE_IN, fill: "forwards" }
      );
      /* 动画被打断（切页/卡顿）也要保证残影不会留在页面上 */
      const timer = window.setTimeout(drop, EXIT_DURATION + GHOST_CLEANUP_SLACK);
      timers.add(timer);
      animation.onfinish = drop;
    });
  }, [ghosts]);

  useLayoutEffect(() => {
    const timers = ghostTimersRef.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  return { blocksRef, ghosts, prepare, captureGhost };
}
