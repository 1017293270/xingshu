export type OnlyOfficeEditorInstance = {
  destroyEditor?: () => void;
};

type OnlyOfficeApi = {
  DocEditor: new (containerId: string, config: Record<string, unknown>) => OnlyOfficeEditorInstance;
};

declare global {
  interface Window {
    DocsAPI?: OnlyOfficeApi;
  }
}

const scriptLoads = new Map<string, Promise<void>>();

function normalizeScriptUrl(scriptUrl: string) {
  const url = new URL(scriptUrl, window.location.href);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("ONLYOFFICE api.js 地址必须使用 HTTP 或 HTTPS");
  }
  return url.href;
}

export function loadOnlyOfficeApiScript(scriptUrl: string): Promise<void> {
  if (window.DocsAPI?.DocEditor) return Promise.resolve();

  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeScriptUrl(scriptUrl);
  } catch (error) {
    return Promise.reject(error);
  }

  const pending = scriptLoads.get(normalizedUrl);
  if (pending) return pending;

  const promise = new Promise<void>((resolve, reject) => {
    const existing = Array.from(document.scripts).find((script) => script.src === normalizedUrl);
    const script = existing ?? document.createElement("script");

    const cleanup = () => {
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    };
    const handleLoad = () => {
      cleanup();
      if (window.DocsAPI?.DocEditor) {
        resolve();
      } else {
        reject(new Error("ONLYOFFICE api.js 已加载，但 DocsAPI.DocEditor 不可用"));
      }
    };
    const handleError = () => {
      cleanup();
      reject(new Error("ONLYOFFICE api.js 加载失败，请检查文档服务器地址和 CSP"));
    };

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    if (!existing) {
      script.src = normalizedUrl;
      script.async = true;
      script.dataset.xingshuOnlyofficeApi = "true";
      document.head.appendChild(script);
    }
  });

  scriptLoads.set(normalizedUrl, promise);
  void promise.catch(() => scriptLoads.delete(normalizedUrl));
  return promise;
}
