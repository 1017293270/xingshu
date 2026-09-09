import { expect, type Page, test } from "@playwright/test";

/*
 * 生成过程离开 /writing 也要继续跑：写作台常驻在壳层里，路由重挂的只是承载它的槽位。
 * 这一组用例把正文流卡住，切走再回来，看进度指示、完成提醒和成稿是不是都还在。
 */
const templateName = "占位符通知模板";
const requirement = "撰写2026年安全检查通知，突出自查与复核安排";

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
  await expect(page.getByRole("button", { name: "停止" })).toBeVisible();
}

const runningDot = '.xs-sidebar__job[data-state="running"]';
const unseenDot = '.xs-sidebar__job[data-state="unseen"]';

test.describe("报告智写：生成过程跟着用户走", () => {
  test("离开写作台后生成继续跑，回来成稿还在", async ({ page }) => {
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
    await expect(page).toHaveURL(/\/writing$/);
    // 成稿是那一轮跑出来的，不是回来以后重跑的
    await expect(page.getByRole("article", { name: "生成的公文文件" })).toBeVisible();
    await expect(page.getByText(requirement)).toBeVisible();
    await expect(page.locator(".xs-sidebar__job")).toHaveCount(0);
  });

  test("回到写作台时页头跟着路径回到写作态", async ({ page }) => {
    const fixture = await install(page);
    await startGeneration(page);

    await page.getByRole("link", { name: "格式模板" }).click();
    await expect(page).toHaveURL(/\/writing\/templates$/);
    await expect(page.locator(".official-document-app")).toHaveAttribute("data-stage", "library");
    await expect(page.locator(runningDot)).toHaveCount(1);

    await page.getByRole("link", { name: "公文写作" }).click();
    await expect(page).toHaveURL(/\/writing$/);
    await expect(page.locator(".official-document-app")).toHaveAttribute("data-stage", "compose");

    await fixture.releaseGeneration();
    await expect(page.getByRole("article", { name: "生成的公文文件" })).toBeVisible();
    // 成稿是当面出来的：不弹提醒，也不留未读圆点
    await expect(page.getByText("公文已生成")).toHaveCount(0);
    await expect(page.locator(".xs-sidebar__job")).toHaveCount(0);
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
});
