import { describe, expect, it } from "vitest";
import { groupTableSessions } from "@/features/tableGeneration/sessionGroups";
import type { TableTemplate } from "@/types/table";

const now = new Date("2026-08-18T14:00:00");

function session(id: string, updatedAt?: string, description = "2026-08-18 10:00"): TableTemplate {
  return { id, title: id, tag: "清单", description, iconId: "contact-list", updatedAt };
}

describe("groupTableSessions", () => {
  it("buckets sessions by how recently they were updated", () => {
    const groups = groupTableSessions(
      [
        session("today", "2026-08-18T09:12:00"),
        session("yesterday", "2026-08-17T22:40:00"),
        session("this-week", "2026-08-14T08:00:00"),
        session("this-month", "2026-08-01T08:00:00"),
        session("older", "2026-05-02T08:00:00")
      ],
      now
    );

    expect(groups.map((group) => group.label)).toEqual(["今天", "昨天", "近 7 天", "近 30 天", "更早"]);
    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([
      ["today"],
      ["yesterday"],
      ["this-week"],
      ["this-month"],
      ["older"]
    ]);
  });

  it("keeps several sessions from the same day in one group, in the given order", () => {
    const groups = groupTableSessions(
      [session("a", "2026-08-18T11:00:00"), session("b", "2026-08-18T08:00:00")],
      now
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("puts the not-yet-persisted current session in its own leading group", () => {
    const groups = groupTableSessions(
      [
        { ...session("live"), updatedAt: undefined, description: "当前会话" },
        session("today", "2026-08-18T09:00:00")
      ],
      now
    );

    expect(groups.map((group) => group.label)).toEqual(["当前会话", "今天"]);
  });

  it("treats a missing or unparsable timestamp as 更早 instead of dropping the session", () => {
    const groups = groupTableSessions([session("no-date"), session("bad-date", "not-a-date")], now);

    expect(groups).toEqual([{ label: "更早", items: expect.any(Array) }]);
    expect(groups[0].items.map((item) => item.id)).toEqual(["no-date", "bad-date"]);
  });

  it("reads space-separated backend timestamps as local time", () => {
    const groups = groupTableSessions([session("today", "2026-08-18 09:12:00")], now);

    expect(groups[0].label).toBe("今天");
  });

  it("returns nothing when there are no sessions", () => {
    expect(groupTableSessions([], now)).toEqual([]);
  });
});
