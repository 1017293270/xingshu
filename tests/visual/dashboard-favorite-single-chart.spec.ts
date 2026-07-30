import { expect, type Page, type Route, test } from "@playwright/test";
import type { QueryExecutionOutput } from "../../src/types/analytics";
import type { DashboardSchema } from "../../src/types/dashboardStudio";

type DashboardRecordFixture = {
  id: string;
  status: "draft" | "published";
  revision: number;
  visibility: "PRIVATE" | "SPACE";
  schema: DashboardSchema;
  versions: unknown[];
  createdAt: string;
  updatedAt: string;
};

const asset = {
  id: "asset-revenue",
  name: "月度收入",
  originalQuestion: "今年每月收入趋势",
  resolvedQuestion: "今年每月收入趋势",
  datasourceId: 8,
  ownerUserId: 1,
  visibility: "PRIVATE",
  stableVersionId: "version-revenue",
  status: "ACTIVE",
  stableVersion: {
    id: "version-revenue",
    versionNo: 1,
    resolvedQuestion: "今年每月收入趋势",
    engine: "CUBE",
    parameters: [],
    outputs: [
      {
        outputKey: "summary",
        label: "汇总说明",
        columns: [
          { columnId: "summary-id", key: "summary", label: "说明", type: "string" }
        ]
      },
      {
        outputKey: "revenue",
        label: "月度收入",
        columns: [
          { columnId: "month-id", key: "month", label: "月份", type: "date" },
          { columnId: "amount-id", key: "amount", label: "收入", type: "number" }
        ]
      }
    ],
    schemaHash: "revenue-schema",
    status: "VALIDATED",
    createdAt: "2026-07-23T00:00:00.000Z"
  },
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z"
};

const preview = {
  id: "execution-revenue",
  assetId: asset.id,
  versionId: asset.stableVersionId,
  status: "SUCCESS",
  triggerType: "PREVIEW",
  durationMs: 18,
  createdAt: "2026-07-23T08:00:00.000Z",
  outputs: [
    {
      outputKey: "summary",
      columns: asset.stableVersion.outputs[0].columns,
      rows: [],
      totalRows: 0,
      updatedAt: "2026-07-23T08:00:00.000Z"
    },
    {
      outputKey: "revenue",
      columns: asset.stableVersion.outputs[1].columns,
      rows: [
        { month: "一月", amount: 12 },
        { month: "二月", amount: 18 },
        { month: "三月", amount: 26 }
      ],
      totalRows: 3,
      updatedAt: "2026-07-23T08:00:00.000Z"
    }
  ]
};

const contractAsset = {
  id: "asset-contract-value",
  name: "合同公司金额",
  originalQuestion: "2023年各公司合同金额",
  resolvedQuestion: "2023年各公司合同金额",
  datasourceId: 8,
  ownerUserId: 1,
  visibility: "PRIVATE",
  stableVersionId: "version-contract-value",
  status: "ACTIVE",
  stableVersion: {
    id: "version-contract-value",
    versionNo: 1,
    resolvedQuestion: "2023年各公司合同金额",
    engine: "CUBE",
    parameters: [],
    outputs: [{
      outputKey: "contracts",
      label: "合同公司金额",
      columns: [
        { columnId: "company-id", key: "company", label: "公司名称" },
        { columnId: "contract-value-id", key: "contractValue", label: "合同值" }
      ]
    }],
    schemaHash: "contract-value-schema",
    status: "VALIDATED",
    createdAt: "2026-07-23T00:00:00.000Z"
  },
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z"
};

const contractPreview = {
  id: "execution-contract-value",
  assetId: contractAsset.id,
  versionId: contractAsset.stableVersionId,
  status: "SUCCESS",
  triggerType: "PREVIEW",
  durationMs: 21,
  createdAt: "2026-07-24T06:47:00.000Z",
  outputs: [{
    outputKey: "contracts",
    columns: contractAsset.stableVersion.outputs[0].columns,
    rows: [
      { company: "甲公司", contractValue: "50000.00" },
      { company: "乙公司", contractValue: "80000.00" },
      { company: "丙公司", contractValue: "153296.50" }
    ],
    totalRows: 3,
    updatedAt: "2026-07-24T06:47:00.000Z"
  }]
};

