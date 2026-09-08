import { chromium } from "@playwright/test";

// 用法：先启动 npm run dev，再执行 node scripts/screenshot-writing-compose.mjs
// 截报告智写的写作台：hero 输入盒、@ 浮层、模板界面、选中模板后的会话态、+ 菜单，
// 以及模板详情与草稿箱的细头部。覆盖 1440 / 1920 / 390 三档。
// 所有 /api/** 请求都被本脚本拦截，不会打到真实后端。
const dir = "outputs/ui-audit";
const base = process.env.XS_QA_BASE_URL ?? "http://127.0.0.1:5173";

function paragraphs(lines) {
  return lines.map(([text, styleName, outlineLevel], index) => ({
    index,
    text,
    format: { styleName, outlineLevel, alignment: outlineLevel === undefined ? 0 : 1 },
    runs: [{ index: 0, text, format: { fontName: "仿宋", fontSizePoints: 16 } }]
  }));
}

// compiledAvailable：true=编译文件在，false=文件已丢失，null=这一版还没编译过。
function template(id, name, fileName, status, sectionCount, headings, compiledAvailable) {
  return {
    id,
    name,
    createdAt: "2026-08-27T00:00:00Z",
    versions: [{
      id: `${id}-v1`,
      versionNumber: 1,
      status,
      originalFileName: fileName,
      originalSize: 42 * 1024,
      createdAt: "2026-08-27T00:00:00Z",
      compiledAvailable: compiledAvailable ?? (status === "PUBLISHED" ? true : null),
      analysis: {
        structureProfile: {
          engineName: "Syncfusion DocIO",
          engineVersion: "24.1",
          sections: Array.from({ length: sectionCount }, (_, index) => ({ index })),
          paragraphs: paragraphs([
            [`关于${name.replace("模板", "")}的通知`, "Title"],
            ["各分公司、各部门：", "Body"],
            ...headings.map((heading) => [heading, "Heading 1", 0]),
            ["今年以来，各项工作总体平稳，现将有关事项通知如下。", "Body"]
          ]),
          tables: [],
          headersAndFooters: [],
          warnings: []
        },
        engineCapabilityReport: {
          engineName: "Syncfusion DocIO",
          engineVersion: "24.1",
          available: true,
          licensed: true,
          capabilities: [],
          warnings: [],
          blockingReasons: []
        }
      }
    }]
  };
}

const templates = [
  template("template-notice", "占位符通知模板", "占位符通知模板.docx", "PUBLISHED", 4, ["一、总体情况", "二、下一步安排"]),
  template("template-report", "季度工作报告模板", "季度工作报告.docx", "PUBLISHED", 6, ["一、经营情况", "二、重点工作"]),
  template("template-meeting", "党组会议纪要模板", "党组会议纪要.docx", "READY_FOR_MAPPING", 3, ["一、会议议题", "二、议定事项"]),
  template("template-request", "请示报批模板", "请示报批.docx", "PUBLISHED", 5, ["一、事项背景", "二、请示意见"]),
  template("template-brief", "工作简报模板", "工作简报.docx", "PUBLISHED", 3, ["一、本期要点", "二、下期计划"]),
  template("template-safety", "安全检查通报模板", "安全检查通报.docx", "ANALYZING", 0, []),
  // 已发布但编译文件在服务器上丢了：@ 里不该出现，模板库要标「文件缺失，需重新上传」
  template("template-missing", "文件缺失通报模板", "文件缺失通报.docx", "PUBLISHED", 4, ["一、事项说明", "二、处理意见"], false)
];

const drafts = [
  {
    id: "draft-progress",
    title: "关于系统联调进展的通报",
    status: "READY",
    templateId: "template-notice",
    templateVersionId: "template-notice-v1",
    createdAt: "2026-08-27T01:20:00Z",
    fileVersions: [{ versionNumber: 2, createdAt: "2026-08-27T01:20:00Z" }],
    bindings: []
  },
  {
    id: "draft-quarter",
    title: "2026 年第三季度工作报告（初稿）",
    status: "EDITING",
    templateId: "template-report",
    templateVersionId: "template-report-v1",
    createdAt: "2026-08-26T11:02:00Z",
    fileVersions: [{ versionNumber: 1, createdAt: "2026-08-26T11:02:00Z" }],
    bindings: []
  }
];

