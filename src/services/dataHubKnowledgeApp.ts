import { readDataHubSession } from "@/services/dataHubSession";

export const DATA_HUB_KNOWLEDGE_MANAGE_PATH = "/platform/knowledge";
export const DATA_HUB_KNOWLEDGE_DETAIL_PATH = "/platform/knowledge/{spaceId}/{id}";
export const DATA_HUB_DATASOURCE_PATH = "/platform/datasources";
export const DATA_HUB_METRICS_PATH = "/platform/metrics";
export const DATA_HUB_GLOSSARY_PATH = "/platform/glossary";
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
  VITE_DATAHUB_DATASOURCE_PATH?: string;
  VITE_DATAHUB_METRICS_PATH?: string;
  VITE_DATAHUB_GLOSSARY_PATH?: string;
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

/**
 * 首次构建后要人工核对的 DataHub 工作台页面。DataHub 只放空间管理员进这些页面，
 * 星数也不知道具体数据源 id，所以入口统一落在列表级页面。
 */
export type DataHubWorkspacePage = "datasources" | "metrics" | "glossary";

export type DataHubWorkspaceLink = {
  url: string | null;
  /** url 为空时给用户看的原因，措辞与「添加知识库」一致 */
  unavailableReason?: string;
};

const dataHubWorkspacePaths: Record<
  DataHubWorkspacePage,
  { defaultPath: string; envKey: keyof DataHubKnowledgeAppEnv }
> = {
  datasources: { defaultPath: DATA_HUB_DATASOURCE_PATH, envKey: "VITE_DATAHUB_DATASOURCE_PATH" },
  metrics: { defaultPath: DATA_HUB_METRICS_PATH, envKey: "VITE_DATAHUB_METRICS_PATH" },
  glossary: { defaultPath: DATA_HUB_GLOSSARY_PATH, envKey: "VITE_DATAHUB_GLOSSARY_PATH" }
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

/** 同源时 DataHub 界面由当前站点反向代理，否则落到从登录配置推出的 DataHub 源站 */
function resolveDataHubUiTarget(
  env: DataHubKnowledgeAppEnv,
  options: DataHubKnowledgeAppLinkOptions
) {
  const currentOrigin = options.currentOrigin?.trim() ?? "";
  const usesSameOriginUi = shouldUseSameOriginDataHubUi(currentOrigin, options.sameOriginUi);
  return {
    appUrl: usesSameOriginUi ? currentOrigin : resolveDataHubAppOrigin(env),
    usesSameOriginUi
  };
}

/**
 * 同源时只有 /platform 被反代到 DataHub，自定义路径会落进星数自己的路由，
 * 所以同源只认 DataHub 的真实路径；自定义路径只对独立部署的 DataHub 界面生效。
 */
function resolveDataHubUiPath(usesSameOriginUi: boolean, override: string | undefined, defaultPath: string) {
  return usesSameOriginUi ? defaultPath : (override?.trim() || defaultPath);
}

function dataHubUrlUnavailableReason(appUrl: string) {
  return appUrl ? "DataHub 地址无效" : "无法从当前登录配置确定 DataHub 地址";
}

export function resolveDataHubKnowledgeAppLinks(
  env: DataHubKnowledgeAppEnv,
  spaceId?: number | null,
  options: DataHubKnowledgeAppLinkOptions = {}
): DataHubKnowledgeAppLinks {
  const { appUrl, usesSameOriginUi } = resolveDataHubUiTarget(env, options);
  const managePath = resolveDataHubUiPath(
    usesSameOriginUi,
    env.VITE_DATAHUB_KB_MANAGE_PATH,
    DATA_HUB_KNOWLEDGE_MANAGE_PATH
  );
  const detailPath = env.VITE_DATAHUB_KB_DETAIL_PATH?.trim() || DATA_HUB_KNOWLEDGE_DETAIL_PATH;
  const manageUrl = buildDataHubKnowledgeManageUrl(appUrl, managePath, spaceId);

  return {
    manageUrl,
    canAdd: Boolean(manageUrl),
    usesSameOriginUi,
    addDisabledReason: manageUrl ? undefined : dataHubUrlUnavailableReason(appUrl),
    detailUrlFor: (kbId: string) => (
      detailPath ? buildDataHubKnowledgeDetailUrl(appUrl, detailPath, kbId, spaceId) : null
    )
  };
}

export function resolveDataHubWorkspaceLink(
  env: DataHubKnowledgeAppEnv,
  page: DataHubWorkspacePage,
  spaceId?: number | null,
  options: DataHubKnowledgeAppLinkOptions = {}
): DataHubWorkspaceLink {
  const { appUrl, usesSameOriginUi } = resolveDataHubUiTarget(env, options);
  const { defaultPath, envKey } = dataHubWorkspacePaths[page];
  const path = resolveDataHubUiPath(usesSameOriginUi, env[envKey], defaultPath);
  const url = buildDataHubKnowledgeManageUrl(appUrl, path, spaceId);

  return url ? { url } : { url: null, unavailableReason: dataHubUrlUnavailableReason(appUrl) };
}

function runtimeDataHubUiOptions(): DataHubKnowledgeAppLinkOptions {
  return {
    currentOrigin: typeof window === "undefined" ? "" : window.location.origin,
    sameOriginUi:
      import.meta.env.DEV
      || import.meta.env.VITE_DATAHUB_UI_SAME_ORIGIN === "true"
  };
}

export function getDataHubKnowledgeAppLinks(spaceId?: number | null) {
  return resolveDataHubKnowledgeAppLinks(import.meta.env, spaceId, runtimeDataHubUiOptions());
}

export function getDataHubWorkspaceLink(page: DataHubWorkspacePage, spaceId?: number | null) {
  return resolveDataHubWorkspaceLink(import.meta.env, page, spaceId, runtimeDataHubUiOptions());
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
