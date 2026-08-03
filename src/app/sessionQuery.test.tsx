import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import {
  SessionQueryBoundary,
  createSessionQueryScope,
  sessionQueryKey
} from "./sessionQuery";

const alice = { token: "token-alice", userId: 1, username: "alice", isAdmin: false };
const bob = { token: "token-bob", userId: 2, username: "bob", isAdmin: false };

describe("session-scoped query cache", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    useDataHubAuthStore.getState().clearAuthState();
  });

  it("builds keys from both the user and workspace identity", () => {
    expect(sessionQueryKey(createSessionQueryScope(7, 12), "dashboards", "list")).toEqual([
      "session",
      7,
      12,
      "dashboards",
      "list"
    ]);
  });

  it("clears all cached data when the user or workspace changes", async () => {
    useDataHubAuthStore.getState().setSession(alice, 11);
    const queryClient = new QueryClient();
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <SessionQueryBoundary><div>session content</div></SessionQueryBoundary>
      </QueryClientProvider>
    );
    const aliceKey = sessionQueryKey(createSessionQueryScope(1, 11), "dashboards");
    queryClient.setQueryData(aliceKey, [{ id: "alice-private-dashboard" }]);

    act(() => useDataHubAuthStore.getState().setCurrentSpaceId(12));
    await waitFor(() => expect(queryClient.getQueryCache().getAll()).toHaveLength(0));

    const workspaceKey = sessionQueryKey(createSessionQueryScope(1, 12), "knowledge-bases");
    queryClient.setQueryData(workspaceKey, [{ id: "workspace-12" }]);
    act(() => useDataHubAuthStore.getState().setSession(bob, 21));
    await waitFor(() => expect(queryClient.getQueryCache().getAll()).toHaveLength(0));

    unmount();
  });
});
