import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDataHubSession,
  clearDataHubSessionExpiredNotice,
  DATA_HUB_SESSION_EXPIRED_EVENT,
  DATA_HUB_SESSION_EXPIRED_NOTICE_KEY,
  DATA_HUB_SPACE_ID_KEY,
  DATA_HUB_TOKEN_KEY,
  DATA_HUB_USER_KEY,
  expireDataHubSession,
  hasDataHubSessionExpiredNotice,
  readDataHubSession,
  writeDataHubSession
} from "./dataHubSession";

const user = { token: "token-123", userId: 1, username: "demo", isAdmin: false };

describe("dataHubSession", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("persists the session in local storage so it survives closing the browser", () => {
    writeDataHubSession(user, 7);

    expect(localStorage.getItem(DATA_HUB_TOKEN_KEY)).toBe("token-123");
    expect(localStorage.getItem(DATA_HUB_USER_KEY)).toBe(JSON.stringify(user));
    expect(localStorage.getItem(DATA_HUB_SPACE_ID_KEY)).toBe("7");
    expect(sessionStorage.getItem(DATA_HUB_TOKEN_KEY)).toBeNull();
    expect(readDataHubSession()).toEqual({ token: "token-123", user, spaceId: 7 });
  });

  it("adopts a tab-scoped session left behind by an older build", () => {
    sessionStorage.setItem(DATA_HUB_TOKEN_KEY, "token-123");
    sessionStorage.setItem(DATA_HUB_USER_KEY, JSON.stringify(user));
    sessionStorage.setItem(DATA_HUB_SPACE_ID_KEY, "7");

    expect(readDataHubSession()).toEqual({ token: "token-123", user, spaceId: 7 });
    expect(localStorage.getItem(DATA_HUB_TOKEN_KEY)).toBe("token-123");
    expect(sessionStorage.getItem(DATA_HUB_TOKEN_KEY)).toBeNull();
    expect(sessionStorage.getItem(DATA_HUB_USER_KEY)).toBeNull();
    expect(sessionStorage.getItem(DATA_HUB_SPACE_ID_KEY)).toBeNull();
  });

  it("keeps the persisted session when a stale tab-scoped token is present", () => {
    writeDataHubSession(user, 7);
    sessionStorage.setItem(DATA_HUB_TOKEN_KEY, "stale-token");

    expect(readDataHubSession().token).toBe("token-123");
    expect(sessionStorage.getItem(DATA_HUB_TOKEN_KEY)).toBeNull();
  });

  it("clears both storages when the session ends", () => {
    writeDataHubSession(user, 7);
    sessionStorage.setItem(DATA_HUB_TOKEN_KEY, "stale-token");
    sessionStorage.setItem(DATA_HUB_SPACE_ID_KEY, "9");

    clearDataHubSession();

    expect(readDataHubSession()).toEqual({ token: null, user: null, spaceId: null });
    for (const key of [DATA_HUB_TOKEN_KEY, DATA_HUB_USER_KEY, DATA_HUB_SPACE_ID_KEY]) {
      expect(localStorage.getItem(key)).toBeNull();
      expect(sessionStorage.getItem(key)).toBeNull();
    }
  });

  it("expires the session only for the token that failed", () => {
    writeDataHubSession(user, 7);
    const listener = vi.fn();
    window.addEventListener(DATA_HUB_SESSION_EXPIRED_EVENT, listener);

    try {
      expect(expireDataHubSession("other-token")).toBe(false);
      expect(expireDataHubSession(null)).toBe(false);
      expect(readDataHubSession().token).toBe("token-123");
      expect(listener).not.toHaveBeenCalled();

      expect(expireDataHubSession("token-123")).toBe(true);
      expect(readDataHubSession()).toEqual({ token: null, user: null, spaceId: null });
      expect(listener).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener(DATA_HUB_SESSION_EXPIRED_EVENT, listener);
    }
  });

  it("keeps the expiry notice scoped to the current tab", () => {
    writeDataHubSession(user, 7);

    expireDataHubSession("token-123");

    expect(sessionStorage.getItem(DATA_HUB_SESSION_EXPIRED_NOTICE_KEY)).toBe("1");
    expect(localStorage.getItem(DATA_HUB_SESSION_EXPIRED_NOTICE_KEY)).toBeNull();
    expect(hasDataHubSessionExpiredNotice()).toBe(true);

    clearDataHubSessionExpiredNotice();

    expect(hasDataHubSessionExpiredNotice()).toBe(false);
  });

  it("drops malformed persisted user payloads instead of throwing", () => {
    localStorage.setItem(DATA_HUB_TOKEN_KEY, "token-123");
    localStorage.setItem(DATA_HUB_USER_KEY, "{not-json");

    expect(readDataHubSession()).toEqual({ token: "token-123", user: null, spaceId: null });
    expect(localStorage.getItem(DATA_HUB_USER_KEY)).toBeNull();
  });
});
