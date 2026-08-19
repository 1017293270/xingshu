import { getDataHubActionLabel } from "@/services/dataHubAskDataPresenter";
import type { DataHubAskDataStatus, DataHubAskTurn, DataHubToolResultData } from "@/types/dataHub";

export type TableAgentTraceStepStatus = "done" | "running" | "error";

export type TableAgentTraceStep = {
  id: string;
  label: string;
  detail: string;
  status: TableAgentTraceStepStatus;
  durationMs?: number;
  sql?: string;
};

export type TableAgentTrace = {
  steps: TableAgentTraceStep[];
  datasourceName: string;
  totalDurationMs?: number;
  tableCount: number;
  rowCount: number;
};

/** 会带出 SQL 的动作；用于把 tool_result 里的语句挂到正确的步骤上。 */
const queryActions = new Set(["generate_query", "execute_query", "nl2sql_fallback"]);

function toolNameOf(item: { toolName?: string; tool?: string; name?: string }) {
  return item.toolName || item.tool || item.name || "";
}

function firstSql(toolResults: DataHubToolResultData[]) {
  for (const result of toolResults) {
    const sql = typeof result.sql === "string" ? result.sql.trim() : "";
    if (sql) {
      return sql;
    }
  }

  return "";
}

function stepStatusOf(rawStatus: string | undefined, isLast: boolean, turnStatus: DataHubAskDataStatus) {
  if (rawStatus === "error" || rawStatus === "fail") {
    return "error" as const;
  }

  if (rawStatus === "running") {
    return "running" as const;
  }

  if (rawStatus === "success") {
    return "done" as const;
  }

  // 没有显式状态时，只有流式过程中的最后一步才算在跑。
  if (isLast && turnStatus === "streaming") {
    return "running" as const;
  }

  return turnStatus === "error" && isLast ? ("error" as const) : ("done" as const);
}

/** 只有真的拆出了子问题才值得单独一步；执行模式对使用者没有信息量。 */
function describeDecompose(turn: DataHubAskTurn) {
  return (turn.decompose?.subQuestions ?? []).join(" · ");
}

/**
 * 把一轮问表的流式事件整理成可读的推演轨迹。
 * 只呈现事件里真实存在的信息，缺什么就不显示什么，不做补全推断。
 */
export function buildTableAgentTrace(turn: DataHubAskTurn): TableAgentTrace {
  const steps: TableAgentTraceStep[] = [];
  const datasourceName = turn.dataSources.at(-1)?.datasourceName ?? "";
  const sql = firstSql(turn.toolResults);

  const decomposeDetail = describeDecompose(turn);
  if (decomposeDetail) {
    steps.push({
      id: "decompose",
      label: "问题拆解",
      detail: decomposeDetail,
      status: "done"
    });
  }

  if (turn.reactSteps.length > 0) {
    let sqlAttached = false;
    turn.reactSteps.forEach((step, index) => {
      const isLast = index === turn.reactSteps.length - 1;
      const label = getDataHubActionLabel(step.action);
      const detail = step.summary || step.resultSummary || step.reason || step.content || "";

      const carriesSql = Boolean(sql) && !sqlAttached && Boolean(step.action) && queryActions.has(step.action!);
      sqlAttached = sqlAttached || carriesSql;

      steps.push({
        id: `react-${step.round ?? 0}-${step.stepNum ?? index}`,
        label,
        detail: detail || (step.action === "locate_datasource" ? datasourceName : ""),
        status: stepStatusOf(step.status, isLast, turn.status),
        durationMs: step.durationMs,
        sql: carriesSql ? sql : undefined
      });
    });
  } else if (turn.toolCalls.length > 0) {
    // 没有 ReAct 步骤时回落到工具调用序列，至少让人看见 agent 走过哪几步。
    turn.toolCalls.forEach((call, index) => {
      const name = toolNameOf(call);
      const result = turn.toolResults.find((item) => toolNameOf(item) === name);
      const isLast = index === turn.toolCalls.length - 1;

      steps.push({
        id: `tool-${name || index}`,
        label: getDataHubActionLabel(name),
        detail: result?.summary || "",
        status: stepStatusOf(result?.status, isLast, turn.status),
        durationMs: result?.durationMs,
        sql: typeof result?.sql === "string" && result.sql.trim() ? result.sql.trim() : undefined
      });
    });
  }

  // 数据源是问表最关键的口径证据；若步骤里没体现，单独补一条。
  if (datasourceName && !steps.some((step) => step.detail === datasourceName)) {
    steps.push({
      id: "datasource",
      label: "定位数据源",
      detail: datasourceName,
      status: "done"
    });
  }

  // SQL 没能挂到任何步骤时，作为独立一条呈现，不让它消失。
  if (sql && !steps.some((step) => step.sql)) {
    steps.push({
      id: "query",
      label: "生成查询",
      detail: "",
      status: "done",
      sql
    });
  }

  const summedDuration = steps.reduce((total, step) => total + (step.durationMs ?? 0), 0);
  const rowCount = turn.tableResults.reduce((total, table) => total + table.totalRows, 0);

  return {
    steps,
    datasourceName,
    totalDurationMs: turn.done?.totalDurationMs ?? (summedDuration > 0 ? summedDuration : undefined),
    tableCount: turn.tableResults.length,
    rowCount
  };
}

export function formatTraceDuration(durationMs?: number) {
  if (!durationMs || durationMs <= 0) {
    return "";
  }

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
}

/** 轨迹折叠时的一行摘要：走了几步、命中哪个数据源、用时多少。 */
export function summarizeTableAgentTrace(trace: TableAgentTrace) {
  const parts: string[] = [];

  if (trace.steps.length > 0) {
    parts.push(`${trace.steps.length} 步`);
  }

  if (trace.datasourceName) {
    parts.push(trace.datasourceName);
  }

  const duration = formatTraceDuration(trace.totalDurationMs);
  if (duration) {
    parts.push(`用时 ${duration}`);
  }

  return parts.join(" · ");
}
