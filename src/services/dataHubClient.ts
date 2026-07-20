import { expireDataHubSession, readDataHubSession } from "@/services/dataHubSession";
import type { DataHubApiResponse } from "@/types/dataHub";

export const dataHubApiBaseUrl = import.meta.env.VITE_DATAHUB_API_BASE_URL ?? "";
const defaultRequestTimeoutMs = 15_000;

type DataHubRequestOptions = RequestInit & {
  authToken?: string;
  baseUrl?: string;
  includeAuth?: boolean;
  spaceId?: number | null;
  timeoutMs?: number;
};

type DataHubServiceErrorOptions = {
  status?: number;
  code?: number | string;
  details?: unknown;
};

export class DataHubServiceError extends Error {
  status?: number;
  code?: number | string;
  details?: unknown;

  constructor(message: string, options: DataHubServiceErrorOptions = {}) {
    super(message);
    this.name = "DataHubServiceError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    Object.setPrototypeOf(this, DataHubServiceError.prototype);
  }
}

export function joinDataHubUrl(path: string, baseUrl = dataHubApiBaseUrl) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const base = baseUrl.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
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

function isDataHubEnvelope<T>(payload: unknown): payload is DataHubApiResponse<T> {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      !Array.isArray(payload) &&
      "code" in payload &&
      "message" in payload
  );
}

function applySessionHeaders(
  headers: Headers,
  includeAuth: boolean,
  explicitSpaceId?: number | null,
  explicitAuthToken?: string
) {
  if (!includeAuth) {
    return null;
  }

  const session = readDataHubSession();
  const authToken = explicitAuthToken || session.token;
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const spaceId = explicitSpaceId === undefined ? session.spaceId : explicitSpaceId;
  if (spaceId !== null && spaceId !== undefined) {
    headers.set("X-Space-Id", String(spaceId));
  }

  return authToken ?? null;
}

export async function requestDataHub<T>(path: string, options: DataHubRequestOptions = {}): Promise<T> {
  const {
    baseUrl = dataHubApiBaseUrl,
    authToken,
    includeAuth = true,
    timeoutMs = defaultRequestTimeoutMs,
    headers: inputHeaders,
    spaceId,
    ...init
  } = options;
  const headers = new Headers(inputHeaders);
  const controller = new AbortController();
  let didTimeout = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const inputSignal = init.signal;
  const abortFromInput = () => controller.abort(inputSignal?.reason);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const requestAuthToken = applySessionHeaders(headers, includeAuth, spaceId, authToken);

  if (inputSignal?.aborted) {
    abortFromInput();
  } else {
    inputSignal?.addEventListener("abort", abortFromInput, { once: true });
  }

  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeoutMs);
  }

  let response: Response;

  try {
    response = await fetch(joinDataHubUrl(path, baseUrl), {
      ...init,
      headers,
      signal: controller.signal
    });
  } catch (error) {
    if (didTimeout) {
      throw new DataHubServiceError("请求超时，请确认 data-hub 登录服务是否可用", {
        code: "REQUEST_TIMEOUT"
      });
    }

    if (inputSignal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new DataHubServiceError("请求已取消", {
        code: "REQUEST_CANCELLED"
      });
    }

    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    inputSignal?.removeEventListener("abort", abortFromInput);
  }

  const payload = await parseJson(response);

  if (!response.ok) {
    if (response.status === 401) {
      expireDataHubSession(requestAuthToken);
    }

    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message?: unknown }).message)
        : response.statusText;

    throw new DataHubServiceError(message, {
      status: response.status,
      details: payload
    });
  }

  if (isDataHubEnvelope<T>(payload)) {
    if (payload.code !== 200) {
      if (payload.code === 401) {
        expireDataHubSession(requestAuthToken);
      }

      throw new DataHubServiceError(payload.message || "请求失败", {
        status: typeof payload.code === "number" ? payload.code : undefined,
        code: payload.code,
        details: payload
      });
    }

    return payload.data;
  }

  return payload as T;
}