function response(data: unknown) {
  return { code: 200, message: "single-chart fixture", data };
}

function runtime(record: DashboardRecordFixture) {
  const bindings = record.schema.dataBindings ?? {};
  const datasets: Record<string, QueryExecutionOutput> = {};
  Object.entries(bindings).forEach(([bindingId, binding]) => {
    if (binding.sourceRef?.outputKey === "revenue") datasets[bindingId] = preview.outputs[1];
    if (binding.sourceRef?.outputKey === "contracts") datasets[bindingId] = contractPreview.outputs[0];
  });
  const moduleStatuses = Object.fromEntries(
    Object.keys(datasets).map((bindingId) => [bindingId, "SUCCESS"])
  );
  return { record, datasets, moduleStatuses };
}

async function installApiFixture(
  page: Page,
  listedAssets: unknown[] = [asset, contractAsset]
) {
  let record: DashboardRecordFixture | null = null;

  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/analytics/query-assets" && request.method() === "GET") {
      await route.fulfill({ json: response(listedAssets) });
      return;
    }
    if (path === `/api/analytics/query-assets/${asset.id}/preview` && request.method() === "POST") {
      await route.fulfill({ json: response(preview) });
      return;
    }
    if (path === `/api/analytics/query-assets/${contractAsset.id}/preview` && request.method() === "POST") {
      await route.fulfill({ json: response(contractPreview) });
      return;
    }
    if (path === "/api/analytics/dashboards/save" && request.method() === "POST") {
      const body = request.postDataJSON() as {
        id: string;
        schema: DashboardSchema;
        visibility?: "PRIVATE" | "SPACE";
      };
      const now = new Date().toISOString();
      record = {
        id: body.id,
        status: "draft",
        revision: record ? record.revision + 1 : 1,
        visibility: body.visibility ?? record?.visibility ?? "PRIVATE",
        schema: structuredClone(body.schema),
        versions: record?.versions ?? [],
        createdAt: record?.createdAt ?? now,
        updatedAt: now
      };
      await route.fulfill({ json: response(record) });
      return;
    }

    const editorMatch = path.match(/^\/api\/analytics\/dashboards\/([^/]+)\/editor-data$/);
    if (editorMatch && request.method() === "GET" && record) {
      await route.fulfill({ json: response(runtime(record)) });
      return;
    }

    await route.fulfill({ json: response([]) });
  });

  return {
    getRecord() {
      return record;
    }
  };
}

test("favorite panel keeps chart actions visible when the asset list overflows", async ({ page }) => {
  const overflowAssets = Array.from({ length: 12 }, (_, index) => ({
    ...contractAsset,
    id: `asset-overflow-${index + 1}`,
    name: `收藏问数示例 ${String(index + 1).padStart(2, "0")}`,
    resolvedQuestion: `用于验证侧栏滚动的收藏问题 ${index + 1}`,
    stableVersionId: `version-overflow-${index + 1}`,
    stableVersion: {
      ...contractAsset.stableVersion,
      id: `version-overflow-${index + 1}`
    }
  }));
  await installApiFixture(page, [asset, ...overflowAssets]);
  await page.addInitScript(() => {
    const user = {
      token: "playwright-favorite-overflow-token",
      userId: 1,
      username: "张三",
      isAdmin: true
    };
    window.localStorage.setItem("xingshu_datahub_token", user.token);
    window.localStorage.setItem("xingshu_datahub_user", JSON.stringify(user));
    window.localStorage.setItem("xingshu_datahub_space_id", "1");
  });
  await page.setViewportSize({ width: 1440, height: 760 });

  await page.goto(`/dashboard-editor?source=favorites&asset=${asset.id}`);
  const addButton = page.getByRole("button", { name: "添加图表", exact: true });
  await expect(addButton).toBeVisible();
  await expect(addButton).toBeEnabled();

  const layout = await page.evaluate(() => {
    const palette = document.querySelector<HTMLElement>(".designer-palette")!;
    const browser = document.querySelector<HTMLElement>(".query-asset-panel__browser")!;
    const preview = document.querySelector<HTMLElement>(".query-asset-panel__preview")!;
    const actions = document.querySelector<HTMLElement>(".query-asset-panel__actions")!;
    return {
      palette: palette.getBoundingClientRect().toJSON(),
      browser: {
        ...browser.getBoundingClientRect().toJSON(),
        clientHeight: browser.clientHeight,
        scrollHeight: browser.scrollHeight
      },
      preview: preview.getBoundingClientRect().toJSON(),
      actions: actions.getBoundingClientRect().toJSON()
    };
  });

  expect(layout.browser.scrollHeight).toBeGreaterThan(layout.browser.clientHeight);
  expect(layout.preview.y).toBeGreaterThanOrEqual(layout.browser.y + layout.browser.height - 1);
  expect(layout.actions.y + layout.actions.height).toBeLessThanOrEqual(
    layout.palette.y + layout.palette.height + 1
  );

  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/dashboard-favorite-overflow-actions-1440x760.png",
    animations: "disabled",
    fullPage: true
  });
});

