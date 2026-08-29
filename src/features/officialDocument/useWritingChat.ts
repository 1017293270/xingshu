import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createDataHubClientId,
  streamDataHubAskData
} from "@/services/dataHubAskDataService";
import { createDataHubAskTurn } from "@/services/dataHubAskDataPresenter";
import { createWritingSessionId, WRITING_CHAT_MODE } from "@/services/dataHubWriting";
import type { DataHubAskDataStatus, DataHubStreamEvent } from "@/types/dataHub";

export type WritingChatTurn = {
  id: string;
  question: string;
  status: DataHubAskDataStatus;
  events: DataHubStreamEvent[];
  error: string;
  purpose: "chat" | "full-draft";
};

function errorText(data: unknown, fallback: string) {
  if (typeof data === "string" && data.trim()) return data;
  if (data && typeof data === "object" && typeof (data as { message?: unknown }).message === "string") {
    return (data as { message: string }).message;
  }
  return fallback;
}

/**
 * 报告智写的对话状态。刻意不进 useUiStore —— 那里的 analysisTurns 是全局单会话的问数对话，
 * 写作聊天必须按草稿隔离，塞进去会和问数互相串台。
 */
export function useWritingChat(draftId: string) {
  const [turns, setTurns] = useState<WritingChatTurn[]>([]);
  const sessionIdRef = useRef(createWritingSessionId());
  const controllerRef = useRef<AbortController | null>(null);
  /* SSE 的文字增量很密，攒一帧再落 state，避免每个 token 都触发整栏重渲染。 */
  const bufferRef = useRef(new Map<string, DataHubStreamEvent[]>());
  const flushTimerRef = useRef<number | undefined>(undefined);

  const flush = useCallback(() => {
    flushTimerRef.current = undefined;
    const buffered = bufferRef.current;
    if (buffered.size === 0) return;
    const batch = new Map(buffered);
    buffered.clear();
    setTurns((current) => current.map((turn) => {
      const pending = batch.get(turn.id);
      return pending ? { ...turn, events: [...turn.events, ...pending] } : turn;
    }));
  }, []);

  const queueEvent = useCallback((turnId: string, event: DataHubStreamEvent) => {
    const buffered = bufferRef.current;
    buffered.set(turnId, [...(buffered.get(turnId) ?? []), event]);
    if (flushTimerRef.current === undefined) {
      flushTimerRef.current = window.setTimeout(flush, 16);
    }
  }, [flush]);

  /* 换一篇草稿就换一个会话，历史不跨草稿串。 */
  useEffect(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    bufferRef.current.clear();
    sessionIdRef.current = createWritingSessionId();
    setTurns([]);
  }, [draftId]);

  useEffect(() => () => {
    controllerRef.current?.abort();
    if (flushTimerRef.current !== undefined) window.clearTimeout(flushTimerRef.current);
  }, []);

  const settle = useCallback((turnId: string, status: DataHubAskDataStatus, error = "") => {
    flush();
    setTurns((current) => current.map((turn) => (
      turn.id === turnId && (turn.status === "streaming") ? { ...turn, status, error } : turn
    )));
  }, [flush]);

  const send = useCallback((
    question: string,
    options: {
      writingContext?: Record<string, unknown>;
      purpose?: WritingChatTurn["purpose"];
      displayQuestion?: string;
    } = {}
  ) => {
    const trimmed = question.trim();
    if (!trimmed || controllerRef.current) return;

    const turnId = createDataHubClientId("chat");
    setTurns((current) => [
      ...current,
      {
        id: turnId,
        question: options.displayQuestion?.trim() || trimmed,
        status: "streaming",
        events: [],
        error: "",
        purpose: options.purpose ?? "chat"
      }
    ]);

    controllerRef.current = streamDataHubAskData(
      {
        message: trimmed,
        sessionId: sessionIdRef.current,
        globalSessionId: sessionIdRef.current,
        chatId: turnId,
        chatMode: WRITING_CHAT_MODE,
        writingContext: options.writingContext
      },
      {
        onEvent: (event) => {
          queueEvent(turnId, event);
          if (event.type === "error" && !event.parentSessionId) {
            controllerRef.current = null;
            settle(turnId, "error", errorText(event.data, "报告智写执行失败"));
          }
        },
        onDone: () => {
          controllerRef.current = null;
          settle(turnId, "done");
        },
        onError: (error) => {
          controllerRef.current = null;
          settle(turnId, "error", error.message);
        }
      }
    );
    return turnId;
  }, [queueEvent, settle]);

  const stop = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    controllerRef.current = null;
    controller.abort();
    setTurns((current) => current.map((turn) => (
      turn.status === "streaming" ? { ...turn, status: "cancelled" } : turn
    )));
  }, []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    bufferRef.current.clear();
    sessionIdRef.current = createWritingSessionId();
    setTurns([]);
  }, []);

  const messages = useMemo(
    () => turns.map((turn) => ({
      ...turn,
      ask: createDataHubAskTurn(turn.question, turn.events, turn.status, turn.error, {
        sessionId: sessionIdRef.current,
        chatId: turn.id
      })
    })),
    [turns]
  );

  return {
    messages,
    busy: turns.some((turn) => turn.status === "streaming"),
    send,
    stop,
    reset
  };
}
