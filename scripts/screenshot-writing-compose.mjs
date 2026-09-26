import { chromium } from "@playwright/test";

// 用法：先启动 npm run dev，再执行 node scripts/screenshot-writing-compose.mjs
// 截报告智写的写作台：首页（标题、输入盒、我的文稿）、@ 浮层、「公文模板」弹窗、选中模板后的会话态、
// Word 引擎不可用的首页提示，以及内容复刻的上传弹窗、左右结构和生成后的会话。覆盖 1440 / 1920 / 390 三档。
// 所有 /api/** 请求都被本脚本拦截，不会打到真实后端；复刻用的 DOCX 在脚本里现场拼出来。
const dir = "outputs/ui-audit";
const base = process.env.XS_QA_BASE_URL ?? "http://127.0.0.1:5173";
const only = process.env.XS_QA_ONLY ? new RegExp(process.env.XS_QA_ONLY) : null;

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

const draftTitles = [
  "关于系统联调进展的通报",
  "2026 年第三季度工作报告（初稿）",
  "关于开展年度安全生产大检查的通知",
  "党组扩大会议纪要",
  "关于调整部分业务流程的请示",
  "数据治理专项工作简报（第 3 期）",
  "上半年经营分析报告",
  "关于做好节假日值班工作的通知"
];

// 首页「我的文稿」只列最近 6 篇：给 8 篇，看得出截断和排序
const drafts = draftTitles.map((title, index) => ({
  id: `draft-${index + 1}`,
  title,
  status: index % 3 === 0 ? "READY" : "EDITING",
  templateId: index % 2 ? "template-report" : "template-notice",
  templateVersionId: index % 2 ? "template-report-v1" : "template-notice-v1",
  createdAt: `2026-09-${String(20 - index).padStart(2, "0")}T0${index % 9}:20:00Z`,
  fileVersions: [{ versionNumber: 1, createdAt: `2026-09-${String(20 - index).padStart(2, "0")}T0${index % 9}:20:00Z` }],
  bindings: []
}));

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

function capabilities(engineDown) {
  return {
    wordEngine: engineDown
      ? { available: false, code: "ENGINE_UNAVAILABLE", details: { blockingReasons: ["Syncfusion license expired"] } }
      : { available: true, code: "AVAILABLE" },
    queryAssets: { available: true, code: "QUERY_ASSET_READY" },
    limits: {
      acceptedFileTypes: [".docx"],
      bindingKinds: ["SCALAR", "FACT_SUMMARY", "TABLE"],
      exportFormats: ["DOCX", "PDF"],
      previewFormats: ["PDF"],
      editingMode: "STRUCTURED"
    }
  };
}

/* ---------- 内容复刻用的 DOCX：在 Node 里用 xlsx 自带的 CFB 拼一个最小包 ---------- */

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const xlsx = await import("xlsx");
const CFB = xlsx.CFB ?? xlsx.default?.CFB;

function escapeXml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wordParagraph(text, centered = false) {
  return `<w:p>${centered ? "<w:pPr><w:jc w:val=\"center\"/></w:pPr>" : ""}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function replicateDocx() {
  const body = [
    wordParagraph("XX集团办公室", true),
    wordParagraph("关于2025年上半年安全生产工作情况的报告", true),
    wordParagraph("集团公司："),
    wordParagraph("现将2025年上半年安全生产工作情况报告如下。"),
    wordParagraph("一、主要工作开展情况"),
    wordParagraph("（一）压实安全生产责任。各单位签订安全生产责任书，逐级分解年度目标，形成横向到边、纵向到底的责任体系。"),
    wordParagraph("（二）开展隐患排查治理。上半年累计排查隐患126项，已整改118项，整改率93.7%。"),
    wordParagraph("二、存在的主要问题"),
    wordParagraph("部分基层单位隐患整改闭环不及时，一线员工培训覆盖面仍有不足。"),
    wordParagraph("三、下半年工作安排"),
    wordParagraph("（一）深化专项整治。聚焦消防、特种设备和危化品三个重点领域开展专项检查。"),
    wordParagraph("（二）加强教育培训。分层分类组织培训，确保一线员工全覆盖。"),
    wordParagraph("XX集团办公室"),
    wordParagraph("2025年7月10日")
  ].join("");
  const container = CFB.utils.cfb_new();
  const encoder = new TextEncoder();
  CFB.utils.cfb_add(container, "[Content_Types].xml", encoder.encode("<Types/>"));
  CFB.utils.cfb_add(container, "word/document.xml", encoder.encode(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body}<w:sectPr/></w:body></w:document>`
  ));
  return Buffer.from(CFB.write(container, { fileType: "zip", type: "array" }));
}