test("a selected favorite result adds one chart and survives save/reload", async ({ page }) => {
  const fixture = await installApiFixture(page);
  await page.addInitScript(() => {
    const user = {
      token: "playwright-single-chart-token",
      userId: 1,
      username: "张三",
      isAdmin: true
    };
    window.localStorage.setItem("xingshu_datahub_token", user.token);
    window.localStorage.setItem("xingshu_datahub_user", JSON.stringify(user));
    window.localStorage.setItem("xingshu_datahub_space_id", "1");
  });
  await page.setViewportSize({ width: 1672, height: 941 });

  await page.goto(`/dashboard-editor?source=favorites&asset=${asset.id}`);
  await expect(page.getByRole("combobox", { name: "结果表" })).toHaveValue("revenue");
  await expect(page.getByText("3 行", { exact: true })).toBeVisible();
  const addButton = page.getByRole("button", { name: "添加图表", exact: true });
  await expect(addButton).toBeEnabled();
  await addButton.click();

  const cards = page.locator(".dashboard-widget-card");
  await expect(cards).toHaveCount(1);
  await expect(cards.first().getByText("今年每月收入趋势", { exact: true })).toBeVisible();
  await expect(page.getByText("固定版本", { exact: true })).toBeVisible();
  await expect(page.locator(".vue-echart[data-echarts-ready='true'] canvas")).toHaveCount(1);
  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/dashboard-favorite-empty-first-output-1672x941.png",
    animations: "disabled",
    fullPage: true
  });

  const titleField = page.locator(".property-field").filter({ hasText: "标题" }).locator("input");
  await titleField.fill("经营收入月度趋势");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("status", { name: "草稿已就绪" })).toBeVisible();

  const stored = fixture.getRecord();
  expect(stored).not.toBeNull();
  expect(stored!.schema.widgets).toHaveLength(1);
  expect(Object.values(stored!.schema.modules ?? {})).toHaveLength(1);
  expect(Object.values(stored!.schema.modules ?? {})[0]?.widgetIds).toEqual([
    stored!.schema.widgets[0].id
  ]);
  expect(Object.values(stored!.schema.dataBindings)[0]?.table.rows).toEqual([]);

  const editorUrl = page.url();
  await page.reload();
  await expect(page).toHaveURL(editorUrl);
  await expect(page.locator(".dashboard-widget-card")).toHaveCount(1);
  await expect(
    page.locator(".dashboard-widget-card").first().getByText("经营收入月度趋势", { exact: true })
  ).toBeVisible();

  const cardBox = await page.locator(".dashboard-widget-card").first().boundingBox();
  const canvasBox = await page.locator(".designer-canvas").boundingBox();
  expect(cardBox).not.toBeNull();
  expect(canvasBox).not.toBeNull();
  expect(cardBox!.x).toBeGreaterThanOrEqual(canvasBox!.x);
  expect(cardBox!.y).toBeGreaterThanOrEqual(canvasBox!.y);
  expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(canvasBox!.x + canvasBox!.width + 1);
  expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(canvasBox!.y + canvasBox!.height + 1);
});

