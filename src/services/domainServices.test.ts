import { describe, expect, it } from "vitest";
import { getDataAssetKpis, listKnowledgeBases } from "./dataAssetService";
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

  it("returns typed table templates", async () => {
    const tables = await listRecentTables();

    expect(tables.map((table) => table.iconId)).toEqual([
      "ranking",
      "contact-list",
      "expense-statistics",
      "inventory"
    ]);
  });

  it("returns typed writing scenes and documents", async () => {
    const scenes = await listWritingScenes();
    const documents = await listWritingDocuments();

    expect(scenes[0].iconId).toBe("report-summary");
    expect(documents[0].words).toBe("1,428 字");
  });

  it("returns typed data asset summaries", async () => {
    const kpis = await getDataAssetKpis();
    const knowledgeBases = await listKnowledgeBases();

    expect(kpis[0]).toMatchObject({ id: "data-assets", label: "数据资产总量" });
    expect(knowledgeBases[0]).toMatchObject({ id: "enterprise-policy", title: "企业制度文档库" });
  });
});
