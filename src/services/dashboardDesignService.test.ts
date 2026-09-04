import { TextEncoder as NodeTextEncoder } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDashboardDesignCatalog } from "@/features/dashboardStudio/core/dashboardDesignContext";
import type { DashboardDesignRequest, DashboardDesignStreamEvent } from "@/types/dashboardDesign";
import {
  DASHBOARD_DESIGN_EDIT_PATH,
  DASHBOARD_DESIGN_GENERATE_PATH,
  parseDashboardDesignSseChunk,
  streamDashboardDesign
} from "./dashboardDesignService";
import { expireDataHubSession } from "./dataHubSession";

vi.mock("./dataHubSession", () => ({
  readDataHubSession: vi.fn(() => ({ token: "token-1", user: null, spaceId: 7 })),
  expireDataHubSession: vi.fn()
}));

const request: DashboardDesignRequest = {
  brief: "做一块营收总览",
  assets: [],
  catalog: buildDashboardDesignCatalog(),
  canvas: { width: 1920, height: 1080 },
  history: []
};

/** 服务只碰 ok / status / headers / body.getReader / text，不必造真的 Response。 */
function sseResponse(
  chunks: string[],
  init: {
    ok?: boolean;
    status?: number;
    statusText?: string;
    /** 默认按事件流返回；给别的值就是模拟网关把 JSON 信封或错误页当成功响应发回来。 */
    contentType?: string;
    body?: null;
  } = {}
) {
  const encoder = new NodeTextEncoder();
  let index = 0;
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type" ? init.contentType ?? "text/event-stream" : null
    },
    body: init.body === null ? null : {
      getReader: () => ({
        read: async () =>
          index < chunks.length
            ? { done: false, value: encoder.encode(chunks[index++]) }
            : { done: true, value: undefined }
      })
    },
    text: async () => chunks.join("")
  } as unknown as Response;
}

function collect(kind: "generate" | "edit", chunks: string[], init?: Parameters<typeof sseResponse>[1]) {
  const fetchMock = vi.fn(async () => sseResponse(chunks, init));
  vi.stubGlobal("fetch", fetchMock);
  const events: DashboardDesignStreamEvent[] = [];
  const onDone = vi.fn();
  const onError = vi.fn();
  const finished = new Promise<void>((resolve) => {
    const controller = streamDashboardDesign(kind, request, {
      onEvent: (event) => events.push(event),
      onDone: () => {
        onDone();
        resolve();
      },
      onError: (error) => {
        onError(error);
        resolve();
      }
    });
    void controller;
  });
  return { fetchMock, events, onDone, onError, finished };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(expireDataHubSession).mockClear();
});

describe("parseDashboardDesignSseChunk", () => {
  it("按空行切块，半截留在 rest 等下一块", () => {
    const { events, rest } = parseDashboardDesignSseChunk(
      'data: {"type":"message","delta":"先看"}\n\ndata: {"type":"message","delta":"三张卡"}\n\ndata: {"type":"sp'
    );
    expect(events).toEqual([
      { type: "message", delta: "先看" },
      { type: "message", delta: "三张卡" }
    ]);
    expect(rest).toBe('data: {"type":"sp');
  });

  it("认 [DONE] 与 done，忽略陌生 type、半截 JSON 与 CRLF 差异", () => {
    const { events, rest } = parseDashboardDesignSseChunk(
      'data: {"type":"telemetry","x":1}\r\n\r\ndata: {broken\r\n\r\ndata: {"type":"error","code":502,"message":"坏了"}\r\n\r\ndata: [DONE]\r\n\r\n'
    );
    expect(events).toEqual([
      { type: "error", code: 502, message: "坏了" },
      { type: "done" }
    ]);
    expect(rest).toBe("");
  });

  it("spec 与 ops 事件原样带出载荷，交给引擎再校验", () => {
    const { events } = parseDashboardDesignSseChunk(
      'data: {"type":"spec","spec":{"widgets":[]}}\n\ndata: {"type":"ops","ops":{"ops":[]}}\n\ndata: {"type":"done","modelId":"kimi-k2"}\n\n'
    );
    expect(events).toEqual([
      { type: "spec", spec: { widgets: [] } },
      { type: "ops", ops: { ops: [] } },
      { type: "done", modelId: "kimi-k2" }
    ]);
  });
});

