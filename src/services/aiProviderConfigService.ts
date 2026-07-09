import type { AiProviderConfig, AiProviderConnectionResult } from "@/types/aiChart";

const sessionConfigKey = "xingshu.aiProvider.session";
const persistentConfigKey = "xingshu.aiProvider.local";
const defaultRequestTimeoutMs = 12_000;

type AiFetch = typeof fetch;

type StoredAiProviderConfig = AiProviderConfig & {
  rememberApiKey: boolean;
};

export function getDefaultAiProviderConfig(): AiProviderConfig {
  return {
    provider: "minimax",
    baseUrl: "https://api.minimaxi.com/v1",
    apiKey: "",
    model: "MiniMax-M3",
    temperature: 0.2,
    rememberApiKey: false
  };
}

function normalizeConfig(config: Partial<AiProviderConfig> | null | undefined): StoredAiProviderConfig {
  const fallback = getDefaultAiProviderConfig();

  return {
    provider: config?.provider ?? fallback.provider,
    baseUrl: (config?.baseUrl || fallback.baseUrl).replace(/\/+$/, ""),
    apiKey: config?.apiKey ?? fallback.apiKey,
    model: config?.model || fallback.model,
    temperature:
      typeof config?.temperature === "number"
        ? Math.min(2, Math.max(0, config.temperature))
        : fallback.temperature,
    rememberApiKey: Boolean(config?.rememberApiKey)
  };
}

function readStoredConfig(storage: Storage, key: string): StoredAiProviderConfig | null {
  const raw = storage.getItem(key);

  if (!raw) {
    return null;
  }

  try {
    return normalizeConfig(JSON.parse(raw) as Partial<AiProviderConfig>);
  } catch {
    return null;
  }
}

export function loadAiProviderConfig(): StoredAiProviderConfig | null {
  const sessionConfig = readStoredConfig(window.sessionStorage, sessionConfigKey);

  if (sessionConfig) {
    return sessionConfig;
  }

  return readStoredConfig(window.localStorage, persistentConfigKey);
}

export function saveAiProviderConfig(config: AiProviderConfig, rememberApiKey: boolean) {
  const normalized = normalizeConfig({ ...config, rememberApiKey });
  const serialized = JSON.stringify(normalized);

  if (rememberApiKey) {
    window.localStorage.setItem(persistentConfigKey, serialized);
    window.sessionStorage.removeItem(sessionConfigKey);
    return;
  }

  window.sessionStorage.setItem(sessionConfigKey, serialized);
  window.localStorage.removeItem(persistentConfigKey);
}

export function clearAiProviderConfig() {
  window.sessionStorage.removeItem(sessionConfigKey);
  window.localStorage.removeItem(persistentConfigKey);
}

function joinProviderUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function testAiProviderConnection(
  config: AiProviderConfig,
  fetcher: AiFetch = fetch
): Promise<AiProviderConnectionResult> {
  const normalized = normalizeConfig(config);

  if (!normalized.apiKey.trim()) {
    return { ok: false, message: "请先填写 API Key" };
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), defaultRequestTimeoutMs);

  try {
    const response = await fetcher(joinProviderUrl(normalized.baseUrl, "/chat/completions"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${normalized.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        model: normalized.model,
        temperature: normalized.temperature,
        max_completion_tokens: 16,
        messages: [
          { role: "system", content: "You are a connectivity test endpoint." },
          { role: "user", content: "Reply with ok." }
        ]
      }),
      signal: controller.signal
    });
    const payload = await parseJson(response);

    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "message" in payload
          ? String((payload as { message?: unknown }).message)
          : response.statusText || "AI 连接测试失败";

      return { ok: false, message };
    }

    return { ok: true, message: "AI 连接测试成功" };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof DOMException && error.name === "AbortError" ? "AI 连接测试超时" : "AI 连接测试失败"
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}
