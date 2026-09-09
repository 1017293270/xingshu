import { expect, type Page, test } from "@playwright/test";

/*
 * 报告智写分两页：/writing 是入口首页（只有标题和输入框），/writing/session 才是会话与成稿。
 * 生成过程离开写作台也要继续跑——写作台常驻在壳层里，路由重挂的只是承载它的槽位。
 * 这一组用例把正文流卡住，切走再回来，看首页提示条、进度指示、完成提醒和成稿是不是都对得上。
 */
const templateName = "占位符通知模板";
const requirement = "撰写2026年安全检查通知，突出自查与复核安排";
/* 成稿标题由模板名派生，提示条照抄它，不自己另编一个 */
const artifactTitle = "占位符通知模板 - 生成稿";

async function install(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("xingshu_datahub_token", "isolated-compose-background");
    localStorage.setItem("xingshu_datahub_user", JSON.stringify({ userId: 1, username: "qa", isAdmin: true }));
    localStorage.setItem("xingshu_datahub_space_id", "1");
    localStorage.setItem("xingshu_onboarding_v1", "done");
  });

  const releases: Array<() => Promise<void>> = [];
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const json = (value: unknown) => route.fulfill({ json: value });
    if (pathname.endsWith("/v1/capabilities")) {
      return json({ wordEngine: { available: true, licensed: true }, limits: { exportFormats: ["DOCX", "PDF"] } });
    }
    if (pathname === "/api/official-document/v1/templates") {
      return json({ items: [{ id: "t1", name: templateName, createdAt: "2026-09-07T00:00:00Z", versions: [{
        id: "v1",
        versionNumber: 1,
        status: "PUBLISHED",
        originalFileName: "占位符通知模板.docx",
        originalSize: 4096,
        createdAt: "2026-09-07T00:00:00Z",
        compiledAvailable: true,
        analysis: {
          structureProfile: {
            sections: [{}],
            paragraphs: [
              { index: 0, text: "关于开展安全检查的通知", format: { styleName: "Title" } },
              { index: 1, text: "一、总体情况", format: { styleName: "Heading 1", outlineLevel: 0 } },
              { index: 2, text: "二、下一步安排", format: { styleName: "Heading 1", outlineLevel: 0 } },
              { index: 3, text: "参考正文内容。", format: { styleName: "Normal" } }
            ],
            tables: [],
            headersAndFooters: []
          },
          engineCapabilityReport: { available: true, licensed: true }
        }
      }] }] });
    }
    if (pathname === "/api/official-document/v1/drafts") return json({ items: [] });
    if (pathname === "/api/analytics/query-assets") return json({ code: 200, message: "ok", data: [] });
    // 大纲分析不可用 → 走一步到位的老路径，提交后直接进正文生成
    if (pathname === "/api/v1/chat/writing-content-analysis") {
      return route.fulfill({ status: 503, json: { message: "outline analysis is out of scope here" } });
    }
    if (pathname === "/api/agentScore/chat/completions/stream") {
      const request = route.request().postDataJSON();
      const context = request.writingContext as {
        fixedFields: Array<{ slotId: string }>;
        referenceSections: Array<{ id: string }>;
      };
      const answer = [
        ...context.fixedFields.map((field) => `[[XS_FIXED:${field.slotId}]]\n关于开展2026年安全检查的通知`),
        ...context.referenceSections.map((section) => `[[XS_SECTION:${section.id}]]\n今年以来各项安全工作总体平稳，各单位应于本月底前完成自查。`)
      ].join("\n\n");
      // 攥住这一轮，好在生成途中切走
      return new Promise<void>((resolve) => {
        releases.push(async () => {
          await route.fulfill({
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
          resolve();
        });
      });
    }
    return route.fulfill({ status: 503, json: { message: "Blocked by compose background fixture" } });
  });

  return {
    releaseGeneration: async () => {
      await expect.poll(() => releases.length).toBeGreaterThan(0);
      await releases.shift()!();
    }
  };
}

