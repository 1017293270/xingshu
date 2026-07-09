import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearAiProviderConfig,
  getDefaultAiProviderConfig,
  loadAiProviderConfig,
  saveAiProviderConfig,
  testAiProviderConnection
} from "./aiProviderConfigService";

describe("aiProviderConfigService", () => {
  afterEach(() => {
    clearAiProviderConfig();
    vi.restoreAllMocks();
  });

  it("defaults to MiniMax OpenAI-compatible settings", () => {
    expect(getDefaultAiProviderConfig()).toMatchObject({
      provider: "minimax",
      baseUrl: "https://api.minimaxi.com/v1",
      model: "MiniMax-M3",
      temperature: 0.2
    });
  });

  it("stores api keys in session storage unless rememberApiKey is enabled", () => {
    saveAiProviderConfig(
      {
        provider: "custom",
        baseUrl: "https://llm.example.com/v1",
        apiKey: "session-key",
        model: "chart-model",
        temperature: 0.1
      },
      false
    );

    expect(loadAiProviderConfig()).toMatchObject({ apiKey: "session-key", model: "chart-model" });
    expect(window.localStorage.length).toBe(0);

    saveAiProviderConfig(
      {
        provider: "openai-compatible",
        baseUrl: "https://open.example.com/v1",
        apiKey: "persistent-key",
        model: "gpt-compatible",
        temperature: 0.3
      },
      true
    );

    window.sessionStorage.clear();

    expect(loadAiProviderConfig()).toMatchObject({
      apiKey: "persistent-key",
      model: "gpt-compatible",
      rememberApiKey: true
    });
  });

  it("tests provider connectivity through chat completions", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" } }]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(
      testAiProviderConnection(
        {
          provider: "minimax",
          baseUrl: "https://api.minimaxi.com/v1",
          apiKey: "test-key",
          model: "MiniMax-M3",
          temperature: 0.2
        },
        fetcher as unknown as typeof fetch
      )
    ).resolves.toEqual({ ok: true, message: "AI 连接测试成功" });

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.minimaxi.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
          "Content-Type": "application/json"
        })
      })
    );
  });
});
