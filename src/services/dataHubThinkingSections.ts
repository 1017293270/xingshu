import { createDataHubAskTurn } from "./dataHubAskDataPresenter";
import type { DataHubAskTurn, DataHubExecutionProjection } from "@/types/dataHub";

export type DataHubThinkingSection = { key: string; label: string; content: string; main: boolean };

/** 只收集实际返回的公开思考；根/子会话保持隔离，工具记录和答案不冒充思考。 */
export function getDataHubThinkingSections(projection: DataHubExecutionProjection, root: DataHubAskTurn): DataHubThinkingSection[] {
  return [projection.mainSession, ...projection.subagentSessions].flatMap((session, index) => {
    const turn = index === 0 ? root : createDataHubAskTurn(root.question,
      session.events.map((event) => ({ ...event, parentSessionId: undefined })),
      session.status === "running" ? "streaming" : session.status,
      session.error?.message, { sessionId: session.sessionId, chatId: session.chatId });
    const content = turn.thinkingBlocks.map((block) => block.content).join("\n\n").trim();
    return content ? [{
      key: session.sessionId ?? `thinking-${index}`,
      label: index === 0 ? "主任务" : session.label || session.agentName || "子任务",
      content, main: index === 0
    }] : [];
  });
}
