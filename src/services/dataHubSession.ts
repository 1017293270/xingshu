import type { DataHubLoginResponse } from "@/types/dataHub";

export const DATA_HUB_TOKEN_KEY = "xingshu_datahub_token";
export const DATA_HUB_USER_KEY = "xingshu_datahub_user";
export const DATA_HUB_SPACE_ID_KEY = "xingshu_datahub_space_id";
export const DATA_HUB_SESSION_EXPIRED_EVENT = "xingshu:data-hub-session-expired";
export const DATA_HUB_SESSION_EXPIRED_MESSAGE = "登录状态已过期，请重新登录";
export const DATA_HUB_SESSION_EXPIRED_NOTICE_KEY = "xingshu_datahub_session_expired";

export type DataHubSessionSnapshot = {
  token: string | null;
  user: DataHubLoginResponse | null;
  spaceId: number | null;
};

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
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(DATA_HUB_TOKEN_KEY);
  storage.removeItem(DATA_HUB_USER_KEY);
  storage.removeItem(DATA_HUB_SPACE_ID_KEY);
}

function getSessionStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function hasDataHubSessionExpiredNotice() {
  return getSessionStorage()?.getItem(DATA_HUB_SESSION_EXPIRED_NOTICE_KEY) === "1";
}

export function markDataHubSessionExpiredNotice() {
  try {
    getSessionStorage()?.setItem(DATA_HUB_SESSION_EXPIRED_NOTICE_KEY, "1");
  } catch {
    // The in-memory auth state still preserves the notice when session storage is unavailable.
  }
}

export function clearDataHubSessionExpiredNotice() {
  try {
    getSessionStorage()?.removeItem(DATA_HUB_SESSION_EXPIRED_NOTICE_KEY);
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
