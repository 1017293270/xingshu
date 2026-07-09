import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setReducedMotion } from "@/test/setup";

import { XsEChart } from "./XsEChart";

const chartMocks = vi.hoisted(() => {
  const setOption = vi.fn();
  const resize = vi.fn();
  const dispose = vi.fn();
  const init = vi.fn(() => ({ setOption, resize, dispose }));

  return { init, setOption, resize, dispose };
});

vi.mock("echarts", () => ({ init: chartMocks.init }));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  chartMocks.init.mockClear();
  chartMocks.setOption.mockClear();
  chartMocks.resize.mockClear();
  chartMocks.dispose.mockClear();
  setReducedMotion(false);
  vi.unstubAllGlobals();
});

describe("XsEChart", () => {
  it("does not initialize a canvas chart in ordinary JSDOM page tests", async () => {
    const { getByRole } = render(<XsEChart option={{ series: [] }} label="营收趋势图" />);

    expect(getByRole("img", { name: "营收趋势图" })).toBeInTheDocument();
    await Promise.resolve();
    expect(chartMocks.init).not.toHaveBeenCalled();
  });

  it("initializes once and applies option updates without rebuilding the chart", async () => {
    vi.stubEnv("MODE", "development");
    const firstOption = { title: { text: "第一版" } };
    const nextOption = { title: { text: "第二版" } };
    const { rerender } = render(<XsEChart option={firstOption} label="营收趋势图" />);

    await waitFor(() => expect(chartMocks.init).toHaveBeenCalledTimes(1));
    expect(chartMocks.setOption).toHaveBeenLastCalledWith(firstOption, {
      notMerge: false,
      lazyUpdate: true,
      replaceMerge: ["series", "xAxis", "yAxis"]
    });

    rerender(<XsEChart option={nextOption} label="营收趋势图" />);

    await waitFor(() =>
      expect(chartMocks.setOption).toHaveBeenLastCalledWith(nextOption, {
        notMerge: false,
        lazyUpdate: true,
        replaceMerge: ["series", "xAxis", "yAxis"]
      })
    );
    expect(chartMocks.init).toHaveBeenCalledTimes(1);
  });

  it("replaces structural components when switching between cartesian and pie charts", async () => {
    vi.stubEnv("MODE", "development");
    const lineOption = {
      xAxis: { type: "category" as const },
      yAxis: { type: "value" as const },
      series: [{ type: "line" as const, data: [1, 2] }]
    };
    const pieOption = {
      series: [{ type: "pie" as const, data: [{ name: "已治理", value: 2 }] }]
    };
    const { rerender } = render(<XsEChart option={lineOption} label="资产类型图" />);

    await waitFor(() => expect(chartMocks.init).toHaveBeenCalledTimes(1));
    rerender(<XsEChart option={pieOption} label="资产类型图" />);

    await waitFor(() =>
      expect(chartMocks.setOption).toHaveBeenLastCalledWith(pieOption, {
        notMerge: false,
        lazyUpdate: true,
        replaceMerge: ["series", "xAxis", "yAxis"]
      })
    );
    expect(chartMocks.init).toHaveBeenCalledTimes(1);
  });

  it("disposes the chart instance when unmounted", async () => {
    vi.stubEnv("MODE", "development");
    const { unmount } = render(<XsEChart option={{ series: [] }} label="营收趋势图" />);
    await waitFor(() => expect(chartMocks.init).toHaveBeenCalledTimes(1));

    unmount();

    expect(chartMocks.dispose).toHaveBeenCalledTimes(1);
  });

  it("coalesces ResizeObserver notifications into one animation frame", async () => {
    vi.stubEnv("MODE", "development");
    let notifyResize: ResizeObserverCallback = () => undefined;
    const disconnect = vi.fn();
    const observe = vi.fn();
    const ResizeObserverMock = vi.fn(function (callback: ResizeObserverCallback) {
      notifyResize = callback;
      return { disconnect, observe, unobserve: vi.fn() };
    });
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const addWindowListener = vi.spyOn(window, "addEventListener");

    render(<XsEChart option={{ series: [] }} label="营收趋势图" />);
    await waitFor(() => expect(chartMocks.init).toHaveBeenCalledTimes(1));

    notifyResize([], {} as ResizeObserver);
    notifyResize([], {} as ResizeObserver);
    notifyResize([], {} as ResizeObserver);

    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(chartMocks.resize).not.toHaveBeenCalled();
    frames[0]?.(0);
    expect(chartMocks.resize).toHaveBeenCalledTimes(1);
    expect(addWindowListener).not.toHaveBeenCalledWith("resize", expect.any(Function));
  });

  it("forces ECharts animation off when reduced motion is preferred", async () => {
    vi.stubEnv("MODE", "development");
    setReducedMotion(true);
    const option = { animation: true, series: [] };

    render(<XsEChart option={option} label="营收趋势图" />);

    await waitFor(() => expect(chartMocks.setOption).toHaveBeenCalled());
    expect(chartMocks.setOption).toHaveBeenLastCalledWith(
      {
        ...option,
        animation: false
      },
      {
        notMerge: false,
        lazyUpdate: true,
        replaceMerge: ["series", "xAxis", "yAxis"]
      }
    );
    expect(option.animation).toBe(true);
  });
});
