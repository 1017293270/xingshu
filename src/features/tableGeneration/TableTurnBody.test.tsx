import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createDataHubAskTurn } from "@/services/dataHubAskDataPresenter";
import { TableTurnBody } from "./TableTurnBody";

const noop = () => {};
const turn = createDataHubAskTurn("按合同年度聚合", [
  { type: "text", content: "已读取合同年度，正在汇总合同。", replyId: "first" },
  { type: "text", content: "统计口径为合同记录数。", replyId: "second" }
], "streaming");
const props = {
  turn, progress: "正在查询数据", activeTableKey: "", busy: true, turnKey: "test-turn",
  dismissedClarifyKeys: [], onOpenTable: noop, onExpandClarify: noop, onCopyAnswer: noop,
  onRegenerate: noop, onExport: noop, onExportTable: noop
};

afterEach(() => { vi.useRealTimers(); });

it("renders every public answer block while streaming", () => {
  render(<TableTurnBody {...props} />);
  expect(screen.getByText("已读取合同年度，正在汇总合同。")).toBeInTheDocument();
  expect(screen.getByText("统计口径为合同记录数。")).toBeInTheDocument();
});

it("does not let an old clarification error override resumed or completed replies", () => {
  const resumed = { ...turn, error: { message: "旧的澄清错误" }, done: { failed: true } };
  const { rerender } = render(<TableTurnBody {...props} turn={resumed} />);
  expect(screen.getByText("统计口径为合同记录数。")).toBeInTheDocument();
  expect(screen.queryByText("旧的澄清错误")).not.toBeInTheDocument();
  rerender(<TableTurnBody {...props} turn={{ ...resumed, status: "done", done: { failed: false } }} busy={false} />);
  expect(screen.getByText("统计口径为合同记录数。")).toBeInTheDocument();
  expect(screen.queryByText("旧的澄清错误")).not.toBeInTheDocument();
});

it("explains a long-running generation without claiming a result and clears it on cancellation", () => {
  vi.useFakeTimers();
  const { rerender } = render(<TableTurnBody {...props} />);
  act(() => { vi.advanceTimersByTime(60_000); });
  expect(screen.getByRole("status")).toHaveTextContent("可以继续等待，或停止后调整需求重试");
  expect(screen.getByRole("status")).toHaveTextContent("结果表尚未生成完成");
  rerender(<TableTurnBody {...props} turn={{ ...turn, status: "cancelled" }} busy={false} />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByText("已停止本次制表生成")).toBeInTheDocument();
});
