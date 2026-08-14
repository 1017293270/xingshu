import { readDataHubSession } from "@/services/dataHubSession";

export const DATA_HUB_KNOWLEDGE_MANAGE_PATH = "/platform/knowledge";
export const DATA_HUB_KNOWLEDGE_DETAIL_PATH = "/platform/knowledge/{spaceId}/{id}";
export const DATA_HUB_WEB_TOKEN_KEY = "platform_token";
export const DATA_HUB_WEB_USER_KEY = "platform_user";
export const DATA_HUB_WEB_SPACE_ID_KEY = "platform_space_id";

export type DataHubKnowledgeAppEnv = {
  VITE_DATAHUB_APP_URL?: string;
  VITE_DATAHUB_API_BASE_URL?: string;
  VITE_DATAHUB_PROXY_TARGET?: string;
  VITE_DATAHUB_BFF_PORT?: string;
  VITE_DATAHUB_KB_MANAGE_PATH?: string;
  VITE_DATAHUB_KB_DETAIL_PATH?: string;
  VITE_DATAHUB_UI_SAME_ORIGIN?: string;
};

export type DataHubKnowledgeAppLinkOptions = {
  currentOrigin?: string;
  sameOriginUi?: boolean;
};

export type DataHubKnowledgeAppLinks = {
  manageUrl: string | null;
  canAdd: boolean;
  addDisabledReason?: string;
  usesSameOriginUi: boolean;
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

export function shouldUseSameOriginDataHubUi(
  currentOrigin = "",
  sameOriginUi = false
) {
  if (!sameOriginUi) {
    return false;
  }
  return Boolean(httpOriginFrom(currentOrigin));
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

function applyKnowledgeBasePlaceholders(
  path: string,
  kbId: string,
  spaceId?: number | null
) {
  let resolved = path;
  if (resolved.includes("{spaceId}")) {
    if (spaceId == null) {
      return null;
    }
    resolved = resolved.replaceAll("{spaceId}", encodeURIComponent(String(spaceId)));
  }

  const encodedId = encodeURIComponent(kbId);
  if (resolved.includes("{id}")) {
    return resolved.replaceAll("{id}", encodedId);
  }

  return `${resolved.replace(/\/+$/, "")}/${encodedId}`;
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

  const resolvedPath = applyKnowledgeBasePlaceholders(trimmedPath, trimmedId, spaceId);
  if (!resolvedPath) {
    return null;
  }

  return buildDataHubKnowledgeManageUrl(appUrl, resolvedPath, spaceId);
}

export function resolveDataHubKnowledgeAppLinks(
  env: DataHubKnowledgeAppEnv,
  spaceId?: number | null,
  options: DataHubKnowledgeAppLinkOptions = {}
): DataHubKnowledgeAppLinks {
  const currentOrigin = options.currentOrigin?.trim() ?? "";
  const usesSameOriginUi = shouldUseSameOriginDataHubUi(currentOrigin, options.sameOriginUi);
  const remoteOrigin = resolveDataHubAppOrigin(env);
  const appUrl = usesSameOriginUi ? currentOrigin : remoteOrigin;
  const managePath = usesSameOriginUi
    ? DATA_HUB_KNOWLEDGE_MANAGE_PATH
    : (env.VITE_DATAHUB_KB_MANAGE_PATH?.trim() || DATA_HUB_KNOWLEDGE_MANAGE_PATH);
  const detailPath = env.VITE_DATAHUB_KB_DETAIL_PATH?.trim() || DATA_HUB_KNOWLEDGE_DETAIL_PATH;
  const manageUrl = buildDataHubKnowledgeManageUrl(appUrl, managePath, spaceId);

  return {
    manageUrl,
    canAdd: Boolean(manageUrl),
    usesSameOriginUi,
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
  return resolveDataHubKnowledgeAppLinks(import.meta.env, spaceId, {
    currentOrigin: typeof window === "undefined" ? "" : window.location.origin,
    sameOriginUi:
      import.meta.env.DEV
      || import.meta.env.VITE_DATAHUB_UI_SAME_ORIGIN === "true"
  });
}

export function seedDataHubWebSession() {
  const session = readDataHubSession();
  if (!session.token || !session.user) {
    return false;
  }

  try {
    window.localStorage.setItem(DATA_HUB_WEB_TOKEN_KEY, session.token);
    window.localStorage.setItem(DATA_HUB_WEB_USER_KEY, JSON.stringify(session.user));
    if (session.spaceId != null) {
      window.localStorage.setItem(DATA_HUB_WEB_SPACE_ID_KEY, String(session.spaceId));
    }
    return true;
  } catch {
    return false;
  }
}

function isSameOriginHttpUrl(url: string) {
  try {
    const parsed = new URL(url, window.location.origin);
    return isHttpProtocol(parsed.protocol) && parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

export function openDataHubUrl(url: string) {
  if (isSameOriginHttpUrl(url)) {
    seedDataHubWebSession();
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
