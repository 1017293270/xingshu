import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { XsStatusBar } from "./XsStatusBar";

describe("XsStatusBar", () => {
  it("reserves a stable slot without creating an empty live region", () => {
    const { container } = render(<XsStatusBar reserveSpace />);

    expect(container.querySelector(".xs-status-bar-slot--reserved")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("replaces only the inner status content when the transition key changes", () => {
    const { container, rerender } = render(
      <XsStatusBar reserveSpace transitionKey="saving" tone="loading" message="正在保存" />
    );
    const firstContent = container.querySelector(".xs-status-bar-slot__content");

    rerender(
      <XsStatusBar reserveSpace transitionKey="saved" tone="success" message="已保存" />
    );

    expect(screen.getByRole("status")).toHaveTextContent("已保存");
    expect(container.querySelector(".xs-status-bar-slot__content")).not.toBe(firstContent);
  });

  it("keeps every tone in one shell so they read as the same object", () => {
    const { container, rerender } = render(<XsStatusBar tone="success" message="已导出" />);
    const shell = container.querySelector(".xs-status-bar");

    expect(shell).toHaveClass("xs-status-bar--success");
    /* 语气只由图标与描边承担：不再另起一块色块药丸和消息抢注意力 */
    expect(container.querySelector(".ant-tag")).not.toBeInTheDocument();

    rerender(<XsStatusBar tone="info" label="筛选结果" message="共 12 个知识库" />);
    /* 类别前缀退成同色重字，仍在消息之前，但不再是独立色块 */
    expect(screen.getByText("筛选结果").tagName).toBe("B");
    expect(screen.getByText("筛选结果")).toHaveClass("xs-status-bar__label");

    rerender(<XsStatusBar tone="error" message="导出失败" />);

    /* 失败态过去是 antd Alert，形状与其他语气完全不同；现在共用同一个外壳 */
    expect(container.querySelector(".xs-status-bar--error")).toBeInTheDocument();
    expect(container.querySelector(".ant-alert")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("导出失败");
  });

  it("announces the two tones that ask the user to act", () => {
    const { rerender } = render(<XsStatusBar tone="warning" message="登录状态已过期" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(<XsStatusBar tone="info" message="共 12 个知识库" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("drops the pill radius once a detail line makes the bar two-line", () => {
    const { container } = render(
      <XsStatusBar tone="warning" message="登录状态已过期，请重新登录" detail="当前会话已安全退出。" />
    );

    expect(container.querySelector(".xs-status-bar--stacked")).toBeInTheDocument();
    expect(screen.getByText("当前会话已安全退出。")).toHaveClass("xs-status-bar__detail");
  });

  it("holds an inline action and freezes the pulse when the page already shows loading", () => {
    const { container } = render(
      <XsStatusBar
        tone="loading"
        spinner={false}
        message="正在校验企业账号"
        action={<button type="button">取消</button>}
      />
    );

    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(container.querySelector(".xs-status-bar__pulse")).toHaveAttribute("data-static", "true");
  });
});
