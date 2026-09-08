import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { DashboardDataBinding, DashboardRecord, DashboardSchema, DashboardWidget } from "../../src/types/dashboardStudio";

const binding = (id: string, columns: DashboardDataBinding["table"]["columns"], rows: DashboardDataBinding["table"]["rows"]): DashboardDataBinding => ({
  id, label: id, mode: "snapshot", status: "success", table: { columns, rows, totalRows: rows.length }
});
const metrics = [
  binding("revenue", [{ key: "value", title: "营收", type: "number" }], [{ value: 1280 }]),
  binding("orders", [{ key: "value", title: "订单数", type: "number" }], [{ value: 326 }])
];
const trend = binding("trend", [
  { key: "month", title: "月份", type: "string" },
  { key: "revenue", title: "营收", type: "number" },
  { key: "cost", title: "成本", type: "number" }
], [120, 160, 145, 220, 260, 310].map((revenue, index) => ({ month: `${index + 1}月`, revenue, cost: 70 + index * 22 })));
const channels = binding("channels", [
  { key: "name", title: "渠道", type: "string" },
  { key: "amount", title: "收入", type: "number" }
], [{ name: "企业直销", amount: 620 }, { name: "渠道合作", amount: 420 }, { name: "线上服务", amount: 240 }]);
const contracts = binding("contracts", [
  { key: "id", title: "合同编号", type: "string" },
  { key: "customer", title: "客户", type: "string" },
  { key: "amount", title: "金额（万元）", type: "number" },
  { key: "status", title: "进展", type: "string" }
], Array.from({ length: 30 }, (_, index) => ({
  id: `HT-2026-${String(index + 1).padStart(3, "0")}`, customer: ["星枢科技", "云图智能", "海诚建设"][index % 3], amount: 120 + index * 8, status: "正常履约"
})));

const widget = (id: string, type: DashboardWidget["type"], title: string, x: number, y: number, w: number, h: number, bindingId?: string): DashboardWidget => ({
  id, type, title, bindingId, position: { x: x / 2, y: y / 2, w: w / 2, h: h / 2 }, mapping: {},
  style: { background: "#fffaf3", color: "#6b3d1c", accent: "#ed8c45", borderColor: "#f5dac0", borderRadius: 16 }
});
const schema: DashboardSchema = {
  schemaVersion: 2, id: "workspace-qa", title: "商务经营总览", description: "经营数据与重点事项",
  canvas: {
    width: 1920, height: 1200, columns: 12, rows: 12, background: "#fff0df", scaleMode: "fit-screen",
    backgroundImage: { dataUrl: "/src/assets/dashboard-backgrounds/xingshu-dashboard-default.jpg", fit: "fill" }
  },
  source: { kind: "blank", generatedAt: "2026-09-07T00:00:00Z", plannerVersion: 2 },
  dataBindings: Object.fromEntries([...metrics, trend, channels, contracts].map((item) => [item.id, item])),
  widgets: [
    { ...widget("title", "text", "商务经营总览", 32, 20, 3776, 100), content: "商务经营总览", style: { color: "#6b3d1c", fontSize: 32, fontWeight: 600, textAlign: "center" } },
    { ...widget("revenue", "metric", "本月营收（万元）", 32, 180, 1860, 320, "revenue"), mapping: { metricKeys: ["value"], valueMode: "first" }, style: { showTrend: false } },
    { ...widget("orders", "metric", "本月新增订单", 1952, 180, 1856, 320, "orders"), mapping: { metricKeys: ["value"], valueMode: "first" }, style: { showTrend: false } },
    { ...widget("trend", "line", "营收与成本趋势", 32, 540, 3776, 720, "trend"), mapping: { dimensionKey: "month", metricKeys: ["revenue", "cost"] } },
    { ...widget("channels", "pie", "收入渠道分布", 32, 1300, 1860, 540, "channels"), mapping: { dimensionKey: "name", metricKeys: ["amount"] } },
    widget("empty", "bar", "社区上报 TOP 3", 1952, 1300, 1856, 540),
    widget("contracts", "table", "重点合同明细", 32, 1880, 3776, 480, "contracts"),
    widget("decoration", "decoration", "自定义装饰", 32, 132, 3776, 8)
  ],
  createdAt: "2026-09-07T00:00:00Z", updatedAt: "2026-09-07T02:00:00Z"
};
const record: DashboardRecord = {
  id: schema.id, schema: { ...schema, widgets: [], canvas: { ...schema.canvas, background: "#ffffff" } },
  publishedSchema: structuredClone(schema), status: "published", revision: 1,
  ownerUserId: 1, visibility: "PRIVATE", createdAt: schema.createdAt, updatedAt: schema.updatedAt, versions: []
};

