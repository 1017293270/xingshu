import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createAttachmentQueue } from "@/services/attachmentService";
import { XsCommandBox } from "./XsCommandBox";

describe("XsCommandBox", () => {
  it("supports attachment, keyboard submit, voice state, and stop", async () => {
    const user = userEvent.setup();
    const onAttach = vi.fn();
    const onSubmit = vi.fn();
    const onStop = vi.fn();
    const onVoice = vi.fn();
    const onCancelVoice = vi.fn();
    const onRemoveAttachment = vi.fn();
    const props = {
      value: "分析销售数据",
      onChange: vi.fn(),
      onSubmit,
      onAttach,
      onVoice
    };
    const { rerender } = render(<XsCommandBox {...props} />);
    expect(screen.getByRole("button", { name: "发送" })).toHaveClass("xs-command-box__primary-action");

    await user.click(screen.getByRole("textbox", { name: "命令输入" }));
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(onSubmit).toHaveBeenCalledOnce();

    const files = [
      new File(["region,revenue"], "sales.csv", { type: "text/csv" }),
      new File(["summary"], "notes.txt", { type: "text/plain" })
    ];
    await user.upload(screen.getByLabelText("添加附件"), files);
    expect(onAttach).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: "sales.csv" }), expect.objectContaining({ name: "notes.txt" })])
    );

    const attachments = createAttachmentQueue(files);
    rerender(
      <XsCommandBox
        {...props}
        attachments={attachments}
        onRemoveAttachment={onRemoveAttachment}
      />
    );
    expect(screen.getByRole("list", { name: "附件队列" })).toHaveTextContent("sales.csv");
    expect(screen.getAllByText("仅保存在本地")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "移除附件 sales.csv" }));
    expect(onRemoveAttachment).toHaveBeenCalledWith(attachments[0]?.id);

    await user.click(screen.getByRole("button", { name: "语音" }));
    expect(onVoice).toHaveBeenCalledOnce();

    rerender(
      <XsCommandBox
        {...props}
        busy
        onStop={onStop}
        onCancelVoice={onCancelVoice}
        voiceState="recording"
      />
    );
    expect(screen.getByRole("button", { name: "停止语音录入" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "停止生成" })).toHaveClass("xs-command-box__primary-action");
    await user.click(screen.getByRole("button", { name: "取消语音输入" }));
    expect(onCancelVoice).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "停止生成" }));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("disables send when the command is empty", () => {
    render(<XsCommandBox value="   " onChange={vi.fn()} onSubmit={vi.fn()} />);

    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "附件" })).not.toBeInTheDocument();
    expect(screen.queryByText("Ctrl/⌘ + Enter 发送")).not.toBeInTheDocument();
  });

  it("optionally submits with Enter while preserving Shift+Enter and IME composition", () => {
    const onSubmit = vi.fn();

    render(
      <XsCommandBox
        value="继续分析利润率"
        onChange={vi.fn()}
        onSubmit={onSubmit}
        submitOnEnter
      />
    );

    const input = screen.getByRole("textbox", { name: "命令输入" });
    expect(input).toHaveAttribute("aria-keyshortcuts", "Enter");

    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("exposes compact quick prompts without submitting them immediately", async () => {
    const user = userEvent.setup();
    const onSuggestion = vi.fn();
    const suggestion = {
      label: "分析本月经营数据",
      value: "帮我分析本月经营数据，并生成趋势图表"
    };

    render(
      <XsCommandBox
        value=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        suggestions={[suggestion]}
        onSuggestion={onSuggestion}
      />
    );

    await user.click(screen.getByRole("button", { name: suggestion.label }));

    expect(onSuggestion).toHaveBeenCalledWith(suggestion);
  });
});
