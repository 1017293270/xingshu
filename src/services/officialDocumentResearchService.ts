import {
  buildGeneratedChartOption,
  buildGeneratedChartSpec,
  planAiChart
} from "@/services/aiChartPlannerService";
import {
  createDataHubClientId,
  streamDataHubAskData
} from "@/services/dataHubAskDataService";
import {
  createDataHubAskTurn,
  resolveDataHubFinalAnswer
} from "@/services/dataHubAskDataPresenter";
import { formatDataHubColumnTitle } from "@/services/dataHubFormat";
import {
  ensureAskArtifact,
  favoriteAskArtifact,
  previewQueryAsset
} from "@/services/queryAssetService";
import type { QueryExecutionOutput } from "@/types/analytics";
import type { DataHubAskTurn, DataHubStreamEvent, DataHubTableResult } from "@/types/dataHub";
import type {
  OfficialDocumentResearchResult,
  OfficialDocumentWritingLogicPlan
} from "@/types/officialDocument";

type ResearchNeed = OfficialDocumentWritingLogicPlan["researchNeeds"][number];

/** 一篇公文最多嵌入的图表数；成稿里已有的与研究新产的合并计数。 */
export const MAX_OFFICIAL_DOCUMENT_CHARTS = 3;

export type OfficialDocumentGeneratedDataAsset = Pick<
  OfficialDocumentResearchResult,
  "summary" | "table" | "chart" | "querySource" | "citations"
>;

function researchAbortError() {
  return new DOMException("已停止资料研究", "AbortError");
}

function checkResearchAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw researchAbortError();
}

/** Existing asset/chart APIs cannot all abort transport yet; stop waiting and never advance on a late response. */
function awaitResearch<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  return new Promise<T>((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(researchAbortError()); };
    signal.addEventListener("abort", abort, { once: true });
    work.then((value) => { signal.removeEventListener("abort", abort); resolve(value); },
      (error) => { signal.removeEventListener("abort", abort); reject(error); });
    if (signal.aborted) abort();
  });
}

