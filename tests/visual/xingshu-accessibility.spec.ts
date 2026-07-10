import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const desktopViewport = { name: "desktop-1440", width: 1440, height: 900 };
const mobileViewport = { name: "mobile-390", width: 390, height: 844 };
const accessibilityViewports = [desktopViewport, mobileViewport];

type AccessibilityRoute = {
  slug: string;
  path: string;
  authenticated: boolean;
  ready: (page: Page) => Promise<void>;
};

const accessibilityRoutes: AccessibilityRoute[] = [
  {
    slug: "login",
    path: "/login",
    authenticated: false,
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "登录星数" })).toBeVisible();
    }
  },
  {
    slug: "home",
    path: "/",
    authenticated: true,
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "您好，张三", level: 1 })).toBeVisible();
    }
  },
  {
    slug: "analysis",
    path: "/analysis",
    authenticated: true,
    ready: async (page) => {
      await expect(page.getByRole("region", { name: "星数命令输入区" })).toBeVisible();
    }
  },
  {
    slug: "dashboard",
    path: "/dashboard",
    authenticated: true,
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "我的看板", level: 1 })).toBeVisible();
      await expect(page.locator('[data-echarts-ready="true"]')).toHaveCount(6);
    }
  },
  {
    slug: "data-management",
    path: "/data-management",
    authenticated: true,
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "数据资产管理", level: 1 })).toBeVisible();
      await expect(page.getByText("财务审计知识库", { exact: false }).first()).toBeVisible();
    }
  }
];

const axeTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// Axe runs every tagged automated rule. These surfaces still require human review because
// automation cannot judge their product meaning or end-to-end usability.
const manualReviewNotes = [
  "图表摘要是否准确表达可视化结论及业务语义",
  "键盘焦点顺序、抽屉关闭后的上下文连续性与长流程可理解性",
  "状态提示出现时机、文案清晰度和不同缩放级别下的视觉层级"
];

async function installAuthenticatedSession(page: Page) {
  await page.addInitScript(() => {
    const user = {
      token: "axe-audit-token",
      userId: 1,
      username: "张三",
      isAdmin: true
    };
    window.localStorage.setItem("xingshu_datahub_token", user.token);
    window.localStorage.setItem("xingshu_datahub_user", JSON.stringify(user));
    window.localStorage.setItem("xingshu_datahub_space_id", "1");
  });
}

async function clearAuthenticatedSession(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.removeItem("xingshu_datahub_token");
    window.localStorage.removeItem("xingshu_datahub_user");
    window.localStorage.removeItem("xingshu_datahub_space_id");
  });
}

test.describe("xingshu WCAG serious and critical gate", () => {
  for (const viewport of accessibilityViewports) {
    for (const routeCase of accessibilityRoutes) {
      test(`${routeCase.slug} has no blocking axe findings at ${viewport.name}`, async ({ page }, testInfo) => {
        await page.route("**/api/**", (route) =>
          route.fulfill({
            json: { code: 200, message: "accessibility test fixture", data: [] },
            status: 200
          })
        );
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        if (routeCase.authenticated) {
          await installAuthenticatedSession(page);
        } else {
          await clearAuthenticatedSession(page);
        }

        await page.goto(routeCase.path);
        await routeCase.ready(page);
        await page.evaluate(async () => {
          await document.fonts.ready;
        });

        const result = await new AxeBuilder({ page }).withTags(axeTags).analyze();
        const blockingFindings = result.violations
          .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
          .map((violation) => ({
            help: violation.help,
            id: violation.id,
            impact: violation.impact,
            nodes: violation.nodes.map((node) => JSON.stringify(node.target))
          }));

        await testInfo.attach(`axe-${routeCase.slug}-${viewport.name}.json`, {
          body: Buffer.from(
            JSON.stringify(
              {
                axeTags,
                blockingFindings,
                incomplete: result.incomplete.map((item) => ({
                  help: item.help,
                  id: item.id,
                  impact: item.impact,
                  nodes: item.nodes.map((node) => JSON.stringify(node.target))
                })),
                manualReviewNotes,
                route: routeCase.path,
                viewport,
                violations: result.violations
              },
              null,
              2
            )
          ),
          contentType: "application/json"
        });

        expect(
          blockingFindings,
          `Blocking accessibility findings on ${routeCase.path} at ${viewport.width}x${viewport.height}`
        ).toEqual([]);
      });
    }
  }
});
