import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamDataHubAskData, type DataHubAskDataStreamHandlers } from "./dataHubAskDataService";
import { ensureAskArtifact, favoriteAskArtifact } from "./queryAssetService";
import { executeOfficialDocumentResearch, executeOfficialDocumentResearchPlan } from "./officialDocumentResearchService";
import type { OfficialDocumentWritingLogicPlan } from "@/types/officialDocument";

vi.mock("./dataHubAskDataService", async (actual) => ({
  ...await actual<typeof import("./dataHubAskDataService")>(), streamDataHubAskData: vi.fn()
}));
vi.mock("./queryAssetService", () => ({ ensureAskArtifact: vi.fn(), favoriteAskArtifact: vi.fn(), previewQueryAsset: vi.fn() }));
const stream = vi.mocked(streamDataHubAskData);
const need: OfficialDocumentWritingLogicPlan["researchNeeds"][number] = {
  id: "need-1", sectionId: "sec-1", kind: "ASK_KNOWLEDGE", question: "查找报销制度", reason: "说明口径", required: true, preferredOutput: "FACT"
};
let handlers: DataHubAskDataStreamHandlers;
let controller: AbortController;
beforeEach(() => {
  vi.clearAllMocks();
  stream.mockImplementation((_input, next) => { handlers = next; controller = new AbortController(); return controller; });
});
function finish(summary: string, failed = false) {
  handlers.onEvent({ type: "done", content: { summary, failed }, finished: true });
  handlers.onDone?.();
}

describe("writing research outcomes", () => {
  it("does not turn a failed done summary into successful knowledge", async () => {
    const task = executeOfficialDocumentResearchPlan([need]);
    finish("知识服务执行失败", true);
    expect(await task).toEqual([expect.objectContaining({ status: "FAILED", summary: "知识服务执行失败" })]);
  });

  it("preserves successful citations and checkpoints each result", async () => {
    const onResult = vi.fn();
    const task = executeOfficialDocumentResearchPlan([need], { onResult });
    handlers.onEvent({ type: "citation_document", content: { kbId: "8", docId: "1", fragments: ["报销须留存凭证"] } });
    finish("报销须留存凭证");
    const results = await task;
    expect(results[0]).toMatchObject({ status: "SUCCESS", summary: "报销须留存凭证", citations: [expect.objectContaining({ docId: "1" })] });
    expect(onResult).toHaveBeenCalledExactlyOnceWith(results[0]);
  });

  it("records an actually empty result as no-result", async () => {
    const onResult = vi.fn();
    const task = executeOfficialDocumentResearchPlan([need], { onResult });
    finish("");
    const results = await task;
    expect(results[0]).toMatchObject({ status: "NO_RESULT", summary: "未返回可写入的资料内容" });
    expect(onResult).toHaveBeenCalledExactlyOnceWith(results[0]);
  });

  it("aborts the live stream, ignores late callbacks, and does not start or checkpoint another task", async () => {
    const abort = new AbortController(); const onResult = vi.fn();
    const task = executeOfficialDocumentResearchPlan([need, { ...need, id: "need-2" }], { signal: abort.signal, onResult });
    abort.abort();
    await expect(task).rejects.toMatchObject({ name: "AbortError" });
    expect(controller.signal.aborted).toBe(true);
    finish("迟到的成功结果");
    handlers.onError?.(new Error("迟到错误"));
    await Promise.resolve();
    expect(stream).toHaveBeenCalledOnce(); expect(onResult).not.toHaveBeenCalled();
  });

  it("does not start a stream for an already-aborted signal", async () => {
    const abort = new AbortController(); abort.abort();
    await expect(executeOfficialDocumentResearch(need, false, undefined, abort.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(stream).not.toHaveBeenCalled();
  });

  it("cancels waiting for materialization and never favorites a late result", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof ensureAskArtifact>>) => void;
    vi.mocked(ensureAskArtifact).mockReturnValue(new Promise((done) => { resolve = done; }));
    const abort = new AbortController();
    const task = executeOfficialDocumentResearch({ ...need, kind: "ASK_DATA" }, false, undefined, abort.signal);
    finish("已查询");
    await vi.waitFor(() => expect(ensureAskArtifact).toHaveBeenCalled());
    abort.abort();
    await expect(task).rejects.toMatchObject({ name: "AbortError" });
    resolve({ askRunId: "run-1", canFavorite: true, resolvedQuestion: "已查询" });
    await Promise.resolve(); await Promise.resolve();
    expect(favoriteAskArtifact).not.toHaveBeenCalled();
  });
});

