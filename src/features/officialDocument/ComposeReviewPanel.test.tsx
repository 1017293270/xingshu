import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { OfficialDocumentResearchResult } from "@/types/officialDocument";
import { ComposeReviewPanel } from "./ComposeReviewPanel";

function issue(sentence: string, additions: string[]) {
  return { sentence, additions };
}

function result(overrides: Partial<OfficialDocumentResearchResult> & { taskId: string }) {
  return {
    sectionId: "s1",
    kind: "ASK_DATA",
    question: "问题",
    required: true,
    preferredOutput: "FACT",
    status: "SUCCESS",
    summary: "",
    citations: [],
    ...overrides
  } as OfficialDocumentResearchResult;
}

function renderPanel(props: Partial<Parameters<typeof ComposeReviewPanel>[0]> = {}) {
  const onConfirmFactReview = vi.fn();
  const onRetryMissing = vi.fn();
  const view = render(
    <ComposeReviewPanel onConfirmFactReview={onConfirmFactReview} onRetryMissing={onRetryMissing} {...props} />
  );
  return { ...view, onConfirmFactReview, onRetryMissing };
}

describe("ComposeReviewPanel", () => {
  it("没有任何提醒时不占位", () => {
    const { container } = renderPanel({ researchResults: [result({ taskId: "a", kind: "ASK_DATA" })] });
    expect(container).toBeEmptyDOMElement();
  });

  it("核对项默认只展开三条，展开后给出全部原句", async () => {
    const user = userEvent.setup();
    const issues = Array.from({ length: 12 }, (_, index) => issue(`第 ${index + 1} 句原文。`, [`${index + 1}人`]));
    renderPanel({ factReview: issues });

    const panel = screen.getByRole("region", { name: "成稿核对" });
    expect(within(panel).getByText("需核对来源")).toBeInTheDocument();
    expect(within(panel).getByText("12 处")).toBeInTheDocument();
    expect(within(panel).getAllByRole("listitem")).toHaveLength(3);

    await user.click(within(panel).getByRole("button", { name: "展开全部 12 处" }));
    expect(within(panel).getAllByRole("listitem")).toHaveLength(12);
    await user.click(within(panel).getByRole("button", { name: "收起" }));
    expect(within(panel).getAllByRole("listitem")).toHaveLength(3);
  });

  it("原句不再带核对前缀，新增词单独成标签", () => {
    renderPanel({ factReview: [issue("请提前十五分钟到场签到。", ["十五分钟", "签到"])] });

    const panel = screen.getByRole("region", { name: "成稿核对" });
    expect(within(panel).getByText("请提前十五分钟到场签到。")).toBeInTheDocument();
    expect(within(panel).getByText("十五分钟")).toBeInTheDocument();
    expect(within(panel).getByText("签到")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent("核对“");
  });

  it("确认后列表收起并可以撤销", async () => {
    const user = userEvent.setup();
    const issues = [issue("一句原文。", ["2026年"])];
    const { onConfirmFactReview, rerender } = renderPanel({ factReview: issues });

    await user.click(screen.getByRole("button", { name: "我已核对来源" }));
    expect(onConfirmFactReview).toHaveBeenCalledOnce();

    rerender(
      <ComposeReviewPanel
        factReview={issues}
        factReviewConfirmedAt="2026-09-08T00:00:00Z"
        onConfirmFactReview={onConfirmFactReview}
        onRetryMissing={vi.fn()}
      />
    );
    const panel = screen.getByRole("region", { name: "成稿核对" });
    expect(within(panel).getByText("已核对来源")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "撤销确认" })).toBeInTheDocument();
    expect(within(panel).queryAllByRole("listitem")).toHaveLength(0);

    await user.click(within(panel).getByRole("button", { name: "查看 1 处" }));
    expect(within(panel).getAllByRole("listitem")).toHaveLength(1);
  });

  it("只统计未成功的资料，重复原因收进脚注", async () => {
    const user = userEvent.setup();
    const shared = "历史问数缺少完整可执行查询，请重新问数后收藏";
    const { onRetryMissing } = renderPanel({
      researchResults: [
        result({ taskId: "ok", status: "SUCCESS", question: "成功项", summary: "已取得" }),
        result({ taskId: "a", status: "NO_RESULT", question: "问题一", summary: shared }),
        result({ taskId: "b", status: "FAILED", question: "问题二", summary: shared }),
        result({ taskId: "c", status: "SKIPPED", question: "问题三", summary: shared }),
        result({ taskId: "d", status: "PENDING", question: "问题四", summary: "另一种原因" })
      ]
    });

    const panel = screen.getByRole("region", { name: "成稿核对" });
    expect(within(panel).getByText("有 4 项资料未补齐")).toBeInTheDocument();
    expect(within(panel).queryByText("成功项")).not.toBeInTheDocument();
    expect(within(panel).getByText("没有找到")).toBeInTheDocument();
    expect(within(panel).getByText("查询失败")).toBeInTheDocument();
    expect(within(panel).getByText("已跳过")).toBeInTheDocument();
    expect(within(panel).getByText("未完成")).toBeInTheDocument();
    expect(within(panel).getByText(`以上 3 项：${shared}`)).toBeInTheDocument();
    expect(within(panel).getByText("另一种原因")).toBeInTheDocument();

    await user.click(within(panel).getByRole("button", { name: "重试缺失资料" }));
    expect(onRetryMissing).toHaveBeenCalledOnce();
  });

  it("生成中禁用重试按钮", () => {
    renderPanel({ busy: true, researchResults: [result({ taskId: "a", status: "FAILED", summary: "查询暂不可用" })] });
    expect(screen.getByRole("button", { name: "重试缺失资料" })).toBeDisabled();
  });

  it("成功的知识检索没有来源链接时补一行说明", () => {
    renderPanel({
      researchResults: [result({ taskId: "a", kind: "ASK_KNOWLEDGE", status: "SUCCESS", summary: "已取得", citations: [] })]
    });
    const panel = screen.getByRole("region", { name: "成稿核对" });
    expect(panel).toHaveTextContent("部分资料未附来源链接，内容已保留供参考");
    expect(within(panel).queryByRole("button")).not.toBeInTheDocument();
  });
});