const draftContent = {
  revision: 3,
  fixedValues: [{ slotId: "title", value: "关于系统联调进展的通报" }],
  blocks: [
    { id: "block-1", order: 1, role: "HEADING_1", variantId: "heading_1-a", text: "一、总体进展" },
    {
      id: "block-2",
      order: 2,
      role: "BODY",
      variantId: "body-a",
      text: "截至 8 月上旬，公文写作模块已完成模板校准与结构化起草的闭环联调。"
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
  await page.waitForTimeout(600);
  if (extra) await extra(page);
  await page.screenshot({ path: `${dir}/${name}.png` });
  await page.close();
  console.log(`shot ${name}`);
}

const composerReady = ".official-document-composer";

const openMentions = async (page) => {
  await page.getByRole("textbox", { name: "公文写作要求" }).pressSequentially("@");
  await page.getByRole("listbox", { name: "引用与动作" }).waitFor();
  await page.waitForTimeout(200);
};

const openGallery = async (page) => {
  await openMentions(page);
  await page.getByRole("option", { name: /模板库/ }).click();
  await page.getByRole("region", { name: "模板库" }).waitFor();
  await page.waitForTimeout(200);
};

await shot("writing-compose-hero-1440", 1440, 900, "/writing", composerReady);
await shot("writing-compose-hero-1920", 1920, 1080, "/writing", composerReady);
await shot("writing-compose-hero-390", 390, 844, "/writing", composerReady);
await shot("writing-compose-mention-1440", 1440, 900, "/writing", composerReady, openMentions);
await shot("writing-compose-mention-1920", 1920, 1080, "/writing", composerReady, openMentions);
await shot("writing-compose-templates-1440", 1440, 900, "/writing", composerReady, openGallery);
await shot("writing-compose-templates-1920", 1920, 1080, "/writing", composerReady, openGallery);
await shot("writing-compose-templates-1180", 1180, 900, "/writing", composerReady, openGallery);
await shot("writing-compose-selected-1440", 1440, 900, "/writing", composerReady, async (page) => {
  await openGallery(page);
  await page.getByRole("button", { name: "使用模板 季度工作报告模板" }).click();
  await page.getByLabel("本轮引用", { exact: true }).waitFor();
  await page.getByRole("textbox", { name: "公文写作要求" }).fill("撰写 2026 年第三季度经营工作通报，突出收入结构变化");
  await page.waitForTimeout(200);
});
await shot("writing-compose-chat-1440", 1440, 900, "/writing", composerReady, async (page) => {
  await openGallery(page);
  await page.getByRole("button", { name: "使用模板 季度工作报告模板" }).click();
  await page.getByRole("textbox", { name: "公文写作要求" }).fill("撰写 2026 年第三季度经营工作通报，突出收入结构变化");
  await page.getByRole("button", { name: "生成完整公文" }).click();
  await page.getByRole("region", { name: "公文生成对话" }).waitFor();
  await page.waitForTimeout(1200);
});
await shot("writing-compose-plus-menu-1440", 1440, 900, "/writing", composerReady, async (page) => {
  await page.getByRole("button", { name: "添加模板或参考资料" }).click();
  await page.getByText("上传参考资料").waitFor();
  await page.waitForTimeout(250);
});
await shot("writing-templates-page-1440", 1440, 900, "/writing/templates", ".official-document-templates__grid");
await shot("writing-templates-page-1920", 1920, 1080, "/writing/templates", ".official-document-templates__grid");
await shot("writing-drafts-page-1440", 1440, 900, "/writing/drafts", ".official-document-app__bar");
await shot(
  "writing-template-detail-1440",
  1440,
  1000,
  "/writing/templates/template-notice",
  ".official-document-app__bar"
);

await browser.close();
console.log("done");
