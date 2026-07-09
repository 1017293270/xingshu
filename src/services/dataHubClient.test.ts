import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestDataHub, DataHubServiceError } from "./dataHubClient";
import { loginToDataHub } from "./dataHubAuthService";
import { ensureDataHubSpace } from "./dataHubSpaceService";
import { clearDataHubSession, readDataHubSession, writeDataHubAuth, writeDataHubSpaceId } from "./dataHubSession";

describe("dataHubClient", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("unwraps the data-hub R envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ code: 200, message: "success", data: [{ id: 1 }] })))
    );

    const result = await requestDataHub<Array<{ id: number }>>("/api/spaces", {
      baseUrl: "http://127.0.0.1:8090"
    });

    expect(result).toEqual([{ id: 1 }]);
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8090/api/spaces",
      expect.objectContaining({ headers: expect.any(Headers) })
    );
  });

  it("adds authorization and space headers from the data-hub session", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ code: 200, message: "success", data: [] }))
    );
    vi.stubGlobal("fetch", fetchMock);
    writeDataHubAuth({ token: "token-123", userId: 1, username: "demo", isAdmin: false });
    writeDataHubSpaceId(7);

    await requestDataHub("/api/spaces", { baseUrl: "http://127.0.0.1:8090" });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer token-123");
    expect(headers.get("X-Space-Id")).toBe("7");
  });

  it("returns login results without persisting a partial session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              code: 200,
              message: "success",
              data: { token: "token-abc", userId: 2, username: "alice", isAdmin: false }
            })
          )
      )
    );

    const user = await loginToDataHub({ username: "alice", password: "secret" });

    expect(user.token).toBe("token-abc");
    expect(readDataHubSession()).toEqual({ token: null, user: null, spaceId: null });
  });

  it("supports an explicit auth token while preparing an atomic login session", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ code: 200, message: "success", data: [] })));
    vi.stubGlobal("fetch", fetchMock);
    writeDataHubAuth({ token: "stale-token", userId: 1, username: "stale", isAdmin: false });
    writeDataHubSpaceId(77);

    await requestDataHub("/api/spaces", { authToken: "temporary-login-token", spaceId: null });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer temporary-login-token");
    expect(new Headers(init.headers).get("X-Space-Id")).toBeNull();
  });

  it("ensures a platform space by reusing the first existing space", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            code: 200,
            message: "success",
            data: [
              {
                id: 9,
                spaceName: "默认空间",
                ownerId: 2,
                myRole: "member",
                memberCount: 3,
                createdAt: "2026-07-07 17:00:00"
              }
            ]
          })
        )
      )
    );

    const space = await ensureDataHubSpace("alice");

    expect(space.id).toBe(9);
    expect(readDataHubSession().spaceId).toBe(9);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("ensures a platform space by creating one when none exists", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 200, message: "success", data: [] })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            message: "success",
            data: {
              id: 10,
              spaceName: "alice的空间",
              ownerId: 2,
              myRole: "super_admin",
              memberCount: 1,
              createdAt: "2026-07-07 17:00:00"
            }
          })
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const space = await ensureDataHubSpace("alice");

    expect(space.id).toBe(10);
    expect(readDataHubSession().spaceId).toBe(10);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/spaces",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ spaceName: "alice的空间" })
      })
    );
  });

  it("throws typed errors and clears session on 401 envelopes", async () => {
    writeDataHubAuth({ token: "stale-token", userId: 1, username: "demo", isAdmin: false });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ code: 401, message: "Token 无效", data: null })))
    );

    await expect(requestDataHub("/api/spaces", { baseUrl: "http://127.0.0.1:8090" })).rejects.toBeInstanceOf(
      DataHubServiceError
    );
    expect(readDataHubSession().token).toBeNull();
  });

  it("aborts stalled data-hub requests with a typed timeout error", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          })
      )
    );

    const request = expect(
      requestDataHub("/api/auth/login", {
        method: "POST",
        includeAuth: false,
        body: JSON.stringify({ username: "demo", password: "secret" }),
        timeoutMs: 10
      })
    ).rejects.toMatchObject({
      name: "DataHubServiceError",
      code: "REQUEST_TIMEOUT",
      message: "请求超时，请确认 data-hub 登录服务是否可用"
    });

    await vi.advanceTimersByTimeAsync(10);

    await request;
  });

  it("keeps caller aborts as cancelled service errors for the login UI", async () => {
    const abortController = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          })
      )
    );

    const request = requestDataHub("/api/auth/login", {
      method: "POST",
      includeAuth: false,
      body: JSON.stringify({ username: "demo", password: "secret" }),
      signal: abortController.signal
    });

    abortController.abort();
    await expect(request).rejects.toMatchObject({
      name: "DataHubServiceError",
      code: "REQUEST_CANCELLED",
      message: "请求已取消"
    });
  });

  it("clears session explicitly", () => {
    writeDataHubAuth({ token: "token-123", userId: 1, username: "demo", isAdmin: false });
    writeDataHubSpaceId(9);

    clearDataHubSession();

    expect(readDataHubSession()).toEqual({ token: null, user: null, spaceId: null });
  });
});
