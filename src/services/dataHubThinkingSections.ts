import { createDataHubAskTurn } from "./dataHubAskDataPresenter";
import type { DataHubAskTurn, DataHubExecutionProjection, DataHubProcessNote } from "@/types/dataHub";

export type { DataHubProcessNote };

export type DataHubThinkingSection = { key: string; label: string; notes: DataHubProcessNote[]; main: boolean };

/** 相邻的同类条目并成一条：连续几次模型调用的分析说明读起来就是一段思路，不必逐条重复标签。 */
function mergeAdjacentNotes(notes: readonly DataHubProcessNote[]): DataHubProcessNote[] {
  return notes.reduce<DataHubProcessNote[]>((merged, note) => {
    const content = note.content.trim();
    if (!content) return merged;
    const previous = merged[merged.length - 1];
    if (previous?.kind === note.kind) {
      merged[merged.length - 1] = { ...previous, content: `${previous.content}\n\n${content}` };
    } else {
      merged.push({ kind: note.kind, content });
    }
    return merged;
  }, []);
}

/**
 * 每个会话按时间顺序给出分析说明（公开思考）与过程说明（非正式回答的正文）；
 * 根/子会话保持隔离，工具记录和正式回答不进来。
 */
export function getDataHubThinkingSections(projection: DataHubExecutionProjection, root: DataHubAskTurn): DataHubThinkingSection[] {
  return [projection.mainSession, ...projection.subagentSessions].flatMap((session, index) => {
    const turn = index === 0 ? root : createDataHubAskTurn(root.question,
      session.events.map((event) => ({ ...event, parentSessionId: undefined })),
      session.status === "running" ? "streaming" : session.status,
      session.error?.message, { sessionId: session.sessionId, chatId: session.chatId });
    const notes = mergeAdjacentNotes(turn.processNotes
      ?? turn.thinkingBlocks.map((block) => ({ kind: "analysis" as const, content: block.content })));
    return notes.length ? [{
      key: session.sessionId ?? `thinking-${index}`,
      label: index === 0 ? "主任务" : session.label || session.agentName || "子任务",
      notes, main: index === 0
    }] : [];
  });
}
