import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { streamAgentMessage } from "@/services/agentService";
import { createDataHubAskTurn } from "@/services/dataHubAskDataPresenter";
import { createDataHubClientId } from "@/services/dataHubAskDataService";
import { ASK_TABLE_CHAT_MODE, createAskTableSessionId } from "@/services/dataHubAskTable";
import { loadDataHubHistoryReplay } from "@/services/historyService";
import type { DataHubAskDataStatus, DataHubAskTurn, DataHubStreamEvent } from "@/types/dataHub";

export type TableSessionLaunchState = {
  prompt?: string;
};

export function tableSessionPath(sessionId: string) {
  return `/table/${encodeURIComponent(sessionId)}`;
}

const TABLE_LAUNCH_KEY_PREFIX = "xingshu.table.launch:";
const TABLE_LAUNCHED_KEY_PREFIX = "xingshu.table.launched:";

function tableLaunchStorageKey(sessionId: string) {
  return `${TABLE_LAUNCH_KEY_PREFIX}${sessionId}`;
}

function tableLaunchedStorageKey(sessionId: string) {
  return `${TABLE_LAUNCHED_KEY_PREFIX}${sessionId}`;
}

function readSessionStorage(key: string) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionStorage(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore quota / private-mode failures; boot can still use location state.
  }
}

function deleteSessionStorage(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore unavailable storage.
  }
}

export function queueTableSessionLaunch(sessionId: string, prompt: string) {
  const trimmedPrompt = prompt.trim();
  if (!sessionId || !trimmedPrompt) {
    return;
  }

  writeSessionStorage(tableLaunchStorageKey(sessionId), trimmedPrompt);
}

function peekTableSessionLaunch(sessionId: string) {
  return readSessionStorage(tableLaunchStorageKey(sessionId)) ?? "";
}

function clearTableSessionLaunch(sessionId: string | null | undefined) {
  if (!sessionId) {
    return;
  }

  deleteSessionStorage(tableLaunchStorageKey(sessionId));
}

function markTableSessionLaunched(sessionId: string) {
  writeSessionStorage(tableLaunchedStorageKey(sessionId), "1");
}

function wasTableSessionLaunched(sessionId: string) {
  return readSessionStorage(tableLaunchedStorageKey(sessionId)) === "1";
}

type TableLiveTurn = {
  id: string;
  question: string;
  chatId: string;
  status: DataHubAskDataStatus;
  events: DataHubStreamEvent[];
  errorMessage: string;
};

type UseTableGenerationOptions = {
  sessionId?: string | null;
  launchPrompt?: string;
};

function projectTurn(sessionId: string | null, live: TableLiveTurn): DataHubAskTurn {
  return createDataHubAskTurn(live.question, live.events, live.status, live.errorMessage, {
    sessionId,
    chatId: live.chatId
  });
}

function errorText(data: { message?: string } | string | undefined, fallback: string) {
  return typeof data === "string" ? data : data?.message || fallback;
}

