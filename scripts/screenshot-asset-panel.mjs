import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// 用法：node scripts/screenshot-asset-panel.mjs
// 打开看板设计器“收藏问数”侧边栏，mock 查询资产接口，截重构后的面板
const dir = "outputs/ui-audit";
const seedRecords = JSON.parse(readFileSync("outputs/dashboard-seed/seed-dashboard.json", "utf8"));
const record = seedRecords[0];

const assets = [
  {
    id: "asset-revenue",
    name: "月度收入趋势",
    originalQuestion: "今年每月收入趋势",
    resolvedQuestion: "今年每月收入趋势",
    datasourceId: 8,
    ownerUserId: 1,
    visibility: "SPACE",
    stableVersionId: "version-revenue",
    status: "ACTIVE",
    stableVersion: {
      id: "version-revenue",
      versionNo: 3,
      resolvedQuestion: "今年每月收入趋势",
      engine: "CUBE",
      parameters: [],
      outputs: [{
        outputKey: "revenue",
        label: "月度收入",
        columns: [
          { columnId: "month-id", key: "month", label: "月份", type: "date" },
          { columnId: "amount-id", key: "amount", label: "收入", type: "number" }
        ]
      }],
      schemaHash: "revenue-schema",
      status: "VALIDATED",
      sqlPreview: "SELECT month, SUM(amount) AS amount FROM sales GROUP BY month;",
      createdAt: "2026-07-23T00:00:00.000Z"
    },
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z"
  },
  {
    id: "asset-orders",
    name: "各区域订单量排行",
    originalQuestion: "上个季度各区域订单量排名",
    resolvedQuestion: "上个季度各区域订单量排名",
    datasourceId: 8,
    ownerUserId: 2,
    visibility: "PRIVATE",
    stableVersionId: "version-orders",
    status: "ACTIVE",
    stableVersion: {
      id: "version-orders",
      versionNo: 1,
      resolvedQuestion: "上个季度各区域订单量排名",
      engine: "CUBE",
      parameters: [],
      outputs: [{
        outputKey: "orders",
        label: "区域订单",
        columns: [
          { columnId: "region-id", key: "region", label: "区域", type: "text" },
          { columnId: "count-id", key: "count", label: "订单量", type: "number" }
        ]
      }],
      schemaHash: "orders-schema",
      status: "VALIDATED",
      createdAt: "2026-07-22T00:00:00.000Z"
    },
    createdAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z"
  },
  {
    id: "asset-refund",
    name: "退款率周环比",
    originalQuestion: "最近八周退款率周环比变化",
    resolvedQuestion: "最近八周退款率周环比变化",
    datasourceId: 9,
    ownerUserId: 1,
    visibility: "PRIVATE",
    stableVersionId: "version-refund",
    status: "ACTIVE",
    stableVersion: {
      id: "version-refund",
      versionNo: 2,
      resolvedQuestion: "最近八周退款率周环比变化",
      engine: "CUBE",
      parameters: [],
      outputs: [{
        outputKey: "refund",
        label: "退款率",
        columns: [
          { columnId: "week-id", key: "week", label: "周", type: "text" },
          { columnId: "rate-id", key: "rate", label: "退款率", type: "number" }
        ]
      }],
      schemaHash: "refund-schema",
      status: "VALIDATED",
      createdAt: "2026-07-21T00:00:00.000Z",
      updatedAt: "2026-07-21T00:00:00.000Z"
    },
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z"
  }
];

const preview = {
  id: "execution-revenue",
  assetId: "asset-revenue",
  versionId: "version-revenue",
  status: "SUCCESS",
  triggerType: "PREVIEW",
  durationMs: 18,
  createdAt: "2026-07-24T08:00:00.000Z",
  outputs: [{
    outputKey: "revenue",
    columns: assets[0].stableVersion.outputs[0].columns,
    rows: [{ month: "一月", amount: 12 }, { month: "二月", amount: 18 }],
    totalRows: 2
  }]
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1672, height: 1000 } });

await page.addInitScript(() => {
  window.localStorage.setItem("xingshu_datahub_token", "visual-qa-token");
  window.localStorage.setItem(
    "xingshu_datahub_user",
    JSON.stringify({ token: "visual-qa-token", userId: 1, username: "visual-qa", isAdmin: true })
  );
  window.localStorage.setItem("xingshu_datahub_space_id", "7");
});

await page.route("**/api/analytics/**", async (route) => {
  const url = route.request().url();
  const json = (body) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  if (url.includes("/editor-data")) return json({ record, datasets: {}, moduleStatuses: {} });
  if (url.includes("/query-assets") && url.includes("/preview")) return json(preview);
  if (/\/api\/analytics\/query-assets(\?|$)/.test(url)) return json(assets);
  return json({});
});

await page.goto(`http://127.0.0.1:5173/dashboard-editor?draft=${record.id}&source=favorites`, { waitUntil: "networkidle" });
await page.waitForSelector(".query-asset-panel", { timeout: 20000 });
await page.waitForSelector(".query-asset-panel__list > button", { timeout: 20000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${dir}/asset-panel-1-list.png` });

// 选中第一条资产并预览，检查配置区样式
await page.locator(".query-asset-panel__list > button").first().click();
await page.getByRole("button", { name: "预览数据" }).click();
await page.waitForSelector(".query-asset-panel__summary", { timeout: 10000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${dir}/asset-panel-2-preview.png` });

// 只截面板区域看细节
const panel = page.locator(".designer-palette");
await panel.screenshot({ path: `${dir}/asset-panel-3-detail.png` });

await browser.close();
console.log("done");
