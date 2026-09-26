import { describe, expect, it } from "vitest";
import {
  CONTRACT_CUBE,
  FLOW_CUBE,
  favoriteExecution,
  monthlyIncomeAsset
} from "@/features/dashboardStudio/testing/favoriteAnswerFixtures";
import { hydrateDashboardSchema } from "./dashboardAnalyticsService";
import { createBlankDashboard } from "./dashboardGenerationService";
import { appendQueryAssetChart } from "./dashboardModuleService";

/** 已经上板的旧看板：绑定里存的还是全称表头，服务端回放的数据集也是全称。 */
function legacyDetailBoard() {
  const preview = favoriteExecution(monthlyIncomeAsset);
  const added = appendQueryAssetChart(
    createBlankDashboard({ title: "旧看板", idFactory: (prefix) => `${prefix}-legacy` }),
    monthlyIncomeAsset,
    preview,
    "output_001"
  );
  const detail = preview.outputs[0]!;
  const binding = added.schema.dataBindings[added.bindingId]!;
  binding.table.columns = detail.columns.map((column) => ({
    columnId: column.columnId,
    key: column.key,
    title: column.title ?? column.label,
    type: column.type
  }));
  return { schema: added.schema, bindingId: added.bindingId, detail };
}

describe("hydrateDashboardSchema", () => {
  it("回放的数据集在灌回看板前清洗表头，完整原文留作悬浮提示", () => {
    const { schema, bindingId, detail } = legacyDetailBoard();
    const hydrated = hydrateDashboardSchema(schema, { [bindingId]: detail }, { [bindingId]: "SUCCESS" });
    const binding = hydrated.dataBindings[bindingId]!;

    expect(binding.table.columns.map((column) => column.title)).toEqual([
      "记录数",
      "合同名称",
      "合同编号",
      "交易日期",
      "对方户名",
      "交易金额（元）"
    ]);
    expect(binding.table.columns[2]?.fullTitle).toBe(`${CONTRACT_CUBE} 合同编号，合同的业务唯一标识`);
    expect(binding.table.rows).toHaveLength(20);
    expect(binding.status).toBe("success");
    // 入参不被改写：同一份运行态再灌一次结果一样。
    expect(schema.dataBindings[bindingId]!.table.columns[3]?.title).toBe(`${FLOW_CUBE} 交易日期`);
  });

  it("没有回放数据的旧绑定也清洗持久化表头", () => {
    const { schema, bindingId } = legacyDetailBoard();
    const hydrated = hydrateDashboardSchema(schema, {}, {});
    const columns = hydrated.dataBindings[bindingId]!.table.columns;

    expect(columns.map((column) => column.title)).toEqual([
      "记录数",
      "合同名称",
      "合同编号",
      "交易日期",
      "对方户名",
      "交易金额（元）"
    ]);
    expect(columns[5]?.fullTitle).toBe(`${FLOW_CUBE} 交易金额（元）`);
    expect(hydrateDashboardSchema(hydrated, {}, {}).dataBindings[bindingId]!.table.columns).toEqual(columns);
  });
});
