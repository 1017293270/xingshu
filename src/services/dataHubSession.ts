import type { DataHubLoginResponse } from "@/types/dataHub";

export const DATA_HUB_TOKEN_KEY = "xingshu_datahub_token";
export const DATA_HUB_USER_KEY = "xingshu_datahub_user";
export const DATA_HUB_SPACE_ID_KEY = "xingshu_datahub_space_id";
export const DATA_HUB_SESSION_EXPIRED_EVENT = "xingshu:data-hub-session-expired";
export const DATA_HUB_SESSION_EXPIRED_MESSAGE = "登录状态已过期，请重新登录";
export const DATA_HUB_SESSION_EXPIRED_NOTICE_KEY = "xingshu_datahub_session_expired";

const SESSION_KEYS = [DATA_HUB_TOKEN_KEY, DATA_HUB_USER_KEY, DATA_HUB_SPACE_ID_KEY];

export type DataHubSessionSnapshot = {
  token: string | null;
  user: DataHubLoginResponse | null;
  spaceId: number | null;
};

/**
 * 登录态存放在 localStorage：会话若随浏览器关闭而丢失，用户每开一个新窗口就得重新登录一次。
 * 令牌本身 24 小时过期，401 时会被清理；内嵌的 DataHub 页面同样从 localStorage 读取该令牌。
 */
function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 一次性提示（如「登录状态已过期」）只属于当前标签页，不跨窗口共享。 */
function getNoticeStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** 接管仍留在 sessionStorage 中的会话，避免升级时把正在使用的用户踢下线。 */
function adoptTabScopedSession() {
  const storage = getStorage();
  const tabScopedStorage = getNoticeStorage();
  if (!storage || !tabScopedStorage) {
    return;
  }

  try {
    if (!storage.getItem(DATA_HUB_TOKEN_KEY) && tabScopedStorage.getItem(DATA_HUB_TOKEN_KEY)) {
      for (const key of SESSION_KEYS) {
        const value = tabScopedStorage.getItem(key);
        if (value !== null) {
          storage.setItem(key, value);
        }
      }
    }

    for (const key of SESSION_KEYS) {
      tabScopedStorage.removeItem(key);
    }
  } catch {
    // Continue with the best available storage. Login can establish a fresh session.
  }
}

function readJson<T>(key: string): T | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const value = storage.getItem(key);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function readDataHubSession(): DataHubSessionSnapshot {
  adoptTabScopedSession();
  const storage = getStorage();
  const rawSpaceId = storage?.getItem(DATA_HUB_SPACE_ID_KEY) ?? null;
  const parsedSpaceId = rawSpaceId ? Number(rawSpaceId) : null;

  return {
    token: storage?.getItem(DATA_HUB_TOKEN_KEY) ?? null,
    user: readJson<DataHubLoginResponse>(DATA_HUB_USER_KEY),
    spaceId: Number.isFinite(parsedSpaceId) ? parsedSpaceId : null
  };
}

export function writeDataHubAuth(user: DataHubLoginResponse) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(DATA_HUB_TOKEN_KEY, user.token);
  storage.setItem(DATA_HUB_USER_KEY, JSON.stringify(user));
}

export function writeDataHubSpaceId(spaceId: number | null) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  if (spaceId === null) {
    storage.removeItem(DATA_HUB_SPACE_ID_KEY);
    return;
  }

  storage.setItem(DATA_HUB_SPACE_ID_KEY, String(spaceId));
}

export function writeDataHubSession(user: DataHubLoginResponse, spaceId: number) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const previousValues = new Map<string, string | null>([
    [DATA_HUB_TOKEN_KEY, storage.getItem(DATA_HUB_TOKEN_KEY)],
    [DATA_HUB_USER_KEY, storage.getItem(DATA_HUB_USER_KEY)],
    [DATA_HUB_SPACE_ID_KEY, storage.getItem(DATA_HUB_SPACE_ID_KEY)]
  ]);

  try {
    storage.setItem(DATA_HUB_TOKEN_KEY, user.token);
    storage.setItem(DATA_HUB_USER_KEY, JSON.stringify(user));
    storage.setItem(DATA_HUB_SPACE_ID_KEY, String(spaceId));
  } catch (error) {
    for (const [key, previousValue] of previousValues) {
      try {
        if (previousValue === null) {
          storage.removeItem(key);
        } else {
          storage.setItem(key, previousValue);
        }
      } catch {
        // Preserve the original storage error after best-effort rollback.
      }
    }
    throw error;
  }
}

export function clearDataHubSession() {
  for (const targetStorage of [getStorage(), getNoticeStorage()]) {
    if (!targetStorage) {
      continue;
    }

    try {
      for (const key of SESSION_KEYS) {
        targetStorage.removeItem(key);
      }
    } catch {
      // Signing out must continue even when a storage backend is unavailable.
    }
  }
}

export function hasDataHubSessionExpiredNotice() {
  return getNoticeStorage()?.getItem(DATA_HUB_SESSION_EXPIRED_NOTICE_KEY) === "1";
}

export function markDataHubSessionExpiredNotice() {
  try {
    getNoticeStorage()?.setItem(DATA_HUB_SESSION_EXPIRED_NOTICE_KEY, "1");
  } catch {
    // The in-memory auth state still preserves the notice when session storage is unavailable.
  }
}

export function clearDataHubSessionExpiredNotice() {
  try {
    getNoticeStorage()?.removeItem(DATA_HUB_SESSION_EXPIRED_NOTICE_KEY);
  } catch {
    // Clearing auth must continue even when session storage is unavailable.
  }
}

export function expireDataHubSession(expiredToken: string | null | undefined) {
  if (!expiredToken || readDataHubSession().token !== expiredToken) {
    return false;
  }

  markDataHubSessionExpiredNotice();
  clearDataHubSession();
  window.dispatchEvent(new Event(DATA_HUB_SESSION_EXPIRED_EVENT));
  return true;
}
