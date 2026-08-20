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
  blocks: Array.from({ length: 429 }, (_, index) => ({
    id: `body-${index}`,
    order: index,
    role: index % 12 === 0 ? "HEADING_2" : "BODY",
    variantId: "body-main",
    text: `第 ${index + 1} 段：上半年经营情况、签约与回款完成度、下半年重点工作安排。`
  }))
};

test("429 个节点的草稿里，单次编辑操作不会阻塞画面", async ({ page }) => {
  await page.addInitScript(() => {
    const user = { token: "playwright-token", userId: 1, username: "qa", spaceId: 1 };
    window.localStorage.setItem("xingshu_datahub_token", user.token);
    window.localStorage.setItem("xingshu_datahub_user", JSON.stringify(user));
    window.localStorage.setItem("xingshu_datahub_space_id", "1");
  });

  await page.route("**/api/**", async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
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
  await expect(page.locator("article[data-block-id]").first()).toBeVisible();
  await page.waitForFunction(() => document.querySelectorAll("article[data-block-id]").length === 429);

  /* 点击到下一帧的间隔就是用户看到的"卡一下"。改坏一次 memo 这里会回到 500ms 以上。 */
  const measure = await page.evaluate(async () => {
    const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const frame = () => new Promise<number>((resolve) => requestAnimationFrame(() => resolve(performance.now())));

    const run = async (label: string, act: () => void) => {
      await wait(300);
      const start = performance.now();
      act();
      const painted = await frame();
      await wait(900);
      return { label, blocked: Math.round(painted - start) };
    };

    const cards = () => Array.from(document.querySelectorAll<HTMLElement>("article[data-block-id]"));
    const results = [];
    cards()[200].scrollIntoView({ block: "center" });
    results.push(await run("move", () => cards()[200].querySelector<HTMLElement>('button[aria-label="下移节点"]')!.click()));
    results.push(await run("typing", () => {
      const field = cards()[200].querySelector<HTMLTextAreaElement>("textarea")!;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(field, `${field.value}好`);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }));
    results.push(await run("delete", () => cards()[200].querySelector<HTMLElement>('[data-block-bin="true"]')!.click()));
    return results;
  });

  for (const { label, blocked } of measure) {
    expect(blocked, `${label} 阻塞了 ${blocked}ms`).toBeLessThan(250);
  }
});