/* ---------- 生成流：按写作上下文里的锚点拼一篇像样的成稿 ---------- */

function generatedAnswer(context) {
  const fixed = (context.fixedFields ?? []).map((field) => (
    `[[XS_FIXED:${field.slotId}]]\n${field.role === "TITLE" ? "关于2026年上半年安全生产工作情况的报告" : field.preview ?? ""}`
  ));
  const sections = (context.referenceSections ?? []).map((section) => {
    const heading = section.headingRole ? `${section.title.replace(/2025/g, "2026")}\n` : "";
    return `[[XS_SECTION:${section.id}]]\n${heading}2026年上半年，各单位按照年初部署推进各项工作，${section.title ? `围绕“${section.title.replace(/^[一二三四五六七八九十（）()\d.、]+/, "")}”` : ""}逐项抓好落实，总体情况平稳可控。`;
  });
  return [...fixed, ...sections].join("\n\n");
}

const browser = await chromium.launch();

async function newPage(width, height, options = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  // Playwright 按注册的倒序匹配路由，通配兜底必须先注册。
  await page.route("**/api/**", (route) =>
    route.fulfill({ json: { code: 200, message: "visual qa fixture", data: [] }, status: 200 })
  );
  await page.route("**/api/analytics/**", (route) =>
    route.fulfill({ status: 503, json: { code: 503, message: "visual qa fixture: 问数资产不参与本次截图" } })
  );
  // 大纲分析不参与截图：不可用时写作台走一步到位的老路径
  await page.route("**/api/v1/chat/writing-content-analysis", (route) =>
    route.fulfill({ status: 503, json: { message: "visual qa fixture: 大纲分析不参与本次截图" } })
  );
  await page.route("**/api/agentScore/chat/completions/stream", (route) => {
    const request = route.request().postDataJSON();
    const answer = generatedAnswer(request.writingContext ?? {});
    return route.fulfill({
      contentType: "text/event-stream",
      body: [
        `data: ${JSON.stringify({ type: "text", content: answer, sessionId: request.sessionId, chatId: request.chatId })}`,
        "",
        `data: ${JSON.stringify({ type: "done", content: {}, finished: true, sessionId: request.sessionId, chatId: request.chatId })}`,
        "",
        "data: [DONE]",
        "",
        ""
      ].join("\n")
    });
  });
  await page.route("**/api/official-document/v1/capabilities", (route) =>
    route.fulfill({ json: capabilities(options.engineDown) }));
  await page.route("**/api/official-document/v1/templates", (route) => route.fulfill({ json: { items: templates } }));
  await page.route("**/api/official-document/v1/drafts", (route) =>
    route.fulfill({ json: { items: options.noDrafts ? [] : drafts } }));
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

async function shot(name, width, height, path, readySelector, extra, options) {
  if (only && !only.test(name)) return;
  const page = await newPage(width, height, options);
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

const openTemplates = async (page) => {
  await page.getByRole("button", { name: "公文模板", exact: true }).click();
  await page.getByRole("dialog", { name: "公文模板" }).getByRole("region", { name: "模板库" }).waitFor();
  await page.waitForTimeout(400);
};

const useReportTemplate = async (page) => {
  await openTemplates(page);
  await page.getByRole("button", { name: "使用模板 季度工作报告模板" }).click();
  await page.getByLabel("本轮引用", { exact: true }).waitFor();
  await page.waitForTimeout(300);
};

const openReplicateDialog = async (page) => {
  await page.getByRole("button", { name: "内容复刻", exact: true }).click();
  await page.getByTestId("official-document-replicate-file").waitFor({ state: "attached" });
  await page.waitForTimeout(400);
};

const startReplicate = async (page) => {
  await openReplicateDialog(page);
  await page.getByTestId("official-document-replicate-file").setInputFiles({
    name: "2025年上半年安全生产工作报告.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: replicateDocx()
  });
  await page.getByRole("button", { name: "读取框架" }).click();
  await page.getByRole("complementary", { name: "内容框架" }).waitFor();
  await page.waitForTimeout(600);
};

// 首页：标题、输入盒、工具条、我的文稿
await shot("writing-compose-hero-1440", 1440, 900, "/writing", composerReady);
await shot("writing-compose-hero-1920", 1920, 1080, "/writing", composerReady);
await shot("writing-compose-hero-390", 390, 844, "/writing", composerReady);
await shot("writing-compose-hero-empty-1440", 1440, 900, "/writing", composerReady, null, { noDrafts: true });
await shot("writing-compose-mention-1440", 1440, 900, "/writing", composerReady, openMentions);

// 「公文模板」弹窗
await shot("writing-compose-templates-1440", 1440, 900, "/writing", composerReady, openTemplates);
await shot("writing-compose-templates-1920", 1920, 1080, "/writing", composerReady, openTemplates);
await shot("writing-compose-templates-390", 390, 844, "/writing", composerReady, openTemplates);
await shot("writing-compose-selected-1440", 1440, 900, "/writing", composerReady, async (page) => {
  await useReportTemplate(page);
  await page.getByRole("textbox", { name: "公文写作要求" }).fill("撰写 2026 年第三季度经营工作通报，突出收入结构变化");
  await page.waitForTimeout(200);
});
await shot("writing-compose-chat-1440", 1440, 900, "/writing", composerReady, async (page) => {
  await useReportTemplate(page);
  await page.getByRole("textbox", { name: "公文写作要求" }).fill("撰写 2026 年第三季度经营工作通报，突出收入结构变化");
  await page.getByRole("button", { name: "生成完整公文" }).click();
  await page.getByRole("region", { name: "公文生成对话" }).waitFor();
  await page.getByRole("article", { name: "生成的公文文件" }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
});

// Word 引擎不可用：首页提示，弹窗里新建模板置灰
await shot("writing-compose-engine-down-1440", 1440, 900, "/writing", composerReady, null, { engineDown: true });
await shot("writing-compose-engine-down-390", 390, 844, "/writing", composerReady, null, { engineDown: true });
await shot("writing-compose-engine-down-templates-1440", 1440, 900, "/writing", composerReady, openTemplates, { engineDown: true });

// 内容复刻：上传弹窗 → 左右结构（未选模板） → 选模板 → 生成
await shot("writing-replicate-upload-1440", 1440, 900, "/writing", composerReady, openReplicateDialog);
await shot("writing-replicate-split-1440", 1440, 900, "/writing", composerReady, startReplicate);
await shot("writing-replicate-split-1920", 1920, 1080, "/writing", composerReady, startReplicate);
await shot("writing-replicate-split-390", 390, 844, "/writing", composerReady, startReplicate);
await shot("writing-replicate-generated-1440", 1440, 900, "/writing", composerReady, async (page) => {
  await startReplicate(page);
  await useReportTemplate(page);
  await page.getByRole("textbox", { name: "公文写作要求" }).fill("按这个框架写 2026 年上半年的版本");
  await page.getByRole("button", { name: "生成完整公文" }).click();
  await page.getByRole("article", { name: "生成的公文文件" }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
});
await shot("writing-replicate-home-notice-1440", 1440, 900, "/writing", composerReady, async (page) => {
  await startReplicate(page);
  await page.getByRole("link", { name: "报告智写" }).first().click();
  await page.getByRole("group", { name: "内容复刻进行中" }).waitFor();
  await page.waitForTimeout(400);
});

// 列表与详情的细头部
await shot("writing-templates-page-1440", 1440, 900, "/writing/templates", ".official-document-templates__grid");
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
