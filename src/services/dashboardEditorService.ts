export type DashboardEditorProbeResult = {
  ok: boolean;
  message: string;
};

type DashboardEditorProbeOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
};

const DEFAULT_PROBE_TIMEOUT_MS = 4_000;

export function normalizeDashboardEditorUrl(url: string): string | null {
  try {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      return null;
    }
    const parsedUrl = new URL(trimmedUrl, window.location.origin);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return null;
    }
    return parsedUrl.toString();
  } catch {
    return null;
  }
}

export async function probeDashboardEditor(
  url: string,
  options: DashboardEditorProbeOptions = {}
): Promise<DashboardEditorProbeResult> {
  const normalizedUrl = normalizeDashboardEditorUrl(url);
  if (!normalizedUrl) {
    return { ok: false, message: "看板编辑器暂时不可用" };
  }

  const controller = new AbortController();
  const abortFromExternalSignal = () => controller.abort();
  if (options.signal?.aborted) {
    controller.abort();
  } else {
    options.signal?.addEventListener("abort", abortFromExternalSignal, { once: true });
  }
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS
  );

  try {
    const response = await (options.fetcher ?? fetch)(normalizedUrl, {
      cache: "no-store",
      credentials: "omit",
      mode: "no-cors",
      signal: controller.signal
    });
    if (response.type !== "opaque" && !response.ok) {
      return { ok: false, message: "看板编辑器暂时不可用" };
    }
    return { ok: true, message: "看板编辑器已连接" };
  } catch {
    return { ok: false, message: "看板编辑器暂时不可用" };
  } finally {
    window.clearTimeout(timeoutId);
    options.signal?.removeEventListener("abort", abortFromExternalSignal);
  }
}
