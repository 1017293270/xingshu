import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DataHubAskDataStreamHandlers } from "@/services/dataHubAskDataService";
import { WritingChatPanel } from "./WritingChatPanel";

const mocks = vi.hoisted(() => ({
  streamDataHubAskData: vi.fn()
}));

vi.mock("@/services/dataHubAskDataService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/dataHubAskDataService")>()),
  streamDataHubAskData: mocks.streamDataHubAskData
}));

type StreamCall = {
  input: { message: string; sessionId: string; chatMode: string; writingContext?: { action?: string } };
  handlers: DataHubAskDataStreamHandlers;
};

function lastStream(): StreamCall {
  const call = mocks.streamDataHubAskData.mock.calls.at(-1);
  return { input: call![0], handlers: call![1] };
}

beforeEach(() => {
  mocks.streamDataHubAskData.mockReset();
  mocks.streamDataHubAskData.mockImplementation(() => new AbortController());
});

function renderPanel(onInsert = vi.fn()) {
  render(
    <WritingChatPanel
      draftId="draft-1"
      draftTitle="经营分析报告"
      templateName="季度通报模板"
      onInsert={onInsert}
    />
  );
  return onInsert;
}

async function ask(question: string) {
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox"), question);
  await user.keyboard("{Enter}");
  return user;
}

