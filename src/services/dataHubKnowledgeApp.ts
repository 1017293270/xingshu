export type DataHubKnowledgeAppEnv = {
  VITE_DATAHUB_APP_URL?: string;
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

  return buildDataHubKnowledgeManageUrl(appUrl, applyKnowledgeBaseId(trimmedPath, trimmedId), spaceId);
}

export function resolveDataHubKnowledgeAppLinks(
  env: DataHubKnowledgeAppEnv,
  spaceId?: number | null
): DataHubKnowledgeAppLinks {
  const appUrl = env.VITE_DATAHUB_APP_URL?.trim() ?? "";
  const managePath = env.VITE_DATAHUB_KB_MANAGE_PATH?.trim() ?? "";
  const detailPath = env.VITE_DATAHUB_KB_DETAIL_PATH?.trim() ?? "";
  const manageUrl = buildDataHubKnowledgeManageUrl(appUrl, managePath, spaceId);

  return {
    manageUrl,
    canAdd: Boolean(manageUrl),
    addDisabledReason: manageUrl
      ? undefined
      : appUrl
        ? "DataHub 前端地址无效"
        : "尚未配置 DataHub 前端地址",
    detailUrlFor: (kbId: string) => (
      detailPath ? buildDataHubKnowledgeDetailUrl(appUrl, detailPath, kbId, spaceId) : null
    )
  };
}

export function getDataHubKnowledgeAppLinks(spaceId?: number | null) {
  return resolveDataHubKnowledgeAppLinks(import.meta.env, spaceId);
}

export function openDataHubUrl(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}
