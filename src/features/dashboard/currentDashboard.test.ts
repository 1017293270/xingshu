import { describe, expect, it } from "vitest";
import type { DashboardRecord } from "@/types/dashboardStudio";
import { resolveCurrentDashboard } from "./currentDashboard";

/** 回退逻辑只看 id / updatedAt / ownerUserId / visibility，其余字段不参与判定 */
function record(
  id: string,
  updatedAt: string,
  extra: Partial<Pick<DashboardRecord, "ownerUserId" | "visibility">> = {}
) {
  return { id, updatedAt, ...extra } as DashboardRecord;
}

const ME = 7;
const SOMEONE_ELSE = 42;

describe("resolveCurrentDashboard", () => {
  it("takes the stored dashboard as-is, even when it belongs to someone else", () => {
    const mine = record("mine", "2026-07-18T08:00:00.000Z", { ownerUserId: ME, visibility: "PRIVATE" });
    const theirs = record("theirs", "2026-07-15T08:00:00.000Z", {
      ownerUserId: SOMEONE_ELSE,
      visibility: "SPACE"
    });

    // 用户自己切过去的那块要留住，归属优先级只在回退时才生效
    expect(resolveCurrentDashboard([mine, theirs], "theirs", ME)).toBe(theirs);
  });

  it("prefers the user's own latest dashboard when the stored id is stale", () => {
    const theirsNewer = record("theirs", "2026-07-20T08:00:00.000Z", {
      ownerUserId: SOMEONE_ELSE,
      visibility: "SPACE"
    });
    const mineOlder = record("mine-old", "2026-07-10T08:00:00.000Z", {
      ownerUserId: ME,
      visibility: "SPACE"
    });
    const mineNewer = record("mine-new", "2026-07-18T08:00:00.000Z", {
      ownerUserId: ME,
      visibility: "PRIVATE"
    });

    const resolved = resolveCurrentDashboard([theirsNewer, mineOlder, mineNewer], "archived", ME);

    expect(resolved).toBe(mineNewer);
  });

  it("falls back to the PRIVATE heuristic while the backend still omits ownerUserId", () => {
    // 老后端没有 ownerUserId：列表 SQL 是 owner_user_id = ? OR visibility = 'SPACE'，
    // 所以能出现在列表里的 PRIVATE 板必然是自己的
    const sharedNewer = record("shared", "2026-07-20T08:00:00.000Z", { visibility: "SPACE" });
    const privateOlder = record("private", "2026-07-12T08:00:00.000Z", { visibility: "PRIVATE" });

    expect(resolveCurrentDashboard([sharedNewer, privateOlder], null, ME)).toBe(privateOlder);
  });

  it("keeps the plain latest-updated fallback when nothing can be attributed to the user", () => {
    // 全是别人共享进来的 SPACE 板：没有自己的可选，还是得挂一块出来，不能出空态
    const older = record("a", "2026-07-15T08:00:00.000Z", { ownerUserId: SOMEONE_ELSE, visibility: "SPACE" });
    const newer = record("b", "2026-07-18T08:00:00.000Z", { ownerUserId: SOMEONE_ELSE, visibility: "SPACE" });

    expect(resolveCurrentDashboard([older, newer], "archived", ME)).toBe(newer);
  });

  it("keeps the plain latest-updated fallback when the records carry no ownership hints at all", () => {
    const older = record("a", "2026-07-15T08:00:00.000Z");
    const newer = record("b", "2026-07-18T08:00:00.000Z");

    expect(resolveCurrentDashboard([older, newer], "archived", ME)).toBe(newer);
    expect(resolveCurrentDashboard([older, newer], "a", ME)).toBe(older);
  });

  it("does not claim ownership of anything before the login user id is known", () => {
    // 登录态还没落地时 userId 是 undefined，ownerUserId 有值也不能当成"我的"
    const theirs = record("theirs", "2026-07-20T08:00:00.000Z", {
      ownerUserId: SOMEONE_ELSE,
      visibility: "SPACE"
    });
    const withOwner = record("mine", "2026-07-10T08:00:00.000Z", { ownerUserId: ME, visibility: "SPACE" });

    expect(resolveCurrentDashboard([theirs, withOwner], null, undefined)).toBe(theirs);
  });

  it("returns null for an empty list so the page can render its empty state", () => {
    expect(resolveCurrentDashboard([], "anything", ME)).toBeNull();
    expect(resolveCurrentDashboard([], null, ME)).toBeNull();
  });
});
