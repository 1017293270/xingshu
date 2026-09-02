import { chromium } from "@playwright/test";

// 用法：先启动 npm run dev，再执行 node scripts/screenshot-writing-compose-waiting.mjs
// 截公文写作提交后的「大纲分析」等待态。这条路径走的是一次同步 LLM 调用，
// 真实后端要几十秒才回，脚本把它拦成永不返回，然后在 3 / 30 / 65 秒各截一张，
// 用来确认耗时在走、阶段在推进、慢速提示按时出现。
// 所有 /api/** 都被拦截，不会打到真实后端。
const dir = "outputs/ui-audit";
const base = process.env.XS_QA_BASE_URL ?? "http://127.0.0.1:5173";

const paragraph = (index, text, extra) => ({ index, text, ...extra });

/** 结构角色由 suggestParagraphRoles 从文本推断，这里给的就是一份常规通知的段落序列。 */
const paragraphs = [
  paragraph(0, "关于开展2026年第三季度安全生产检查的通知"),
  paragraph(1, "各部门、各直属单位："),
  paragraph(2, "为落实安全生产责任制，进一步排查治理各类隐患，现将开展第三季度安全生产检查的有关事项通知如下。"),
  paragraph(3, "一、检查范围与重点"),
  paragraph(4, "检查范围覆盖生产、仓储、运输和外包作业四个环节，重点排查特种设备台账、消防通道占用、危化品存放以及外包人员资质四类问题。"),
  paragraph(5, "（一）生产作业环节"),
  paragraph(6, "重点核查特种设备定期检验记录、作业票证签署情况和现场安全防护措施落实情况。"),
  paragraph(7, "（二）仓储与危化品管理"),
  paragraph(8, "重点核查危化品分区存放、台账登记、通风与消防设施完好情况。"),
  paragraph(9, "（三）运输与外包作业"),
  paragraph(10, "重点核查承运单位资质、车辆检验状态以及外包人员入场培训记录。"),
  paragraph(11, "二、时间安排"),
  paragraph(12, "各单位应于本月底前完成自查并报送书面材料，公司将于下月上旬组织抽查复核。"),
  paragraph(13, "三、工作要求"),
  paragraph(14, "各单位主要负责人是本单位安全检查第一责任人，应亲自部署、亲自督办。"),
  paragraph(15, "四、结果运用"),
  paragraph(16, "抽查结果纳入年度安全生产考核，对自查敷衍、整改不到位的单位按规定追究管理责任。"),
  paragraph(17, "五、联系方式"),
  paragraph(18, "联系人及联系电话由各单位安全管理部门另行通知。"),
  paragraph(19, "六、其他事项"),
  paragraph(20, "本次检查所需费用由各单位在安全生产费用中列支。"),
  paragraph(21, "七、附则"),
  paragraph(22, "本通知自印发之日起施行，由安全管理部负责解释。"),
  paragraph(23, "XX市应急管理局"),
  paragraph(24, "2026年9月1日")
];

const templates = [
  {
    id: "template-notice",
    name: "情况通报模板",
    createdAt: "2026-08-05T09:38:00Z",
    versions: [
      {
        id: "template-notice-v1",
        versionNumber: 1,
        status: "PUBLISHED",
        originalFileName: "情况通报模板.docx",
        originalSize: 38 * 1024,
        createdAt: "2026-08-05T09:38:00Z",
        analysis: {
          structureProfile: {
            engineName: "Syncfusion DocIO",
            engineVersion: "visual-qa",
            sections: [{}],
            paragraphs,
            tables: [],
            headersAndFooters: [],
            featureCounts: { paragraphs: paragraphs.length },
            warnings: []
          },
          engineCapabilityReport: {
            engineName: "Syncfusion DocIO",
            engineVersion: "visual-qa",
            available: true,
            licensed: true,
            warnings: [],
            blockingReasons: []
          }
        }
      }
    ]
  }
];

const drafts = [
  {
    id: "draft-progress",
    title: "关于系统联调进展的通报",
    status: "EDITING",
    templateId: "template-notice",
    templateVersionId: "template-notice-v1",
    createdAt: "2026-08-06T01:20:00Z",
    fileVersions: [{ versionNumber: 2, createdAt: "2026-08-06T01:20:00Z" }],
    bindings: []
  }
];

const draftContent = {
  revision: 3,
  fixedValues: [{ slotId: "title", value: "关于系统联调进展的通报" }],
  blocks: [
    { id: "block-1", order: 1, role: "HEADING_1", variantId: "heading_1-a", text: "一、总体进展" },
    { id: "block-2", order: 2, role: "BODY", variantId: "body-a", text: "联调已完成模板校准与结构化起草的闭环。" }
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

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
// 大纲分析永不返回：等待态就是本脚本要截的东西
await page.route("**/api/v1/chat/writing-content-analysis", () => {});

await page.addInitScript(() => {
  window.localStorage.setItem("xingshu_datahub_token", "visual-qa-token");
  window.localStorage.setItem(
    "xingshu_datahub_user",
    JSON.stringify({ token: "visual-qa-token", userId: 1, username: "visual-qa", isAdmin: true })
  );
  window.localStorage.setItem("xingshu_datahub_space_id", "7");
  window.localStorage.setItem("xingshu_onboarding_v1", "done");
});

await page.goto(`${base}/writing`, { waitUntil: "networkidle" });

const composer = page.getByRole("textbox", { name: "公文写作要求" });
await composer.waitFor({ timeout: 15000 });
await composer.click();
await composer.type("@");
await page.waitForSelector(".official-document-compose-mentions", { timeout: 10000 });
await page.locator(".official-document-compose-mentions").getByText("关于系统联调进展的通报").click();
await composer.type("参照这份通报，写一份第三季度安全生产检查通知，突出隐患整改责任和时限要求。");
await page.getByRole("button", { name: "生成完整公文" }).click();

const card = page.locator(".compose-analyzing");
await card.waitFor({ timeout: 15000 });

async function shot(name, waitUntilMs, startedAt) {
  const remaining = startedAt + waitUntilMs - Date.now();
  if (remaining > 0) await page.waitForTimeout(remaining);
  await page.screenshot({ path: `${dir}/${name}.png` });
  // 卡片挂在 .xs-chat 这条共用滚动容器里，一处横向溢出整条会话流都会横滚
  const overflow = await page.evaluate(() => {
    const chat = document.querySelector(".xs-chat");
    const analyzing = document.querySelector(".compose-analyzing");
    return {
      chat: chat ? chat.scrollWidth - chat.clientWidth : null,
      card: analyzing ? analyzing.scrollWidth - analyzing.clientWidth : null,
      elapsed: document.querySelector(".compose-analyzing__elapsed")?.textContent ?? "",
      steps: [...document.querySelectorAll(".compose-analyzing__steps > li")].map((li) => (
        `${li.querySelector("span:last-child > span")?.textContent}=${li.dataset.state}`
      )),
      slow: Boolean(document.querySelector(".compose-analyzing__slow"))
    };
  });
  console.log(`shot ${name}`, JSON.stringify(overflow));
}

const startedAt = Date.now();
await shot("compose-waiting-03s", 3000, startedAt);
await shot("compose-waiting-30s", 30_000, startedAt);
await shot("compose-waiting-65s", 65_000, startedAt);

await page.close();
await browser.close();
console.log("done");
