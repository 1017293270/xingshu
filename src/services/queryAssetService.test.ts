import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  QUERY_ASSET_ANSWER_MAX_CHARS,
  attachQueryAssetAnswer,
  ensureAskArtifact,
  favoriteAskArtifact,
  saveQueryAssetAnswer
} from "./queryAssetService";
import { writeDataHubAuth, writeDataHubSpaceId } from "./dataHubSession";
import type { QueryAsset } from "@/types/analytics";

const favoritedAsset: QueryAsset = {
  id: "asset-total",
  name: "全年借方发生额",
  originalQuestion: "全年借方发生额是多少",
  resolvedQuestion: "统计全年借方发生额",
  ownerUserId: 2,
  visibility: "PRIVATE",
  stableVersionId: "version-total",
  status: "ACTIVE",
  createdAt: "2026-10-08T00:00:00.000Z",
  updatedAt: "2026-10-08T00:00:00.000Z"
};

function envelope(data: unknown) {
  return new Response(JSON.stringify({ code: 200, message: "success", data }));
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
  const init = fetchMock.mock.calls[call]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

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

  it("selects one orchestration child result through the persisted root session", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          code: 200,
          message: "success",
          data: {
            askRunId: "child-run",
            resolvedQuestion: "统计合同数量",
            canFavorite: true
          }
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await ensureAskArtifact("root-session", "chat-1", "sub-contracts");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/query-artifacts/ensure",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          sessionId: "root-session",
          chatId: "chat-1",
          resultSessionId: "sub-contracts"
        })
      })
    );
  });

  it("keeps the from-ask body limited to the fields analytics accepts", async () => {
    const fetchMock = vi.fn(async () => envelope(favoritedAsset));
    vi.stubGlobal("fetch", fetchMock);

    await favoriteAskArtifact(
      { askRunId: "run-total", resolvedQuestion: "统计全年借方发生额", canFavorite: true },
      "全年借方发生额"
    );

    expect(fetchMock).toHaveBeenCalledWith("/api/analytics/query-assets/from-ask", expect.anything());
    expect(requestBody(fetchMock)).toEqual({ askRunId: "run-total", name: "全年借方发生额" });
  });

  it("posts the trimmed answer to the asset answer endpoint", async () => {
    const fetchMock = vi.fn(async () => envelope({ ...favoritedAsset, answerText: "共 1,280 万元" }));
    vi.stubGlobal("fetch", fetchMock);

    const updated = await saveQueryAssetAnswer("asset/total", "  共 1,280 万元\n");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/analytics/query-assets/asset%2Ftotal/answer",
      expect.objectContaining({ method: "POST" })
    );
    expect(requestBody(fetchMock)).toEqual({ answerText: "共 1,280 万元" });
    expect(updated).toMatchObject({ id: "asset-total" });
  });

  it.each([
    ["keeps an answer at the UTF-16 limit untouched", "x".repeat(QUERY_ASSET_ANSWER_MAX_CHARS), "x".repeat(QUERY_ASSET_ANSWER_MAX_CHARS)],
    ["cuts plain text to the UTF-16 limit", "x".repeat(QUERY_ASSET_ANSWER_MAX_CHARS + 3), "x".repeat(QUERY_ASSET_ANSWER_MAX_CHARS)],
    // 每个 📈 占两个 UTF-16 单元，偶数个正好在上限处切在两个 emoji 之间。
    ["cuts between two emoji at the limit", "📈".repeat(QUERY_ASSET_ANSWER_MAX_CHARS / 2 + 1), "📈".repeat(QUERY_ASSET_ANSWER_MAX_CHARS / 2)],
    // 前面多一个字符，第 20000 个单元就是某个 📈 的高代理，要退一位。
    ["backs off when the limit falls inside an emoji", `a${"📈".repeat(QUERY_ASSET_ANSWER_MAX_CHARS / 2)}`, `a${"📈".repeat(QUERY_ASSET_ANSWER_MAX_CHARS / 2 - 1)}`]
  ])("%s", async (_label, answer, expected) => {
    const fetchMock = vi.fn(async () => envelope(favoritedAsset));
    vi.stubGlobal("fetch", fetchMock);

    await saveQueryAssetAnswer("asset-total", `  ${answer}\n`);

    const sent = String(requestBody(fetchMock).answerText);
    expect(sent).toBe(expected);
    expect(sent.length).toBeLessThanOrEqual(QUERY_ASSET_ANSWER_MAX_CHARS);
    expect(/[\ud800-\udbff]$/.test(sent)).toBe(false);
  });

  it("does not call the answer endpoint for a blank answer", async () => {
    const fetchMock = vi.fn(async () => envelope(favoritedAsset));
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveQueryAssetAnswer("asset-total", " \n\t ")).resolves.toBeUndefined();
    await expect(attachQueryAssetAnswer(favoritedAsset, "")).resolves.toBe(favoritedAsset);
    await expect(attachQueryAssetAnswer(favoritedAsset, undefined)).resolves.toBe(favoritedAsset);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the asset returned by the answer endpoint", async () => {
    const answered = { ...favoritedAsset, answerText: "共 1,280 万元", updatedAt: "2026-10-08T00:01:00.000Z" };
    vi.stubGlobal("fetch", vi.fn(async () => envelope(answered)));

    await expect(attachQueryAssetAnswer(favoritedAsset, "共 1,280 万元")).resolves.toEqual(answered);
  });

  it("keeps the favorited asset when an older backend has no answer endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404, statusText: "Not Found" }))
    );

    await expect(attachQueryAssetAnswer(favoritedAsset, "共 1,280 万元")).resolves.toBe(favoritedAsset);
  });

  it("keeps the favorited asset when the answer request throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));

    await expect(attachQueryAssetAnswer(favoritedAsset, "共 1,280 万元")).resolves.toBe(favoritedAsset);
  });

  it.each([
    ["an empty envelope", null],
    ["a non-asset payload", { ok: true }],
    ["another asset", { ...favoritedAsset, id: "asset-other" }]
  ])("keeps the favorited asset when the answer endpoint returns %s", async (_label, data) => {
    vi.stubGlobal("fetch", vi.fn(async () => envelope(data)));

    await expect(attachQueryAssetAnswer(favoritedAsset, "共 1,280 万元")).resolves.toBe(favoritedAsset);
  });
});
