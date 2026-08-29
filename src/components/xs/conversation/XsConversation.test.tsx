import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  XsArtifactCard,
  XsChatActionButton,
  XsChatActions,
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
