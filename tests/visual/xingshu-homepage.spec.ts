import { expect, type Page, type Route, test } from "@playwright/test";

type AnalyticsRecord = {
  id: string;
  status: "draft" | "published";
  revision: number;
  visibility: "PRIVATE" | "SPACE";
  schema: Record<string, unknown>;
  publishedSchema?: Record<string, unknown>;
  versions: unknown[];
  createdAt: string;
  updatedAt: string;
};

type AnalyticsFixtureState = {
  records: Map<string, AnalyticsRecord>;
};

const analyticsFixtures = new WeakMap<Page, AnalyticsFixtureState>();

function analyticsResponse(data: unknown) {
  return { code: 200, message: "visual analytics fixture", data };
}

const knowledgeBaseFixtures = [
  {
    id: "kb-policy",
    title: "企业制度知识库",
    description: "合同、制度、报告统一入库",
    doc_count: 48,
    updated_at: "今日 13:42"
  },
  {
    id: "kb-legal",
    title: "合同法务知识库",
    description: "支持问答、写作与分析引用",
    doc_count: 22,
    updated_at: "今日 11:26"
  },
  {
    id: "kb-hr",
    title: "人力资源知识库",
    description: "按部门空间隔离资料范围",
    doc_count: 19,
    updated_at: "昨日 17:08"
  }
];

const knowledgeDocumentFixtures = [
  {
    doc_id: "doc-policy-1",
    doc_name: "合同管理办法.pdf",
    doc_key: "contract-policy.pdf",
    doc_status: "indexed",
    size: 2_355_200,
    chunk_count: 128,
    markdown_available: true
  },
  {
    doc_id: "doc-policy-2",
    doc_name: "2026 年度采购制度.docx",
    doc_key: "purchase-policy.docx",
    doc_status: "parsing",
    size: 486_400
  },
  {
    doc_id: "doc-policy-3",
    doc_name: "供应商准入标准.xlsx",
    doc_key: "supplier-standard.xlsx",
    doc_status: "uploaded",
    size: 132_096
  },
  {
    doc_id: "doc-policy-4",
    doc_name: "历史归档说明.txt",
    doc_key: "archive-note.txt",
    doc_status: "failed",
    size: 4_096,
    message: "解析失败，请重新上传"
  }
];

const dataAssetOverviewFixture = {
  updatedAt: "2026-08-11T08:00:00Z",
  range: "30D",
  kpis: {
    assetCount: 6,
    dataVolumeBytes: 7_516_192_768,
    unstructuredCount: 2,
    tableCount: 4,
    dataSourceCount: 2,
    serviceCallCount: 8
  },
  typeDistribution: [
    { type: "STRUCTURED", count: 4 },
    { type: "DOCUMENT", count: 2 }
  ],
  growth: [
    { date: "2026-08-10", assetCount: 5, dataVolumeBytes: 6_442_450_944 },
    { date: "2026-08-11", assetCount: 6, dataVolumeBytes: 7_516_192_768 }
  ],
  sourceDistribution: [
    { type: "DATABASE", count: 1 },
    { type: "EXCEL", count: 1 }
  ],
  usageByScenario: [
    { scenario: "ASK_DATA", count: 5 },
    { scenario: "OFFICIAL_DOCUMENT", count: 3 }
  ],
  hotAssets: [
    { assetId: "asset-1", assetName: "客户订单表", assetType: "STRUCTURED", callCount: 5 },
    { assetId: "asset-2", assetName: "月报文档", assetType: "DOCUMENT", callCount: 3 }
  ]
};

async function fulfillAnalyticsRoute(page: Page, route: Route) {
  const state = analyticsFixtures.get(page)!;
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;

  if (path === "/api/analytics/data-assets/overview" && request.method() === "GET") {
    await route.fulfill({
      json: analyticsResponse({ ...dataAssetOverviewFixture, range: url.searchParams.get("range") ?? "30D" })
    });
    return;
  }

  if (path === "/api/analytics/dashboards" && request.method() === "GET") {
    await route.fulfill({ json: analyticsResponse(Array.from(state.records.values())) });
    return;
  }

  if (path === "/api/analytics/dashboards/save" && request.method() === "POST") {
    const body = request.postDataJSON() as { id: string; schema: Record<string, unknown>; visibility?: "PRIVATE" | "SPACE" };
    const existing = state.records.get(body.id);
    const now = new Date().toISOString();
    const record: AnalyticsRecord = {
      id: body.id,
      status: "draft",
      revision: existing ? existing.revision + 1 : 1,
      visibility: body.visibility ?? existing?.visibility ?? "PRIVATE",
      schema: body.schema,
      publishedSchema: existing?.publishedSchema,
      versions: existing?.versions ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    state.records.set(record.id, record);
    await route.fulfill({ json: analyticsResponse(record) });
    return;
  }

  const detailMatch = path.match(/^\/api\/analytics\/dashboards\/([^/]+)\/(editor-data|runtime|publish)$/);
  if (detailMatch) {
    const id = decodeURIComponent(detailMatch[1]);
    const action = detailMatch[2];
    const record = state.records.get(id);
    if (!record) {
      await route.fulfill({ json: { code: 404, message: "fixture dashboard not found", data: null } });
      return;
    }
    if (action === "publish") {
      record.status = "published";
      record.revision += 1;
      record.publishedSchema = structuredClone(record.schema);
      record.updatedAt = new Date().toISOString();
      await route.fulfill({ json: analyticsResponse(record) });
      return;
    }
    await route.fulfill({
      json: analyticsResponse({
        record,
        datasets: {},
        moduleStatuses: {}
      })
    });
    return;
  }

  if (path.startsWith("/api/analytics/query-assets")) {
    await route.fulfill({ json: analyticsResponse([]) });
    return;
  }

  await route.fulfill({ json: analyticsResponse([]) });
}

test.beforeEach(async ({ page }) => {
  analyticsFixtures.set(page, { records: new Map() });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/ai/rag/kbs") {
      await route.fulfill({ json: { kbs: knowledgeBaseFixtures } });
      return;
    }
    if (path === "/api/ai/rag/kb/documents" || path === "/api/ai/rag/kb/files") {
      await route.fulfill({ json: { files: knowledgeDocumentFixtures } });
      return;
    }
    if (path.startsWith("/api/analytics/")) {
      await fulfillAnalyticsRoute(page, route);
      return;
    }
    if (path === "/api/v1/chat/sessions/list") {
      await route.fulfill({
        json: {
          code: 200,
          message: "visual test fixture",
          data: [
            {
              sessionId: "ask-table-sales-ranking",
              title: "客户销售排行榜表",
              createdAt: "2026-08-14T10:00:00",
              updatedAt: "2026-08-17T10:00:00"
            },
            {
              sessionId: "ask-table-department-contacts",
              title: "各部门人员通讯录",
              createdAt: "2026-08-13T10:00:00",
              updatedAt: "2026-08-16T10:00:00"
            },
            {
              sessionId: "ask-table-monthly-expense",
              title: "月度费用统计报表",
              createdAt: "2026-08-12T10:00:00",
              updatedAt: "2026-08-15T10:00:00"
            },
            {
              sessionId: "ask-table-inventory-daily",
              title: "库存表——日用百货",
              createdAt: "2026-08-11T10:00:00",
              updatedAt: "2026-08-14T10:00:00"
            }
          ]
        },
        status: 200
      });
      return;
    }
    if (path === "/api/v1/chat/messages/list" && route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { sessionId?: string };
      await route.fulfill({
        json: {
          code: 200,
          message: "visual test fixture",
          data: [
            {
              id: 1,
              sessionId: body.sessionId,
              chatId: "chat-restore-1",
              role: "user",
              content: "客户销售排行榜表",
              seqNum: 1,
              createdAt: "2026-08-17T10:00:00"
            }
          ]
        },
        status: 200
      });
      return;
    }
    if (path === "/api/v1/chat/events/list" && route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { sessionId?: string };
      await route.fulfill({
        json: {
          code: 200,
          message: "visual test fixture",
          data: [
            {
              id: 1,
              sessionId: body.sessionId,
              chatId: "chat-restore-1",
              type: "table",
              data: {
                columns: [
                  { name: "region", title: "区域" },
                  { name: "customer", title: "客户" },
                  { name: "sales", title: "销售额", type: "number" }
                ],
                rows: [
                  { region: "华东", customer: "星海实业", sales: 1280 },
                  { region: "华东", customer: "临港贸易", sales: 960 }
                ],
                totalRows: 2,
                source: "cube",
                groupLabel: "客户销售排行榜表"
              },
              seqNum: 2,
              createdAt: "2026-08-17T10:00:01"
            }
          ]
        },
        status: 200
      });
      return;
    }
    await route.fulfill({
      json: { code: 200, message: "visual test fixture", data: [] },
      status: 200
    });
  });

  await page.addInitScript(() => {
    const publicRoutes = ["/login", "/welcome"];

    if (publicRoutes.includes(window.location.pathname)) {
      window.localStorage.removeItem("xingshu_datahub_token");
      window.localStorage.removeItem("xingshu_datahub_user");
      window.localStorage.removeItem("xingshu_datahub_space_id");
      return;
    }

    const user = {
      token: "playwright-visual-token",
      userId: 1,
      username: "张三",
      isAdmin: true
    };
    window.localStorage.setItem("xingshu_datahub_token", user.token);
    window.localStorage.setItem("xingshu_datahub_user", JSON.stringify(user));
    window.localStorage.setItem("xingshu_datahub_space_id", "1");
    window.localStorage.setItem("xingshu_onboarding_v1", "done");
    window.localStorage.setItem("xingshu_dashboard_onboarding_v2:1", "done");
  });
});