it("keeps failed results and continues later research without a confirmation gate", async () => {
  const onResult = vi.fn();
  const task = executeOfficialDocumentResearchPlan([need, { ...need, id: "need-2" }], { onResult });
  finish("第一项查询失败", true);
  await vi.waitFor(() => expect(stream).toHaveBeenCalledTimes(2));
  handlers.onEvent({ type: "citation_document", content: { kbId: "8", docId: "1", fragments: ["可引用内容"] } });
  finish("第二项已查到资料");
  const results = await task;
  expect(results.map((result) => result.status)).toEqual(["FAILED", "SUCCESS"]);
  expect(onResult).toHaveBeenCalledTimes(2);
  expect(onResult).toHaveBeenNthCalledWith(1, results[0]);
  expect(onResult).toHaveBeenNthCalledWith(2, results[1]);
});

it("checkpoints a completed item before cancellation and does not start the next one", async () => {
  const abort = new AbortController();
  const onResult = vi.fn(() => abort.abort());
  const task = executeOfficialDocumentResearchPlan([need, { ...need, id: "need-2" }], { signal: abort.signal, onResult });
  handlers.onEvent({ type: "citation_document", content: { kbId: "8", docId: "1", fragments: ["可引用内容"] } });
  finish("第一项已完成");
  await expect(task).rejects.toMatchObject({ name: "AbortError" });
  expect(onResult).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ taskId: "need-1", status: "SUCCESS" }));
  expect(stream).toHaveBeenCalledOnce();
});


it("keeps a successful nonempty summary without citations as usable research", async () => {
  const task = executeOfficialDocumentResearchPlan([need]);
  finish("已确认的非空资料摘要");
  expect(await task).toEqual([expect.objectContaining({ status: "SUCCESS", summary: "已确认的非空资料摘要", citations: [] })]);
});

it("uses only the new frozen execution, never the earlier answer, as writing evidence", async () => {
  const { previewQueryAsset } = await import("./queryAssetService");
  vi.mocked(ensureAskArtifact).mockResolvedValue({ canFavorite: true, askRunId: "run-1", resolvedQuestion: "收入" });
  vi.mocked(favoriteAskArtifact).mockResolvedValue({ id: "asset-1", stableVersionId: "v1" } as never);
  vi.mocked(previewQueryAsset).mockResolvedValue({ id: "execution-2", status: "SUCCESS", snapshotId: "snapshot-2",
    outputs: [{ outputKey: "out", columns: [{ key: "revenue", title: "收入" }], rows: [{ revenue: 120 }], totalRows: 1 }] } as never);
  const pending = executeOfficialDocumentResearch({ ...need, kind: "ASK_DATA" }, false);
  finish("收入100万元");
  const result = await pending;
  expect(previewQueryAsset).toHaveBeenCalledWith("asset-1", { versionId: "v1", force: true });
  expect(result.summary).not.toContain("100");
  expect(result.summary).toContain("本次冻结查询");
  expect(result.table?.rows).toEqual([["120"]]);
  expect(result.querySource).toMatchObject({ executionId: "execution-2", snapshotId: "snapshot-2" });
});

it("records zero frozen rows as NO_RESULT and continues the next research task", async () => {
  const { previewQueryAsset } = await import("./queryAssetService");
  vi.mocked(ensureAskArtifact).mockResolvedValue({ canFavorite: true, askRunId: "run-1", resolvedQuestion: "收入" });
  vi.mocked(favoriteAskArtifact).mockResolvedValue({ id: "asset-1", stableVersionId: "v1" } as never);
  vi.mocked(previewQueryAsset).mockResolvedValue({ id: "execution-2", status: "SUCCESS",
    outputs: [{ outputKey: "out", columns: [{ key: "revenue" }], rows: [], totalRows: 0 }] } as never);
  const pending = executeOfficialDocumentResearchPlan([{ ...need, kind: "ASK_DATA" }, { ...need, id: "next" }]);
  finish("收入100万元");
  await vi.waitFor(() => expect(stream).toHaveBeenCalledTimes(2));
  finish("制度要求留存凭据");
  const results = await pending;
  expect(results[0]).toMatchObject({ status: "NO_RESULT", summary: "查询执行成功，但未返回数据行", table: { rows: [] } });
  expect(results[1].status).toBe("SUCCESS");
});
