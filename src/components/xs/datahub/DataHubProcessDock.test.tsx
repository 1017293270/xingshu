import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataHubProcessDock } from "./DataHubProcessDock";

afterEach(() => vi.useRealTimers());

describe("DataHubProcessDock", () => {
  it("shows an honest waiting placeholder, then removes an empty completed phase", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const { rerender } = render(<DataHubProcessDock thinkingContent="" status="running" startedAt={10_000} showPlaceholder />);
    expect(screen.getByText("正在整理思路…")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByRole("button", { name: "思考过程 （3秒）" })).toHaveAttribute("aria-expanded", "true");
    rerender(<DataHubProcessDock thinkingContent="" status="done" durationMs={3000} showPlaceholder />);
    expect(screen.queryByRole("region", { name: "思考过程" })).not.toBeInTheDocument();
  });

  it("preserves manual expansion when a phase ends", () => {
    const { rerender } = render(<DataHubProcessDock thinkingContent="正在核对问题。" status="running" />);
    const toggle = screen.getByRole("button", { name: /思考过程/ });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    rerender(<DataHubProcessDock thinkingContent="正在核对问题。" status="done" durationMs={2000} />);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps empty optional callers and interrupted empty phases hidden", () => {
    const { rerender } = render(<DataHubProcessDock thinkingContent="" status="done" />);
    expect(screen.queryByRole("region", { name: "思考过程" })).not.toBeInTheDocument();
    rerender(<DataHubProcessDock thinkingContent="" status="error" showPlaceholder durationMs={0} />);
    expect(screen.queryByRole("region", { name: "思考过程" })).not.toBeInTheDocument();
  });
});
