import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// 用法：node scripts/screenshot-dashboard-designer.mjs
// 验收「添加即成型 + 一键美化」：mock 收藏问数接口，连加三个组件看自动排版，
// 再打开一键美化对话框看四档主题色卡。
const dir = "outputs/ui-audit";
const seedRecords = JSON.parse(readFileSync("outputs/dashboard-seed/seed-dashboard.json", "utf8"));
const base = seedRecords[0];
// 从空板起步，才能看清「首添自动套主题 + 自动构图」
const record = {
  ...base,
  schema: { ...base.schema, widgets: [], dataBindings: {}, modules: {}, theme: undefined }
};

const months = ["一月", "二月", "三月", "四月", "五月", "六月"];
const regions = ["华东", "华北", "华南", "西南", "东北"];

const version = (id, no, question, outputKey, label, columns) => ({
  id,
  versionNo: no,
  resolvedQuestion: question,
  engine: "CUBE",
  parameters: [],
  outputs: [{ outputKey, label, columns }],
  schemaHash: `${outputKey}-schema`,
  status: "VALIDATED",
  createdAt: "2026-07-23T00:00:00.000Z"
});

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
    stableVersion: version("version-revenue", 3, "今年每月收入趋势", "revenue", "月度收入", [
      { columnId: "month-id", key: "month", label: "月份", type: "date" },
      { columnId: "amount-id", key: "amount", label: "收入", type: "number" }
    ]),
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z"
  },
  {
    id: "asset-orders",
    name: "各区域订单量排行",
    originalQuestion: "上个季度各区域订单量排名",
    resolvedQuestion: "上个季度各区域订单量排名",
    datasourceId: 8,
    ownerUserId: 1,
    visibility: "PRIVATE",
    stableVersionId: "version-orders",
    status: "ACTIVE",
    stableVersion: version("version-orders", 1, "上个季度各区域订单量排名", "orders", "区域订单", [
      { columnId: "region-id", key: "region", label: "区域", type: "text" },
      { columnId: "count-id", key: "count", label: "订单量", type: "number" }
    ]),
    createdAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z"
  },
  {
    id: "asset-channel",
    name: "渠道收入占比",
    originalQuestion: "各渠道收入占比",
    resolvedQuestion: "各渠道收入占比",
    datasourceId: 8,
    ownerUserId: 1,
    visibility: "SPACE",
    stableVersionId: "version-channel",
    status: "ACTIVE",
    stableVersion: version("version-channel", 2, "各渠道收入占比", "channel", "渠道占比", [
      { columnId: "channel-id", key: "channel", label: "渠道", type: "text" },
      { columnId: "share-id", key: "share", label: "收入占比", type: "number" }
    ]),
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z"
  }
];

const previews = {
  "asset-revenue": {
    outputKey: "revenue",
    rows: months.map((month, index) => ({ month, amount: 120 + index * 26 }))
  },
  "asset-orders": {
    outputKey: "orders",
    rows: regions.map((region, index) => ({ region, count: 940 - index * 130 }))
  },
  "asset-channel": {
    outputKey: "channel",
    rows: ["直营", "分销", "线上", "代理"].map((channel, index) => ({ channel, share: 40 - index * 9 }))
  }
};

const previewFor = (assetId) => {
  const asset = assets.find((item) => item.id === assetId);
  const seed = previews[assetId];
  return {
    id: `execution-${assetId}`,
    assetId,
    versionId: asset.stableVersionId,
    status: "SUCCESS",
    triggerType: "PREVIEW",
    durationMs: 21,
    createdAt: "2026-07-24T08:00:00.000Z",
    outputs: [{
      outputKey: seed.outputKey,
      columns: asset.stableVersion.outputs[0].columns,
      rows: seed.rows,
      totalRows: seed.rows.length
    }]
  };
};

let editorRecord = record;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1672, height: 1000 }, deviceScaleFactor: 2 });

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
  if (url.includes("/editor-data")) return json({ record: editorRecord, datasets: {}, moduleStatuses: {} });
  if (url.includes("/query-assets") && url.includes("/preview")) {
    const assetId = assets.map((item) => item.id).find((id) => url.includes(id)) ?? "asset-revenue";
    return json(previewFor(assetId));
  }
  if (/\/api\/analytics\/query-assets(\?|$)/.test(url)) return json(assets);
  return json({});
});

