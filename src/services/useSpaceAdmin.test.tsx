import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listDataHubSpaces } from "@/services/dataHubSpaceService";
import { useSpaceAdmin } from "@/services/useSpaceAdmin";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import type { DataHubSpace } from "@/types/dataHub";

vi.mock("@/services/dataHubSpaceService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/dataHubSpaceService")>();
  return {
    ...actual,
    listDataHubSpaces: vi.fn()
  };
});

const listSpaces = vi.mocked(listDataHubSpaces);

function space(id: number, myRoles: string[]): DataHubSpace {
  return {
    id,
    spaceName: `空间 ${id}`,
    ownerId: 1,
    myRoles,
    memberCount: 3,
    createdAt: "2026-08-01 09:00:00"
  };
}

function renderSpaceAdmin({
  isAdmin = false,
  spaceId = 7
}: { isAdmin?: boolean; spaceId?: number | null } = {}) {
  localStorage.clear();
  useDataHubAuthStore.getState().clearAuthState();
  useDataHubAuthStore.getState().setAuth({
    token: "test-token",
    userId: 1,
    username: "zhangsan",
    isAdmin
  });
  useDataHubAuthStore.getState().setCurrentSpaceId(spaceId);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return renderHook(() => useSpaceAdmin(), { wrapper });
}

describe("useSpaceAdmin", () => {
  beforeEach(() => {
    listSpaces.mockReset();
    listSpaces.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("keeps a plain member out of the space scope", async () => {
    listSpaces.mockResolvedValue([space(7, ["空间游客"])]);
    const { result } = renderSpaceAdmin();

    // 角色请求未回来之前不算落定，调用方据此门住知识库查询
    expect(result.current).toEqual({ isSpaceAdmin: false, resolved: false });

    await waitFor(() => expect(result.current.resolved).toBe(true));
    expect(result.current.isSpaceAdmin).toBe(false);
  });

  it("recognizes the space super admin role of the current space", async () => {
    listSpaces.mockResolvedValue([space(7, ["超级管理员"])]);
    const { result } = renderSpaceAdmin();

    await waitFor(() => expect(result.current.isSpaceAdmin).toBe(true));
    expect(result.current.resolved).toBe(true);
  });

  it("ignores the super admin role held in another space", async () => {
    listSpaces.mockResolvedValue([space(9, ["超级管理员"]), space(7, ["空间游客"])]);
    const { result } = renderSpaceAdmin();

    await waitFor(() => expect(result.current.resolved).toBe(true));
    expect(result.current.isSpaceAdmin).toBe(false);
  });

  it("treats a system admin as an admin without asking for the space list", async () => {
    const { result } = renderSpaceAdmin({ isAdmin: true });

    expect(result.current).toEqual({ isSpaceAdmin: true, resolved: true });
    expect(listSpaces).not.toHaveBeenCalled();
  });

  it("falls back to the personal scope when the space list fails", async () => {
    listSpaces.mockRejectedValue(new Error("空间列表加载失败"));
    const { result } = renderSpaceAdmin();

    await waitFor(() => expect(result.current.resolved).toBe(true));
    expect(result.current.isSpaceAdmin).toBe(false);
    expect(listSpaces).toHaveBeenCalledTimes(1);
  });

  it("resolves without a request when no space is selected", () => {
    const { result } = renderSpaceAdmin({ spaceId: null });

    expect(result.current).toEqual({ isSpaceAdmin: false, resolved: true });
    expect(listSpaces).not.toHaveBeenCalled();
  });
});
