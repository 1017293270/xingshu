import { expect, type Locator, test } from "@playwright/test";

const preview = "/tests/visual/fixtures/query-process.html";

async function titleFrames(title: Locator) {
  return title.evaluate(async (node) => {
    const first = getComputedStyle(node).backgroundPosition;
    const started = performance.now();
    await new Promise<void>((resolve) => {
      const frame = () => performance.now() - started >= 180 ? resolve() : requestAnimationFrame(frame);
      requestAnimationFrame(frame);
    });
    const style = getComputedStyle(node);
    return { first, second: style.backgroundPosition, animation: style.animationName,
      iterations: style.animationIterationCount, background: style.backgroundImage, clip: style.backgroundClip };
  });
}

test("phase titles animate only while running and stay static in terminal states", async ({ page }) => {
  await page.goto(preview);
  for (const [control, label] of [["思考中", "思考过程"], ["查询中", "查询过程"]]) {
    await page.getByRole("button", { name: control, exact: true }).click();
    const region = page.getByRole("region", { name: label, exact: true });
    await expect(region).toHaveAttribute("data-status", "running");
    const frames = await titleFrames(region.locator(".datahub-phase-title"));
    expect(frames.animation).toBe("xs-datahub-shimmer");
    expect(frames.iterations).toBe("infinite");
    expect(frames.background).toContain("linear-gradient");
    expect(frames.clip).toBe("text");
    expect(frames.first).not.toBe(frames.second);
  }
  for (const control of ["已完成", "失败", "已停止"]) {
    await page.getByRole("button", { name: control, exact: true }).click();
    for (const label of ["思考过程", "查询过程"]) {
      const title = page.getByRole("region", { name: label, exact: true }).locator(".datahub-phase-title");
      const frames = await titleFrames(title);
      expect(frames.animation).toBe("none");
      expect(frames.first).toBe(frames.second);
    }
  }
  await page.getByRole("button", { name: "查询中", exact: true }).click();
  for (const width of [1440, 1672, 1920, 2200, 390]) {
    await page.setViewportSize({ width, height: 1050 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await page.screenshot({ path: `outputs/process-motion/qa/running-${width}.png`, fullPage: true, animations: "disabled" });
  }
});

for (const label of ["思考过程", "查询过程"]) {
  test(`${label} collapse changes height and opacity before reaching its final state`, async ({ page }) => {
    await page.goto(preview);
    await page.getByRole("button", { name: label === "思考过程" ? "思考中" : "查询中", exact: true }).click();
    const region = page.getByRole("region", { name: label, exact: true });
    const toggle = region.getByRole("button", { name: new RegExp(`^${label}`) });
    const content = region.locator(":scope > .xs-datahub-collapse");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => content.evaluate((node) => getComputedStyle(node).opacity)).toBe("1");
    const openHeight = await content.evaluate((node) => node.getBoundingClientRect().height);
    expect(openHeight).toBeGreaterThan(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const frames = await content.evaluate(async (node) => {
      const frames: { height: number; opacity: number }[] = [];
      const started = performance.now();
      await new Promise<void>((resolve) => {
        const frame = () => {
          frames.push({ height: node.getBoundingClientRect().height, opacity: Number(getComputedStyle(node).opacity) });
          if (performance.now() - started >= 400) resolve(); else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      return frames;
    });
    expect(frames.some((frame) => frame.height > 0 && frame.height < openHeight)).toBeTruthy();
    expect(frames.some((frame) => frame.opacity > 0 && frame.opacity < 1)).toBeTruthy();
    await expect.poll(() => content.evaluate((node) => node.getBoundingClientRect().height)).toBe(0);
    await expect.poll(() => content.evaluate((node) => getComputedStyle(node).opacity)).toBe("0");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => content.evaluate((node) => node.getBoundingClientRect().height)).toBeCloseTo(openHeight, 2);
    await expect.poll(() => content.evaluate((node) => getComputedStyle(node).opacity)).toBe("1");
    await expect(content).toBeVisible();
  });
}

test("reduced motion and forced colors keep running titles static and readable", async ({ page }) => {
  for (const media of [{ reducedMotion: "reduce" as const }, { reducedMotion: "no-preference" as const, forcedColors: "active" as const }]) {
    await page.emulateMedia(media);
    await page.goto(preview);
    for (const [control, label] of [["思考中", "思考过程"], ["查询中", "查询过程"]]) {
      await page.getByRole("button", { name: control, exact: true }).click();
      const region = page.getByRole("region", { name: label, exact: true });
      const style = await region.locator(".datahub-phase-title").evaluate((node) => {
        const style = getComputedStyle(node);
        return { animation: style.animationName, color: style.color, fill: style.webkitTextFillColor, background: style.backgroundImage };
      });
      expect(style.animation).toBe("none");
      expect(style.background).toBe("none");
      expect(style.color).not.toBe("rgba(0, 0, 0, 0)");
      expect(style.fill).not.toBe("rgba(0, 0, 0, 0)");
      expect(await region.locator(":scope > .xs-datahub-collapse").evaluate((node) => getComputedStyle(node).transitionDuration)).toBe("0s");
    }
  }
});


test("waiting results shimmer while active and show descriptive query titles", async ({ page }) => {
  await page.goto(preview);
  const waiting = page.getByText("等待查询结果", { exact: true });
  await expect(waiting).toHaveClass("datahub-query-waiting-text");
  const frames = await titleFrames(waiting);
  expect(frames.animation).toBe("xs-datahub-shimmer");
  expect(frames.first).not.toBe(frames.second);
  await expect(page.locator(".datahub-query-waiting-icon")).toHaveCSS("animation-name", "xs-datahub-spin");
  for (const width of [1440, 1672, 1920, 2200, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `outputs/query-waiting-polish-2026-09-07/waiting-${width}.png`, animations: "disabled", fullPage: true });
  }
  for (const control of ["已完成", "失败", "已停止"]) {
    await page.getByRole("button", { name: control, exact: true }).click();
    await expect(page.locator(".datahub-query-waiting-text")).toHaveCount(0);
    await expect(page.locator(".datahub-query-waiting-icon")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "多次查询", exact: true }).click();
  await page.getByRole("button", { name: /查询过程/ }).click();
  const titles = page.locator(".datahub-business-explanation__query-title");
  await expect(titles).toHaveText(["查询发票开具明细", "按购方单位名称统计记录数", "按购方单位名称汇总开票金额"]);
  for (const width of [1440, 1672, 1920, 2200, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `outputs/query-waiting-polish-2026-09-07/query-titles-${width}.png`, animations: "disabled", fullPage: true });
  }
});

test("result waiting respects reduced motion and high contrast", async ({ page }) => {
  for (const media of [{ reducedMotion: "reduce" as const }, { reducedMotion: "no-preference" as const, forcedColors: "active" as const }]) {
    await page.emulateMedia(media);
    await page.goto(preview);
    const waiting = page.getByText("等待查询结果", { exact: true });
    await expect(waiting).toHaveCSS("animation-name", "none");
    await expect(waiting).toHaveCSS("background-image", "none");
    await expect(page.locator(".datahub-query-waiting-icon")).toHaveCSS("animation-name", "none");
    expect(await waiting.evaluate(node => getComputedStyle(node).webkitTextFillColor)).not.toBe("rgba(0, 0, 0, 0)");
  }
});
