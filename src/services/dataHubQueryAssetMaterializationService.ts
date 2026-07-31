import {
  createDataHubClientId,
  streamDataHubAskData
} from "@/services/dataHubAskDataService";
import { getDataHubEventPayload } from "@/services/dataHubEventAdapter";
import { ensureAskArtifact } from "@/services/queryAssetService";
import type { AskArtifactRef } from "@/types/dataHub";

export type MaterializeAskArtifactInput = {
  question: string;
};

type UnknownRecord = Record<string, unknown>;

const materializationTimeoutMs = 120_000;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNestedJson(value: unknown): unknown {
  let current = value;

  for (let depth = 0; depth < 4 && typeof current === "string"; depth += 1) {
    const text = current.trim();
    if (!text || (!text.startsWith("{") && !text.startsWith("["))) {
      break;
    }
    try {
      current = JSON.parse(text) as unknown;
    } catch {
      break;
    }
  }

  return current;
}

function normalizeAskArtifact(value: unknown): AskArtifactRef | undefined {
  const parsed = parseNestedJson(value);
  if (!isRecord(parsed)) {
    return undefined;
  }

  const askRunId =
    typeof parsed.askRunId === "string" ? parsed.askRunId.trim() : "";
  const resolvedQuestion =
    typeof parsed.resolvedQuestion === "string"
      ? parsed.resolvedQuestion.trim()
      : "";
  if (!askRunId || !resolvedQuestion || parsed.canFavorite !== true) {
    return undefined;
  }

  return { askRunId, resolvedQuestion, canFavorite: true };
}

function findAskArtifact(value: unknown): AskArtifactRef | undefined {
  const parsed = parseNestedJson(value);
  const direct = normalizeAskArtifact(parsed);
  if (direct || !isRecord(parsed)) {
    return direct;
  }

  for (const key of [
    "askArtifact",
    "queryArtifact",
    "artifact",
    "data",
    "content"
  ] as const) {
    const artifact = normalizeAskArtifact(parsed[key]);
    if (artifact) {
      return artifact;
    }
  }

  return undefined;
}

function readErrorMessage(value: unknown) {
  const parsed = parseNestedJson(value);
  if (typeof parsed === "string" && parsed.trim()) {
    return parsed.trim();
  }
  if (!isRecord(parsed)) {
    return undefined;
  }
  return typeof parsed.message === "string" && parsed.message.trim()
    ? parsed.message.trim()
    : undefined;
}

function readFailedDoneMessage(value: unknown) {
  const parsed = parseNestedJson(value);
  if (!isRecord(parsed) || parsed.failed !== true) {
    return undefined;
  }

  return (
    readErrorMessage(parsed) ||
    (typeof parsed.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim()
      : "重新问数执行失败")
  );
}

export function materializeAskArtifact(
  input: MaterializeAskArtifactInput
): Promise<AskArtifactRef> {
  const question = input.question.trim();
  if (!question) {
    return Promise.reject(new Error("缺少需要重新执行的问数问题"));
  }

  const sessionId = createDataHubClientId("session");
  const chatId = createDataHubClientId("chat");

  return new Promise<AskArtifactRef>((resolve, reject) => {
    let controller: AbortController | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let artifact: AskArtifactRef | undefined;
    let settled = false;
    let finishing = false;

    const cleanup = () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    };
    const resolveOnce = (value: AskArtifactRef) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const rejectOnce = (error: unknown, abortStream = false) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (abortStream) {
        controller?.abort();
      }
      reject(
        error instanceof Error ? error : new Error("重新问数生成可收藏查询失败")
      );
    };
    const finish = async () => {
      if (settled || finishing) return;
      finishing = true;
      try {
        const ensured = artifact ?? (await ensureAskArtifact(sessionId, chatId));
        if (!ensured.canFavorite) {
          throw new Error("重新问数完成，但没有生成可收藏的结构化查询");
        }
        resolveOnce(ensured);
      } catch (error) {
        rejectOnce(error);
      }
    };

    try {
      controller = streamDataHubAskData(
        {
          message: question,
          sessionId,
          globalSessionId: sessionId,
          chatId,
          chatMode: "ask"
        },
        {
          onEvent: (event) => {
            const payload = getDataHubEventPayload(event);
            if (event.type === "ask_artifact" || event.type === "done") {
              artifact =
                findAskArtifact(payload) ?? artifact;
            }
            if (event.type === "done") {
              const failedMessage = readFailedDoneMessage(payload);
              if (failedMessage) {
                rejectOnce(new Error(failedMessage), true);
                return;
              }
            }
            if (event.type === "error" && !event.parentSessionId) {
              rejectOnce(
                new Error(
                  readErrorMessage(payload) || "重新问数执行失败"
                ),
                true
              );
            }
          },
          onDone: () => {
            void finish();
          },
          onError: rejectOnce
        }
      );
      timeoutId = setTimeout(() => {
        controller?.abort();
        rejectOnce(new Error("重新问数超时，请稍后重试"));
      }, materializationTimeoutMs);
      if (settled) {
        cleanup();
      }
    } catch (error) {
      rejectOnce(error);
    }
  });
}
