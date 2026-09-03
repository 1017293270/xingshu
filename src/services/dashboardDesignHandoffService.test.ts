import { beforeEach, describe, expect, it } from "vitest";
import { DASHBOARD_SMART_HANDOFF_KEY, type DashboardSmartHandoff } from "@/types/dashboardDesign";
import {
  clearDashboardSmartHandoff,
  consumeDashboardSmartHandoff,
  writeDashboardSmartHandoff
} from "./dashboardDesignHandoffService";

const handoff: DashboardSmartHandoff = {
  version: 1,
  draftId: "draft-1",
  brief: "做一块面向经营例会的营收总览",
  assetIds: ["asset-revenue", "asset-region"],
  createdAt: "2026-09-03T08:00:00.000Z"
};

describe("dashboardDesignHandoffService", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("写进去的交接只能被同一份草稿读一次", () => {
    writeDashboardSmartHandoff(handoff);

    expect(consumeDashboardSmartHandoff("draft-1")).toEqual(handoff);
    expect(window.sessionStorage.getItem(DASHBOARD_SMART_HANDOFF_KEY)).toBeNull();
    expect(consumeDashboardSmartHandoff("draft-1")).toBeNull();
  });

  it("草稿对不上时不返还也不清掉，等真正的那块板来取", () => {
    writeDashboardSmartHandoff(handoff);

    expect(consumeDashboardSmartHandoff("draft-2")).toBeNull();
    expect(window.sessionStorage.getItem(DASHBOARD_SMART_HANDOFF_KEY)).not.toBeNull();
  });

  it("坏掉的存储内容会被清掉而不是抛错", () => {
    window.sessionStorage.setItem(DASHBOARD_SMART_HANDOFF_KEY, "{not json");

    expect(consumeDashboardSmartHandoff("draft-1")).toBeNull();
    expect(window.sessionStorage.getItem(DASHBOARD_SMART_HANDOFF_KEY)).toBeNull();
  });

  it("版本不认识的交接直接忽略", () => {
    window.sessionStorage.setItem(DASHBOARD_SMART_HANDOFF_KEY, JSON.stringify({ ...handoff, version: 2 }));

    expect(consumeDashboardSmartHandoff("draft-1")).toBeNull();
  });

  it("字段残缺的交接补成安全默认值", () => {
    window.sessionStorage.setItem(
      DASHBOARD_SMART_HANDOFF_KEY,
      JSON.stringify({ version: 1, draftId: "draft-1", assetIds: ["a", 3, null] })
    );

    const consumed = consumeDashboardSmartHandoff("draft-1");
    expect(consumed?.brief).toBe("");
    expect(consumed?.assetIds).toEqual(["a"]);
    expect(typeof consumed?.createdAt).toBe("string");
  });

  it("clear 之后什么都读不到", () => {
    writeDashboardSmartHandoff(handoff);
    clearDashboardSmartHandoff();

    expect(consumeDashboardSmartHandoff("draft-1")).toBeNull();
  });
});
