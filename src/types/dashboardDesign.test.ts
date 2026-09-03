import { describe, expect, it } from "vitest";
import {
  DASHBOARD_SMART_HANDOFF_KEY,
  dashboardDesignArchetypes,
  dashboardDesignRoles
} from "./dashboardDesign";

/**
 * 这三个常量是模型 prompt、引擎校验与交接存储的共同口径，
 * 改名等于同时改后端 prompt 与已经写进用户浏览器的交接键，所以钉死在测试里。
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

  it("交接存储键带版本号", () => {
    expect(DASHBOARD_SMART_HANDOFF_KEY).toBe("xingshu.dashboard.smart-handoff.v1");
  });
});