function runResearchQuestion(need: ResearchNeed, chatMode?: "ask_table", signal?: AbortSignal) {
  checkResearchAbort(signal);
  const sessionId = createDataHubClientId("session");
  const chatId = createDataHubClientId("chat");
  const events: DataHubStreamEvent[] = [];

  return new Promise<DataHubAskTurn>((resolve, reject) => {
    let settled = false;
    let controller: AbortController | undefined;
    let stopTransport = false;
    const abort = () => {
      if (settled) return;
      settled = true;
      stopTransport = true;
      signal?.removeEventListener("abort", abort);
      controller?.abort();
      reject(researchAbortError());
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      const turn = createDataHubAskTurn(need.question, events, error ? "error" : "done",
        error?.message ?? "", { sessionId, chatId });
      if (error || turn.error || turn.done?.failed) {
        stopTransport = true;
        controller?.abort();
        reject(error ?? new Error(turn.error?.message || turn.done?.summary || "资料查询失败"));
      } else {
        resolve(turn);
      }
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    try {
      controller = streamDataHubAskData(
        { message: need.question, sessionId, globalSessionId: sessionId, chatId,
          chatMode: chatMode ?? (need.kind === "ASK_DATA" ? "ask" : "rag") },
        {
          onEvent: (event) => {
            if (settled) return;
            events.push(event);
            if (event.type === "error" && !event.parentSessionId) {
              const message = typeof event.data === "object" && event.data && "message" in event.data
                ? String((event.data as { message: unknown }).message) : "资料查询失败";
              finish(new Error(message));
            }
          },
          onDone: () => finish(),
          onError: (error) => finish(error)
        }
      );
      if (stopTransport) controller.abort();
    } catch (error) { finish(error instanceof Error ? error : new Error("资料查询失败")); }
  });
}

function outputAsTable(output: QueryExecutionOutput): NonNullable<OfficialDocumentResearchResult["table"]> {
  const columns = output.columns.slice(0, 10);
  return {
    columns: columns.map((column) => formatDataHubColumnTitle(
      column.label || column.title || column.key,
      column.key
    )),
    rows: output.rows.slice(0, 50).map((row) => columns.map((column) => {
      const value = row[column.key];
      return value === null || value === undefined ? "" : String(value);
    })),
    totalRows: output.totalRows
  };
}

function outputAsChartTable(output: QueryExecutionOutput): DataHubTableResult {
  return {
    columns: output.columns.map((column) => ({
      columnId: column.columnId,
      key: column.key,
      title: column.label || column.title || column.key,
      type: column.type
    })),
    rows: output.rows,
    totalRows: output.totalRows,
    tableIndex: 0
  };
}

async function renderChartPng(
  question: string,
  output: QueryExecutionOutput,
  signal?: AbortSignal
): Promise<OfficialDocumentResearchResult["chart"] | undefined> {
  const table = outputAsChartTable(output);
  const plan = await awaitResearch(planAiChart({ question, tables: [table] }), signal);
  checkResearchAbort(signal);
  const spec = buildGeneratedChartSpec(plan, [table]);
  if (!spec) return undefined;

  const widthPx = 960;
  const heightPx = 540;
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${widthPx}px;height:${heightPx}px;background:#fff`;
  document.body.append(host);
  try {
    const echarts = await awaitResearch(import("@/services/echartsRuntime"), signal);
    checkResearchAbort(signal);
    const chart = echarts.init(host, null, { renderer: "canvas", width: widthPx, height: heightPx });
    try {
      chart.setOption({
        ...buildGeneratedChartOption(spec),
        animation: false,
        backgroundColor: "#fff"
      });
      await awaitResearch(new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))), signal);
      checkResearchAbort(signal);
      const dataUrl = chart.getDataURL({ type: "png", pixelRatio: 1, backgroundColor: "#fff" });
      return {
        mimeType: "image/png",
        base64: dataUrl.replace(/^data:image\/png;base64,/, ""),
        widthPx,
        heightPx,
        altText: spec.title
      };
    } finally {
      chart.dispose();
    }
  } finally {
    host.remove();
  }
}

export async function executeOfficialDocumentResearch(
  need: ResearchNeed,
  chartAllowed: boolean,
  chatMode?: "ask_table",
  signal?: AbortSignal
): Promise<OfficialDocumentGeneratedDataAsset> {
  const turn = await runResearchQuestion(need, chatMode, signal);
  checkResearchAbort(signal);
  const summary = resolveDataHubFinalAnswer(turn.done?.summary, turn.assistantContent, false, {
    keepRicherStreamedAnswer: true
  });

  if (need.kind === "ASK_KNOWLEDGE") {
    const citations = turn.citationDocuments.slice(0, 5).map((citation) => ({
      kbId: citation.kbId,
      kbName: citation.kbName || "企业知识库",
      docId: citation.docId,
      docName: citation.docName || citation.fileName || citation.docKey || citation.docId,
      fragments: citation.fragments,
      sourceAvailable: citation.sourceAvailable
    }));
    return { summary, citations };
  }

  const artifact = turn.artifact?.canFavorite
    ? turn.artifact
    : await awaitResearch(ensureAskArtifact(turn.sessionId || "", turn.chatId || ""), signal);
  checkResearchAbort(signal);
  if (!artifact.canFavorite) throw new Error("问数未形成可冻结的结构化查询");
  const asset = await awaitResearch(favoriteAskArtifact(artifact, need.question), signal);
  checkResearchAbort(signal);
  const versionId = asset.stableVersionId || asset.stableVersion?.id;
  if (!versionId) throw new Error("问数资产没有稳定版本");
  const execution = await awaitResearch(previewQueryAsset(asset.id, { versionId, force: true }), signal);
  checkResearchAbort(signal);
  if (execution.status !== "SUCCESS") {
    throw new Error(execution.errorMessage || "问数资产执行失败");
  }
  const output = execution.outputs.find((candidate) => candidate.rows.length) ?? execution.outputs[0];
  if (!output) throw new Error("问数没有返回可写入的结果");
  const querySource = {
    kind: "QUERY_ASSET" as const,
    queryAssetId: asset.id,
    queryVersionId: versionId,
    outputKey: output.outputKey,
    executionId: execution.id,
    snapshotId: execution.snapshotId,
    dataAsOf: output.updatedAt || execution.createdAt
  };
  let chart: OfficialDocumentResearchResult["chart"];
  if (chartAllowed) {
    try {
      chart = await renderChartPng(need.question, output, signal);
    } catch {
      checkResearchAbort(signal);
      chart = undefined;
    }
  }
  return {
    summary,
    table: outputAsTable(output),
    chart,
    querySource,
    citations: []
  };
}

