import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TableAgentTrace } from "./TableAgentTrace";
import type { TableAgentTrace as Trace } from "./agentTrace";

const trace: Trace = {
  steps: [{ id: "query", label: "执行数据查询", detail: "已返回 2 行", status: "done", durationMs: 1200,
    sql: "SELECT name FROM contracts ORDER BY name" }],
  datasourceName: "合同库", totalDurationMs: 2400, tableCount: 1, rowCount: 2
};

describe("TableAgentTrace", () => {
  it("starts collapsed during streaming and preserves the user's expansion after completion", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<TableAgentTrace trace={trace} isStreaming progress="执行数据查询" />);
    const toggle = screen.getByRole("button", { name: /执行过程/ });
    const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(panel).toHaveAttribute("inert");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(toggle).toHaveTextContent("1 步 · 合同库 · 用时 2.4s");
    expect(toggle).not.toHaveTextContent("执行数据查询");
    expect(toggle).not.toHaveTextContent("成功");
    await user.tab();
    expect(toggle).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(panel).not.toHaveAttribute("inert");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(within(panel).getByText("1.2s")).toBeInTheDocument();
    const sqlToggle = screen.getByText("查询语句");
    expect(sqlToggle.tagName).toBe("SUMMARY");
    await user.click(sqlToggle);
    expect(sqlToggle.closest("details")).toHaveAttribute("open");
    expect(screen.getByText(trace.steps[0].sql!)).toBeVisible();
    rerender(<TableAgentTrace trace={trace} isStreaming={false} status="done" progress="完成" />);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveTextContent("处理结束");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    toggle.focus();
    await user.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveAttribute("inert");
  });

  it("keeps progress inside the empty running panel and never adds a synthetic step", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<TableAgentTrace trace={{ ...trace, steps: [], totalDurationMs: undefined }} isStreaming progress="正在检索来源" />);
    expect(screen.queryByText("正在检索来源")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /执行过程/ }));
    expect(screen.getByText("正在检索来源")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    rerender(<TableAgentTrace trace={trace} isStreaming progress="正在检索来源" />);
    expect(screen.queryByText("正在检索来源")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /执行过程/ })).toHaveAttribute("aria-expanded", "true");
  });

  it.each(["error", "cancelled"] as const)("uses actual %s status without inferring success from finished tools", (status) => {
    render(<TableAgentTrace trace={trace} isStreaming status={status} progress="执行数据查询" />);
    const toggle = screen.getByRole("button", { name: /执行过程/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent(status === "error" ? "执行失败" : "已停止");
    expect(toggle).not.toHaveTextContent("进行中");
    expect(screen.getByRole("region", { name: "执行过程" })).toHaveAttribute("data-status", status);
  });
});
