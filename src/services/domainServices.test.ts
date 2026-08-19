import { describe, expect, it } from "vitest";
import { listHistorySessions } from "./historyService";
import { listRecentTables } from "./tableService";
import { listWritingDocuments, listWritingScenes } from "./writingService";

describe("domain services", () => {
  it("returns typed history sessions", async () => {
    const sessions = await listHistorySessions();

    expect(sessions[0]).toMatchObject({
      id: "expense-policy",
      title: "员工报销流程说明",
      category: "知识快查"
    });
  });

  it("returns no recent tables in unit tests so DataHub list is not called", async () => {
    const tables = await listRecentTables();

    expect(tables).toEqual([]);
  });

  it("returns typed writing scenes and documents", async () => {
    const scenes = await listWritingScenes();
    const documents = await listWritingDocuments();

    expect(scenes[0].iconId).toBe("report-summary");
    expect(documents[0].words).toBe("1,428 字");
  });
});
