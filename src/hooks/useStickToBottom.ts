import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent
} from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const BOTTOM_THRESHOLD = 24;

type SmoothScrollHandle = {
  frameId: number | null;
  aborted: boolean;
};

export function isNearScrollBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= BOTTOM_THRESHOLD;
}

function getScrollBottom(element: HTMLElement) {
  return Math.max(0, element.scrollHeight - element.clientHeight);
}

function easeOutXingshu(progress: number) {
  const t = Math.min(1, Math.max(0, progress));
  return 1 - (1 - t) ** 4;
}

function cancelSmoothScroll(handle: SmoothScrollHandle) {
  handle.aborted = true;
  if (handle.frameId !== null) {
    window.cancelAnimationFrame(handle.frameId);
    handle.frameId = null;
  }
}

/**
 * 平滑滚到底。目标值每帧重算，所以流式内容边长边滚也不会追丢。
 */
function scrollElementToBottom(
  element: HTMLElement,
  options: { smooth?: boolean; handle?: SmoothScrollHandle } = {}
) {
  const handle = options.handle;
  const bottom = getScrollBottom(element);

  if (handle) {
    cancelSmoothScroll(handle);
    handle.aborted = false;
  }

  if (Math.abs(element.scrollTop - bottom) <= 1) return;

  if (!options.smooth) {
    element.scrollTop = bottom;
    return;
  }

  const startTop = element.scrollTop;
  const duration = Math.min(520, Math.max(280, Math.abs(bottom - startTop) * 0.32));
  let startTime: number | null = null;
  let finished = false;

  const finish = () => {
    finished = true;
    element.scrollTop = getScrollBottom(element);
    if (handle) handle.frameId = null;
  };

  const tick = (now: number) => {
    if (finished || handle?.aborted) return;
    if (startTime === null) startTime = now;
    const t = Math.min(1, (now - startTime) / duration);
    element.scrollTop = startTop + (getScrollBottom(element) - startTop) * easeOutXingshu(t);
    if (t >= 1) {
      finish();
      return;
    }
    const nextId = window.requestAnimationFrame(tick);
    if (!finished && handle && !handle.aborted) handle.frameId = nextId;
  };

  const frameId = window.requestAnimationFrame(tick);
  if (!finished && handle && !handle.aborted) handle.frameId = frameId;
}

export type StickToBottomOptions = {
  /**
   * 内容签名。变化即尝试跟随，流式场景传「已生成字数」这类会持续变的值。
   */
  signature?: string | number;
  /** 关掉时重置为「贴底」，用于空态。 */
  enabled?: boolean;
};

/**
 * 会话流的滚动契约：贴底才自动跟随，用户一旦主动上滚就脱离并露出「回到底部」。
 * 强制 `scrollTop = scrollHeight` 会在流式期间把正在回看的用户拽回底部，所以不要那么写。
 */
export function useStickToBottom<T extends HTMLElement = HTMLDivElement>(
  options: StickToBottomOptions = {}
) {
  const { signature = "", enabled = true } = options;
  const containerRef = useRef<T | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const frameRef = useRef<number | null>(null);
  const smoothHandleRef = useRef<SmoothScrollHandle>({ frameId: null, aborted: false });
  const lastScrollTopRef = useRef(0);
  const pointerDownRef = useRef(false);
  const lastTouchYRef = useRef<number | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const scheduleFollow = useCallback(() => {
    const container = containerRef.current;
    if (
      !container
      || !shouldAutoScrollRef.current
      || frameRef.current !== null
      || smoothHandleRef.current.frameId !== null
    ) {
      return;
    }

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const current = containerRef.current;
      if (!current || !shouldAutoScrollRef.current) return;
      scrollElementToBottom(current);
      lastScrollTopRef.current = current.scrollTop;
      setShowScrollToBottom(false);
    });
  }, []);

  const pauseAutoScroll = useCallback(() => {
    shouldAutoScrollRef.current = false;
    cancelSmoothScroll(smoothHandleRef.current);
    const container = containerRef.current;
    if (container && !isNearScrollBottom(container)) setShowScrollToBottom(true);
  }, []);

  const scrollToBottom = useCallback(() => {
    shouldAutoScrollRef.current = true;
    setShowScrollToBottom(false);
    const container = containerRef.current;
    if (!container) return;
    scrollElementToBottom(container, { smooth: !reducedMotion, handle: smoothHandleRef.current });
    lastScrollTopRef.current = container.scrollTop;
  }, [reducedMotion]);

  useEffect(() => {
    if (enabled) return;
    shouldAutoScrollRef.current = true;
    lastScrollTopRef.current = 0;
    cancelSmoothScroll(smoothHandleRef.current);
    setShowScrollToBottom(false);
  }, [enabled]);

  useEffect(() => {
    const release = () => {
      pointerDownRef.current = false;
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, []);

  useEffect(() => {
    const smoothHandle = smoothHandleRef.current;
    if (enabled) scheduleFollow();
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      cancelSmoothScroll(smoothHandle);
    };
  }, [enabled, scheduleFollow, signature]);

  /* 流式文本让内容高度持续变化，靠 ResizeObserver 才能跟住每一次增高。 */
  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container || typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(() => {
      const current = containerRef.current;
      if (current && !shouldAutoScrollRef.current && isNearScrollBottom(current)) {
        shouldAutoScrollRef.current = true;
        setShowScrollToBottom(false);
      }
      scheduleFollow();
    });

    observer.observe(container);
    for (const child of Array.from(container.children)) {
      if (child instanceof HTMLElement) observer.observe(child);
    }

    return () => observer.disconnect();
  }, [enabled, scheduleFollow, signature]);

  const onScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const atBottom = isNearScrollBottom(container);
    const movedUp = container.scrollTop < lastScrollTopRef.current - 2;

    if (atBottom) {
      shouldAutoScrollRef.current = true;
      setShowScrollToBottom(false);
    } else if (pointerDownRef.current && movedUp) {
      shouldAutoScrollRef.current = false;
      setShowScrollToBottom(true);
    } else if (!shouldAutoScrollRef.current) {
      setShowScrollToBottom(true);
    }

    lastScrollTopRef.current = container.scrollTop;
  }, []);

  const containerProps = {
    ref: containerRef,
    onScroll,
    onPointerDown: (_event: ReactPointerEvent<T>) => {
      pointerDownRef.current = true;
    },
    onWheel: (event: ReactWheelEvent<T>) => {
      if (event.deltaY < 0) pauseAutoScroll();
    },
    onTouchStart: (event: ReactTouchEvent<T>) => {
      lastTouchYRef.current = event.touches[0]?.clientY ?? null;
    },
    onTouchMove: (event: ReactTouchEvent<T>) => {
      const touchY = event.touches[0]?.clientY;
      const previous = lastTouchYRef.current;
      if (touchY !== undefined && previous !== null && touchY > previous + 2) pauseAutoScroll();
      lastTouchYRef.current = touchY ?? null;
    },
    onKeyDown: (event: ReactKeyboardEvent<T>) => {
      if (["ArrowUp", "PageUp", "Home"].includes(event.key) || (event.key === " " && event.shiftKey)) {
        pauseAutoScroll();
      }
    }
  };

  return { containerRef, containerProps, showScrollToBottom, scrollToBottom, pauseAutoScroll };
}
