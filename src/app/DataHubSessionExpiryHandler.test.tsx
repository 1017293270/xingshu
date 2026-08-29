import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import { DataHubSessionExpiryHandler } from "./DataHubSessionExpiryHandler";
import { ProtectedRoute } from "./ProtectedRoute";

function jwtWithExpiry(exp: number) {
  const encode = (value: object) => btoa(JSON.stringify(value))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${encode({ alg: "none" })}.${encode({ exp })}.signature`;
}

describe("DataHubSessionExpiryHandler", () => {
  beforeEach(() => {
    useDataHubAuthStore.getState().clearAuthState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns an already-expired JWT session to login on app entry", async () => {
    useDataHubAuthStore.getState().setSession(
      { token: jwtWithExpiry(Math.floor(Date.now() / 1000) - 60), userId: 1, username: "alice", isAdmin: false },
      7
    );

    render(
      <MemoryRouter initialEntries={["/private"]}>
        <DataHubSessionExpiryHandler />
        <Routes>
          <Route path="/login" element={<div role="alert">登录状态已过期，请重新登录</div>} />
          <Route path="/private" element={<ProtectedRoute><div>受保护页面</div></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("登录状态已过期");
    expect(useDataHubAuthStore.getState().token).toBeNull();
  });

  it("returns to login when an active JWT reaches its expiry time", async () => {
    vi.useFakeTimers({ now: new Date("2026-08-26T18:00:00Z") });
    useDataHubAuthStore.getState().setSession(
      { token: jwtWithExpiry(Math.floor(Date.now() / 1000) + 60), userId: 1, username: "alice", isAdmin: false },
      7
    );

    render(
      <MemoryRouter initialEntries={["/private"]}>
        <DataHubSessionExpiryHandler />
        <Routes>
          <Route path="/login" element={<div role="alert">登录状态已过期，请重新登录</div>} />
          <Route path="/private" element={<ProtectedRoute><div>受保护页面</div></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("受保护页面")).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(screen.getByRole("alert")).toHaveTextContent("登录状态已过期");
  });
});
