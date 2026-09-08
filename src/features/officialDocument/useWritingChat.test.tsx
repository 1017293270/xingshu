import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { streamDataHubAskData, type DataHubAskDataStreamHandlers } from "@/services/dataHubAskDataService";
import { useWritingChat, type WritingChatSnapshot } from "./useWritingChat";

vi.mock("@/services/dataHubAskDataService", async (actual) => ({
  ...await actual<typeof import("@/services/dataHubAskDataService")>(), streamDataHubAskData: vi.fn()
}));
const calls: Array<{ handlers: DataHubAskDataStreamHandlers; controller: AbortController }> = [];
beforeEach(() => {
  calls.length = 0; vi.mocked(streamDataHubAskData).mockReset();
  vi.mocked(streamDataHubAskData).mockImplementation((_input, handlers) => {
    const controller = new AbortController(); calls.push({ handlers, controller }); return controller;
  });
});
afterEach(() => { vi.useRealTimers(); });

it("restores completed and interrupted turns, reuses the session, and snapshots unflushed text", () => {
  const initial: WritingChatSnapshot = { sessionId: "writing-existing", turns: [
    { id: "done", question: "旧要求", status: "done", events: [{ type: "text", content: "原成稿" }], error: "", purpose: "full-draft" },
    { id: "pending", question: "中断要求", status: "streaming", events: [{ type: "text", content: "已收到一半" }], error: "", purpose: "full-draft" }
  ] };
  const hook = renderHook(() => useWritingChat("draft-1", initial));
  expect(hook.result.current.messages.map((turn) => turn.status)).toEqual(["done", "cancelled"]);
  expect(hook.result.current.busy).toBe(false);
  act(() => { hook.result.current.send("继续修改"); });
  expect(streamDataHubAskData).toHaveBeenLastCalledWith(expect.objectContaining({ sessionId: "writing-existing" }), expect.anything());
  act(() => { calls[0].handlers.onEvent({ type: "text", content: "尚在缓冲的内容" }); });
  const saved = hook.result.current.getSnapshot();
  expect(saved.turns.at(-1)?.events).toHaveLength(1);
  hook.unmount();
  const restored = renderHook(() => useWritingChat("draft-1", saved));
  expect(restored.result.current.messages.at(-1)?.status).toBe("cancelled");
  expect(restored.result.current.messages.at(-1)?.ask.assistantContent).toBe("尚在缓冲的内容");
  expect(restored.result.current.getSnapshot().sessionId).toBe("writing-existing");
  restored.unmount();
});

it("keeps flushed text on stop and rejects old callbacks while the next turn is running", () => {
  const hook = renderHook(() => useWritingChat("draft-1"));
  act(() => { hook.result.current.send("第一轮"); });
  act(() => { calls[0].handlers.onEvent({ type: "text", content: "收到的部分" }); hook.result.current.stop(); });
  expect(calls[0].controller.signal.aborted).toBe(true);
  expect(hook.result.current.messages[0]).toMatchObject({ status: "cancelled", ask: { assistantContent: "收到的部分" } });
  act(() => { hook.result.current.send("第二轮"); });
  act(() => { calls[0].handlers.onEvent({ type: "text", content: "旧流晚包" }); calls[0].handlers.onDone?.(); });
  expect(hook.result.current.busy).toBe(true);
  expect(hook.result.current.getSnapshot().turns.flatMap((turn) => turn.events).some((event) => event.content === "旧流晚包")).toBe(false);
  act(() => { expect(hook.result.current.send("不应绕过正在生成")).toBeUndefined(); });
  expect(calls).toHaveLength(2);
  hook.unmount();
});

it("changes sessions with the draft and ignores callbacks after draft change and unmount", () => {
  const hook = renderHook(({ draft }) => useWritingChat(draft), { initialProps: { draft: "draft-a" } });
  act(() => { hook.result.current.send("旧草稿"); });
  const previousSession = hook.result.current.getSnapshot().sessionId;
  hook.rerender({ draft: "draft-b" });
  expect(calls[0].controller.signal.aborted).toBe(true);
  expect(hook.result.current.messages).toEqual([]);
  expect(hook.result.current.getSnapshot().sessionId).not.toBe(previousSession);
  act(() => { hook.result.current.send("新草稿"); });
  act(() => { calls[0].handlers.onEvent({ type: "text", content: "旧草稿晚包" }); calls[0].handlers.onError?.(new Error("旧错误")); });
  const snapshot = hook.result.current.getSnapshot();
  expect(snapshot.turns[0]).toMatchObject({ question: "新草稿", status: "streaming", events: [] });
  hook.unmount();
  calls[1].handlers.onEvent({ type: "text", content: "卸载后晚包" }); calls[1].handlers.onDone?.();
  expect(hook.result.current.getSnapshot()).toEqual(snapshot);
  expect(calls[1].controller.signal.aborted).toBe(true);
});

it("keeps a root failed done as an error while a child failed done does not end the root", () => {
  const hook = renderHook(() => useWritingChat("draft-1"));
  act(() => { hook.result.current.send("生成正文"); });
  act(() => { calls[0].handlers.onEvent({ type: "done", parentSessionId: "root", data: { failed: true, summary: "子任务失败" }, finished: true }); });
  expect(hook.result.current.busy).toBe(true);
  act(() => {
    calls[0].handlers.onEvent({ type: "done", data: { failed: true, summary: "正文生成失败" }, finished: true });
    calls[0].handlers.onDone?.();
  });
  expect(hook.result.current.messages[0]).toMatchObject({ status: "error", error: "正文生成失败" });
  expect(hook.result.current.getSnapshot().turns[0].status).toBe("error");
  hook.unmount();
});
