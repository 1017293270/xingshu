import { describe, expect, it } from "vitest";
import type { DataHubAskTurn } from "@/types/dataHub";
import { createDashboardRepository } from "./dashboardRepositoryService";
import { prepareDashboardFromAskTurn } from "./dashboardAskDataHandoffService";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function completedTurn(): DataHubAskTurn {
  return {
    question: "按区域统计本月销售额",
    status: "done",
    assistantContent: "华东区域销售额领先。",
    infoMessages: [],
    routingEvents: [],
    reactSteps: [],
    toolCalls: [],
    toolResults: [],
    chartResults: [],
    tableResults: [
      {
        columns: [
          { key: "region", title: "区域" },
          { key: "sales", title: "销售额", type: "number" }
        ],
        rows: [
          { region: "华东", sales: 6820 },
          { region: "华南", sales: 6120 }
        ],
        totalRows: 2,
        groupLabel: "区域销售"
      }
    ]
  };
}

describe("dashboardAskDataHandoffService", () => {
  it("persists a generated draft and returns the editor path for the ask-data page", () => {
    const repository = createDashboardRepository(new MemoryStorage());
    const result = prepareDashboardFromAskTurn(completedTurn(), {
      repository,
      sourceQueryId: "ask-result-42",
      spaceId: 7,
      dataMode: "live",
      idFactory: (prefix) => `${prefix}-42`,
      now: new Date("2026-07-10T08:00:00.000Z")
    });

    expect(result.editorPath).toBe(
      `/dashboard-editor?draft=${encodeURIComponent(result.record.id)}&returnTo=${encodeURIComponent("/analysis")}`
    );
    expect(repository.get(result.record.id)?.schema.source).toMatchObject({
      queryId: "ask-result-42",
      spaceId: 7
    });
    expect(Object.values(result.record.schema.dataBindings)[0].mode).toBe("live");
  });
});
