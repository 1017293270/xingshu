import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDataHubAuthStore } from "./dataHubAuthStore";
import {
  DATA_HUB_SPACE_ID_KEY,
  readDataHubSession,
  writeDataHubAuth,
  writeDataHubSpaceId
} from "@/services/dataHubSession";

describe("useDataHubAuthStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useDataHubAuthStore.getState().refreshFromStorage();
  });

  it("persists auth and selected space", () => {
    useDataHubAuthStore.getState().setAuth({
      token: "token-123",
      userId: 1,
      username: "demo",
      isAdmin: false
    });
    useDataHubAuthStore.getState().setCurrentSpaceId(3);

    expect(readDataHubSession()).toMatchObject({
      token: "token-123",
      spaceId: 3,
      user: { username: "demo" }
    });
  });

  it("commits a complete authenticated session in one action", () => {
    useDataHubAuthStore.getState().setSession(
      { token: "token-session", userId: 4, username: "session-user", isAdmin: false },
      11
    );

    expect(useDataHubAuthStore.getState()).toMatchObject({
      token: "token-session",
      currentSpaceId: 11,
      user: { username: "session-user" }
    });
    expect(readDataHubSession()).toMatchObject({ token: "token-session", spaceId: 11 });
  });

  it("rolls storage back if a complete session cannot be committed", () => {
    const originalSetItem = Storage.prototype.setItem;
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === DATA_HUB_SPACE_ID_KEY) {
        throw new DOMException("Storage unavailable", "QuotaExceededError");
      }
      return originalSetItem.call(this, key, value);
    });

    try {
      expect(() =>
        useDataHubAuthStore.getState().setSession(
          { token: "partial-token", userId: 5, username: "partial", isAdmin: false },
          12
        )
      ).toThrow("Storage unavailable");
      expect(readDataHubSession()).toEqual({ token: null, user: null, spaceId: null });
      expect(useDataHubAuthStore.getState()).toMatchObject({ token: null, user: null, currentSpaceId: null });
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it("refreshes state from storage", () => {
    writeDataHubAuth({ token: "token-abc", userId: 2, username: "alice", isAdmin: false });
    writeDataHubSpaceId(8);

    useDataHubAuthStore.getState().refreshFromStorage();

    expect(useDataHubAuthStore.getState()).toMatchObject({
      token: "token-abc",
      currentSpaceId: 8,
      user: { username: "alice" }
    });
  });

  it("clears auth state and storage", () => {
    useDataHubAuthStore.getState().setAuth({
      token: "token-123",
      userId: 1,
      username: "demo",
      isAdmin: false
    });
    useDataHubAuthStore.getState().setCurrentSpaceId(3);

    useDataHubAuthStore.getState().clearAuthState();

    expect(useDataHubAuthStore.getState()).toMatchObject({
      token: null,
      user: null,
      currentSpaceId: null
    });
    expect(readDataHubSession()).toEqual({ token: null, user: null, spaceId: null });
  });
});