await page.goto(`http://127.0.0.1:5173/dashboard-editor?draft=${record.id}&source=favorites`, { waitUntil: "networkidle" });
await page.waitForSelector(".query-asset-panel__list > button", { timeout: 20000 });

// 连续加三个组件：每次添加后都应自动收口成整齐版式，首个组件顺带套上默认主题
const names = ["月度收入趋势", "各区域订单量排行", "渠道收入占比"];
for (const [index, name] of names.entries()) {
  await page.getByRole("button", { name: new RegExp(name) }).first().click();
  await page.getByRole("button", { name: /添加到画布|再次添加/ }).click();
  await page.waitForTimeout(900);
  // 首个组件落板时应看到「自动排版并套用默认主题」的回执
  if (index === 0) await page.screenshot({ path: `${dir}/designer-0-first-widget.png` });
}

await page.waitForTimeout(700);
await page.screenshot({ path: `${dir}/designer-1-auto-compose.png` });
await page.locator(".designer-palette").screenshot({ path: `${dir}/designer-2-palette.png` });

// 撤销一步应只退回这次自动排版，三个组件都还在
const positionsAfterCompose = await page.locator(".dashboard-widget-card").evaluateAll(
  (nodes) => nodes.map((node) => `${node.style.left}/${node.style.top}`)
);
await page.getByRole("button", { name: "撤销" }).click();
await page.waitForTimeout(500);
const positionsAfterUndo = await page.locator(".dashboard-widget-card").evaluateAll(
  (nodes) => nodes.map((node) => `${node.style.left}/${node.style.top}`)
);
console.log("撤销前", positionsAfterCompose.join(" | "));
console.log("撤销后", positionsAfterUndo.join(" | "));
if (positionsAfterUndo.length !== 3) throw new Error("撤销把组件也一起退掉了，应该只退自动排版");
if (positionsAfterCompose.join() === positionsAfterUndo.join()) throw new Error("撤销没有退回自动排版");
await page.getByRole("button", { name: "重做" }).click();
await page.waitForTimeout(500);

// 一键美化对话框：四档主题色卡 + 前后构图对比
await page.getByRole("button", { name: "一键美化" }).click();
await page.waitForSelector(".board-theme-picker", { timeout: 10000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${dir}/designer-3-beautify-dialog.png` });

await page.getByRole("radio", { name: /深空指挥/ }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${dir}/designer-4-beautify-dark.png` });

await page.getByRole("button", { name: "应用美化" }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${dir}/designer-5-applied.png` });

// 空态降噪：换一块彻底空的板，加两个没有数据绑定的组件，浅色与深色档各看一次
editorRecord = { ...record, schema: { ...record.schema, widgets: [], dataBindings: {}, modules: {} } };
await page.goto(`http://127.0.0.1:5173/dashboard-editor?draft=${record.id}`, { waitUntil: "networkidle" });
await page.waitForSelector(".designer-palette__list", { timeout: 20000 });

const palette = page.locator(".designer-palette__list");
await palette.getByRole("button", { name: /^折线图/ }).click();
await page.waitForTimeout(300);
await palette.getByRole("button", { name: /^数据表格/ }).click();
await page.waitForTimeout(600);
await page.locator(".designer-canvas").screenshot({ path: `${dir}/designer-6-empty-states-light.png` });

await page.getByRole("button", { name: "一键美化" }).click();
await page.waitForSelector(".board-theme-picker", { timeout: 10000 });
await page.getByRole("radio", { name: /深空指挥/ }).click();
await page.getByRole("button", { name: "应用美化" }).click();
await page.waitForTimeout(1000);
await page.locator(".designer-canvas").screenshot({ path: `${dir}/designer-7-empty-states-dark.png` });
// 提示卡贴脸看一眼，确认深色档下文字对比度过关
await page.locator(".chart-renderer__notice").screenshot({ path: `${dir}/designer-8-notice-chart-dark.png` });
await page.locator(".table-renderer__notice").screenshot({ path: `${dir}/designer-9-notice-table-dark.png` });

await browser.close();
console.log("done");
