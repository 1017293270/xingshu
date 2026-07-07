import { beforeEach, describe, expect, it } from "vitest";
import { useDataHubAuthStore } from "./dataHubAuthStore";
import { readDataHubSession, writeDataHubAuth, writeDataHubSpaceId } from "@/services/dataHubSession";

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