const viewports = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1672x941", width: 1672, height: 941 },
  { name: "2200x944", width: 2200, height: 944 },
  { name: "390x844", width: 390, height: 844 }
];

const welcomeViewports = [
  ...viewports,
  { name: "2560x1440", width: 2560, height: 1440 }
];

type SmokePage = {
  slug: string;
  path: string;
  heading?: string;
  region?: string;
  readyText?: string;
  shell?: boolean;
  charts: number;
};

const pages: SmokePage[] = [
  { slug: "login", path: "/login", heading: "登录星数", shell: false, charts: 0 },
  { slug: "home", path: "/", heading: "您好，张三", charts: 0 },
  { slug: "analysis", path: "/analysis", region: "星数命令输入区", charts: 0 },
  { slug: "ask-data", path: "/ask-data", heading: "从一个经营问题开始", charts: 0 },
  { slug: "ask-knowledge", path: "/ask-knowledge", heading: "从一个企业知识问题开始", charts: 0 },
  { slug: "history", path: "/history", heading: "历史对话", readyText: "还没有历史对话", charts: 0 },
  { slug: "table", path: "/table", heading: "智能制表", charts: 0 },
  { slug: "writing", path: "/writing", heading: "公文写作", charts: 0, shell: false },
  { slug: "dashboard", path: "/dashboard", heading: "大屏库", readyText: "暂无大屏", charts: 0 },
  { slug: "cloud", path: "/cloud", heading: "我的云盘", readyText: "企业制度知识库", charts: 0 },
  { slug: "data-dashboard", path: "/data-dashboard", heading: "数据资产看板", charts: 4 },
  {
    slug: "data-management",
    path: "/data-management",
    heading: "数据资产管理",
    readyText: "财务审计知识库",
    charts: 0
  }
];

async function settleResponsiveLayout(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    });
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth
  }));

  expect(Math.max(overflow.body, overflow.document)).toBeLessThanOrEqual(overflow.viewport + 1);
}

async function ensureChartsReady(page: Page, expectedCount: number) {
  const chartHosts = page.locator('[role="img"].xs-echart, [role="img"].vue-echart');
  await expect(chartHosts).toHaveCount(expectedCount);

  for (let index = 0; index < expectedCount; index += 1) {
    const chartHost = chartHosts.nth(index);
    await chartHost.scrollIntoViewIfNeeded();
    await expect
      .poll(() => chartHost.evaluate((element) =>
        element.dataset.echartsReady === "true" ||
        Boolean(element.querySelector('[data-echarts-ready="true"]'))
      ))
      .toBe(true);
  }

  await expect(page.locator('[data-echarts-ready="true"]')).toHaveCount(expectedCount);
}

async function expectReducedMotionStatic(page: Page) {
  const motionViolations = await page.locator("body *").evaluateAll((elements) => {
    const toSeconds = (value: string) => {
      const trimmed = value.trim();
      const amount = Number.parseFloat(trimmed);
      return Number.isFinite(amount) ? amount * (trimmed.endsWith("ms") ? 0.001 : 1) : 0;
    };

    return elements.flatMap((element) => {
      if (element.getClientRects().length === 0) {
        return [];
      }
      const styles = window.getComputedStyle(element);
      const animationDurations = styles.animationDuration.split(",").map(toSeconds);
      const transitionDurations = styles.transitionDuration.split(",").map(toSeconds);
      const hasFiniteAnimation =
        styles.animationName !== "none" && Math.max(0, ...animationDurations) > 0.001;
      const hasTransition =
        styles.transitionProperty !== "none" && Math.max(0, ...transitionDurations) > 0.001;
      const hasInfiniteAnimation = styles.animationIterationCount.split(",").includes("infinite");

      if (!hasFiniteAnimation && !hasTransition && !hasInfiniteAnimation) {
        return [];
      }

      return [
        {
          animationDuration: styles.animationDuration,
          animationIterationCount: styles.animationIterationCount,
          animationName: styles.animationName,
          element: `${element.tagName.toLowerCase()}.${Array.from(element.classList).join(".")}`,
          transitionDuration: styles.transitionDuration,
          transitionProperty: styles.transitionProperty
        }
      ];
    });
  });

  expect(motionViolations).toEqual([]);
  expect(
    await page.locator("html").evaluate((element) => window.getComputedStyle(element).scrollBehavior)
  ).not.toBe("smooth");
}