export function useTableGeneration(options: UseTableGenerationOptions = {}) {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<DataHubAskDataStatus>("idle");
  const [events, setEvents] = useState<DataHubStreamEvent[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(options.sessionId ?? null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [turns, setTurns] = useState<TableLiveTurn[]>([]);
  const [restoreError, setRestoreError] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);
  const [didRestore, setDidRestore] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const generationIdRef = useRef(0);
  const mountedRef = useRef(true);
  const generateRef = useRef<(prompt: string, explicitSessionId?: string) => boolean>(() => false);
  const restoreRef = useRef<(targetSessionId: string) => Promise<void>>(async () => undefined);

  const projectedTurns = useMemo(
    () => turns.map((item) => projectTurn(sessionId, item)),
    [sessionId, turns]
  );
  const turn = useMemo(() => {
    const latest = turns.at(-1);
    if (latest) {
      return projectTurn(sessionId, latest);
    }

    return createDataHubAskTurn(question, events, status, errorMessage, { sessionId, chatId });
  }, [chatId, errorMessage, events, question, sessionId, status, turns]);

  const patchActiveTurn = useCallback((
    updater: (current: TableLiveTurn) => TableLiveTurn
  ) => {
    setTurns((current) => {
      const last = current.at(-1);
      if (!last) {
        return current;
      }

      return [...current.slice(0, -1), updater(last)];
    });
  }, []);

  const stop = useCallback(() => {
    generationIdRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setStatus((current) => (current === "streaming" ? "cancelled" : current));
    patchActiveTurn((current) => (
      current.status === "streaming" ? { ...current, status: "cancelled" } : current
    ));
    clearTableSessionLaunch(sessionId);
  }, [patchActiveTurn, sessionId]);

  const generate = useCallback((prompt: string, explicitSessionId?: string) => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      return false;
    }

    generationIdRef.current += 1;
    const generationId = generationIdRef.current;
    controllerRef.current?.abort();

    const nextSessionId = explicitSessionId || sessionId || createAskTableSessionId();
    const nextChatId = createDataHubClientId("chat");
    const liveTurn: TableLiveTurn = {
      id: nextChatId,
      question: trimmedPrompt,
      chatId: nextChatId,
      status: "streaming",
      events: [],
      errorMessage: ""
    };

    setSessionId(nextSessionId);
    setChatId(nextChatId);
    setQuestion(trimmedPrompt);
    setEvents([]);
    setErrorMessage("");
    setRestoreError("");
    setDidRestore(false);
    setStatus("streaming");
    setTurns((current) => {
      const last = current.at(-1);
      if (last?.status === "streaming") {
        return [...current.slice(0, -1), liveTurn];
      }

      return [...current, liveTurn];
    });

    const controller = streamAgentMessage(
      {
        content: trimmedPrompt,
        sessionId: nextSessionId,
        globalSessionId: nextSessionId,
        chatId: nextChatId,
        chatMode: ASK_TABLE_CHAT_MODE
      },
      {
        onEvent: (event) => {
          if (!mountedRef.current || generationId !== generationIdRef.current) {
            return;
          }

          setEvents((current) => [...current, event]);
          patchActiveTurn((current) => ({ ...current, events: [...current.events, event] }));
          if (event.type === "error" && !event.parentSessionId) {
            const message = errorText(event.data as { message?: string } | string | undefined, "制表执行失败");
            setErrorMessage(message);
            setStatus("error");
            patchActiveTurn((current) => ({ ...current, status: "error", errorMessage: message }));
          }
        },
        onDone: () => {
          if (!mountedRef.current || generationId !== generationIdRef.current) {
            return;
          }

          setStatus((current) => (current === "streaming" ? "done" : current));
          patchActiveTurn((current) => (
            current.status === "streaming" ? { ...current, status: "done" } : current
          ));
          clearTableSessionLaunch(nextSessionId);
        },
        onError: (error) => {
          if (!mountedRef.current || generationId !== generationIdRef.current) {
            return;
          }

          const message = error.message || "制表需求提交失败，请稍后重试";
          setErrorMessage(message);
          setStatus("error");
          patchActiveTurn((current) => ({ ...current, status: "error", errorMessage: message }));
          clearTableSessionLaunch(nextSessionId);
        }
      }
    );
    controllerRef.current = controller;
    return true;
  }, [patchActiveTurn, sessionId]);

  const restore = useCallback(async (targetSessionId: string) => {
    generationIdRef.current += 1;
    const generationId = generationIdRef.current;
    controllerRef.current?.abort();
    controllerRef.current = null;
    clearTableSessionLaunch(targetSessionId);
    setIsRestoring(true);
    setRestoreError("");
    setDidRestore(false);
    setStatus("idle");
    setErrorMessage("");

    try {
      const replay = await loadDataHubHistoryReplay(targetSessionId, "ask");
      if (!mountedRef.current || generationId !== generationIdRef.current) {
        return;
      }

      const restoredTurns: TableLiveTurn[] = replay.turns.map((item) => ({
        id: item.id,
        question: item.question,
        chatId: item.chatId,
        status: "done",
        events: item.events,
        errorMessage: item.error
      }));
      const latest = restoredTurns.at(-1);
      setSessionId(targetSessionId);
      setTurns(restoredTurns);
      setQuestion(latest?.question || replay.question);
      setChatId(latest?.chatId ?? null);
      setEvents(latest?.events ?? replay.events);
      setErrorMessage(latest?.errorMessage ?? "");
      setDidRestore(true);
      setStatus(restoredTurns.length > 0 ? "done" : "idle");
    } catch (error) {
      if (!mountedRef.current || generationId !== generationIdRef.current) {
        return;
      }

      const message = error instanceof Error ? error.message : "制表记录加载失败";
      setRestoreError(message);
      setStatus("error");
      setErrorMessage(message);
    } finally {
      if (mountedRef.current) {
        setIsRestoring(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  generateRef.current = generate;
  restoreRef.current = restore;

  useEffect(() => {
    const bootSessionId = options.sessionId;
    if (!bootSessionId) {
      return;
    }

    const queuedPrompt = peekTableSessionLaunch(bootSessionId);
    const launchPrompt = queuedPrompt || options.launchPrompt?.trim() || "";
    if (queuedPrompt || (launchPrompt && !wasTableSessionLaunched(bootSessionId))) {
      markTableSessionLaunched(bootSessionId);
      queueTableSessionLaunch(bootSessionId, launchPrompt);
      generateRef.current(launchPrompt, bootSessionId);
      return;
    }

    void restoreRef.current(bootSessionId);
  }, [options.launchPrompt, options.sessionId]);

  return {
    status,
    turn,
    turns: projectedTurns,
    sessionId,
    generate,
    restore,
    stop,
    isStreaming: status === "streaming",
    isRestoring,
    didRestore,
    restoreError
  };
}
