import { chromium } from "@playwright/test";

// 用法：先启动 npm run dev，再执行 node scripts/screenshot-writing-module.mjs
// 截公文写作模块：模板库列表页、草稿箱列表页与两个详情页，覆盖 1440/1672/1920/390 四档。
// 所有 /api/** 请求都被本脚本拦截，不会打到真实后端。
const dir = "outputs/ui-audit";
const base = process.env.XS_QA_BASE_URL ?? "http://127.0.0.1:5173";

const templates = [
  {
    id: "template-notice",
    name: "公文助手_占位符通知模板_示例",
    createdAt: "2026-08-05T09:38:00Z",
    versions: [
      {
        id: "template-notice-v1",
        versionNumber: 1,
        status: "PUBLISHED",
        originalFileName: "占位符通知模板.docx",
        originalSize: 38 * 1024,
        createdAt: "2026-08-05T09:38:00Z"
      }
    ]
  },
  {
    id: "template-report",
    name: "季度工作报告模板",
    createdAt: "2026-08-03T02:10:00Z",
    versions: [
      {
        id: "template-report-v2",
        versionNumber: 2,
        status: "READY_FOR_MAPPING",
        originalFileName: "季度工作报告.docx",
        originalSize: 126 * 1024,
        createdAt: "2026-08-03T02:10:00Z"
      }
    ]
  },
  {
    id: "template-meeting",
    name: "党组会议纪要模板",
    createdAt: "2026-08-02T07:45:00Z",
    versions: [
      {
        id: "template-meeting-v1",
        versionNumber: 1,
        status: "ANALYZING",
        originalFileName: "党组会议纪要.docx",
        originalSize: 64 * 1024,
        createdAt: "2026-08-02T07:45:00Z"
      }
    ]
  }
];

const drafts = [
  {
    id: "draft-progress",
    title: "关于系统联调进展的通报",
    status: "READY",
    templateId: "template-notice",
    templateVersionId: "template-notice-v1",
    createdAt: "2026-08-06T01:20:00Z",
    fileVersions: [{ versionNumber: 2, createdAt: "2026-08-06T01:20:00Z" }],
    bindings: []
  },
  {
    id: "draft-quarter",
    title: "2026 年第三季度工作报告（初稿）",
    status: "EDITING",
    templateId: "template-report",
    templateVersionId: "template-report-v2",
    createdAt: "2026-08-05T11:02:00Z",
    fileVersions: [{ versionNumber: 1, createdAt: "2026-08-05T11:02:00Z" }],
    bindings: []
  },
  {
    id: "draft-meeting",
    title: "党组扩大会议纪要",
    status: "BLOCKED",
    templateId: "template-meeting",
    templateVersionId: "template-meeting-v1",
    createdAt: "2026-08-04T08:30:00Z",
    fileVersions: [{ versionNumber: 1, createdAt: "2026-08-04T08:30:00Z" }],
    bindings: []
  }
];

const draftContent = {
  revision: 3,
  fixedValues: [
    { slotId: "title", value: "关于系统联调进展的通报" },
    { slotId: "recipient", value: "各部门、各直属单位：" }
  ],
  blocks: [
    { id: "block-1", order: 1, role: "HEADING_1", variantId: "heading_1-a", text: "一、总体进展" },
    {
      id: "block-2",
      order: 2,
      role: "BODY",
      variantId: "body-a",
      text: "截至 8 月上旬，公文写作模块已完成模板校准与结构化起草的闭环联调。"
    },
    { id: "block-3", order: 3, role: "HEADING_1", variantId: "heading_1-a", text: "二、下一步安排" },
    {
      id: "block-4",
      order: 4,
      role: "BODY",
      variantId: "body-a",
      text: "请各部门于本月底前完成模板归档，并按新流程提交导出申请。"
    }
  ]
};

const capabilities = {
  wordEngine: { available: true, code: "ENGINE_READY" },
  queryAssets: { available: true, code: "QUERY_ASSET_READY" },
  limits: {
    acceptedFileTypes: [".docx"],
    bindingKinds: ["SCALAR", "FACT_SUMMARY", "TABLE"],
    exportFormats: ["DOCX", "PDF"],
    previewFormats: ["PDF"],
    editingMode: "STRUCTURED"
  }
};

const browser = await chromium.launch();

async function newPage(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  // Playwright 按注册的倒序匹配路由，通配兜底必须先注册。
  await page.route("**/api/**", (route) =>
    route.fulfill({ json: { code: 200, message: "visual qa fixture", data: [] }, status: 200 })
  );
  await page.route("**/api/analytics/**", (route) =>
    route.fulfill({ status: 503, json: { code: 503, message: "visual qa fixture: 问数资产不参与本次截图" } })
  );
  await page.route("**/api/official-document/v1/capabilities", (route) => route.fulfill({ json: capabilities }));
  await page.route("**/api/official-document/v1/templates", (route) => route.fulfill({ json: { items: templates } }));
  await page.route("**/api/official-document/v1/drafts", (route) => route.fulfill({ json: { items: drafts } }));
  await page.route("**/api/official-document/v1/drafts/*/content", (route) => route.fulfill({ json: draftContent }));
  await page.addInitScript(() => {
    window.localStorage.setItem("xingshu_datahub_token", "visual-qa-token");
    window.localStorage.setItem(
      "xingshu_datahub_user",
      JSON.stringify({ token: "visual-qa-token", userId: 1, username: "visual-qa", isAdmin: true })
    );
    window.localStorage.setItem("xingshu_datahub_space_id", "7");
    window.localStorage.setItem("xingshu_onboarding_v1", "done");
  });
  return page;
}

async function shot(name, width, height, path, readySelector, extra) {
  const page = await newPage(width, height);
  await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
  await page.waitForSelector(readySelector, { timeout: 15000 });
  await page.waitForTimeout(700);
  if (extra) await extra(page);
  await page.screenshot({ path: `${dir}/${name}.png` });
  await page.close();
  console.log(`shot ${name}`);
}

const listReady = ".official-document-list__rows .official-document-row";

await shot("writing-templates-1440", 1440, 900, "/writing/templates", listReady);
await shot("writing-templates-1672", 1672, 1000, "/writing/templates", listReady);
await shot("writing-templates-1920", 1920, 1080, "/writing/templates", listReady);
await shot("writing-templates-390", 390, 844, "/writing/templates", listReady);
await shot("writing-drafts-1440", 1440, 900, "/writing/drafts", listReady);
await shot("writing-drafts-390", 390, 844, "/writing/drafts", listReady);
await shot(
  "writing-template-detail-1440",
  1440,
  1100,
  "/writing/templates/template-notice",
  ".official-document-app__workspace"
);
await shot(
  "writing-draft-detail-1440",
  1440,
  1100,
  "/writing/drafts/draft-progress",
  ".official-document-app__workspace"
);

await browser.close();
console.log("done");