describe("streamDashboardDesign", () => {
  it("带登录态发 POST，按顺序吐出叙事、设计稿与 done，且 onDone 只触发一次", async () => {
    const { fetchMock, events, onDone, onError, finished } = collect("generate", [
      'data: {"type":"message","delta":"先看"}\n\ndata: {"type":"mess',
      'age","delta":"三张卡。"}\n\ndata: {"type":"spec","spec":{"widgets":[{"ref":"a"}]}}\n\n',
      'data: {"type":"done","modelId":"kimi-k2"}\n\n'
    ]);
    await finished;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(DASHBOARD_DESIGN_GENERATE_PATH);
    expect(init.method).toBe("POST");
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer token-1");
    expect(headers.get("X-Space-Id")).toBe("7");
    expect(headers.get("Accept")).toBe("text/event-stream");
    expect(JSON.parse(String(init.body)).brief).toBe("做一块营收总览");

    expect(events).toEqual([
      { type: "message", delta: "先看" },
      { type: "message", delta: "三张卡。" },
      { type: "spec", spec: { widgets: [{ ref: "a" }] } },
      { type: "done", modelId: "kimi-k2" }
    ]);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("edit 走修改端点，收尾没有空行的最后一块也会被冲出来", async () => {
    const { fetchMock, events, onDone, finished } = collect("edit", [
      'data: {"type":"ops","ops":{"ops":[]}}\n\ndata: {"type":"done"}'
    ]);
    await finished;

    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(DASHBOARD_DESIGN_EDIT_PATH);
    expect(events).toEqual([{ type: "ops", ops: { ops: [] } }, { type: "done" }]);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("401 会过期本地登录态并以 onError 收场", async () => {
    const { events, onDone, onError, finished } = collect(
      "generate",
      ['{"code":401,"message":"登录已过期"}'],
      { ok: false, status: 401, statusText: "Unauthorized" }
    );
    await finished;

    expect(events).toEqual([]);
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0] as unknown as [Error])[0].message).toBe("登录已过期或没有权限：登录已过期");
    expect(expireDataHubSession).toHaveBeenCalledWith("token-1");
  });

  it("其它非 2xx 在中文主句后追加信封里的 message", async () => {
    const { onError, finished } = collect(
      "generate",
      ['{"code":503,"message":"设计服务暂不可用"}'],
      { ok: false, status: 503, statusText: "Service Unavailable" }
    );
    await finished;

    expect((onError.mock.calls[0] as unknown as [Error])[0].message).toBe("大屏设计服务异常（HTTP 503）：设计服务暂不可用");
    expect(expireDataHubSession).not.toHaveBeenCalled();
  });

  /* 兜底提示条会原样显示这句话，所以它必须是用户读得懂的中文，而不是 Spring 的占位符。 */
  it("404 空响应体只给中文主句，指明接口没部署", async () => {
    const { onError, finished } = collect("generate", [""], { ok: false, status: 404, statusText: "Not Found" });
    await finished;

    expect((onError.mock.calls[0] as unknown as [Error])[0].message).toBe(
      "大屏设计接口不存在（HTTP 404），后端尚未部署该接口"
    );
  });

  it("404 带 Spring 占位文案时不把「No message available」透给用户", async () => {
    const { onError, finished } = collect(
      "generate",
      ['{"timestamp":"2026-09-03T00:00:00.000Z","status":404,"error":"Not Found","message":"No message available","path":"/api/v1/dashboard-design/generate"}'],
      { ok: false, status: 404, statusText: "Not Found" }
    );
    await finished;

    expect((onError.mock.calls[0] as unknown as [Error])[0].message).toBe(
      "大屏设计接口不存在（HTTP 404），后端尚未部署该接口"
    );
  });

  it("500 带中文 message 时主句与细节都在", async () => {
    const { onError, finished } = collect(
      "generate",
      ['{"code":500,"message":"opencode 场景未绑定模型"}'],
      { ok: false, status: 500, statusText: "Internal Server Error" }
    );
    await finished;

    expect((onError.mock.calls[0] as unknown as [Error])[0].message).toBe(
      "大屏设计服务异常（HTTP 500）：opencode 场景未绑定模型"
    );
  });

  /* 线上后端顶着 application/json 推合法 SSE，还把 data 的 JSON 多包了一层字符串。 */
  it("响应头是 application/json、data 双重编码时照样识别出事件", async () => {
    const { events, onDone, onError, finished } = collect(
      "generate",
      [
        'data:"{\\"type\\":\\"message\\",\\"delta\\":\\"这一\\"}"\n\n',
        'data:"{\\"type\\":\\"ops\\",\\"ops\\":{\\"ops\\":[]}}"\n\n',
        'data:"{\\"type\\":\\"done\\",\\"modelId\\":\\"kimi-k2\\"}"\n\n'
      ],
      { contentType: "application/json" }
    );
    await finished;

    expect(events).toEqual([
      { type: "message", delta: "这一" },
      { type: "ops", ops: { ops: [] } },
      { type: "done", modelId: "kimi-k2" }
    ]);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("整条流读完一条事件都没有、正文是 JSON 信封时，把信封里的 message 交给 onError", async () => {
    const { events, onDone, onError, finished } = collect(
      "generate",
      ['{"code":0,"data":null,"message":"模型返回的设计稿无效"}'],
      { contentType: "application/json" }
    );
    await finished;

    expect(events).toEqual([]);
    expect(onDone).not.toHaveBeenCalled();
    expect((onError.mock.calls[0] as unknown as [Error])[0].message).toBe(
      "大屏设计服务返回了非事件流响应：模型返回的设计稿无效"
    );
  });

  it("事件流里一条可识别事件都没有时报空流，而不是静默收场", async () => {
    const { events, onDone, onError, finished } = collect("generate", ["", ": keep-alive\n\n"]);
    await finished;

    expect(events).toEqual([]);
    expect(onDone).not.toHaveBeenCalled();
    expect((onError.mock.calls[0] as unknown as [Error])[0].message).toBe("大屏设计服务返回了空的事件流");
  });

  it("空流带残留正文时把开头贴出来，方便看出后端到底推了什么", async () => {
    const { onDone, onError, finished } = collect("generate", ["<!doctype html><html><body>请先登录</body></html>"]);
    await finished;

    expect(onDone).not.toHaveBeenCalled();
    expect((onError.mock.calls[0] as unknown as [Error])[0].message).toBe(
      "大屏设计服务返回了空的事件流：<!doctype html><html><body>请先登录</body></html>"
    );
  });

  it("主动取消不算错误", async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const onError = vi.fn();
    const onDone = vi.fn();

    const controller = streamDashboardDesign("generate", request, { onEvent: vi.fn(), onDone, onError });
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onError).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});
