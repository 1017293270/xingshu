import { joinDataHubUrl } from "@/services/dataHubClient";
import {
  DATA_HUB_SESSION_EXPIRED_MESSAGE,
  expireDataHubSession,
  readDataHubSession
} from "@/services/dataHubSession";
import { adaptDataHubStreamEvent } from "@/services/dataHubEventAdapter";
import type { DataHubChatRequest, DataHubRequestChatMode, DataHubStreamEvent } from "@/types/dataHub";

export type DataHubAskDataInput = {
  message: string;
  sessionId?: string;
  globalSessionId?: string;
  chatId?: string;
  chatMode?: DataHubRequestChatMode;
};

export type DataHubAskDataStreamHandlers = {
  onEvent: (event: DataHubStreamEvent) => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
};

export function createDataHubClientId(prefix: "session" | "chat") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function buildDataHubChatRequest(input: DataHubAskDataInput): DataHubChatRequest {
  const sessionId = input.sessionId || createDataHubClientId("session");

  return {
    message: input.message,
    sessionId,
    globalSessionId: input.globalSessionId || sessionId,
    chatId: input.chatId || createDataHubClientId("chat"),
    chatMode: input.chatMode ?? "ask"
  };
}

export function parseDataHubSseBlocks(text: string): {
  events: DataHubStreamEvent[];
  isDone: boolean;
  rest: string;
} {
  const events: DataHubStreamEvent[] = [];
  let isDone = false;
  let buffer = text.replace(/\r\n/g, "\n");
  let boundary = buffer.indexOf("\n\n");

  while (boundary >= 0) {
    const block = buffer.slice(0, boundary);
    buffer = buffer.slice(boundary + 2);

    const dataLines = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());
    const payload = dataLines.join("\n").trim();

    if (payload === "[DONE]") {
      isDone = true;
    } else if (payload) {
      const event = adaptDataHubStreamEvent(payload);
      if (event) {
        events.push(event);
        if (event.finished && !event.parentSessionId) {
          isDone = true;
        }
      }
    }

    boundary = buffer.indexOf("\n\n");
  }

  return { events, isDone, rest: buffer };
}

export function streamDataHubAskData(
  input: DataHubAskDataInput,
  handlers: DataHubAskDataStreamHandlers
): AbortController {
  const request = buildDataHubChatRequest(input);
  const session = readDataHubSession();
  const controller = new AbortController();
  const xhr = new XMLHttpRequest();
  let lastProcessed = 0;
  let eventBuffer = "";
  let isDone = false;
  let isAborted = false;
  let hasTransportError = false;

  xhr.open("POST", joinDataHubUrl("/api/agentScore/chat/completions/stream"));
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.setRequestHeader("Accept", "text/event-stream");

  if (session.token) {
    xhr.setRequestHeader("Authorization", `Bearer ${session.token}`);
  }

  const spaceId = session.spaceId;
  if (spaceId !== null && spaceId !== undefined) {
    xhr.setRequestHeader("X-Space-Id", String(spaceId));
  }

  controller.signal.addEventListener("abort", () => {
    isAborted = true;
    xhr.abort();
  });

  function drain(flush = false) {
    const parsed = parseDataHubSseBlocks(eventBuffer);
    eventBuffer = parsed.rest;
    parsed.events.forEach((event) => handlers.onEvent(event));

    if (parsed.isDone && !isDone) {
      isDone = true;
      handlers.onDone?.();
    }

    if (flush && eventBuffer.trim()) {
      try {
        const flushed = parseDataHubSseBlocks(`${eventBuffer}\n\n`);
        eventBuffer = flushed.rest;
        flushed.events.forEach((event) => handlers.onEvent(event));
        if (flushed.isDone && !isDone) {
          isDone = true;
          handlers.onDone?.();
        }
      } catch {
        eventBuffer = "";
      }
    }
  }

  xhr.onprogress = () => {
    const nextText = xhr.responseText.substring(lastProcessed);
    lastProcessed = xhr.responseText.length;
    eventBuffer += nextText;
    drain();
  };

  xhr.onerror = () => {
    if (!isAborted) {
      hasTransportError = true;
      handlers.onError?.(new Error("DataHub 流式连接失败"));
    }
  };

  xhr.onabort = () => {
    isAborted = true;
  };

  xhr.onloadend = () => {
    if (isAborted || hasTransportError) {
      return;
    }

    const finalText = xhr.responseText.substring(lastProcessed);
    lastProcessed = xhr.responseText.length;
    eventBuffer += finalText;
    drain(true);

    if (xhr.status === 401) {
      expireDataHubSession(session.token);
      handlers.onEvent({
        type: "error",
        data: { code: xhr.status, message: DATA_HUB_SESSION_EXPIRED_MESSAGE },
        content: { code: xhr.status, message: DATA_HUB_SESSION_EXPIRED_MESSAGE },
        sessionId: request.sessionId,
        globalSessionId: request.globalSessionId,
        chatId: request.chatId,
        finished: true
      });
      handlers.onError?.(new Error(DATA_HUB_SESSION_EXPIRED_MESSAGE));
      isDone = true;
      return;
    }

    if (xhr.status < 200 || xhr.status >= 300) {
      const message = xhr.responseText?.slice(0, 200) || `HTTP ${xhr.status}`;
      handlers.onEvent({
        type: "error",
        data: { code: xhr.status, message },
        content: { code: xhr.status, message },
        sessionId: request.sessionId,
        globalSessionId: request.globalSessionId,
        chatId: request.chatId,
        finished: true
      });
      handlers.onError?.(new Error(message));
      isDone = true;
      return;
    }

    if (!isDone) {
      isDone = true;
      handlers.onDone?.();
    }
  };

  xhr.send(JSON.stringify(request));
  return controller;
}
