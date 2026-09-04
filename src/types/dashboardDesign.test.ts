import { describe, expect, it } from "vitest";
import { dashboardDesignArchetypes, dashboardDesignRoles } from "./dashboardDesign";

/**
 * 这两个枚举是模型 prompt 与引擎校验的共同口径，
 * 改名等于同时改后端 prompt，所以钉死在测试里。
 */
describe("dashboardDesign 契约常量", () => {
  it("角色枚举覆盖六种语义角色", () => {
    expect([...dashboardDesignRoles]).toEqual([
      "kpi",
      "trend",
      "comparison",
      "composition",
      "detail",
      "narrative"
    ]);
  });

  it("构图原型枚举覆盖四档", () => {
    expect([...dashboardDesignArchetypes]).toEqual([
      "kpi-led",
      "trend-led",
      "comparison-grid",
      "ranking-detail"
    ]);
  });
});
