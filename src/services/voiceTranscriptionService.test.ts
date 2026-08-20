import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeDataHubAuth, writeDataHubSpaceId } from "./dataHubSession";
import {
  appendVoiceTranscript,
  transcribeVoice,
  VOICE_TRANSCRIBE_PATH,
  VOICE_TRANSCRIBE_TIMEOUT_MS
} from "./voiceTranscriptionService";

describe("voiceTranscriptionService", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    writeDataHubAuth({ token: "token-123", userId: 2, username: "demo", isAdmin: false });
    writeDataHubSpaceId(5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("posts the audio blob as multipart form data", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ code: 200, message: "success", data: { text: "本月销售额是多少" } }))
    );
    vi.stubGlobal("fetch", fetchMock);
    const audio = new Blob(["voice"], { type: "audio/webm" });

    await expect(transcribeVoice(audio)).resolves.toBe("本月销售额是多少");

    expect(fetchMock).toHaveBeenCalledWith(
      VOICE_TRANSCRIBE_PATH,
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData)
      })
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("Content-Type")).toBeNull();
    const body = init.body as FormData;
    const file = body.get("audio");
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe("voice.webm");
  });

  it("uses a 30s timeout for transcription", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ code: 200, message: "success", data: { text: "查询合同" } }))
    );
    vi.stubGlobal("fetch", fetchMock);

    await transcribeVoice(new Blob(["voice"], { type: "audio/mp4" }));

    expect(VOICE_TRANSCRIBE_TIMEOUT_MS).toBe(30_000);
  });

  it("rejects an empty recording before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(transcribeVoice(new Blob([], { type: "audio/webm" }))).rejects.toMatchObject({
      message: "没有录到有效语音"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a blank transcript from the envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ code: 200, message: "success", data: { text: "  " } })))
    );

    await expect(transcribeVoice(new Blob(["voice"], { type: "audio/webm" }))).rejects.toMatchObject({
      message: "无法识别语音内容"
    });
  });

  it("surfaces the data-hub failure message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ code: 400, message: "没有可用的语音转写供应商，请在系统管理中配置", data: null }))
      )
    );

    await expect(transcribeVoice(new Blob(["voice"], { type: "audio/webm" }))).rejects.toMatchObject({
      message: "没有可用的语音转写供应商，请在系统管理中配置"
    });
  });

  it("appends a transcript to existing draft text", () => {
    expect(appendVoiceTranscript("", "本月销售额")).toBe("本月销售额");
    expect(appendVoiceTranscript("请分析 ", "本月销售额")).toBe("请分析 本月销售额");
    expect(appendVoiceTranscript("请分析", "  ")).toBe("请分析");
  });
});
