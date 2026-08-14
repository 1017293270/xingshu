export type DataHubKnowledgeAppEnv = {
  VITE_DATAHUB_APP_URL?: string;
  VITE_DATAHUB_API_BASE_URL?: string;
  VITE_DATAHUB_PROXY_TARGET?: string;
  VITE_DATAHUB_BFF_PORT?: string;
  VITE_DATAHUB_KB_MANAGE_PATH?: string;
  VITE_DATAHUB_KB_DETAIL_PATH?: string;
};

export type DataHubKnowledgeAppLinks = {
  manageUrl: string | null;
  canAdd: boolean;
  addDisabledReason?: string;
  detailUrlFor: (kbId: string) => string | null;
};

function isHttpProtocol(protocol: string) {
  return protocol === "http:" || protocol === "https:";
}

function httpOriginFrom(value: string): string | null {
  try {
    const url = new URL(value);
    return isHttpProtocol(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}

export function resolveDataHubAppOrigin(env: DataHubKnowledgeAppEnv): string {
  const explicitApp = env.VITE_DATAHUB_APP_URL?.trim();
  if (explicitApp) {
    return explicitApp;
  }

  const apiBase = env.VITE_DATAHUB_API_BASE_URL?.trim();
  if (apiBase && /^https?:\/\//i.test(apiBase)) {
    return httpOriginFrom(apiBase) ?? "";
  }

  const proxyTarget = env.VITE_DATAHUB_PROXY_TARGET?.trim();
  if (proxyTarget) {
    return proxyTarget;
  }

  const bffPort = env.VITE_DATAHUB_BFF_PORT?.trim();
  if (bffPort) {
    return `http://127.0.0.1:${bffPort}`;
  }

  return "";
}

export function buildDataHubKnowledgeManageUrl(
  appUrl: string,
  managePath = "",
  spaceId?: number | null
): string | null {
  const originInput = appUrl.trim();
  if (!originInput) {
    return null;
  }

  try {
    const origin = new URL(originInput);
    if (!isHttpProtocol(origin.protocol)) {
      return null;
    }

    const pathInput = managePath.trim();
    const path = pathInput
      ? (pathInput.startsWith("/") || /^https?:\/\//i.test(pathInput) ? pathInput : `/${pathInput}`)
      : "/";
    const url = new URL(path, origin);
    if (!isHttpProtocol(url.protocol) || url.origin !== origin.origin) {
      return null;
    }

    if (spaceId != null) {
      url.searchParams.set("space_id", String(spaceId));
    }

    return url.href;
  } catch {
    return null;
  }
}

function applyKnowledgeBaseId(path: string, kbId: string) {
  const encodedId = encodeURIComponent(kbId);
  if (path.includes("{id}")) {
    return path.replaceAll("{id}", encodedId);
  }

  return `${path.replace(/\/+$/, "")}/${encodedId}`;
}

export function buildDataHubKnowledgeDetailUrl(
  appUrl: string,
  detailPath: string,
  kbId: string,
  spaceId?: number | null
): string | null {
  const trimmedPath = detailPath.trim();
  const trimmedId = kbId.trim();
  if (!trimmedPath || !trimmedId) {
    return null;
  }

  return buildDataHubKnowledgeManageUrl(appUrl, applyKnowledgeBaseId(trimmedPath, kbId), spaceId);
}

export function resolveDataHubKnowledgeAppLinks(
  env: DataHubKnowledgeAppEnv,
  spaceId?: number | null
): DataHubKnowledgeAppLinks {
  const appUrl = resolveDataHubAppOrigin(env);
  const managePath = env.VITE_DATAHUB_KB_MANAGE_PATH?.trim() ?? "";
  const detailPath = env.VITE_DATAHUB_KB_DETAIL_PATH?.trim() ?? "";
  const manageUrl = buildDataHubKnowledgeManageUrl(appUrl, managePath, spaceId);

  return {
    manageUrl,
    canAdd: Boolean(manageUrl),
    addDisabledReason: manageUrl
      ? undefined
      : appUrl
        ? "DataHub 地址无效"
        : "无法从当前登录配置确定 DataHub 地址",
    detailUrlFor: (kbId: string) => (
      detailPath ? buildDataHubKnowledgeDetailUrl(appUrl, detailPath, kbId, spaceId) : null
    )
  };
}

export function getDataHubKnowledgeAppLinks(spaceId?: number | null) {
  return resolveDataHubKnowledgeAppLinks(import.meta.env, spaceId);
}

export function openDataHubUrl(url: string) {
  // Token stays in Xingshu sessionStorage and Authorization headers.
  // A new tab is a different origin, so the JWT cannot be injected into
  // DataHub's localStorage, and it must not be copied into the URL.
  window.open(url, "_blank", "noopener,noreferrer");
}
