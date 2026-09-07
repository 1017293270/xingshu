import { getDataHubActionLabel } from "@/services/dataHubAskDataPresenter";
import { buildTableAgentTrace, type TableExecutionTurn } from "./agentTrace";

export function getTableGenerationProgress(turn: TableExecutionTurn) {
  if (turn.tableResults.length > 0) {
    return `已生成 ${turn.tableResults.length} 张结果表`;
  }

  if (turn.execution) {
    const steps = buildTableAgentTrace(turn).steps;
    const active = [...steps].reverse().find((step) => step.status === "running");
    if (active) return `当前步骤：${active.label}`;
    const latest = steps.at(-1);
    if (latest) return latest.status === "error" ? `执行失败：${latest.label}`
      : latest.status === "warning" ? `正在修正：${latest.label}`
        : latest.status === "cancelled" ? `已停止：${latest.label}`
        : `已完成：${latest.label}，等待结果表`;
  }

  const lastStep = [...turn.reactSteps].reverse().find((step) => step.action);
  if (lastStep?.action) {
    return `当前步骤：${getDataHubActionLabel(lastStep.action)}`;
  }

  const lastTool = turn.toolCalls.at(-1);
  const toolName = lastTool?.toolName || lastTool?.tool || lastTool?.name;
  if (toolName) {
    return `当前步骤：${getDataHubActionLabel(toolName)}`;
  }

  const dataSource = turn.dataSources.at(-1);
  if (dataSource) {
    return `已定位数据源：${dataSource.datasourceName}`;
  }

  if (turn.routingEvents.length > 0) {
    return "正在理解制表需求";
  }

  return turn.execution?.eventCount ? "正在生成结果表，等待执行进度" : "正在连接问表，生成结果表";
}