test.describe("xingshu page visual smoke", () => {
  for (const pageCase of pages) {
    for (const viewport of viewports) {
      test(`renders ${pageCase.slug} at ${viewport.name}`, async ({ page }) => {
        const runtimeErrors: string[] = [];
        page.on("console", (message) => {
          if (message.type() === "error") {
            runtimeErrors.push(message.text());
          }
        });
        page.on("pageerror", (error) => runtimeErrors.push(error.message));

        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(pageCase.path);

        if (pageCase.heading) {
          await expect(page.getByRole("heading", { name: pageCase.heading }).first()).toBeVisible();
        }
        if (pageCase.region) {
          await expect(page.getByRole("region", { name: pageCase.region }).first()).toBeVisible();
        }
        if (pageCase.readyText) {
          await expect(page.getByText(pageCase.readyText, { exact: false }).first()).toBeVisible();
        }
        if (pageCase.slug === "home") {
          await expect(
            page.getByRole("button", { name: "选择模型，当前编排模型" })
          ).toBeVisible();
        }
        if (pageCase.slug === "login" && viewport.width >= 1024) {
          await expect(page.locator(".xs-ask-demo")).toBeVisible();
        }
        if (pageCase.slug === "analysis") {
          await expect(
            page.getByRole("button", { name: "选择模型，当前编排模型" })
          ).toBeVisible();
        }
        if (pageCase.slug === "ask-data") {
          await expect(
            page.getByRole("button", { name: "选择模型，当前问数模型" })
          ).toBeVisible();
        }
        if (pageCase.slug === "ask-knowledge") {
          await expect(
            page.getByRole("button", { name: "选择模型，当前问知模型" })
          ).toBeVisible();
        }

        if (pageCase.shell !== false && viewport.width > 900) {
          await expect(page.getByRole("navigation", { name: "星数主导航" })).toBeVisible();
        }
        if (pageCase.shell !== false && viewport.width <= 900) {
          await expect(page.getByRole("button", { name: "打开主导航" })).toBeVisible();
        }
        if (pageCase.charts > 0) {
          await ensureChartsReady(page, pageCase.charts);
          await expect(page.locator('[data-echarts-renderer="canvas"]')).toHaveCount(pageCase.charts);
        }

        await settleResponsiveLayout(page);
        await expectNoHorizontalOverflow(page);

        await page.screenshot({
          path: `outputs/xingshu-homepage-system/qa/react/${pageCase.slug}-react-${viewport.name}.png`,
          animations: "disabled",
          fullPage: true
        });
        expect(runtimeErrors).toEqual([]);
      });
    }
  }
});

test("keeps cloud knowledge-base card content comfortably separated", async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1672, height: 941 },
    { width: 2200, height: 944 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/cloud");
    await expect(page.getByRole("heading", { name: "我的云盘", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "知识库：企业制度知识库" })).toBeVisible();
    await settleResponsiveLayout(page);

    const cards = page.locator(".cloud-kb-card");
    await expect(cards).toHaveCount(3);

    const metrics = await cards.evaluateAll((elements) => elements.map((element) => {
      const cardRect = element.getBoundingClientRect();
      const iconRect = element.querySelector(".xs-icon-tile")!.getBoundingClientRect();
      const bodyRect = element.querySelector(".cloud-kb-card__heading")!.getBoundingClientRect();
      const headingRect = element.querySelector(".cloud-kb-card__heading h2")!.getBoundingClientRect();
      const descriptionRect = element.querySelector(".cloud-kb-card__heading p")!.getBoundingClientRect();
      const footRect = element.querySelector(".cloud-kb-card__foot")!.getBoundingClientRect();

      return {
        cardHeight: cardRect.height,
        iconBodyGap: bodyRect.left - iconRect.right,
        headingDescriptionGap: descriptionRect.top - headingRect.bottom,
        footBottomGap: cardRect.bottom - footRect.bottom
      };
    }));

    for (const metric of metrics) {
      expect(metric.cardHeight).toBeGreaterThanOrEqual(180);
      expect(metric.iconBodyGap).toBeGreaterThanOrEqual(14);
      expect(metric.headingDescriptionGap).toBeGreaterThanOrEqual(6);
      expect(metric.footBottomGap).toBeGreaterThanOrEqual(16);
    }
  }
});

test("switches the cloud drive between card and list views", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/cloud");
  await expect(page.getByRole("link", { name: "知识库：企业制度知识库" })).toBeVisible();
  await settleResponsiveLayout(page);

  await expect(page.locator(".cloud-kb-card")).toHaveCount(3);
  await page.locator(".cloud-toolbar__view").getByText("列表").click();
  await expect(page.locator(".cloud-kb-row")).toHaveCount(3);
  await expect(page.locator(".cloud-kb-card")).toHaveCount(0);
  await settleResponsiveLayout(page);
  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/cloud-list-react-1440x900.png",
    animations: "disabled",
    fullPage: true
  });

  await page.getByLabel("知识库搜索").fill("法务");
  await expect(page.locator(".cloud-kb-row")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "知识库：合同法务知识库" })).toBeVisible();
});

test("fills the smart table composer from a recent template", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/table");
  await expect(page.getByRole("heading", { name: "智能制表", level: 1 })).toBeVisible();

  const template = page.getByRole("article", { name: /客户销售排行榜表/ });
  await template.getByRole("button", { name: "复制制表要求" }).click();

  await expect(page.getByRole("textbox", { name: "制表需求" }))
    .toHaveValue("客户销售排行榜表");
  await expect(page.getByRole("button", { name: "生成表格" })).toBeEnabled();
  await settleResponsiveLayout(page);
  await expectNoHorizontalOverflow(page);

  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/table-filled-react-1440x900.png",
    animations: "disabled",
    fullPage: true
  });
});

test("restores a recent table into the table agent workspace", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/table");
  await expect(page.getByRole("heading", { name: "智能制表", level: 1 })).toBeVisible();

  await page.getByRole("link", { name: "打开制表结果：客户销售排行榜表" }).click();

  await expect(page.getByRole("heading", { name: "问表智能体", level: 1 })).toBeVisible();
  await expect(page.getByText("客户销售排行榜表").first()).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "客户" })).toBeVisible();
  await expect(page.getByText("星海实业")).toBeVisible();
  await settleResponsiveLayout(page);
  await expectNoHorizontalOverflow(page);

  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/table-session-react-1440x900.png",
    animations: "disabled",
    fullPage: true
  });
});

