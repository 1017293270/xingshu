import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
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
    const { container } = render(
      <XsAsyncPanel status="refreshing" empty={false}>
        <p>已缓存内容</p>
      </XsAsyncPanel>
    );

    expect(screen.getByText("已缓存内容")).toBeVisible();
    expect(container.querySelector(".xs-async-panel__content")).toContainElement(screen.getByText("已缓存内容"));
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

  it.each([
    ["rows", 5],
    ["cards", 3],
    ["metrics", 4],
    ["table", 6]
  ] as const)("renders the %s skeleton variant after the delay", (variant, itemCount) => {
    vi.useFakeTimers();
    const { container, unmount } = render(
      <XsAsyncPanel status="pending" empty={false} loadingVariant={variant} />
    );

    act(() => vi.advanceTimersByTime(200));

    expect(container.querySelector(`.xs-async-panel__skeleton--${variant}`)).toBeInTheDocument();
    expect(
      container.querySelectorAll(`.xs-async-panel__skeleton--${variant} > span:not(.sr-only)`)
    ).toHaveLength(itemCount);
    unmount();
  });

  it("can replace cached content with a refreshing skeleton", () => {
    render(
      <XsAsyncPanel
        status="refreshing"
        empty={false}
        preserveContentWhileRefreshing={false}
        loadingVariant="table"
      >
        <p>旧内容</p>
      </XsAsyncPanel>
    );

    expect(screen.queryByText("旧内容")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "正在刷新" })).toBeVisible();
  });

  it("keys content transitions without changing the live content semantics", () => {
    const { container, rerender } = render(
      <XsAsyncPanel status="ready" empty={false} contentKey="page-1">
        <p>第一页</p>
      </XsAsyncPanel>
    );
    const firstContent = container.querySelector(".xs-async-panel__content");

    rerender(
      <XsAsyncPanel status="ready" empty={false} contentKey="page-2">
        <p>第二页</p>
      </XsAsyncPanel>
    );

    expect(screen.getByText("第二页")).toBeVisible();
    expect(container.querySelector(".xs-async-panel__content")).not.toBe(firstContent);
  });

  it("stacks loaded modules with the shared page gap", () => {
    const xsCss = readFileSync("src/components/xs/xs.css", "utf8");
    const contentRule = xsCss.match(/\.xs-async-panel__content\[data-view="content"\]\s*\{(?<declarations>[^}]*)\}/)?.groups?.declarations ?? "";

    expect(contentRule).toContain("display: grid");
    expect(contentRule).toContain("gap: var(--xs-module-gap)");
  });
});
