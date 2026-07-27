import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureAskArtifact } from "./queryAssetService";
import { writeDataHubAuth, writeDataHubSpaceId } from "./dataHubSession";

describe("queryAssetService", () => {
  beforeEach(() => {
    localStorage.clear();
    writeDataHubAuth({ token: "token-123", userId: 2, username: "demo", isAdmin: false });
    writeDataHubSpaceId(5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("requests an authoritative artifact backfill for a historical ask", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          code: 200,
          message: "success",
          data: {
            askRunId: "history-run",
            resolvedQuestion: "统计全年借方发生额",
            canFavorite: true
          }
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const artifact = await ensureAskArtifact("session-1", "chat-1");

    expect(artifact.canFavorite).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/query-artifacts/ensure",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sessionId: "session-1", chatId: "chat-1" })
      })
    );
  });
});