test("renders a generated table result on the workbench", async ({ page }) => {
  const captured: { request: { chatMode?: string; sessionId?: string; globalSessionId?: string; chatId?: string } | null } = {
    request: null
  };
  await page.route("**/api/agentScore/chat/completions/stream", async (route) => {
    captured.request = route.request().postDataJSON() as {
      chatMode?: string;
      sessionId?: string;
      globalSessionId?: string;
      chatId?: string;
    };
    const body = captured.request;
    const root = {
      agentName: "问数智能体",
      sessionId: body.sessionId,
      globalSessionId: body.globalSessionId,
      chatId: body.chatId
    };
    const sse = (event: Record<string, unknown>) => `data: ${JSON.stringify(event)}\n\n`;
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      headers: {
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      },
      body: [
        sse({
          ...root,
          type: "data_source_selected",
          content: { datasourceId: 8, datasourceName: "经营分析库" },
          finished: false
        }),
        sse({
          ...root,
          type: "text",
          content: "已按华东区 Q1 口径汇总销售排行。",
          finished: false
        }),
        sse({
          ...root,
          type: "table",
          content: {
            columns: [
              { name: "region", title: "区域" },
              { name: "customer", title: "客户" },
              { name: "sales", title: "销售额", type: "number" }
            ],
            rows: [
              { region: "华东", customer: "星海实业", sales: 1280 },
              { region: "华东", customer: "临港贸易", sales: 960 }
            ],
            totalRows: 2,
            source: "cube",
            groupLabel: "华东区 Q1 销售排行"
          },
          finished: false
        }),
        sse({
          ...root,
          type: "done",
          content: { mode: "ask" },
          finished: true
        }),
        "data: [DONE]\n\n"
      ].join("")
    });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/table");
  await expect(page.getByRole("heading", { name: "智能制表", level: 1 })).toBeVisible();

  await page.getByRole("textbox", { name: "制表需求" }).fill("华东区Q1销售排行");
  await page.getByRole("button", { name: "生成表格" }).click();

  await expect(page.getByRole("heading", { name: "问表智能体", level: 1 })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "客户" })).toBeVisible();
  expect(captured.request?.chatMode).toBe("ask_table");
  expect(captured.request?.sessionId).toMatch(/^ask-table-/);
  await expect(page.getByText("星海实业")).toBeVisible();
  await expect(page.getByRole("button", { name: "导出结果" })).toBeVisible();
  await settleResponsiveLayout(page);
  await expectNoHorizontalOverflow(page);

  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/table-result-react-1440x900.png",
    animations: "disabled",
    fullPage: true
  });
});

test("renders the knowledge-base document table with parse status", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/cloud");
  await page.getByRole("link", { name: "知识库：企业制度知识库" }).click();

  await expect(page.getByRole("heading", { name: "企业制度知识库", level: 1 })).toBeVisible();
  await expect(page.locator(".cloud-doc-row")).toHaveCount(4);
  await expect(page.getByText("已入库")).toBeVisible();
  await settleResponsiveLayout(page);
  await expectNoHorizontalOverflow(page);

  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/cloud-detail-react-1440x900.png",
    animations: "disabled",
    fullPage: true
  });
});

test.describe("login desktop viewport lock", () => {
  for (const viewport of [
    { name: "1366x768", width: 1366, height: 768 },
    { name: "1440x900", width: 1440, height: 900 },
    { name: "1920x1080", width: 1920, height: 1080 }
  ]) {
    test(`keeps login within ${viewport.name} without scrollbars`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/login");
      await expect(page.getByRole("heading", { name: "登录星数" })).toBeVisible();
      await settleResponsiveLayout(page);

      const dimensions = await page.evaluate(() => ({
        clientHeight: document.documentElement.clientHeight,
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth
      }));

      expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.clientHeight);
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    });
  }
});

