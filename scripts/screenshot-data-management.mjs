import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

// 用法：先启动 npm run dev，再执行 node scripts/screenshot-data-management.mjs
// 截数据资产管理页的三个核对入口（数据源 / 数据表 / 指标），管理员与普通成员各一组，
// 覆盖 1440/1672/1920/2200/390 五档，并真点一次入口核对新标签地址与同源登录态写入。
// 所有 /api/** 请求都被本脚本拦截，/platform/** 给一页空壳，不会打到真实后端；
// dev server 的代理可以指向死端口（VITE_DATAHUB_PROXY_TARGET=http://127.0.0.1:9）。
const dir = "outputs/ui-audit";
const base = process.env.XS_QA_BASE_URL ?? "http://127.0.0.1:5173";

const knowledgeBases = [
  { kb_id: "kb-policy", kb_name: "企业制度知识库", description: "制度、流程与规范文件", doc_count: 48, update_time: "2026-08-13 10:00" },
  { kb_id: "kb-contract", kb_name: "合同与法务文件库", description: "合同模板与审批记录", doc_count: 12, update_time: "2026-08-11 09:30" },
  { kb_id: "kb-project", kb_name: "项目运营资料库", description: "项目周报、里程碑与复盘", doc_count: 27, update_time: "2026-08-09 16:20" }
];

const roles = {
  admin: ["超级管理员"],
  member: ["空间游客"]
};

const panels = {
  数据源管理: "核对数据源的首次构建结果",
  数据表管理: "核对表注释与表间关系",
  指标管理: "核对指标与口语说法"
};

const envelope = (data) => JSON.stringify({ code: 200, message: "ok", data });

async function openPage(browser, role, viewport) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
    // isAdmin 是系统管理员；这里两种角色都关掉它，只靠 /api/spaces 的 myRoles 区分
    const user = { token: "visual-qa-token", userId: 1, username: "张三", isAdmin: false };
    window.localStorage.setItem("xingshu_datahub_token", user.token);
    window.localStorage.setItem("xingshu_datahub_user", JSON.stringify(user));
    window.localStorage.setItem("xingshu_datahub_space_id", "7");
  });
  // 兜底先注册：Playwright 后注册的路由优先
  await context.route("**/api/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: envelope(null) })
  );
  await context.route("**/api/spaces", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: envelope([{ id: 7, spaceName: "示例空间", ownerId: 1, myRoles: roles[role], memberCount: 4, createdAt: "2026-08-01 09:00:00" }])
    })
  );
  await context.route("**/api/ai/rag/kbs**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: envelope(knowledgeBases) })
  );
  await context.route("**/platform/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<title>DataHub stub</title><p>DataHub stub</p>" })
  );

  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto(`${base}/data-management`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "数据资产管理" }).waitFor();
  return { context, page, consoleErrors };
}

async function selectTab(page, name) {
  await page.getByRole("radiogroup", { name: "资产管理类型" }).getByText(name, { exact: true }).click();
  const panel = page.getByRole("region", { name: panels[name] });
  await panel.waitFor();
  // 等角色落定与入场动效（enter 260ms + 阶梯）走完
  await panel.locator(".asset-review__actions, .asset-review__note:not([role='status'])").first().waitFor();
  await page.waitForTimeout(500);
  return panel;
}

async function layoutFacts(page) {
  return page.evaluate(() => {
    const px = (value) => Math.round(parseFloat(value) * 10) / 10;
    const card = document.querySelector(".asset-review");
    const title = card?.querySelector("h2");
    const note = card?.querySelector(".asset-review__note");
    const buttons = [...(card?.querySelectorAll(".ant-btn") ?? [])].map((button) => {
      const style = getComputedStyle(button);
      return {
        label: button.textContent.trim(),
        height: px(button.getBoundingClientRect().height),
        radius: style.borderTopLeftRadius,
        weight: style.fontWeight,
        shadow: style.boxShadow
      };
    });
    const cardStyle = card ? getComputedStyle(card) : null;
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      cardRadius: cardStyle?.borderTopLeftRadius,
      cardWidth: card ? px(card.getBoundingClientRect().width) : null,
      trackWidth: px(document.querySelector(".xs-page")?.getBoundingClientRect().width ?? 0),
      title: title ? `${getComputedStyle(title).fontSize}/${getComputedStyle(title).fontWeight}` : null,
      note: note ? `${getComputedStyle(note).fontSize}/${getComputedStyle(note).fontWeight} ${getComputedStyle(note).color}` : null,
      headerActions: Boolean(document.querySelector(".xs-page__actions")),
      buttons
    };
  });
}