async function mockDashboard(page: Page) {
  await page.route("**/api/**", (route) => route.fulfill({ json: { code: 200, message: "success", data: [] } }));
  await page.route("**/api/analytics/dashboards", (route) => route.fulfill({ json: { code: 200, message: "success", data: [record] } }));
  await page.route("**/api/analytics/dashboards/workspace-qa/runtime", (route) => route.fulfill({ json: {
    code: 200, message: "success", data: { record, datasets: {}, moduleStatuses: {} }
  } }));
  await page.addInitScript(() => {
    localStorage.setItem("xingshu_datahub_token", "visual-qa-token");
    localStorage.setItem("xingshu_datahub_user", JSON.stringify({ token: "visual-qa-token", userId: 1, username: "visual-qa", isAdmin: false }));
    localStorage.setItem("xingshu_datahub_space_id", "7");
    localStorage.setItem("xingshu_onboarding_v1", "done");
    localStorage.setItem("xs-dashboard-current", "workspace-qa");
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
}

test("简洁页头使用品牌蓝按钮，展示保留已发布大屏的布局和样式", async ({ page }) => {
  const errors: string[] = [];
  const writes: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/api/analytics/dashboards") && request.method() !== "GET") writes.push(request.url());
  });
  await mockDashboard(page);
  await page.goto("/dashboard");
  const canvas = page.locator(".runtime-canvas");
  const trendCard = page.getByRole("article", { name: "营收与成本趋势", exact: true });
  const createButton = page.getByRole("button", { name: "新建看板", exact: true }).first();
  await expect(canvas).toBeVisible();
  await expect(page.locator(".runtime-workspace-grid")).toHaveCount(0);
  await expect(page.getByRole("article", { name: "本月营收（万元）", exact: true }).locator(".metric-card-renderer__value")).toContainText("1,280");
  await expect(trendCard.locator("canvas")).toBeVisible();
  await expect(createButton).toHaveCSS("background-color", "rgb(37, 99, 235)");
  await createButton.hover();
  await expect(createButton).toHaveCSS("background-color", "rgb(29, 78, 216)");
  await page.mouse.move(0, 0);
  await expect(page.getByRole("combobox", { name: "看板阅读缩放" })).toHaveValue("reading");
  await page.getByRole("combobox", { name: "看板阅读缩放" }).selectOption("1");
  await expect(canvas).toHaveCSS("width", "1920px");
  await expect(canvas).toHaveCSS("height", "1200px");
  await expect(canvas).toHaveCSS("background-color", "rgb(255, 240, 223)");
  await expect(canvas).toHaveCSS("background-image", /xingshu-dashboard-default\.jpg/);
  await expect(canvas).toHaveCSS("background-size", "100% 100%");
  await expect(page.getByRole("article", { name: "商务经营总览", exact: true }).locator(".text-renderer")).toHaveCSS("font-size", "32px");
  await expect(trendCard).toHaveCSS("left", "16px");
  await expect(trendCard).toHaveCSS("top", "270px");
  await expect(trendCard).toHaveCSS("width", "1888px");
  await expect(trendCard).toHaveCSS("height", "360px");
  await expect(trendCard.locator(".chart-renderer")).toHaveCSS("background-color", "rgb(255, 250, 243)");
  await expect(page.getByRole("article", { name: "自定义装饰", exact: true })).toBeVisible();

  await page.getByRole("combobox", { name: "看板阅读缩放" }).selectOption("reading");
  for (const [width, height] of [[1440, 1000], [1672, 1100], [1920, 1200], [2200, 1300], [960, 1100], [390, 844]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await expect.poll(async () => {
      const viewportWidth = await page.locator(".runtime-canvas-viewport").evaluate((node) => node.clientWidth);
      return Math.abs((await canvas.boundingBox())!.width - viewportWidth);
    }).toBeLessThanOrEqual(1);
    await expect(canvas).toHaveCSS("transform", "none");
    await expect(trendCard).toHaveCSS("height", "320px");
    await expect(trendCard.locator("canvas")).toBeVisible();
    const columns = await canvas.evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(width === 390 ? 1 : 2);
    await page.screenshot({ path: `outputs/dashboard-codex/configured-page-${width}.png`, fullPage: true });
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "当前看板设置" }).click();
  await expect(page.getByRole("menuitem", { name: "编辑", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "归档", exact: true })).toBeVisible();
  await page.screenshot({ path: "outputs/dashboard-codex/configured-settings.png" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "新建看板", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "新建看板", exact: true });
  await expect(dialog.getByRole("button", { name: "创建并进入编辑器" })).toBeDisabled();
  await dialog.getByRole("textbox", { name: "看板名称" }).fill("季度经营看板");
  await expect(dialog.getByRole("button", { name: "创建并进入编辑器" })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "创建并进入编辑器" })).toHaveCSS("background-color", "rgb(37, 99, 235)");
  await page.screenshot({ path: "outputs/dashboard-codex/blue-create-dialog.png" });
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  const tableRegion = page.getByRole("region", { name: "重点合同明细表格内容", exact: true });
  await tableRegion.focus();
  await page.keyboard.press("PageDown");
  await expect.poll(() => tableRegion.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  expect((await new AxeBuilder({ page }).include(".dashboard-current").analyze()).violations).toEqual([]);

  await page.goto("/dashboard-view?dashboard=workspace-qa");
  await expect(page.locator(".xs-dashboard-runtime.is-fullscreen")).toBeVisible();
  await expect(page.locator(".runtime-workspace-grid")).toHaveCount(0);
  await expect(page.locator(".runtime-canvas")).toBeVisible();
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("编辑器的字体、面板和蓝色控件保持一致，原始画布与操作继续可用", async ({ page }) => {
  const errors: string[] = [];
  const writes: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/api/analytics/dashboards") && request.method() !== "GET") writes.push(request.url());
  });
  await mockDashboard(page);
  await page.route("**/api/analytics/dashboards/workspace-qa/editor-data", (route) => route.fulfill({ json: {
    code: 200, message: "success", data: { record: { ...record, schema }, datasets: {}, moduleStatuses: {} }
  } }));
  await page.goto("/dashboard-editor?draft=workspace-qa");
  const canvas = page.getByRole("application", { name: "大屏组件画布" });
  const save = page.getByRole("button", { name: "保存", exact: true });
  await expect(canvas).toBeVisible();
  await expect(canvas.locator(".vue-echart").first()).toHaveAttribute("data-echarts-ready", "true");
  await expect(save).toHaveCSS("background-color", "rgb(37, 99, 235)");
  await expect(save).toHaveCSS("font-size", "13px");
  await expect(save).toHaveCSS("font-weight", "500");
  await expect(canvas).toHaveCSS("width", "1920px");
  await expect(canvas).toHaveCSS("background-color", "rgb(255, 240, 223)");
  await expect(canvas).toHaveCSS("background-image", /xingshu-dashboard-default\.jpg/);
  await expect(page.locator(".designer-palette__icon svg")).toHaveCount(11);
  await expect(page.locator(".designer-palette__icon").first()).toHaveCSS("background-color", "rgb(237, 243, 255)");

  for (const [width, height] of [[1440, 1000], [1672, 1100], [1920, 1200], [2200, 1300], [960, 1100], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await expect(save).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await expect(canvas).toHaveCSS("width", "1920px");
    await page.screenshot({ path: `outputs/dashboard-codex/editor-${width}.png` });
  }

  const palette = page.getByRole("complementary", { name: "组件库", exact: true });
  await expect(palette).toBeVisible();
  await palette.getByRole("button", { name: "收藏问数", exact: true }).click();
  await expect(palette.getByText("暂无收藏问数，请先在问数结果中收藏。")).toBeVisible();
  await palette.getByRole("button", { name: "组件", exact: true }).click();
  await page.screenshot({ path: "outputs/dashboard-codex/editor-palette-390.png" });
  await page.getByRole("button", { name: "更多操作", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "应用大屏模板" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 1672, height: 1100 });
  await page.getByRole("button", { name: "本月营收（万元）", exact: true }).click();
  await expect(page.getByRole("heading", { name: "基础", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "基础", exact: true })).toHaveCSS("font-weight", "500");
  await page.screenshot({ path: "outputs/dashboard-codex/editor-properties-1672.png" });
  await canvas.getByRole("button", { name: "营收与成本趋势", exact: true }).click();
  await expect(page.locator(".chart-type-picker__label").first()).toHaveCSS("font-size", "12px");
  await expect(page.locator(".chart-type-picker__label").first()).toHaveCSS("font-weight", "500");
  await page.screenshot({ path: "outputs/dashboard-codex/editor-chart-properties-1672.png" });
  await page.getByRole("button", { name: "一键美化", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "选配色，再构图" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "应用美化" })).toHaveCSS("background-color", "rgb(37, 99, 235)");
  await page.screenshot({ path: "outputs/dashboard-codex/editor-beautify-dialog.png" });
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(canvas).toHaveCSS("background-color", "rgb(255, 240, 223)");
  await expect(canvas.getByRole("button", { name: "营收与成本趋势", exact: true })).toHaveCSS("top", "270px");
  expect((await new AxeBuilder({ page }).include(".designer-toolbar").include(".designer-panel").analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "智享", exact: true }).click();
  await expect(page.locator(".smart-dashboard")).toBeVisible();
  await expect(page.locator(".smart-dashboard__head strong")).toHaveCSS("font-weight", "500");
  await page.screenshot({ path: "outputs/dashboard-codex/editor-smart-1672.png" });
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
