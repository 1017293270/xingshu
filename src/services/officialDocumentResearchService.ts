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

export type OfficialDocumentGeneratedDataAsset = Pick<
  OfficialDocumentResearchResult,
  "summary" | "table" | "chart" | "querySource" | "citations"
>;

function runResearchQuestion(need: ResearchNeed, chatMode?: "ask_table") {
  const sessionId = createDataHubClientId("session");
  const chatId = createDataHubClientId("chat");
  const events: DataHubStreamEvent[] = [];

  return new Promise<DataHubAskTurn>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      const turn = createDataHubAskTurn(
        need.question,
        events,
        error ? "error" : "done",
        error?.message ?? "",
        { sessionId, chatId }
      );
      if (error || turn.error) {
        reject(error ?? new Error(turn.error?.message || "资料查询失败"));
      } else {
        resolve(turn);
      }
    };

    streamDataHubAskData(
      {
        message: need.question,
        sessionId,
        globalSessionId: sessionId,
        chatId,
        chatMode: chatMode ?? (need.kind === "ASK_DATA" ? "ask" : "rag")
      },
      {
        onEvent: (event) => {
          events.push(event);
          if (event.type === "error" && !event.parentSessionId) {
            const message = typeof event.data === "object" && event.data
              && "message" in event.data
              ? String((event.data as { message: unknown }).message)
              : "资料查询失败";
            finish(new Error(message));
          }
        },
        onDone: () => finish(),
        onError: (error) => finish(error)
      }
    );
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
  output: QueryExecutionOutput
): Promise<OfficialDocumentResearchResult["chart"] | undefined> {
  const table = outputAsChartTable(output);
  const plan = await planAiChart({ question, tables: [table] });
  const spec = buildGeneratedChartSpec(plan, [table]);
  if (!spec) return undefined;

  const widthPx = 960;
  const heightPx = 540;
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${widthPx}px;height:${heightPx}px;background:#fff`;
  document.body.append(host);
  try {
    const echarts = await import("@/services/echartsRuntime");
    const chart = echarts.init(host, null, { renderer: "canvas", width: widthPx, height: heightPx });
    try {
      chart.setOption({
        ...buildGeneratedChartOption(spec),
        animation: false,
        backgroundColor: "#fff"
      });
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
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
  chatMode?: "ask_table"
): Promise<OfficialDocumentGeneratedDataAsset> {
  const turn = await runResearchQuestion(need, chatMode);
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
    : await ensureAskArtifact(turn.sessionId || "", turn.chatId || "");
  if (!artifact.canFavorite) throw new Error("问数未形成可冻结的结构化查询");
  const asset = await favoriteAskArtifact(artifact, need.question);
  const versionId = asset.stableVersionId || asset.stableVersion?.id;
  if (!versionId) throw new Error("问数资产没有稳定版本");
  const execution = await previewQueryAsset(asset.id, { versionId, force: true });
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
      chart = await renderChartPng(need.question, output);
    } catch {
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

export async function executeOfficialDocumentDataTable(
  question: string,
  chartAllowed: boolean
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
  }, chartAllowed, "ask_table");
  if (!result.table?.rows.length || !result.querySource) {
    throw new Error("问数没有返回可回填的表格数据");
  }
  return result;
}
