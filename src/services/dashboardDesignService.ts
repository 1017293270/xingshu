import type { DashboardDesignRequest, DashboardDesignStreamEvent } from "@/types/dashboardDesign";
import {
  DataHubServiceError,
  isTrustedDataHubAuthTarget,
  joinDataHubUrl
} from "./dataHubClient";
import { expireDataHubSession, readDataHubSession } from "./dataHubSession";

/**
 * 智享大屏的流式端点：先叙事后 JSON。
 * 与问数那条 XHR 流不同，这里用 fetch + ReadableStream——只需要单向读，
 * 也不必兼容 IE 时代的进度事件，读完直接交给纯函数解析。
 */

export const DASHBOARD_DESIGN_GENERATE_PATH = "/api/v1/dashboard-design/generate";
export const DASHBOARD_DESIGN_EDIT_PATH = "/api/v1/dashboard-design/edit";

export type DashboardDesignStreamHandlers = {
  onEvent: (event: DashboardDesignStreamEvent) => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** 只认识契约里的五种 type，别的一律忽略——后端加了新事件不该让前端炸掉。 */
function adaptEvent(payload: unknown): DashboardDesignStreamEvent | null {
  if (!isRecord(payload)) return null;
  switch (payload.type) {
    case "message":
      return typeof payload.delta === "string" ? { type: "message", delta: payload.delta } : null;
    case "spec":
      return { type: "spec", spec: payload.spec };
    case "ops":
      return { type: "ops", ops: payload.ops };
    case "error":
      return {
        type: "error",
        code: typeof payload.code === "number" ? payload.code : 500,
        message: typeof payload.message === "string" ? payload.message : "设计服务返回错误"
      };
    case "done":
      return { type: "done", ...(typeof payload.modelId === "string" ? { modelId: payload.modelId } : {}) };
    default:
      return null;
  }
}

/**
 * 按空行切块解析 SSE，剩下的半行留在 rest 里等下一个 chunk 补齐。
 * 后端可能推 `[DONE]` 也可能推 `{"type":"done"}`，两种都当收流。
 */
export function parseDashboardDesignSseChunk(text: string): {
  events: DashboardDesignStreamEvent[];
  rest: string;
} {
  const events: DashboardDesignStreamEvent[] = [];
  let buffer = text.replace(/\r\n/g, "\n");
  let boundary = buffer.indexOf("\n\n");

  while (boundary >= 0) {
    const block = buffer.slice(0, boundary);
    buffer = buffer.slice(boundary + 2);
    const payload = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();

    if (payload === "[DONE]") {
      events.push({ type: "done" });
    } else if (payload) {
      try {
        const event = adaptEvent(JSON.parse(payload));
        if (event) events.push(event);
      } catch {
        // 半截 JSON 或后端的调试输出，丢掉即可；真正的失败会走 error 事件。
      }
    }

    boundary = buffer.indexOf("\n\n");
  }

  return { events, rest: buffer };
}

async function readErrorMessage(response: Response) {
  try {
    const text = await response.text();
    if (!text) return response.statusText;
    const payload = JSON.parse(text) as unknown;
    if (isRecord(payload) && typeof payload.message === "string") return payload.message;
    return text;
  } catch {
    return response.statusText;
  }
}

export function streamDashboardDesign(
  kind: "generate" | "edit",
  request: DashboardDesignRequest,
  handlers: DashboardDesignStreamHandlers
): AbortController {
  const path = kind === "generate" ? DASHBOARD_DESIGN_GENERATE_PATH : DASHBOARD_DESIGN_EDIT_PATH;
  const controller = new AbortController();
  const session = readDataHubSession();

  void (async () => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      handlers.onDone?.();
    };

    try {
      if (!isTrustedDataHubAuthTarget(path)) {
        throw new DataHubServiceError("已阻止向未授权地址发送登录凭证", { code: "UNTRUSTED_AUTH_ORIGIN" });
      }

      const headers = new Headers({
        "Content-Type": "application/json",
        Accept: "text/event-stream"
      });
      if (session.token) headers.set("Authorization", `Bearer ${session.token}`);
      if (session.spaceId !== null && session.spaceId !== undefined) {
        headers.set("X-Space-Id", String(session.spaceId));
      }

      const response = await fetch(joinDataHubUrl(path), {
        method: "POST",
        headers,
        body: JSON.stringify(request),
        signal: controller.signal
      });

      if (!response.ok) {
        if (response.status === 401) expireDataHubSession(session.token);
        throw new DataHubServiceError(await readErrorMessage(response), { status: response.status });
      }

      const body = response.body;
      if (!body) {
        finish();
        return;
      }

      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseDashboardDesignSseChunk(buffer);
        buffer = parsed.rest;
        for (const event of parsed.events) {
          handlers.onEvent(event);
          if (event.type === "done") finish();
        }
        if (finished) break;
      }

      // 收流时最后一块可能没有空行结尾，补一个边界把它冲出来。
      if (!finished && buffer.trim()) {
        const flushed = parseDashboardDesignSseChunk(`${buffer}\n\n`);
        for (const event of flushed.events) {
          handlers.onEvent(event);
          if (event.type === "done") finish();
        }
      }
      finish();
    } catch (error) {
      if (controller.signal.aborted) return;
      handlers.onError?.(error instanceof Error ? error : new Error("大屏设计服务连接失败"));
    }
  })();

  return controller;
}
