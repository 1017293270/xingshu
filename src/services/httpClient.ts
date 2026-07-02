export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
export const agentBaseUrl = import.meta.env.VITE_AGENT_BASE_URL ?? "";

type XingshuServiceErrorOptions = {
  status?: number;
  code?: string;
  details?: unknown;
};

export class XingshuServiceError extends Error {
  status?: number;
  code?: string;
  details?: unknown;

  constructor(message: string, options: XingshuServiceErrorOptions = {}) {
    super(message);
    this.name = "XingshuServiceError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    Object.setPrototypeOf(this, XingshuServiceError.prototype);
  }
}

type RequestJsonOptions = RequestInit & {
  baseUrl?: string;
};

function joinUrl(baseUrl: string, path: string) {
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

export async function requestJson<T>(path: string, options: RequestJsonOptions = {}): Promise<T> {
  const { baseUrl = apiBaseUrl, headers: inputHeaders, ...init } = options;
  const headers = new Headers(inputHeaders);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(joinUrl(baseUrl, path), {
    ...init,
    headers
  });
  const payload = await parseJson(response);

  if (!response.ok) {
    const errorPayload =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as { code?: string; message?: string })
        : {};

    throw new XingshuServiceError(errorPayload.message ?? response.statusText, {
      status: response.status,
      code: errorPayload.code,
      details: payload
    });
  }

  return payload as T;
}