describe("WritingChatPanel", () => {
  it("以 writing 模式和 writing- 前缀的会话发起请求，不占用问数会话", async () => {
    renderPanel();
    await ask("帮我拟一版开头");

    await waitFor(() => expect(mocks.streamDataHubAskData).toHaveBeenCalledTimes(1));
    const { input } = lastStream();
    expect(input.chatMode).toBe("writing");
    expect(input.sessionId).toMatch(/^writing-/);
    expect(input.message).toBe("帮我拟一版开头");
  });

  it("流式过程中显示生成态，完成后才给出插入入口", async () => {
    renderPanel();
    await ask("帮我拟一版开头");
    await waitFor(() => expect(mocks.streamDataHubAskData).toHaveBeenCalled());
    const { handlers } = lastStream();

    expect(await screen.findByText("正在起草")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "插入到正文" })).not.toBeInTheDocument();

    handlers.onEvent({ type: "content", data: "第一段。\n\n第二段。" });
    expect(await screen.findByText("第一段。")).toBeInTheDocument();
    // 还在流式中，不能插入未写完的内容
    expect(screen.queryByRole("button", { name: "插入到正文" })).not.toBeInTheDocument();

    handlers.onDone?.();
    expect(await screen.findByRole("button", { name: "插入到正文" })).toBeInTheDocument();
    expect(screen.queryByText("正在起草")).not.toBeInTheDocument();
  });

  it("插入把完整回答交给草稿编辑器", async () => {
    const onInsert = renderPanel();
    const user = await ask("帮我拟一版开头");
    await waitFor(() => expect(mocks.streamDataHubAskData).toHaveBeenCalled());
    const { handlers } = lastStream();
    handlers.onEvent({ type: "content", data: "第一段。\n\n第二段。" });
    handlers.onDone?.();

    await user.click(await screen.findByRole("button", { name: "插入到正文" }));
    expect(onInsert).toHaveBeenCalledWith("第一段。\n\n第二段。");
  });

  it("把用户在输入框里的整篇写作要求自动路由到全文链路", async () => {
    render(
      <WritingChatPanel
        draftId="draft-1"
        draftTitle="经营分析报告"
        templateName="季度通报模板"
        canGenerateFullDraft
        resolveWritingContext={(action) => ({ action })}
        onFullDraftPreview={vi.fn()}
      />
    );
    await ask("帮我完整详细写这个报告");

    await waitFor(() => expect(mocks.streamDataHubAskData).toHaveBeenCalledTimes(1));
    expect(lastStream().input.writingContext?.action).toBe("FULL_DRAFT");
    expect(screen.getByText("帮我完整详细写这个报告")).toBeInTheDocument();
    expect(screen.queryByText(/请严格按已确认章节/)).not.toBeInTheDocument();
    lastStream().handlers.onEvent({
      type: "content",
      data: "[[XS_SECTION:section-1]]\n# 第一章\n\n正文。"
    });
    lastStream().handlers.onDone?.();
    expect(await screen.findByRole("button", { name: "预览全文" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "插入到正文" })).not.toBeInTheDocument();
  });

  it("把详细写一份工作汇报识别为替换全文，而不是普通追加", async () => {
    render(
      <WritingChatPanel
        draftId="draft-1"
        draftTitle="经营分析报告"
        templateName="季度通报模板"
        canGenerateFullDraft
        resolveWritingContext={(action) => ({ action })}
        onFullDraftPreview={vi.fn()}
      />
    );
    await ask("帮我详细写一个工作汇报");

    await waitFor(() => expect(mocks.streamDataHubAskData).toHaveBeenCalledTimes(1));
    expect(lastStream().input.writingContext?.action).toBe("FULL_DRAFT");
  });

  it("普通对话返回章节锚点时也必须走全文预览，不能追加到文末", async () => {
    const onInsert = vi.fn();
    const onFullDraftPreview = vi.fn();
    render(
      <WritingChatPanel
        draftId="draft-1"
        draftTitle="经营分析报告"
        templateName="季度通报模板"
        onInsert={onInsert}
        onFullDraftPreview={onFullDraftPreview}
      />
    );
    const user = await ask("根据当前内容详细写一下");
    await waitFor(() => expect(mocks.streamDataHubAskData).toHaveBeenCalled());
    lastStream().handlers.onEvent({
      type: "content",
      data: "[[XS_SECTION:section-1]]\n# 第一章\n\n正文。"
    });
    lastStream().handlers.onDone?.();

    const preview = await screen.findByRole("button", { name: "预览全文" });
    expect(screen.queryByText(/\[\[XS_SECTION:/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "第一章" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "插入到正文" })).not.toBeInTheDocument();
    await user.click(preview);
    expect(onFullDraftPreview).toHaveBeenCalledWith("[[XS_SECTION:section-1]]\n# 第一章\n\n正文。");
    expect(onInsert).not.toHaveBeenCalled();
  });

  it("无锚点但覆盖现有章节的完整回答也必须替换，不能追加", async () => {
    render(
      <WritingChatPanel
        draftId="draft-1"
        draftTitle="经营分析报告"
        templateName="季度通报模板"
        sectionOptions={[
          { value: "section-1", label: "一、工作完成情况" },
          { value: "section-2", label: "二、重点工作成果" },
          { value: "section-3", label: "三、下一步工作计划" }
        ]}
        onInsert={vi.fn()}
        onFullDraftPreview={vi.fn()}
      />
    );
    await ask("根据当前内容详细写一下");
    await waitFor(() => expect(mocks.streamDataHubAskData).toHaveBeenCalled());
    lastStream().handlers.onEvent({
      type: "content",
      data: `# 工作汇报\n\n开头说明。\n\n# 一、工作完成情况\n\n${"工作正文。".repeat(30)}\n\n# 二、重点工作成果\n\n${"成果正文。".repeat(30)}\n\n# 三、下一步工作计划\n\n${"计划正文。".repeat(30)}`
    });
    lastStream().handlers.onDone?.();

    expect(await screen.findByRole("button", { name: "预览全文" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "插入到正文" })).not.toBeInTheDocument();
  });

  it("终端错误就地显示原因，不静默失败", async () => {
    renderPanel();
    await ask("帮我拟一版开头");
    await waitFor(() => expect(mocks.streamDataHubAskData).toHaveBeenCalled());

    lastStream().handlers.onError?.(new Error("写作服务未接入"));
    expect(await screen.findByRole("alert")).toHaveTextContent("写作服务未接入");
    expect(screen.queryByRole("button", { name: "插入到正文" })).not.toBeInTheDocument();
  });
});