test.describe("dashboard editor Vue island", () => {
  for (const viewport of viewports) {
    test(`renders the internal designer at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/dashboard-editor");

      await expect(page.getByRole("heading", { name: "看板编辑器" })).toBeVisible();
      await expect(page.getByRole("region", { name: "星数大屏设计器" })).toBeVisible();
      await expect(page.getByRole("textbox", { name: "大屏名称" })).toHaveValue("未命名大屏");
      await expect(page.getByText("1920 × 1080", { exact: true }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "放大" })).toBeVisible();
      await expect(page.getByRole("combobox", { name: "缩放" })).toBeVisible();
      await expect(page.getByRole("button", { name: "保存" })).toBeVisible();
      await expect(page.getByRole("button", { name: "发布" })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "星数主导航" })).toHaveCount(0);
      await expect(page.locator("iframe")).toHaveCount(0);
      await expect(page.locator('[data-echarts-ready="true"]')).toHaveCount(0);
      await settleResponsiveLayout(page);
      await expectNoHorizontalOverflow(page);

      await page.screenshot({
        path: `outputs/xingshu-homepage-system/qa/react/dashboard-editor-vue-react-${viewport.name}.png`,
        animations: "disabled",
        fullPage: true
      });
    });
  }
});

test("dashboard widgets follow pointer drag and snap to the grid", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/dashboard-editor");
  await page.getByRole("button", { name: /指标卡 320 × 180/ }).click();

  const card = page.locator("article.dashboard-widget-card").filter({ hasText: "核心指标" });
  const bounds = await card.boundingBox();
  expect(bounds).not.toBeNull();

  const startX = bounds!.x + bounds!.width / 2;
  const startY = bounds!.y + bounds!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 360, startY, { steps: 8 });
  await expect(card).toHaveClass(/is-dragging/);
  await page.mouse.up();

  await expect(page.getByRole("spinbutton", { name: "X" })).not.toHaveValue("0");
  await expect(card).not.toHaveClass(/is-dragging/);
});

test("dashboard widgets resize from the selected lower-right handle", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/dashboard-editor");
  await page.getByRole("button", { name: /指标卡 320 × 180/ }).click();

  const resizeHandle = page.getByRole("button", { name: "调整组件大小" });
  const bounds = await resizeHandle.boundingBox();
  expect(bounds).not.toBeNull();

  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 260, bounds!.y + 170, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByRole("spinbutton", { name: "W" })).not.toHaveValue("320");
  await expect(page.getByRole("spinbutton", { name: "H" })).not.toHaveValue("180");
});

test("dashboard viewing uses true fullscreen chrome", async ({ page }) => {
  const timestamp = "2026-07-10T08:00:00.000Z";
  const schema = {
    schemaVersion: 1,
    id: "dashboard-visual-fullscreen",
    title: "经营全景大屏",
    description: "全屏浏览视觉用例",
    canvas: { width: 1920, height: 1080, columns: 12, rows: 10, background: "#F5F9FF" },
    source: { kind: "blank", generatedAt: timestamp, plannerVersion: 1 },
    dataBindings: {},
    widgets: [
      {
        id: "widget-title",
        type: "text",
        title: "可信经营洞察",
        content: "关键经营指标保持稳定。",
        mapping: {},
        position: { x: 0, y: 0, w: 12, h: 1 },
        style: { accent: "#00C2FF", background: "#F8FBFF" }
      },
      {
        id: "widget-metric",
        type: "metric",
        title: "营收指标",
        mapping: {},
        position: { x: 0, y: 1, w: 3, h: 2 },
        style: { accent: "#1677FF", background: "#FFFFFF" }
      }
    ],
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const state = analyticsFixtures.get(page)!;
  state.records.set(schema.id, {
    id: schema.id,
    status: "published",
    revision: 1,
    visibility: "PRIVATE",
    schema,
    publishedSchema: structuredClone(schema),
    versions: [],
    createdAt: timestamp,
    updatedAt: timestamp
  });

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/dashboard-view?dashboard=dashboard-visual-fullscreen");

  await expect(page.getByRole("main", { name: "大屏运行态" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "星数主导航" })).toHaveCount(0);
  await expect(page.locator(".runtime-header")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "返回大屏库" })).toBeVisible();
  await expect(page.getByRole("button", { name: "刷新" })).toBeVisible();
  await expect(page.getByText(/最近更新/)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expect(page.locator("html")).toHaveJSProperty("scrollHeight", 768);

  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/dashboard-view-fullscreen-1366x768.png",
    animations: "disabled"
  });
});

test("2K dashboard preview does not expose black side bars", async ({ page }) => {
  const timestamp = "2026-07-30T08:00:00.000Z";
  const schema = {
    schemaVersion: 1,
    id: "dashboard-visual-2k-edge-fill",
    title: "2K 经营全景大屏",
    description: "2K 预览边缘填充回归用例",
    canvas: { width: 2560, height: 1440, columns: 12, rows: 10, background: "#F5F9FF" },
    source: { kind: "blank", generatedAt: timestamp, plannerVersion: 1 },
    dataBindings: {},
    widgets: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const state = analyticsFixtures.get(page)!;
  state.records.set(schema.id, {
    id: schema.id,
    status: "published",
    revision: 1,
    visibility: "PRIVATE",
    schema,
    publishedSchema: structuredClone(schema),
    versions: [],
    createdAt: timestamp,
    updatedAt: timestamp
  });

  await page.setViewportSize({ width: 2048, height: 1024 });
  await page.goto("/dashboard-view?dashboard=dashboard-visual-2k-edge-fill");
  await expect(page.getByRole("main", { name: "大屏运行态" })).toBeVisible();

  const geometry = await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>(".runtime-canvas-viewport")!.getBoundingClientRect();
    const stage = document.querySelector<HTMLElement>(".runtime-canvas-stage")!.getBoundingClientRect();
    return {
      stageAspectRatio: stage.width / stage.height,
      horizontalGutter: viewport.width - stage.width
    };
  });
  const edgeLuminance = await page.evaluate(() => {
    const colorLuminance = (color: string) => {
      const match = color.match(
        /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/
      );
      if (!match) return null;
      const alpha = match[4] === undefined ? 1 : Number(match[4]);
      if (alpha < 0.99) return null;
      const red = Number(match[1]);
      const green = Number(match[2]);
      const blue = Number(match[3]);
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };

    const renderedLuminanceAt = (x: number, y: number) => {
      for (const element of document.elementsFromPoint(x, y)) {
        const styles = window.getComputedStyle(element);
        const gradientColors = Array.from(styles.backgroundImage.matchAll(/rgba?\([^)]+\)/g))
          .map((match) => colorLuminance(match[0]))
          .filter((value): value is number => value !== null);
        if (gradientColors.length > 0) return Math.min(...gradientColors);
        const backgroundLuminance = colorLuminance(styles.backgroundColor);
        if (backgroundLuminance !== null) return backgroundLuminance;
      }
      return 0;
    };

    return {
      left: renderedLuminanceAt(1, window.innerHeight / 2),
      right: renderedLuminanceAt(window.innerWidth - 2, window.innerHeight / 2)
    };
  });

  expect(geometry.stageAspectRatio).toBeCloseTo(16 / 9, 3);
  expect(geometry.horizontalGutter).toBeGreaterThan(100);
  expect(edgeLuminance.left).toBeGreaterThan(80);
  expect(edgeLuminance.right).toBeGreaterThan(80);
  await expect(page.locator(".runtime-canvas-viewport")).toHaveCSS("background-image", /url\(/);
  await expect(page.locator(".runtime-canvas")).toHaveCSS("background-image", "none");
  await expect(page.locator(".runtime-canvas")).toHaveCSS("box-shadow", "none");
});

for (const viewport of viewports) {
  test(`dashboard ECharts stays inside its module at ${viewport.name}`, async ({ page }) => {
    const timestamp = "2026-07-22T08:00:00.000Z";
    const id = `dashboard-chart-boundary-${viewport.name}`;
    const schema = {
      schemaVersion: 2,
      id,
      title: "月度销售收入趋势",
      description: "由收藏问数的真实字段绑定生成。",
      canvas: {
        width: 1920,
        height: 1080,
        columns: 12,
        rows: 8,
        background: "#EFF4FB",
        scaleMode: "fit-screen"
      },
      source: {
        kind: "ask-data",
        question: "今年每月销售收入如何变化？",
        generatedAt: timestamp,
        plannerVersion: 2
      },
      dataBindings: {
        "binding-sales": {
          id: "binding-sales",
          label: "月度销售收入",
          mode: "live",
          queryAssetId: "asset-sales",
          queryVersionId: "version-sales-v1",
          outputKey: "monthly-sales",
          status: "success",
          table: {
            columns: [
              { columnId: "month-col", key: "month", title: "月份", type: "date" },
              { columnId: "revenue-col", key: "revenue", title: "销售收入（万元）", type: "decimal" }
            ],
            rows: [
              { month: "2026-01", revenue: 320 },
              { month: "2026-02", revenue: 410 },
              { month: "2026-03", revenue: 480 },
              { month: "2026-04", revenue: 530 },
              { month: "2026-05", revenue: 590 },
              { month: "2026-06", revenue: 680 }
            ],
            totalRows: 6
          }
        }
      },
      widgets: [
        {
          id: "widget-sales-line",
          type: "line",
          title: "今年每月销售收入趋势",
          bindingId: "binding-sales",
          mapping: {
            dimensionColumnId: "month-col",
            metricColumnIds: ["revenue-col"],
            dimensionKey: "month",
            metricKeys: ["revenue"]
          },
          position: { x: 260, y: 240, w: 620, h: 300 },
          style: {
            background: "#FFFFFF",
            borderColor: "#DCE8FB",
            borderRadius: 12,
            color: "#294469",
            accent: "#1677FF",
            visible: true,
            locked: false,
            zIndex: 1,
            smooth: true
          }
        }
      ],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    analyticsFixtures.get(page)!.records.set(id, {
      id,
      status: "published",
      revision: 1,
      visibility: "PRIVATE",
      schema,
      publishedSchema: structuredClone(schema),
      versions: [],
      createdAt: timestamp,
      updatedAt: timestamp
    });

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`/dashboard-view?dashboard=${encodeURIComponent(id)}`);
    const chart = page.locator('[data-echarts-ready="true"]');
    await expect(chart).toHaveCount(1);

    const bounds = await chart.evaluate((element) => {
      const card = element.closest(".dashboard-widget-card");
      const canvas = element.querySelector("canvas");
      if (!card || !canvas) return null;
      const cardRect = card.getBoundingClientRect();
      const chartRect = element.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      return {
        card: { left: cardRect.left, top: cardRect.top, right: cardRect.right, bottom: cardRect.bottom },
        chart: { left: chartRect.left, top: chartRect.top, right: chartRect.right, bottom: chartRect.bottom },
        canvas: { left: canvasRect.left, top: canvasRect.top, right: canvasRect.right, bottom: canvasRect.bottom }
      };
    });

    expect(bounds).not.toBeNull();
    for (const inner of [bounds!.chart, bounds!.canvas]) {
      expect(inner.left).toBeGreaterThanOrEqual(bounds!.card.left - 1);
      expect(inner.top).toBeGreaterThanOrEqual(bounds!.card.top - 1);
      expect(inner.right).toBeLessThanOrEqual(bounds!.card.right + 1);
      expect(inner.bottom).toBeLessThanOrEqual(bounds!.card.bottom + 1);
    }
    await expectNoHorizontalOverflow(page);

    await page.screenshot({
      path: `outputs/xingshu-homepage-system/qa/react/dashboard-chart-boundary-${viewport.name}.png`,
      animations: "disabled"
    });
  });
}

test("sidebar logo is readable at desktop size", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/table");

  const logo = page.getByRole("img", { name: "星数" });
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute("src", /xingshu-logo-2x/);

  const box = await logo.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(170);
  expect(box!.height).toBeGreaterThanOrEqual(76);
  expect(box!.height).toBeLessThanOrEqual(86);

  const firstNavTile = page.locator(".xs-sidebar__menu svg").first();
  await expect(firstNavTile).toBeVisible();
  const firstNavTileBox = await firstNavTile.boundingBox();
  expect(firstNavTileBox).not.toBeNull();
  expect(firstNavTileBox!.width).toBeGreaterThanOrEqual(20);
  expect(firstNavTileBox!.height).toBeGreaterThanOrEqual(20);
});

test("home page matches the reference welcome workbench composition", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "您好，张三", exact: true })).toBeVisible();
  await expect(page.getByText("我是您的数据管家，有什么可以帮您？")).toBeVisible();
  await expect(page.getByRole("button", { name: "选择模型，当前编排模型" })).toBeVisible();

  const metrics = await page.evaluate(() => {
    const hero = document.querySelector(".home-page__hero");
    const background = document.querySelector<HTMLImageElement>(".home-page__bg");
    const command = document.querySelector(".home-page .xs-command-box");
    const apps = document.querySelector(".home-page__apps");
    const firstCard = document.querySelector(".home-page .xs-app-card");
    const firstDescription = document.querySelector(".home-page .xs-app-card__desc");
    const firstIcon = document.querySelector<HTMLImageElement>(".home-page .xs-app-card .xs-icon-tile__image");
    const input = document.querySelector<HTMLElement>(".home-page .xs-command-box__input");
    const toolbar = document.querySelector<HTMLElement>(".home-page .xs-command-box__toolbar");
    const voiceButton = document.querySelector<HTMLElement>('.home-page .xs-command-box__tool[aria-label="语音"]');
    const sendButton = document.querySelector<HTMLElement>(".home-page .xs-command-box__send");
    const modelButton = document.querySelector<HTMLElement>(".home-page .xs-command-model-select");

    if (
      !hero ||
      !background ||
      !command ||
      !apps ||
      !firstCard ||
      !firstDescription ||
      !firstIcon ||
      !input ||
      !toolbar ||
      !voiceButton ||
      !sendButton ||
      !modelButton
    ) {
      return null;
    }

    const heroRect = hero.getBoundingClientRect();
    const commandRect = command.getBoundingClientRect();
    const appsRect = apps.getBoundingClientRect();
    const cardRect = firstCard.getBoundingClientRect();
    const descriptionStyles = window.getComputedStyle(firstDescription);
    const inputStyles = window.getComputedStyle(input);
    const toolbarStyles = window.getComputedStyle(toolbar);
    const voiceRect = voiceButton.getBoundingClientRect();
    const sendRect = sendButton.getBoundingClientRect();
    const modelRect = modelButton.getBoundingClientRect();
    const voiceStyles = window.getComputedStyle(voiceButton);
    const sendStyles = window.getComputedStyle(sendButton);

    return {
      heroTop: heroRect.top,
      commandWidth: commandRect.width,
      commandHeight: commandRect.height,
      appsTop: appsRect.top,
      cardHeight: cardRect.height,
      cardWidth: cardRect.width,
      descriptionDisplay: descriptionStyles.display,
      inputFocusShadow: inputStyles.boxShadow,
      toolbarBorderTopWidth: Number.parseFloat(toolbarStyles.borderTopWidth),
      attachmentButtonCount: document.querySelectorAll('.home-page [aria-label="附件"]').length,
      voiceButtonSize: [voiceRect.width, voiceRect.height],
      sendButtonSize: [sendRect.width, sendRect.height],
      modelButtonHeight: modelRect.height,
      modelBeforeVoice: modelRect.right <= voiceRect.left,
      voiceButtonRadius: Number.parseFloat(voiceStyles.borderRadius),
      sendButtonRadius: Number.parseFloat(sendStyles.borderRadius),
      quickPromptCount: document.querySelectorAll(".xs-command-box__suggestions button").length,
      generatedIconCount: document.querySelectorAll(".home-page .xs-icon-tile__image").length,
      iconSource: firstIcon.dataset.iconSource ?? "",
      backgroundLoaded: background.complete && background.naturalWidth > 0
    };
  });

  expect(metrics).not.toBeNull();
  expect(metrics!.backgroundLoaded).toBe(true);
  expect(metrics!.heroTop).toBeGreaterThanOrEqual(120);
  expect(metrics!.heroTop).toBeLessThanOrEqual(190);
  expect(metrics!.commandWidth).toBeGreaterThanOrEqual(980);
  expect(metrics!.commandWidth).toBeLessThanOrEqual(1120);
  expect(metrics!.commandHeight).toBeGreaterThanOrEqual(140);
  expect(metrics!.commandHeight).toBeLessThanOrEqual(176);
  expect(metrics!.appsTop).toBeGreaterThanOrEqual(400);
  expect(metrics!.appsTop).toBeLessThanOrEqual(560);
  expect(metrics!.cardHeight).toBeGreaterThanOrEqual(196);
  expect(metrics!.cardHeight).toBeLessThanOrEqual(240);
  expect(metrics!.cardWidth).toBeGreaterThanOrEqual(130);
  expect(metrics!.cardWidth).toBeLessThanOrEqual(180);
  expect(["-webkit-box", "flow-root"]).toContain(metrics!.descriptionDisplay);
  expect(metrics!.inputFocusShadow).toBe("none");
  expect(metrics!.toolbarBorderTopWidth).toBe(0);
  expect(metrics!.attachmentButtonCount).toBe(0);
  expect(metrics!.voiceButtonSize[0]).toBeCloseTo(44, 0);
  expect(metrics!.voiceButtonSize[1]).toBeCloseTo(44, 0);
  expect(metrics!.sendButtonSize[0]).toBeCloseTo(44, 0);
  expect(metrics!.sendButtonSize[1]).toBeCloseTo(44, 0);
  expect(metrics!.modelButtonHeight).toBeGreaterThanOrEqual(42);
  expect(metrics!.modelButtonHeight).toBeLessThanOrEqual(48);
  expect(metrics!.modelBeforeVoice).toBe(true);
  expect(metrics!.voiceButtonRadius).toBe(12);
  expect(metrics!.sendButtonRadius).toBe(12);
  expect(metrics!.quickPromptCount).toBe(0);
  expect(metrics!.generatedIconCount).toBe(7);
  expect(metrics!.iconSource).toBe("xingshu-home-apps-image2-v1");
});

test("home model selector exposes all modes and recommendation cards open their workspaces", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const modelButton = page.getByRole("button", { name: "选择模型，当前编排模型" });
  await modelButton.click();

  await expect(page.getByRole("menuitem", { name: /编排模型/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /问数模型/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /问知模型/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /找文档模型/ })).toBeVisible();
  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/home-model-selector-open-1440x900.png",
    animations: "disabled",
    fullPage: true
  });

  await page.getByRole("menuitem", { name: /找文档模型/ }).click();
  await expect(page.getByRole("button", { name: "选择模型，当前找文档模型" })).toBeVisible();
  await expect(page.getByText(/已切换为.*模型/)).toHaveCount(0);
  await expect(page.locator(".xs-app-card--selected")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await page.reload();
  await page.getByRole("button", { name: /^打开 智能问数/ }).click();
  await expect(page).toHaveURL(/\/ask-data$/);
  await expect(page.getByRole("heading", { name: "从一个经营问题开始" })).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: /^打开 知识问答/ }).click();
  await expect(page).toHaveURL(/\/ask-knowledge$/);
  await expect(page.getByRole("heading", { name: "从一个企业知识问题开始" })).toBeVisible();
});

test("centers collapsed sidebar icons in their tiles", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/history");
  await expect(page.getByRole("heading", { name: "历史对话" })).toBeVisible();
  await page.getByRole("button", { name: "收起侧边栏" }).click();
  await expect(page.locator(".xs-sidebar--collapsed")).toBeVisible();
  await expect(page.getByRole("button", { name: "展开侧边栏" })).toBeVisible();
  await expect.poll(async () => {
    const box = await page.locator(".xs-sidebar").boundingBox();
    return Math.round(box?.width ?? 0);
  }).toBeLessThanOrEqual(80);
  await settleResponsiveLayout(page);

  const offsets = await page.evaluate(() => {
    const measure = (container: Element, icon: Element | null) => {
      if (!icon) {
        return { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY };
      }

      const containerRect = container.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      return {
        x: Math.abs(iconRect.left + iconRect.width / 2 - (containerRect.left + containerRect.width / 2)),
        y: Math.abs(iconRect.top + iconRect.height / 2 - (containerRect.top + containerRect.height / 2))
      };
    };

    const newChat = document.querySelector(".xs-sidebar__new-chat");
    const items = [...document.querySelectorAll(".xs-sidebar__menu .ant-menu-item, .xs-sidebar__menu .ant-menu-submenu-title")];

    return {
      newChat: newChat ? measure(newChat, newChat.querySelector("svg")) : { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY },
      items: items.map((item) => measure(item, item.querySelector("svg")))
    };
  });

  expect(offsets.newChat.x).toBeLessThanOrEqual(2);
  expect(offsets.newChat.y).toBeLessThanOrEqual(2);
  expect(offsets.items.length).toBeGreaterThan(0);
  for (const item of offsets.items) {
    expect(item.x).toBeLessThanOrEqual(2);
    expect(item.y).toBeLessThanOrEqual(2);
  }
});

test("navigates from collapsed sidebar icons", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/history");
  await expect(page.getByRole("heading", { name: "历史对话" })).toBeVisible();
  await page.getByRole("button", { name: "收起侧边栏" }).click();
  await expect(page.locator(".xs-sidebar--collapsed")).toBeVisible();
  await expect.poll(async () => {
    const box = await page.locator(".xs-sidebar").boundingBox();
    return Math.round(box?.width ?? 0);
  }).toBeLessThanOrEqual(80);

  await page.getByRole("menuitem", { name: "我的看板" }).click();
  await expect(page.getByRole("heading", { name: "大屏库" })).toBeVisible();

  await page.getByRole("button", { name: "新建对话" }).click();
  await expect(page.getByRole("heading", { name: "您好，张三", exact: true })).toBeVisible();
});

test("sidebar active item has a stronger selected state", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "大屏库" })).toBeVisible();

  const activeState = await page.getByRole("link", { name: /我的看板/ }).evaluate((element) => {
    const selectedItem = element.closest(".ant-menu-item") ?? element;
    const styles = window.getComputedStyle(selectedItem);

    return {
      backgroundColor: styles.backgroundColor,
      borderLeftColor: styles.borderLeftColor,
      borderLeftWidth: Number.parseFloat(styles.borderLeftWidth)
    };
  });

  expect(activeState.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(activeState.backgroundColor).not.toBe("rgb(255, 255, 255)");
  expect(activeState.borderLeftWidth).toBeGreaterThanOrEqual(3);
  expect(activeState.borderLeftColor).toMatch(/rgb\(22, 119, 255\)|rgb\(37, 99, 235\)/);
});

test("dashboard library hides the fixed business demo", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "大屏库" })).toBeVisible();
  await expect(page.getByRole("region", { name: "大屏库空状态" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "创建第一个大屏" })).toBeVisible();
  await expect(page.getByRole("button", { name: "新建大屏" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "选择收藏问数" })).toBeVisible();
  await expect(page.locator(".board-card")).toHaveCount(0);
  await expect(page.getByText("月度营收趋势")).toHaveCount(0);
});

test("dashboard editor opens as a fullscreen zoomable workspace", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard-editor");
  await expect(page.getByRole("region", { name: "星数大屏设计器" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "星数主导航" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "缩放" })).toHaveValue("fit");
  await page.getByRole("combobox", { name: "缩放" }).selectOption("1");
  await page.getByRole("button", { name: "放大" }).click();
  await expect(page.getByRole("combobox", { name: "缩放" })).toHaveValue("1.25");
  await expectNoHorizontalOverflow(page);
});

test.describe("xingshu welcome page visual smoke", () => {
  for (const viewport of welcomeViewports) {
    test(`renders welcome at ${viewport.name}`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          consoleErrors.push(message.text());
        }
      });

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/welcome");

      await expect(page.getByRole("main", { name: "星数欢迎页" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "欢迎来到星数" })).toBeVisible();
      await expect(page.getByRole("link", { name: "进入星数", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "开始智能问数" })).toBeVisible();
      await expect(page.getByRole("img", { name: "星数可信数据智能主视觉" })).toBeVisible();

      const heroOpacity = await page.locator(".welcome-page__visual img").evaluate((element) => {
        return Number.parseFloat(window.getComputedStyle(element).opacity);
      });
      expect(heroOpacity).toBeLessThan(0.95);

      const heroLayer = await page.locator(".welcome-page__visual").evaluate((element) => {
        const styles = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return {
          pointerEvents: styles.pointerEvents,
          position: styles.position,
          widthRatio: rect.width / window.innerWidth,
          zIndex: styles.zIndex
        };
      });
      expect(heroLayer.position).toBe("absolute");
      expect(heroLayer.pointerEvents).toBe("none");
      expect(heroLayer.widthRatio).toBeGreaterThan(0.5);
      expect(Number.parseInt(heroLayer.zIndex, 10)).toBeLessThan(1);

      if (viewport.width >= 2200) {
        const wideMetrics = await page.evaluate(() => {
          const shell = document.querySelector(".welcome-page__shell");
          const copy = document.querySelector(".welcome-page__copy");
          const firstCard = document.querySelector(".welcome-page__capability");

          if (!shell || !copy || !firstCard) {
            return null;
          }

          const shellRect = shell.getBoundingClientRect();
          const copyRect = copy.getBoundingClientRect();
          const cardRect = firstCard.getBoundingClientRect();

          return {
            shellWidthRatio: shellRect.width / window.innerWidth,
            copyCenterRatio: (copyRect.top + copyRect.height / 2) / window.innerHeight,
            copyLeftRatio: copyRect.left / window.innerWidth,
            cardWidth: cardRect.width,
            heroCenterRatio:
              (document.querySelector(".welcome-page__visual")!.getBoundingClientRect().top +
                document.querySelector(".welcome-page__visual")!.getBoundingClientRect().height / 2) /
              window.innerHeight
          };
        });

        expect(wideMetrics).not.toBeNull();
        expect(wideMetrics!.shellWidthRatio).toBeGreaterThanOrEqual(0.76);
        expect(wideMetrics!.copyCenterRatio).toBeGreaterThanOrEqual(0.43);
        expect(wideMetrics!.copyCenterRatio).toBeLessThanOrEqual(0.58);
        expect(wideMetrics!.copyLeftRatio).toBeLessThanOrEqual(0.14);
        expect(wideMetrics!.cardWidth).toBeGreaterThanOrEqual(220);
        expect(wideMetrics!.heroCenterRatio).toBeGreaterThanOrEqual(0.46);
        expect(wideMetrics!.heroCenterRatio).toBeLessThanOrEqual(0.6);
      }

      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(hasHorizontalOverflow).toBe(false);
      expect(consoleErrors).toEqual([]);

      await page.screenshot({
        path: `outputs/xingshu-homepage-system/qa/react/welcome-react-${viewport.name}.png`,
        fullPage: true
      });
    });
  }
});

test("mobile navigation reaches every product destination and account route", async ({ page }) => {
  const destinations: Array<{
    label: string;
    path: string;
    heading: string;
    charts?: number;
    readyText?: string;
  }> = [
    { label: "历史对话", path: "/history", heading: "历史对话", readyText: "还没有历史对话" },
    { label: "智能制表", path: "/table", heading: "智能制表" },
    { label: "公文写作", path: "/writing", heading: "公文写作" },
    { label: "我的看板", path: "/dashboard", heading: "大屏库", readyText: "暂无大屏" },
    { label: "我的云盘", path: "/cloud", heading: "我的云盘", readyText: "企业制度知识库" },
    { label: "数据资产看板", path: "/data-dashboard", heading: "数据资产看板", charts: 4 },
    {
      label: "数据资产管理",
      path: "/data-management",
      heading: "数据资产管理",
      readyText: "财务审计知识库"
    }
  ];

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  for (const destination of destinations) {
    await page.getByRole("button", { name: "打开主导航" }).click();
    const drawer = page.getByRole("dialog", { name: "星数主导航" });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("link", { name: destination.label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${destination.path.replace("/", "\\/")}$`));
    await expect(page.getByRole("heading", { name: destination.heading, level: 1 })).toBeVisible();
    if (destination.readyText) {
      await expect(page.getByText(destination.readyText, { exact: false }).first()).toBeVisible();
    }
    if (destination.charts) {
      await ensureChartsReady(page, destination.charts);
    }
    await expect(drawer).toBeHidden();
    if (destination.path === "/writing") {
      await expect(page.getByRole("navigation", { name: "星数主导航" })).toHaveCount(0);
      await page.getByRole("link", { name: "返回星数" }).click();
      await expect(page).toHaveURL(/\/$/);
    }
  }

  await page.getByRole("button", { name: "打开主导航" }).click();
  let drawer = page.getByRole("dialog", { name: "星数主导航" });
  await drawer.getByRole("button", { name: "新建对话" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "您好，张三", level: 1 })).toBeVisible();
  await expect(drawer).toBeHidden();

  await page.getByRole("button", { name: "打开主导航" }).click();
  drawer = page.getByRole("dialog", { name: "星数主导航" });
  await drawer.getByRole("button", { name: "移动端账户菜单" }).click();
  await expect(page.getByRole("menuitem", { name: /AI 配置/ })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: /退出登录/ })).toBeVisible();

  await page.goto("/settings/ai");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "您好，张三", level: 1 })).toBeVisible();
});

