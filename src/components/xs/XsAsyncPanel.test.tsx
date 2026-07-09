import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveXsAsyncStatus, XsAsyncPanel } from "./XsAsyncPanel";

describe("XsAsyncPanel", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("classifies a failed background refresh as stale data", () => {
    expect(
      resolveXsAsyncStatus({ isPending: false, isFetching: false, isError: true, hasData: true })
    ).toBe("stale");
  });

  it("never shows empty content while the first request is pending", () => {
    vi.useFakeTimers();
    render(
      <XsAsyncPanel status="pending" empty emptyDescription="暂无历史">
        <p>旧内容</p>
      </XsAsyncPanel>
    );

    expect(screen.queryByRole("status", { name: "正在加载" })).not.toBeInTheDocument();
    expect(screen.queryByText("暂无历史")).not.toBeInTheDocument();
    expect(screen.queryByText("旧内容")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(199));
    expect(screen.queryByRole("status", { name: "正在加载" })).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("status", { name: "正在加载" })).toBeVisible();
  });

  it("renders an actionable error and retry", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <XsAsyncPanel status="error" error="连接失败" onRetry={onRetry} empty={false}>
        <p>旧内容</p>
      </XsAsyncPanel>
    );

    expect(screen.getByRole("alert")).toHaveTextContent("连接失败");
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("keeps stale content visible while announcing a background refresh", () => {
    render(
      <XsAsyncPanel status="refreshing" empty={false}>
        <p>已缓存内容</p>
      </XsAsyncPanel>
    );

    expect(screen.getByText("已缓存内容")).toBeVisible();
    expect(screen.getByRole("status", { name: "正在刷新" })).toBeVisible();
  });

  it("keeps cached content visible and warns when a refresh fails", () => {
    render(
      <XsAsyncPanel status="stale" empty={false}>
        <p>上次同步的数据</p>
      </XsAsyncPanel>
    );

    expect(screen.getByText("上次同步的数据")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("刷新失败，正在显示上次数据");
  });

  it("keeps a cached empty state while refreshing", () => {
    render(<XsAsyncPanel status="refreshing" empty emptyDescription="暂无记录" />);

    expect(screen.getByText("暂无记录")).toBeVisible();
    expect(screen.getByRole("status", { name: "正在刷新" })).toBeVisible();
    expect(screen.queryByRole("status", { name: "正在加载" })).not.toBeInTheDocument();
  });

  it("warns when refreshing an empty cache fails", () => {
    render(<XsAsyncPanel status="stale" empty emptyDescription="暂无记录" />);

    expect(screen.getByText("暂无记录")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("刷新失败，正在显示上次数据");
  });

  it("offers an empty-state action", async () => {
    const user = userEvent.setup();
    const onEmptyAction = vi.fn();
    render(
      <XsAsyncPanel
        status="ready"
        empty
        emptyDescription="还没有对话"
        emptyActionLabel="开始新对话"
        onEmptyAction={onEmptyAction}
      />
    );

    await user.click(screen.getByRole("button", { name: "开始新对话" }));
    expect(onEmptyAction).toHaveBeenCalledOnce();
  });
});
