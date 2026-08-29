import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isNearScrollBottom, useStickToBottom } from "./useStickToBottom";

/** jsdom 不排版，滚动几何全靠手工装配。 */
function attachContainer(
  ref: { current: HTMLDivElement | null },
  geometry: { scrollHeight: number; clientHeight: number; scrollTop: number }
) {
  const element = document.createElement("div");
  Object.defineProperty(element, "scrollHeight", { configurable: true, value: geometry.scrollHeight });
  Object.defineProperty(element, "clientHeight", { configurable: true, value: geometry.clientHeight });
  element.scrollTop = geometry.scrollTop;
  ref.current = element;
  return element;
}

describe("useStickToBottom", () => {
  beforeEach(() => {
    // 同步跑帧，但时间戳必须真的往前走，否则缓动永远到不了终点
    let clock = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      clock += 600;
      callback(clock);
      return 1;
    });
  });

  it("treats a container within the threshold as bottomed out", () => {
    const element = document.createElement("div");
    Object.defineProperty(element, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(element, "clientHeight", { configurable: true, value: 400 });

    element.scrollTop = 590;
    expect(isNearScrollBottom(element)).toBe(true);

    element.scrollTop = 400;
    expect(isNearScrollBottom(element)).toBe(false);
  });

  it("follows new content while the user sits at the bottom", () => {
    const { result, rerender } = renderHook(
      ({ signature }) => useStickToBottom<HTMLDivElement>({ signature }),
      { initialProps: { signature: 0 } }
    );
    const element = attachContainer(result.current.containerRef, {
      scrollHeight: 1000,
      clientHeight: 400,
      scrollTop: 600
    });

    rerender({ signature: 1 });

    expect(element.scrollTop).toBe(600);
    expect(result.current.showScrollToBottom).toBe(false);
  });

  it("stops following once the user scrolls up, then resumes on demand", () => {
    const { result, rerender } = renderHook(
      ({ signature }) => useStickToBottom<HTMLDivElement>({ signature }),
      { initialProps: { signature: 0 } }
    );
    const element = attachContainer(result.current.containerRef, {
      scrollHeight: 1000,
      clientHeight: 400,
      scrollTop: 600
    });

    act(() => {
      result.current.pauseAutoScroll();
      element.scrollTop = 120;
      result.current.containerProps.onScroll();
    });
    expect(result.current.showScrollToBottom).toBe(true);

    // 流式内容继续增长也不能把正在回看的用户拽回底部
    rerender({ signature: 2 });
    expect(element.scrollTop).toBe(120);

    act(() => result.current.scrollToBottom());
    expect(element.scrollTop).toBe(600);
    expect(result.current.showScrollToBottom).toBe(false);
  });

  it("re-arms following when the user scrolls back to the bottom", () => {
    const { result } = renderHook(() => useStickToBottom<HTMLDivElement>({ signature: 0 }));
    const element = attachContainer(result.current.containerRef, {
      scrollHeight: 1000,
      clientHeight: 400,
      scrollTop: 100
    });

    act(() => {
      result.current.pauseAutoScroll();
      result.current.containerProps.onScroll();
    });
    expect(result.current.showScrollToBottom).toBe(true);

    act(() => {
      element.scrollTop = 600;
      result.current.containerProps.onScroll();
    });
    expect(result.current.showScrollToBottom).toBe(false);
  });
});