export type OfficialDocumentResearchProgress = {
  need: ResearchNeed;
  index: number;
  total: number;
  status: "running" | "success" | "failed";
  error?: string;
};

/**
 * 按研究清单逐条执行问数/问知并汇成 researchResults。
 * 串行执行（每条都是一次完整的流式会话）；单条失败不阻塞后续，
 * 以 FAILED 记录留给正文写「[待补充]」。图表配额全程共享 3 张上限。
 */
export async function executeOfficialDocumentResearchPlan(
  needs: ResearchNeed[],
  options: {
    existingChartCount?: number;
    onProgress?: (progress: OfficialDocumentResearchProgress) => void;
    onResult?: (result: OfficialDocumentResearchResult) => void;
    signal?: AbortSignal;
  } = {}
): Promise<OfficialDocumentResearchResult[]> {
  const results: OfficialDocumentResearchResult[] = [];
  let chartCount = options.existingChartCount ?? 0;
  checkResearchAbort(options.signal);

  for (const [index, need] of needs.entries()) {
    checkResearchAbort(options.signal);
    options.onProgress?.({ need, index, total: needs.length, status: "running" });
    const base = { taskId: need.id, sectionId: need.sectionId, kind: need.kind,
      question: need.question, required: need.required, preferredOutput: need.preferredOutput };
    let result: OfficialDocumentResearchResult;
    try {
      const asset = await executeOfficialDocumentResearch(need, chartCount < MAX_OFFICIAL_DOCUMENT_CHARTS, undefined, options.signal);
      checkResearchAbort(options.signal);
      if (asset.chart) chartCount += 1;
      const hasResult = Boolean(asset.summary.trim() || asset.table);
      result = {
        ...base, ...asset, status: hasResult ? "SUCCESS" : "NO_RESULT",
        summary: hasResult ? asset.summary : "未返回可写入的资料内容",
        citations: asset.citations ?? []
      };
    } catch (caught) {
      checkResearchAbort(options.signal);
      if (caught instanceof Error && caught.name === "AbortError") throw caught;
      const message = caught instanceof Error ? caught.message : "资料查询失败";
      result = { ...base, status: "FAILED", summary: message, citations: [] };
    }
    checkResearchAbort(options.signal);
    results.push(result);
    options.onResult?.(result);
    checkResearchAbort(options.signal);
    options.onProgress?.({ need, index, total: needs.length,
      status: result.status === "SUCCESS" ? "success" : "failed",
      ...(result.status === "SUCCESS" ? {} : { error: result.summary }) });
  }

  return results;
}

export async function executeOfficialDocumentDataTable(
  question: string,
  chartAllowed: boolean,
  signal?: AbortSignal
): Promise<OfficialDocumentGeneratedDataAsset> {
  const value = question.trim();
  if (!value) throw new Error("请输入需要查询的数据问题");
  const result = await executeOfficialDocumentResearch({
    id: crypto.randomUUID(),
    sectionId: "writing-chat",
    kind: "ASK_DATA",
    question: value,
    reason: "智写助手临时数据表",
    required: false,
    preferredOutput: "TABLE"
  }, chartAllowed, "ask_table", signal);
  if (!result.table?.rows.length || !result.querySource) {
    throw new Error("问数没有返回可回填的表格数据");
  }
  return result;
}
