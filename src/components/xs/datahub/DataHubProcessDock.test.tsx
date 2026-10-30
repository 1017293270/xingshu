import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataHubProcessDock } from "./DataHubProcessDock";
import type { DataHubThinkingSection } from "@/services/dataHubThinkingSections";

afterEach(() => vi.useRealTimers());

const sections: DataHubThinkingSection[] = [
  { key: "root", label: "主任务", main: true, notes: [{ kind: "analysis", content: "我将把这两个指标委派给问数智能体。" }] },
  {
    key: "child",
    label: "问数智能体",
    main: false,
    notes: [
      { kind: "analysis", content: "先看查询技能。" },
      { kind: "progress", content: "语义 SQL 报错（列数不匹配），我改用标准查询分别统计两个分项。" }
    ]
  }
];

describe("DataHubProcessDock", () => {
  it("stays collapsed while running and only states the plain-language phase with a timer", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const { rerender } = render(<DataHubProcessDock thinkingContent="" status="running" startedAt={10_000} showPlaceholder />);
    act(() => vi.advanceTimersByTime(3000));
    const toggle = screen.getByRole("button", { name: "思考过程 （正在分析问题，3秒）" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("正在整理思路…")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText("正在整理思路…")).toBeInTheDocument();

    rerender(<DataHubProcessDock thinkingContent="" status="running" phase="query" startedAt={10_000} sections={sections} showPlaceholder />);
    expect(screen.getByRole("button", { name: "思考过程 （正在查询数据，3秒）" })).toBeInTheDocument();
    rerender(<DataHubProcessDock thinkingContent="" status="running" phase="result" startedAt={10_000} sections={sections} showPlaceholder />);
    expect(screen.getByRole("button", { name: /^思考过程 （正在整理回答/ })).toBeInTheDocument();
    // 折叠头不复述模型原文
    expect(screen.getByRole("button", { name: /^思考过程/ })).not.toHaveTextContent("语义 SQL");

    rerender(<DataHubProcessDock thinkingContent="" status="done" durationMs={3000} showPlaceholder />);
    expect(screen.queryByRole("region", { name: "思考过程" })).not.toBeInTheDocument();
  });

  it("is collapsed by default in every state and keeps the user's choice across phases", () => {
    const { rerender } = render(<DataHubProcessDock thinkingContent="" sections={sections} status="done" durationMs={8000} />);
    const toggle = screen.getByRole("button", { name: "思考过程 （已完成，8秒）" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    rerender(<DataHubProcessDock thinkingContent="" sections={sections} status="running" />);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    rerender(<DataHubProcessDock thinkingContent="" sections={sections} status="done" durationMs={2000} />);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    rerender(<DataHubProcessDock thinkingContent="" sections={sections} status="running" />);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("lists each agent's notes in order with an analysis or process label", () => {
    render(<DataHubProcessDock thinkingContent="" sections={sections} status="done" />);
    fireEvent.click(screen.getByRole("button", { name: /^思考过程/ }));
    const notes = screen.getByLabelText("模型思考");
    expect(within(notes).getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["主任务", "问数智能体"]);
    expect(within(notes).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "分析说明我将把这两个指标委派给问数智能体。",
      "分析说明先看查询技能。",
      "过程说明语义 SQL 报错（列数不匹配），我改用标准查询分别统计两个分项。"
    ]);
  });

  it("falls back to the plain thinking text as one analysis note", () => {
    render(<DataHubProcessDock thinkingContent="正在核对问题。" status="done" />);
    fireEvent.click(screen.getByRole("button", { name: /^思考过程/ }));
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("分析说明正在核对问题。");
  });

  it("keeps empty optional callers and interrupted empty phases hidden", () => {
    const { rerender } = render(<DataHubProcessDock thinkingContent="" status="done" />);
    expect(screen.queryByRole("region", { name: "思考过程" })).not.toBeInTheDocument();
    rerender(<DataHubProcessDock thinkingContent="" status="error" showPlaceholder durationMs={0} />);
    expect(screen.queryByRole("region", { name: "思考过程" })).not.toBeInTheDocument();
  });
});
