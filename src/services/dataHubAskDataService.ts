import { joinDataHubUrl } from "@/services/dataHubClient";
import { readDataHubSession } from "@/services/dataHubSession";
import type {
  DataHubAskStrategy,
  DataHubChatMode,
  DataHubChatRequest,
  DataHubStreamEvent
} from "@/types/dataHub";

export type DataHubAskDataInput = {
  message: string;
  sessionId?: string;
  chatId?: string;
  chatMode?: DataHubChatMode;
  askStrategy?: DataHubAskStrategy;
  datasourceId?: number;
  model?: string;
  providerId?: number;
  spaceId?: number;
};

export type DataHubAskDataStreamHandlers = {
  onEvent: (event: DataHubStreamEvent) => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
};

function createChatId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function buildDataHubChatRequest(input: DataHubAskDataInput): DataHubChatRequest {
  const session = readDataHubSession();
  const spaceId = input.spaceId ?? session.spaceId ?? undefined;

  return {
    message: input.message,
    sessionId: input.sessionId,
    chatId: input.chatId ?? createChatId(),
    chatMode: input.chatMode ?? "ask",
    askStrategy: input.askStrategy ?? "cube_fallback",
    datasourceId: input.datasourceId,
    model: input.model,
    providerId: input.providerId,
    spaceId
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
      events.push(JSON.parse(payload) as DataHubStreamEvent);
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

  xhr.open("POST", joinDataHubUrl("/api/v1/chat/completions/stream"));
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.setRequestHeader("Accept", "text/event-stream");

  if (session.token) {
    xhr.setRequestHeader("Authorization", `Bearer ${session.token}`);
  }

  const spaceId = request.spaceId ?? session.spaceId;
  if (spaceId !== null && spaceId !== undefined) {
    xhr.setRequestHeader("X-Space-Id", String(spaceId));
  }

  controller.signal.addEventListener("abort", () => {
    xhr.abort();
  });

  function drain(flush = false) {
    const parsed = parseDataHubSseBlocks(eventBuffer);
    eventBuffer = parsed.rest;
    parsed.events.forEach(handlers.onEvent);

    if (parsed.isDone && !isDone) {
      isDone = true;
      handlers.onDone?.();
    }

    if (flush && eventBuffer.trim()) {
      try {
        const flushed = parseDataHubSseBlocks(`${eventBuffer}\n\n`);
        eventBuffer = flushed.rest;
        flushed.events.forEach(handlers.onEvent);
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
    handlers.onError?.(new Error("问数连接失败"));
  };

  xhr.onloadend = () => {
    drain(true);

    if (xhr.status < 200 || xhr.status >= 300) {
      const message = xhr.responseText?.slice(0, 200) || `HTTP ${xhr.status}`;
      handlers.onEvent({ type: "error", data: { code: xhr.status, message } });
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