async function shot(page, name) {
  const facts = await layoutFacts(page);
  assert(facts.overflow <= 1, `${name}: 页面横向溢出 ${facts.overflow}px`);
  // ui-audit 是各模块共用的输出目录，文件名带上模块前缀
  await page.screenshot({ path: `${dir}/data-management-${name}.png` });
  console.log(name, JSON.stringify(facts));
}

const browser = await chromium.launch();
try {
  // —— 管理员 ——
  {
    const { context, page, consoleErrors } = await openPage(browser, "admin", { width: 1440, height: 1000 });
    await page.getByRole("region", { name: "知识库列表" }).waitFor();
    await page.waitForTimeout(900);
    await shot(page, "admin-1440-knowledge");

    await selectTab(page, "数据源管理");
    await shot(page, "admin-1440-datasources");

    // 真点一次：开发态 DataHub 界面与当前页同源，所以入口地址按同源断言，并确认登录态已写入
    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByRole("button", { name: "打开 DataHub 数据源" }).click()
    ]);
    await popup.waitForLoadState();
    const seeded = await page.evaluate(() => ({
      token: window.localStorage.getItem("platform_token"),
      spaceId: window.localStorage.getItem("platform_space_id")
    }));
    console.log("popup", popup.url(), JSON.stringify(seeded));
    assert.equal(popup.url(), `${base}/platform/datasources?space_id=7`);
    assert.equal(seeded.token, "visual-qa-token");
    assert.equal(seeded.spaceId, "7");
    await popup.close();

    await page.setViewportSize({ width: 1672, height: 1000 });
    await selectTab(page, "数据表管理");
    await shot(page, "admin-1672-tables");

    await page.setViewportSize({ width: 1920, height: 1000 });
    await selectTab(page, "指标管理");
    await shot(page, "admin-1920-metrics");

    const [glossary] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByRole("button", { name: "打开口语词典" }).click()
    ]);
    await glossary.waitForLoadState();
    console.log("popup", glossary.url());
    assert.equal(glossary.url(), `${base}/platform/glossary?space_id=7`);
    await glossary.close();

    await page.setViewportSize({ width: 2200, height: 1000 });
    await page.waitForTimeout(300);
    await shot(page, "admin-2200-metrics");

    console.log("admin console errors", JSON.stringify(consoleErrors));
    await context.close();
  }
  {
    const { context, page } = await openPage(browser, "admin", { width: 390, height: 844 });
    await selectTab(page, "指标管理");
    await page.getByRole("region", { name: panels["指标管理"] }).scrollIntoViewIfNeeded();
    await shot(page, "admin-390-metrics");
    await context.close();
  }

  // —— 普通成员 ——
  {
    const { context, page, consoleErrors } = await openPage(browser, "member", { width: 1440, height: 1000 });
    for (const tab of ["数据源管理", "数据表管理", "指标管理"]) {
      const panel = await selectTab(page, tab);
      assert.equal(await panel.getByRole("button").count(), 0, `${tab}: 普通成员不该有按钮`);
    }
    await selectTab(page, "数据表管理");
    await shot(page, "member-1440-tables");
    console.log("member console errors", JSON.stringify(consoleErrors));
    await context.close();
  }
  {
    const { context, page } = await openPage(browser, "member", { width: 390, height: 844 });
    await selectTab(page, "指标管理");
    await shot(page, "member-390-metrics");
    await context.close();
  }
} finally {
  await browser.close();
}
console.log("done");
