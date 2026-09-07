import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  XsArtifactCard,
  XsChatActionButton,
  XsChatActions,
  XsClarifyCard,
  XsClarifyPanel,
  XsComposerBox,
  XsSidePanel
} from "./index";

describe("XsArtifactCard", () => {
  it("names itself, marks the one being viewed, and opens on click", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();

    const { rerender } = render(
      <XsArtifactCard
        label="结果表"
        icon={<span />}
        title="季度销售排行"
        meta="字段 2 · 行 1"
        openLabel="浏览结果表：季度销售排行"
        onOpen={onOpen}
      />
    );

    const card = screen.getByRole("article", { name: "结果表" });
    expect(card).not.toHaveAttribute("data-active");

    await user.click(screen.getByRole("button", { name: "浏览结果表：季度销售排行" }));
    expect(onOpen).toHaveBeenCalledTimes(1);

    rerender(
      <XsArtifactCard
        label="结果表"
        icon={<span />}
        title="季度销售排行"
        meta="字段 2 · 行 1"
        active
        openLabel="浏览结果表：季度销售排行"
        onOpen={onOpen}
      />
    );
    expect(screen.getByRole("article", { name: "结果表" })).toHaveAttribute("data-active", "true");
  });
});

describe("XsSidePanel", () => {
  it("closes from the button and from Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <XsSidePanel label="结果表预览" icon={<span />} title="季度销售排行" onClose={onClose}>
        <p>表体</p>
      </XsSidePanel>
    );

    expect(screen.getByRole("complementary", { name: "结果表预览" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "关闭预览" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("XsChatActionButton", () => {
  it("keeps a full accessible name while showing a shorter label", () => {
    render(
      <XsChatActions>
        <XsChatActionButton icon={<span />} label="复制回答" text="复制" onClick={() => undefined} />
        <XsChatActionButton icon={<span />} label="重新生成" disabled onClick={() => undefined} />
      </XsChatActions>
    );

    const copy = screen.getByRole("button", { name: "复制回答" });
    expect(copy).toHaveTextContent("复制");
    expect(screen.getByRole("button", { name: "重新生成" })).toBeDisabled();
  });
});

describe("XsComposerBox", () => {
  it("is only a named region when a label is given, and reports busy", () => {
    const { rerender } = render(
      <XsComposerBox mode="hero" toolbarTail={<button type="button">发送</button>}>
        <textarea aria-label="需求" />
      </XsComposerBox>
    );
    expect(screen.queryByRole("region")).not.toBeInTheDocument();

    rerender(
      <XsComposerBox mode="chat" label="继续制表" busy toolbarTail={<button type="button">发送</button>}>
        <textarea aria-label="需求" />
      </XsComposerBox>
    );
    const region = screen.getByRole("region", { name: "继续制表" });
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(region).toHaveAttribute("data-mode", "chat");
  });

  it("shows 回到底部 only when the caller says the reader has scrolled away", async () => {
    const user = userEvent.setup();
    const onScrollToBottom = vi.fn();

    const { rerender } = render(
      <XsComposerBox mode="chat" toolbarTail={<button type="button">发送</button>} onScrollToBottom={onScrollToBottom}>
        <textarea aria-label="需求" />
      </XsComposerBox>
    );
    expect(screen.queryByRole("button", { name: "回到底部" })).not.toBeInTheDocument();

    rerender(
      <XsComposerBox
        mode="chat"
        toolbarTail={<button type="button">发送</button>}
        showScrollToBottom
        onScrollToBottom={onScrollToBottom}
      >
        <textarea aria-label="需求" />
      </XsComposerBox>
    );
    await user.click(screen.getByRole("button", { name: "回到底部" }));
    expect(onScrollToBottom).toHaveBeenCalledTimes(1);
  });
});

const nativeCard = {
  interactionId: "tool-call-1",
  question: "区域按哪个口径？",
  options: [{ label: "客户区域" }, { label: "签约主体区域" }],
  allowFreeText: false
};

describe("XsClarifyPanel", () => {
  it("takes focus on the first option so the keyboard works straight away", () => {
    render(<XsClarifyPanel clarification={nativeCard} onAnswer={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByRole("region", { name: "需要你确认" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /客户区域/ })).toHaveFocus();
  });

  it("submits the option text on a single click, with no extra confirm step", async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();

    render(<XsClarifyPanel clarification={nativeCard} onAnswer={onAnswer} onDismiss={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /客户区域/ }));
    expect(onAnswer).toHaveBeenCalledWith("客户区域");
  });

  it("shows the legacy reply as the second line and submits it instead of the label", async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();

    render(
      <XsClarifyPanel
        clarification={{
          question: "区域按哪个口径？",
          options: [{ label: "客户区域", reply: "按客户所属区域统计" }],
          allowFreeText: false
        }}
        onAnswer={onAnswer}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByText("按客户所属区域统计")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /客户区域/ }));
    expect(onAnswer).toHaveBeenCalledWith("按客户所属区域统计");
  });

  it("marks the clicked option and locks the rest while the answer is in flight", () => {
    render(
      <XsClarifyPanel
        clarification={nativeCard}
        submittingAnswer="客户区域"
        onAnswer={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /客户区域/ })).toHaveAttribute("data-chosen", "true");
    expect(screen.getByRole("button", { name: /签约主体区域/ })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("正在提交你的选择");
  });

  it("still lets the reader put the panel away while the answer is in flight", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();

    render(
      <XsClarifyPanel
        clarification={nativeCard}
        submittingAnswer="客户区域"
        onAnswer={vi.fn()}
        onDismiss={onDismiss}
      />
    );

    const dismiss = screen.getByRole("button", { name: "稍后再确认" });
    expect(dismiss).not.toBeDisabled();
    await user.click(dismiss);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("hands a failed submission back as a retryable choice", () => {
    render(
      <XsClarifyPanel
        clarification={nativeCard}
        error="确认提交失败，请重试"
        onAnswer={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("确认提交失败，请重试");
    expect(screen.getByRole("button", { name: /客户区域/ })).not.toBeDisabled();
  });

  it("offers a free-text escape hatch only when the card allows it", async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();

    const { rerender } = render(
      <XsClarifyPanel clarification={nativeCard} onAnswer={onAnswer} onDismiss={vi.fn()} />
    );
    expect(screen.queryByRole("textbox", { name: "补充你的理解" })).not.toBeInTheDocument();

    rerender(
      <XsClarifyPanel
        clarification={{ ...nativeCard, allowFreeText: true }}
        onAnswer={onAnswer}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "确认提交" })).toBeDisabled();

    await user.type(screen.getByRole("textbox", { name: "补充你的理解" }), "按大区统计");
    await user.click(screen.getByRole("button", { name: "确认提交" }));
    expect(onAnswer).toHaveBeenCalledWith("按大区统计");
  });

  it("walks the options with the arrow keys and steps aside on Escape", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();

    render(<XsClarifyPanel clarification={nativeCard} onAnswer={vi.fn()} onDismiss={onDismiss} />);

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: /签约主体区域/ })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("button", { name: /客户区域/ })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("XsClarifyCard", () => {
  it("shows a selected native option label instead of its internal value", () => {
    render(<XsClarifyCard clarification={{ ...nativeCard,
      options: [{ label: "客户所属区域", value: "customer-region" }], selectedAnswer: "customer-region"
    }} />);
    expect(screen.getByLabelText("已确认的选择")).toHaveTextContent("客户所属区域");
    expect(screen.getByLabelText("已确认的选择")).not.toHaveTextContent("customer-region");
  });

  it("keeps unmatched free text visible instead of replacing it with an option label", () => {
    render(<XsClarifyCard clarification={{ ...nativeCard, allowFreeText: true,
      options: [{ label: "客户所属区域", value: "customer-region" }], selectedAnswer: " 按自定义片区统计 "
    }} />);
    expect(screen.getByLabelText("已确认的选择")).toHaveTextContent("按自定义片区统计");
    expect(screen.getByLabelText("已确认的选择")).not.toHaveTextContent("客户所属区域");
  });

  it("keeps the submitted legacy XML reply rather than its shorter label", () => {
    render(<XsClarifyCard clarification={{ question: "采用哪个口径？", allowFreeText: false,
      options: [{ label: "客户区域", reply: "按客户所属区域统计" }], selectedAnswer: "按客户所属区域统计"
    }} />);
    expect(screen.getByLabelText("已确认的选择")).toHaveTextContent("按客户所属区域统计");
  });

  it("leaves one line of history once the backend records an answer", () => {
    render(<XsClarifyCard clarification={{ ...nativeCard, selectedAnswer: "客户区域" }} />);

    expect(screen.getByText("已选择")).toBeInTheDocument();
    expect(screen.getByText("客户区域")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps a way back to a question the reader put aside", async () => {
    const user = userEvent.setup();
    const onExpand = vi.fn();

    render(<XsClarifyCard clarification={nativeCard} onExpand={onExpand} />);

    expect(screen.getByText("待确认")).toBeInTheDocument();
    expect(screen.getByText("区域按哪个口径？")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "去选择" }));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });
});
