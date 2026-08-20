import { expect, test, type Route } from "@playwright/test";

const template = {
  id: "template-1",
  name: "通知模板",
  createdAt: "2026-08-01T00:00:00.000Z",
  versions: [
    {
      id: "version-1",
      versionNumber: 1,
      status: "PUBLISHED",
      originalFileName: "通知.docx",
      originalSize: 2048,
      originalSha256: "sha-1",
      createdAt: "2026-08-01T00:00:00.000Z"
    }
  ]
};

const draft = {
  id: "draft-1",
  templateId: "template-1",
  templateVersionId: "version-1",
  title: "上半年工作总结",
  createdAt: "2026-08-02T00:00:00.000Z",
  status: "READY",
  fileVersions: [{ versionNumber: 1, createdAt: "2026-08-02T00:00:00.000Z" }],
  bindings: []
};

const content = {
  revision: 1,
  fixedValues: [],
  blocks: [
    { id: "body-1", order: 0, role: "BODY", variantId: "body-main", text: "第一段：上半年整体经营情况。" },
    { id: "body-2", order: 1, role: "BODY", variantId: "body-main", text: "第二段：签约与回款完成度。" },
    { id: "body-3", order: 2, role: "BODY", variantId: "body-main", text: "第三段：下半年重点工作。" }
  ]
};

test("结构化节点的新增、移动、删除都有可见的动效", async ({ page }) => {
  await page.addInitScript(() => {
    const user = { token: "playwright-token", userId: 1, username: "qa", spaceId: 1 };
    window.localStorage.setItem("xingshu_datahub_token", user.token);
    window.localStorage.setItem("xingshu_datahub_user", JSON.stringify(user));
    window.localStorage.setItem("xingshu_datahub_space_id", "1");
  });

  await page.route("**/api/**", async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (path.endsWith("/v1/capabilities")) return json({});
    if (path.endsWith("/v1/templates")) return json({ items: [template] });
    if (path.endsWith("/v1/drafts")) return json({ items: [draft] });
    if (path.endsWith("/v1/drafts/draft-1/content")) {
      if (route.request().method() === "PUT") {
        const body = route.request().postDataJSON() as { blocks: unknown[] };
        return json({ revision: 2, fixedValues: [], blocks: body.blocks });
      }
      return json(content);
    }
    return route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/writing/drafts/draft-1");
  await expect(page.locator("article[data-block-id]")).toHaveCount(3);

  const ids = () => page.locator("article[data-block-id]").evaluateAll((cards) =>
    cards.map((card) => (card as HTMLElement).dataset.blockId)
  );
  expect(await ids()).toEqual(["body-1", "body-2", "body-3"]);

  // 移动：两张卡片同时位移，被点的那张抬起
  await page.getByRole("button", { name: "下移节点" }).first().click();
  const moving = await page.evaluate(() =>
    document.getAnimations()
      .filter((animation) => (animation.effect as KeyframeEffect | null)?.target instanceof HTMLElement
        && ((animation.effect as KeyframeEffect).target as HTMLElement).tagName === "ARTICLE")
      .map((animation) => ({
        duration: (animation.effect as KeyframeEffect).getTiming().duration,
        frames: (animation.effect as KeyframeEffect).getKeyframes().map((frame) => String(frame.transform ?? ""))
      }))
  );
  expect(moving).toHaveLength(2);
  expect(moving.some((entry) => entry.frames.some((frame) => frame.includes("scale(1.02)")))).toBe(true);
  await page.waitForTimeout(500);
  expect(await ids()).toEqual(["body-2", "body-1", "body-3"]);

  // 删除：残影收进删除按钮，数据立即少一条
  await page.getByRole("button", { name: "删除节点" }).first().click();
  await expect(page.locator(".structured-draft-editor__ghost")).toHaveCount(1);
  expect(await ids()).toEqual(["body-1", "body-3"]);
  const ghostBox = await page.locator(".structured-draft-editor__ghost").evaluate((ghost) => ({
    position: getComputedStyle(ghost).position,
    transform: getComputedStyle(ghost).transform,
    offsetTop: (ghost as HTMLElement).offsetTop,
    slotTop: (document.querySelector("article[data-block-id]") as HTMLElement).offsetTop
  }));
  expect(ghostBox.position).toBe("absolute");
  expect(ghostBox.transform).not.toBe("none");
  /* 残影停在被删卡片原来的槽位上，而不是掉到列表末尾 */
  expect(Math.abs(ghostBox.offsetTop - ghostBox.slotTop)).toBeLessThan(2);
  await expect(page.locator(".structured-draft-editor__ghost")).toHaveCount(0, { timeout: 2000 });

  // 新增：邻居让位后新卡片带高亮落位
  await page.getByRole("button", { name: "在下方新增节点" }).first().click();
  await page.getByRole("menuitem", { name: "正文" }).click();
  await expect(page.locator('article[data-just-added="true"]')).toHaveCount(1);
  const settled = await page.locator('article[data-just-added="true"]').evaluate((card) => new Promise<{
    opacity: string;
    shadow: string;
  }>((resolve) => {
    window.setTimeout(() => resolve({
      opacity: getComputedStyle(card).opacity,
      shadow: getComputedStyle(card).boxShadow
    }), 420);
  }));
  expect(Number(settled.opacity)).toBe(1);
  /* 落位后仍带一圈高亮，告诉用户新节点是哪一个 */
  expect(settled.shadow).not.toBe("none");
  await expect(page.locator("article[data-block-id]")).toHaveCount(3);
});
