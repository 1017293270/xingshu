import { expect, test } from "@playwright/test";

const viewports = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1672x941", width: 1672, height: 941 },
  { name: "2200x944", width: 2200, height: 944 },
  { name: "390x844", width: 390, height: 844 }
];

const pages = [
  { slug: "home", path: "/", heading: "您好，张三", charts: 0 },
  { slug: "analysis", path: "/analysis", heading: "已完成分析", charts: 1 },
  { slug: "history", path: "/history", heading: "历史对话", charts: 0 },
  { slug: "table", path: "/table", heading: "智能制表", charts: 0 },
  { slug: "writing", path: "/writing", heading: "智能写作", charts: 0 },
  { slug: "dashboard", path: "/dashboard", heading: "我的看板", charts: 6 },
  { slug: "cloud", path: "/cloud", heading: "我的云盘", charts: 0 },
  { slug: "data-dashboard", path: "/data-dashboard", heading: "数据资产看板", charts: 4 },
  { slug: "data-management", path: "/data-management", heading: "数据资产管理", charts: 0 }
];

test.describe("xingshu page visual smoke", () => {
  for (const pageCase of pages) {
    for (const viewport of viewports) {
      test(`renders ${pageCase.slug} at ${viewport.name}`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          consoleErrors.push(message.text());
        }
      });

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(pageCase.path);

      await expect(page.getByRole("heading", { name: pageCase.heading }).first()).toBeVisible();
      if (viewport.width > 900) {
        await expect(page.getByRole("navigation", { name: "星数主导航" })).toBeVisible();
      } else {
        await expect(page.getByRole("button", { name: "新建对话" })).toBeVisible();
      }
      if (pageCase.charts > 0) {
        await expect(page.locator('[data-echarts-ready="true"]')).toHaveCount(pageCase.charts);
        await expect(page.locator('[data-echarts-renderer="canvas"]')).toHaveCount(pageCase.charts);
      }

      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(hasHorizontalOverflow).toBe(false);
      expect(consoleErrors).toEqual([]);

      await page.screenshot({
        path: `outputs/xingshu-homepage-system/qa/react/${pageCase.slug}-react-${viewport.name}.png`,
        fullPage: true
      });
    });
  }
  }
});
