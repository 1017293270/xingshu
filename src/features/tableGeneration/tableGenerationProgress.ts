import { getDataHubActionLabel } from "@/services/dataHubAskDataPresenter";
import type { DataHubAskTurn } from "@/types/dataHub";

export function getTableGenerationProgress(turn: DataHubAskTurn) {
  if (turn.tableResults.length > 0) {
    return `已生成 ${turn.tableResults.length} 张结果表`;
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

  return "正在连接问表，生成结果表";
}