async function startGeneration(page: Page) {
  await page.goto("/writing");
  const input = page.getByRole("textbox", { name: "公文写作要求", exact: true });
  await input.fill("@");
  await page.getByRole("option", { name: new RegExp(templateName) }).first().click();
  await input.fill(requirement);
  await page.getByRole("button", { name: "生成完整公文" }).click();
  /* 首页只管开头：一提交就进会话页看过程 */
  await expect(page).toHaveURL(/\/writing\/session$/);
  await expect(page.getByRole("button", { name: "停止" })).toBeVisible();
}

const runningDot = '.xs-sidebar__job[data-state="running"]';
const unseenDot = '.xs-sidebar__job[data-state="unseen"]';
const heroTitle = "想写一篇什么公文？";
const notice = ".writing-session-notice";

test.describe("报告智写：生成过程跟着用户走", () => {
  test("离开写作台后生成继续跑，提醒把人送回会话页", async ({ page }) => {
    const fixture = await install(page);
    await startGeneration(page);

    await page.getByRole("link", { name: "智能制表" }).click();
    await expect(page).toHaveURL(/\/table$/);
    // 页面换成了制表，侧栏仍替写作台报进度
    await expect(page.locator(runningDot)).toHaveCount(1);
    await expect(page.getByLabel("正在生成公文")).toBeVisible();

    await fixture.releaseGeneration();

    // 人不在写作台，完成要主动说一声，并留下未读圆点
    await expect(page.getByText("公文已生成")).toBeVisible();
    await expect(page.locator(unseenDot)).toHaveCount(1);
    await expect(page).toHaveURL(/\/table$/);

    await page.getByRole("button", { name: "查看" }).click();
    // 成稿在会话页，不在入口首页
    await expect(page).toHaveURL(/\/writing\/session$/);
    // 成稿是那一轮跑出来的，不是回来以后重跑的
    await expect(page.getByRole("article", { name: "生成的公文文件" })).toBeVisible();
    await expect(page.getByText(requirement)).toBeVisible();
    await expect(page.locator(".xs-sidebar__job")).toHaveCount(0);
  });

  test("生成中点侧栏「报告智写」落在首页，提示条才是进会话的门", async ({ page }) => {
    await install(page);
    await startGeneration(page);

    await page.getByRole("link", { name: "报告智写" }).click();
    // 点侧栏永远先落在入口首页，哪怕那边正在写
    await expect(page).toHaveURL(/\/writing$/);
    await expect(page.getByRole("heading", { name: heroTitle })).toBeVisible();
    await expect(page.locator(".official-document-app")).toHaveAttribute("data-stage", "compose");
    // 首页不给「停止」，只说清楚为什么发不出去
    await expect(page.getByRole("button", { name: "停止" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "生成完整公文" })).toBeDisabled();
    await expect(page.getByText("正在生成中，完成后可继续提交。")).toBeVisible();

    const running = page.locator(notice);
    await expect(running).toHaveAttribute("data-state", "running");
    await expect(running).toContainText(`正在生成：${requirement}`);
    await expect(page.locator(runningDot)).toHaveCount(1);

    await running.click();
    await expect(page).toHaveURL(/\/writing\/session$/);
    await expect(page.getByRole("button", { name: "停止" })).toBeVisible();
    await expect(page.getByText(requirement)).toBeVisible();
  });

  test("完成时人在首页：提示条改口说已生成，点进去圆点才消", async ({ page }) => {
    const fixture = await install(page);
    await startGeneration(page);

    await page.getByRole("link", { name: "格式模板" }).click();
    await expect(page).toHaveURL(/\/writing\/templates$/);
    await expect(page.locator(".official-document-app")).toHaveAttribute("data-stage", "library");
    await expect(page.locator(runningDot)).toHaveCount(1);

    // 页头跟着路径回到写作态，落点仍是入口首页
    await page.getByRole("link", { name: "公文写作" }).click();
    await expect(page).toHaveURL(/\/writing$/);
    await expect(page.locator(".official-document-app")).toHaveAttribute("data-stage", "compose");
    await expect(page.getByRole("heading", { name: heroTitle })).toBeVisible();

    await fixture.releaseGeneration();

    // 首页看不到成稿：不弹提醒，提示条自己改口，未读圆点还留着
    const done = page.locator(notice);
    await expect(done).toHaveAttribute("data-state", "unseen");
    await expect(done).toContainText(`《${artifactTitle}》已生成`);
    await expect(done).toContainText("尚未查看");
    await expect(page.getByText("公文已生成")).toHaveCount(0);
    await expect(page.locator(unseenDot)).toHaveCount(1);

    await done.click();
    await expect(page).toHaveURL(/\/writing\/session$/);
    await expect(page.getByRole("article", { name: "生成的公文文件" })).toBeVisible();
    await expect(page.locator(".xs-sidebar__job")).toHaveCount(0);
  });

  test("刷新后首页还认得上次成稿，但不当成刚写完的一份", async ({ page }) => {
    const fixture = await install(page);
    await startGeneration(page);
    await fixture.releaseGeneration();
    await expect(page.getByRole("article", { name: "生成的公文文件" })).toBeVisible();

    await page.getByRole("link", { name: "报告智写" }).click();
    await expect(page).toHaveURL(/\/writing$/);
    await page.reload();

    // 会话是从 sessionStorage 认回来的：提示条有东西可点，但不提醒也不亮圆点
    const restored = page.locator(notice);
    await expect(restored).toHaveAttribute("data-state", "seen");
    await expect(restored).toContainText(`上次成稿《${artifactTitle}》`);
    await expect(restored).toContainText("点击继续这次写作");
    await expect(page.getByRole("heading", { name: heroTitle })).toBeVisible();
    await expect(page.getByText("公文已生成")).toHaveCount(0);
    await expect(page.locator(".xs-sidebar__job")).toHaveCount(0);

    await restored.click();
    await expect(page).toHaveURL(/\/writing\/session$/);
    await expect(page.getByText(requirement)).toBeVisible();
  });

  test("生成中输入框还能接着打字，只是发不出去", async ({ page }) => {
    await install(page);
    await startGeneration(page);

    const input = page.getByRole("textbox", { name: "公文写作要求", exact: true });
    await expect(input).toBeEnabled();
    await input.fill("顺便补一句检查范围");
    await expect(input).toHaveValue("顺便补一句检查范围");
    // 发送位换成了停止，回车也不该抢跑一轮
    await expect(page.getByRole("button", { name: "生成完整公文" })).toHaveCount(0);
    await input.press("Enter");
    await expect(page.getByRole("button", { name: "停止" })).toBeVisible();
  });

  /* 入口三态的视觉证据：首页在跑、首页已生成、会话页成稿。 */
  test("三态截图", async ({ page }) => {
    const fixture = await install(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await startGeneration(page);

    await page.getByRole("link", { name: "报告智写" }).click();
    await expect(page.locator(notice)).toHaveAttribute("data-state", "running");
    await page.screenshot({ path: "outputs/compose-entry/01-home-running.png", animations: "disabled" });

    await fixture.releaseGeneration();
    await expect(page.locator(notice)).toHaveAttribute("data-state", "unseen");
    await page.screenshot({ path: "outputs/compose-entry/02-home-done.png", animations: "disabled" });

    await page.locator(notice).click();
    await expect(page.getByRole("article", { name: "生成的公文文件" })).toBeVisible();
    await page.screenshot({ path: "outputs/compose-entry/03-session.png", animations: "disabled" });
  });

  test("首页在大屏和手机上都不横向溢出", async ({ page }) => {
    await install(page);
    await startGeneration(page);
    await page.getByRole("link", { name: "报告智写" }).click();
    await expect(page.locator(notice)).toBeVisible();

    for (const size of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size);
      await expect(page.getByRole("heading", { name: heroTitle })).toBeVisible();
      const overflow = await page.evaluate(() => (
        document.documentElement.scrollWidth - document.documentElement.clientWidth
      ));
      expect(overflow, `${size.width} 宽度下不该出现横向滚动`).toBeLessThanOrEqual(0);
    }
  });
});