test("switching chart family and favorite binding keeps ECharts populated", async ({ page }) => {
  const fixture = await installApiFixture(page);
  await page.addInitScript(() => {
    const user = {
      token: "playwright-switch-chart-token",
      userId: 1,
      username: "张三",
      isAdmin: true
    };
    window.localStorage.setItem("xingshu_datahub_token", user.token);
    window.localStorage.setItem("xingshu_datahub_user", JSON.stringify(user));
    window.localStorage.setItem("xingshu_datahub_space_id", "1");
  });
  await page.setViewportSize({ width: 1920, height: 1080 });

  await page.goto(`/dashboard-editor?source=favorites&asset=${asset.id}`);
  await page.getByRole("combobox", { name: "结果表" }).selectOption("revenue");
  await page.getByRole("button", { name: "添加图表", exact: true }).click();
  await expect(page.locator(".dashboard-widget-card")).toHaveCount(1);
  await expect(page.locator(".vue-echart[data-echarts-ready='true']")).toHaveCount(1);

  const piePreset = page.getByRole("button", { name: "饼图: 环形占比" });
  await piePreset.click();
  await expect(piePreset).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "饼图", exact: true })).toBeVisible();
  await expect(page.locator(".vue-echart[data-echarts-ready='true']")).toHaveCount(1);
  await expect(page.getByText(/当前结果缺少可绘制的数值指标/)).toHaveCount(0);

  await page.getByRole("button", { name: /合同公司金额.*2023年各公司合同金额/ }).click();
  const addContractButton = page.getByRole("button", { name: "添加图表", exact: true });
  await expect(addContractButton).toBeEnabled();
  await addContractButton.click();
  await expect(page.locator(".dashboard-widget-card")).toHaveCount(2);
  await expect(page.locator(".vue-echart[data-echarts-ready='true']")).toHaveCount(2);

  await page.getByRole("button", { name: "饼图", exact: true }).click();
  const bindingSelect = page.getByRole("combobox", { name: "绑定" });
  await bindingSelect.selectOption({ label: contractAsset.name });
  await expect(bindingSelect).toHaveValue(/binding-/);
  await expect(page.getByRole("combobox", { name: "维度" })).toHaveValue("company-id");
  await expect(
    page.getByRole("listbox", { name: "指标" }).locator("option:checked")
  ).toHaveText("合同值");
  await expect(
    page.getByRole("button", { name: "饼图", exact: true })
      .locator(".vue-echart[data-echarts-ready='true']")
  ).toHaveCount(1);

  const linePreset = page.getByRole("button", { name: "折线图: 平滑折线" });
  await linePreset.click();
  await expect(linePreset).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "折线图", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "折线图", exact: true })
      .locator(".vue-echart[data-echarts-ready='true']")
  ).toHaveCount(1);
  await expect(page.getByText(/当前结果缺少可绘制的数值指标/)).toHaveCount(0);

  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("status", { name: "草稿已就绪" })).toBeVisible();

  const stored = fixture.getRecord();
  expect(stored).not.toBeNull();
  const switchedWidget = stored!.schema.widgets.find(
    (widget) => widget.type === "line" && widget.title === asset.resolvedQuestion
  );
  expect(switchedWidget?.bindingId).toBeTruthy();
  expect(switchedWidget?.moduleId).toBeTruthy();
  expect(switchedWidget?.mapping.dimensionColumnId).toBe("company-id");
  expect(switchedWidget?.mapping.metricColumnIds).toEqual(["contract-value-id"]);

  const switchedModule = stored!.schema.modules?.[switchedWidget!.moduleId!];
  expect(switchedModule?.bindingId).toBe(switchedWidget?.bindingId);
  expect(switchedModule?.source).toMatchObject({
    assetId: contractAsset.id,
    queryVersionId: contractAsset.stableVersionId,
    outputKey: "contracts"
  });

  await page.reload();
  await expect(page.locator(".dashboard-widget-card")).toHaveCount(2);
  await expect(page.locator(".vue-echart[data-echarts-ready='true']")).toHaveCount(2);
  await page.getByRole("button", { name: "折线图", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "绑定" })).toHaveValue(
    switchedWidget!.bindingId!
  );
  await expect(page.getByRole("combobox", { name: "维度" })).toHaveValue("company-id");
  await expect(
    page.getByRole("listbox", { name: "指标" }).locator("option:checked")
  ).toHaveText("合同值");
  await expect(
    page.getByRole("button", { name: "折线图", exact: true })
      .locator(".vue-echart[data-echarts-ready='true']")
  ).toHaveCount(1);
});