test("reduced motion keeps feedback visible while suppressing nonessential motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "您好，张三", level: 1 })).toBeVisible();
  await expectReducedMotionStatic(page);

  await page.getByRole("button", { name: /打开 智能问数/ }).click();
  await expect(page).toHaveURL(/\/ask-data$/);
  await expect(page.getByRole("heading", { name: "从一个经营问题开始" })).toBeVisible();
  await expectReducedMotionStatic(page);

  await page.goto("/analysis");
  await expect(page.getByRole("region", { name: "星数命令输入区" })).toBeVisible();
  await expectReducedMotionStatic(page);
  await expectNoHorizontalOverflow(page);
});

test.describe("desktop content density", () => {
  const wideTrackCases = [
    { path: "/", selector: ".home-page__apps", minWidth: 1439, maxWidth: 1441 },
    { path: "/table", selector: ".xs-page", minWidth: 1439, maxWidth: 1441 },
    { path: "/writing", selector: ".official-document-app", minWidth: 2100, maxWidth: 2200 },
    { path: "/analysis", selector: ".xs-page", minWidth: 1479, maxWidth: 1481 },
    { path: "/dashboard", selector: ".dashboard-list__header", minWidth: 1439, maxWidth: 1441 },
    { path: "/data-dashboard", selector: ".xs-page", minWidth: 1479, maxWidth: 1481 },
    { path: "/data-management", selector: ".xs-page", minWidth: 1479, maxWidth: 1481 }
  ];

  for (const pageCase of wideTrackCases) {
    test(`uses the segmented wide desktop rail on ${pageCase.path}`, async ({ page }) => {
      await page.setViewportSize({ width: 2200, height: 944 });
      await page.goto(pageCase.path);

      const trackWidth = await page.locator(pageCase.selector).first().evaluate((element) => {
        return element.getBoundingClientRect().width;
      });

      expect(trackWidth).toBeGreaterThanOrEqual(pageCase.minWidth);
      expect(trackWidth).toBeLessThanOrEqual(pageCase.maxWidth);
    });
  }

  test("uses denser card grids for list-heavy pages", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto("/table");
    await expect(page.locator(".sheet-list")).toHaveCSS("grid-template-columns", /\d+(?:\.\d+)?px \d+(?:\.\d+)?px/);

    await page.route("**/api/v1/chat/sessions/list", (route) =>
      route.fulfill({
        json: {
          code: 200,
          message: "history density fixture",
          data: [1, 2, 3, 4].map((index) => ({
            sessionId: `density-session-${index}`,
            title: `经营分析会话 ${index}`,
            chatMode: "ask",
            updatedAt: `2026-08-0${index}T10:00:00`
          }))
        }
      })
    );
    await page.goto("/history");
    await expect(page.locator(".history-card")).toHaveCount(4);
    await expect(page.locator(".history-list")).toHaveCSS("grid-template-columns", /\d+(?:\.\d+)?px \d+(?:\.\d+)?px/);
  });
});
