import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OfficialDocumentRole, OfficialDocumentStructureNode } from "@/types/officialDocument";
import { ComposeAnalyzingCard } from "./ComposeAnalyzingCard";

function node(order: number, role: OfficialDocumentRole, preview: string): OfficialDocumentStructureNode {
  return {
    id: `node-${order}`,
    order,
    paragraphIndex: order,
    slotId: `slot-${order}`,
    variantId: `${role.toLocaleLowerCase()}-v1`,
    role,
    roleLabel: role,
    preview,
    editable: true,
    dataBinding: false,
    required: false,
    styleSummary: []
  };
}

const templateNodes: OfficialDocumentStructureNode[] = [
  node(0, "TITLE", "关于开展安全检查的通知"),
  node(1, "HEADING_1", "一、检查范围"),
  node(2, "BODY", "覆盖生产、仓储与运输三个环节。"),
  node(3, "HEADING_2", "（一）生产环节"),
  node(4, "BODY", "重点排查特种设备台账。"),
  node(5, "HEADING_1", "二、时间安排")
];

function renderCard(overrides: Partial<Parameters<typeof ComposeAnalyzingCard>[0]> = {}) {
  const onSkip = vi.fn();
  const onCancel = vi.fn();
  const view = render(
    <ComposeAnalyzingCard
      startedAt={Date.now()}
      templateName="通知模板"
      templateNodes={templateNodes}
      onSkip={onSkip}
      onCancel={onCancel}
      {...overrides}
    />
  );
  return { ...view, onSkip, onCancel };
}

/** useNow 靠 setInterval 推进，秒数与阶段全部用假时钟推，不真等。 */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function stepRow(label: string) {
  return screen.getByText(label).closest("li");
}

describe("ComposeAnalyzingCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("开场就给出真实耗时、参考结构事实和两个出口", () => {
    renderCard();

    const card = screen.getByRole("region", { name: "写作大纲分析中" });
    expect(within(card).getByText("正在梳理写作大纲")).toBeInTheDocument();
    expect(within(card).getByText("0 秒")).toBeInTheDocument();
    // 章节数是参考结构里真实的标题条数（两个一级 + 一个二级），不是编的进度
    expect(within(card).getByText("《通知模板》· 3 个章节")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "跳过大纲直接生成" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "取消" })).toBeInTheDocument();
  });

  it("耗时读数随时间走", () => {
    renderCard();

    advance(12_000);
    expect(screen.getByText("12 秒")).toBeInTheDocument();
    expect(screen.queryByText("0 秒")).not.toBeInTheDocument();
  });

  it("三个阶段按已用时间推进，不给百分比", () => {
    renderCard();

    expect(stepRow("读取参考结构")).toHaveAttribute("data-state", "active");
    expect(stepRow("推断各章写作要点")).toHaveAttribute("data-state", "pending");
    expect(stepRow("整理需要补充的资料")).toHaveAttribute("data-state", "pending");

    advance(2_000);
    expect(stepRow("读取参考结构")).toHaveAttribute("data-state", "done");
    expect(stepRow("推断各章写作要点")).toHaveAttribute("data-state", "active");
    expect(stepRow("整理需要补充的资料")).toHaveAttribute("data-state", "pending");

    advance(24_000);
    expect(stepRow("推断各章写作要点")).toHaveAttribute("data-state", "done");
    expect(stepRow("整理需要补充的资料")).toHaveAttribute("data-state", "active");

    // 没有任何百分比读数
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("列出参考结构里真实的标题骨架并保留层级", () => {
    renderCard();

    const skeleton = screen.getByText("将沿用参考结构的章节骨架").closest("div");
    const items = within(skeleton as HTMLElement).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["一、检查范围", "（一）生产环节", "二、时间安排"]);
    expect(items[1]).toHaveAttribute("data-depth", "1");
  });

  it("骨架超过八条时收敛成「还有 N 个章节」", () => {
    const many = [
      node(0, "TITLE", "关于开展安全检查的通知"),
      ...Array.from({ length: 11 }, (_, index) => node(index + 1, "HEADING_1", `第 ${index + 1} 章`))
    ];
    renderCard({ templateNodes: many });

    expect(screen.getByText("第 8 章")).toBeInTheDocument();
    expect(screen.queryByText("第 9 章")).not.toBeInTheDocument();
    expect(screen.getByText("还有 3 个章节")).toBeInTheDocument();
  });

  it("超过一分钟才给慢速提示，之前不打扰", () => {
    renderCard();

    advance(59_000);
    expect(screen.queryByText(/分析比平时慢一些/)).not.toBeInTheDocument();

    advance(2_000);
    expect(screen.getByText(/分析比平时慢一些，可以跳过大纲直接生成，也可以继续等待。/)).toBeInTheDocument();
  });

  it("跳过与取消各自触发回调", () => {
    const { onSkip, onCancel } = renderCard();

    fireEvent.click(screen.getByRole("button", { name: "跳过大纲直接生成" }));
    expect(onSkip).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
