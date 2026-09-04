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
 * data: 后面的载荷。线上抓到过外层多包一层字符串的形态
 * （`data:"{\"type\":\"message\",\"delta\":\"这一\"}"`），
 * 第一次 parse 出来的是字符串就再 parse 一次；最多两层，再多就是后端在乱套了。
 */
function parsePayload(payload: string): unknown {
  const first = JSON.parse(payload) as unknown;
  return typeof first === "string" ? JSON.parse(first) : first;
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
        const event = adaptEvent(parsePayload(payload));
        if (event) events.push(event);
      } catch {
        // 半截 JSON 或后端的调试输出，丢掉即可；真正的失败会走 error 事件。
      }
    }

    boundary = buffer.indexOf("\n\n");
  }

  return { events, rest: buffer };
}

/** Spring 兜底的占位文案，透给用户等于没说。 */
const EMPTY_BACKEND_MESSAGE = "No message available";

/**
 * 状态码先给一句用户看得懂的中文主句。
 * 这条消息会一路透到智享面板的「模型未参与本次设计：{原因}」，
 * 直接甩「No message available」或「Not Found」用户没法判断该找谁。
 */
function errorHeadline(status: number) {
  if (status === 401 || status === 403) return "登录已过期或没有权限";
  if (status === 404) return "大屏设计接口不存在（HTTP 404），后端尚未部署该接口";
  if (status === 408 || status === 504) return "大屏设计服务响应超时";
  if (status >= 500) return `大屏设计服务异常（HTTP ${status}）`;
  return `大屏设计服务返回 HTTP ${status}`;
}

/** 只认信封里的 message：非 JSON 的错误体（网关的 HTML 404 页）不该整页贴进提示条。 */
async function readErrorDetail(response: Response) {
  try {
    const text = (await response.text()).trim();
    if (!text) return "";
    const payload = JSON.parse(text) as unknown;
    const message = isRecord(payload) && typeof payload.message === "string" ? payload.message.trim() : "";
    return message === EMPTY_BACKEND_MESSAGE ? "" : message;
  } catch {
    return "";
  }
}

async function readErrorMessage(response: Response) {
  const detail = await readErrorDetail(response);
  return `${errorHeadline(response.status)}${detail ? `：${detail}` : ""}`;
}

/** 提示条里只放前 160 字：够看出后端到底返回了什么，又不会把整页 HTML 糊进面板。 */
const MAX_BODY_PREVIEW = 160;

function bodyPreview(text: string) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_BODY_PREVIEW ? flat.slice(0, MAX_BODY_PREVIEW) : flat;
}

/**
 * 整条流读完一条可识别事件都没有时的说法。
 * content-type 不作数——线上后端就是顶着 application/json 推的合法 SSE，
 * 按响应头拦会把正常的流也拦掉；只有「什么都没解析出来」才是真出了事。
 * 正文能解析成 JSON 且带 message，说明收到的是信封而不是流，把这句话直接告诉用户。
 */
function emptyStreamMessage(text: string) {
  try {
    const payload = JSON.parse(text) as unknown;
    const message = isRecord(payload) && typeof payload.message === "string" ? payload.message.trim() : "";
    if (message) return `大屏设计服务返回了非事件流响应：${message}`;
  } catch {
    // 不是 JSON，按空流加正文预览处理。
  }
  const preview = bodyPreview(text);
  return `大屏设计服务返回了空的事件流${preview ? `：${preview}` : ""}`;
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
        throw new Error("大屏设计服务返回了空的事件流");
      }

      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseDashboardDesignSseChunk(buffer);
        buffer = parsed.rest;
        for (const event of parsed.events) {
          received += 1;
          handlers.onEvent(event);
          if (event.type === "done") finish();
        }
        if (finished) break;
      }

      // 收流时最后一块可能没有空行结尾，补一个边界把它冲出来。
      if (!finished && buffer.trim()) {
        const flushed = parseDashboardDesignSseChunk(`${buffer}\n\n`);
        for (const event of flushed.events) {
          received += 1;
          handlers.onEvent(event);
          if (event.type === "done") finish();
        }
      }
      // 一条可识别事件都没有：流是空的，或者收到的根本是个 JSON 信封。
      // 静默 onDone 只会让面板说不清原因，这里把实际收到的东西说出来。
      // 切不出事件块的正文会原样留在 buffer 里（JSON 信封、登录页都没有空行边界），拿它说事。
      if (received === 0) {
        throw new Error(emptyStreamMessage(buffer.trim()));
      }
      finish();
    } catch (error) {
      if (controller.signal.aborted) return;
      handlers.onError?.(error instanceof Error ? error : new Error("大屏设计服务连接失败"));
    }
  })();

  return controller;
}
