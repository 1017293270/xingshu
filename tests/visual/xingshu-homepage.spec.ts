import { expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({
      json: { code: 200, message: "visual test fixture", data: [] },
      status: 200
    })
  );

  await page.addInitScript(() => {
    const publicRoutes = ["/login", "/welcome"];

    if (publicRoutes.includes(window.location.pathname)) {
      window.localStorage.removeItem("xingshu_datahub_token");
      window.localStorage.removeItem("xingshu_datahub_user");
      window.localStorage.removeItem("xingshu_datahub_space_id");
      return;
    }

    const user = {
      token: "playwright-visual-token",
      userId: 1,
      username: "张三",
      isAdmin: true
    };
    window.localStorage.setItem("xingshu_datahub_token", user.token);
    window.localStorage.setItem("xingshu_datahub_user", JSON.stringify(user));
    window.localStorage.setItem("xingshu_datahub_space_id", "1");
  });
});

const viewports = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1672x941", width: 1672, height: 941 },
  { name: "2200x944", width: 2200, height: 944 },
  { name: "390x844", width: 390, height: 844 }
];

const welcomeViewports = [
  ...viewports,
  { name: "2560x1440", width: 2560, height: 1440 }
];

type SmokePage = {
  slug: string;
  path: string;
  heading?: string;
  region?: string;
  readyText?: string;
  shell?: boolean;
  charts: number;
};

const pages: SmokePage[] = [
  { slug: "login", path: "/login", heading: "登录星数", shell: false, charts: 0 },
  { slug: "home", path: "/", heading: "您好，张三", charts: 0 },
  { slug: "analysis", path: "/analysis", region: "星数命令输入区", charts: 0 },
  { slug: "history", path: "/history", heading: "历史对话", readyText: "还没有历史对话", charts: 0 },
  { slug: "table", path: "/table", heading: "智能制表", charts: 0 },
  { slug: "writing", path: "/writing", heading: "智能写作", charts: 0 },
  { slug: "dashboard", path: "/dashboard", heading: "我的看板", charts: 6 },
  { slug: "cloud", path: "/cloud", heading: "我的云盘", charts: 0 },
  { slug: "data-dashboard", path: "/data-dashboard", heading: "数据资产看板", charts: 4 },
  {
    slug: "data-management",
    path: "/data-management",
    heading: "数据资产管理",
    readyText: "财务审计知识库",
    charts: 0
  },
  { slug: "ai-settings", path: "/settings/ai", heading: "AI 配置", charts: 0 }
];

async function settleResponsiveLayout(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    });
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth
  }));

  expect(Math.max(overflow.body, overflow.document)).toBeLessThanOrEqual(overflow.viewport + 1);
}

async function expectReducedMotionStatic(page: Page) {
  const motionViolations = await page.locator("body *").evaluateAll((elements) => {
    const toSeconds = (value: string) => {
      const trimmed = value.trim();
      const amount = Number.parseFloat(trimmed);
      return Number.isFinite(amount) ? amount * (trimmed.endsWith("ms") ? 0.001 : 1) : 0;
    };

    return elements.flatMap((element) => {
      const styles = window.getComputedStyle(element);
      const animationDurations = styles.animationDuration.split(",").map(toSeconds);
      const transitionDurations = styles.transitionDuration.split(",").map(toSeconds);
      const hasFiniteAnimation =
        styles.animationName !== "none" && Math.max(0, ...animationDurations) > 0.001;
      const hasTransition =
        styles.transitionProperty !== "none" && Math.max(0, ...transitionDurations) > 0.001;
      const hasInfiniteAnimation = styles.animationIterationCount.split(",").includes("infinite");

      if (!hasFiniteAnimation && !hasTransition && !hasInfiniteAnimation) {
        return [];
      }

      return [
        {
          animationDuration: styles.animationDuration,
          animationIterationCount: styles.animationIterationCount,
          animationName: styles.animationName,
          element: `${element.tagName.toLowerCase()}.${Array.from(element.classList).join(".")}`,
          transitionDuration: styles.transitionDuration,
          transitionProperty: styles.transitionProperty
        }
      ];
    });
  });

  expect(motionViolations).toEqual([]);
  expect(
    await page.locator("html").evaluate((element) => window.getComputedStyle(element).scrollBehavior)
  ).not.toBe("smooth");
}

test.describe("xingshu page visual smoke", () => {
  for (const pageCase of pages) {
    for (const viewport of viewports) {
      test(`renders ${pageCase.slug} at ${viewport.name}`, async ({ page }) => {
        const runtimeErrors: string[] = [];
        page.on("console", (message) => {
          if (message.type() === "error") {
            runtimeErrors.push(message.text());
          }
        });
        page.on("pageerror", (error) => runtimeErrors.push(error.message));

        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(pageCase.path);

        if (pageCase.heading) {
          await expect(page.getByRole("heading", { name: pageCase.heading }).first()).toBeVisible();
        }
        if (pageCase.region) {
          await expect(page.getByRole("region", { name: pageCase.region }).first()).toBeVisible();
        }
        if (pageCase.readyText) {
          await expect(page.getByText(pageCase.readyText, { exact: false }).first()).toBeVisible();
        }

        if (pageCase.shell !== false && viewport.width > 900) {
          await expect(page.getByRole("navigation", { name: "星数主导航" })).toBeVisible();
        }
        if (pageCase.shell !== false && viewport.width <= 900) {
          await expect(page.getByRole("button", { name: "打开主导航" })).toBeVisible();
        }
        if (pageCase.charts > 0) {
          await expect(page.locator('[data-echarts-ready="true"]')).toHaveCount(pageCase.charts);
          await expect(page.locator('[data-echarts-renderer="canvas"]')).toHaveCount(pageCase.charts);
        }

        await settleResponsiveLayout(page);
        await expectNoHorizontalOverflow(page);

        await page.screenshot({
          path: `outputs/xingshu-homepage-system/qa/react/${pageCase.slug}-react-${viewport.name}.png`,
          animations: "disabled",
          fullPage: true
        });
        expect(runtimeErrors).toEqual([]);
      });
    }
  }
});

test.describe("dashboard editor unavailable state", () => {
  for (const viewport of viewports) {
    test(`renders an honest editor error at ${viewport.name}`, async ({ page }) => {
      await page.route(/\/workbenches(?:[/?#]|$)/, (route) => route.abort("connectionrefused"));
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/dashboard-editor");

      await expect(page.getByRole("heading", { name: "看板编辑器" })).toBeVisible();
      await expect(page.getByText("暂时无法连接看板编辑器", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "重试" })).toBeVisible();
      await settleResponsiveLayout(page);
      await expectNoHorizontalOverflow(page);

      await page.screenshot({
        path: `outputs/xingshu-homepage-system/qa/react/dashboard-editor-error-react-${viewport.name}.png`,
        animations: "disabled",
        fullPage: true
      });
    });
  }
});

test("sidebar logo is readable at desktop size", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/table");

  const logo = page.getByRole("img", { name: "星数" });
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute("src", /xingshu-logo-transparent/);

  const box = await logo.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(170);
  expect(box!.height).toBeGreaterThanOrEqual(76);
  expect(box!.height).toBeLessThanOrEqual(86);

  const firstNavTile = page.locator(".xs-sidebar__nav .xs-icon-tile").first();
  await expect(firstNavTile.locator("svg")).toBeVisible();
  const firstNavTileBox = await firstNavTile.boundingBox();
  expect(firstNavTileBox).not.toBeNull();
  expect(firstNavTileBox!.width).toBeGreaterThanOrEqual(28);
  expect(firstNavTileBox!.height).toBeGreaterThanOrEqual(28);
});

test("home page matches the reference welcome workbench composition", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "您好，张三", exact: true })).toBeVisible();
  await expect(page.getByText("我是您的数据管家，有什么可以帮您？")).toBeVisible();

  const metrics = await page.evaluate(() => {
    const hero = document.querySelector(".home-page__hero");
    const background = document.querySelector<HTMLImageElement>(".home-page__bg");
    const command = document.querySelector(".home-page .xs-command-box");
    const apps = document.querySelector(".home-page__apps");
    const firstCard = document.querySelector(".home-page .xs-app-card");
    const firstDescription = document.querySelector(".home-page .xs-app-card__desc");
    const firstIcon = document.querySelector(".home-page .xs-app-card .xs-icon-tile svg");
    const firstIconNode = document.querySelector(".home-page .xs-app-card .xs-icon-tile__node");

    if (
      !hero ||
      !background ||
      !command ||
      !apps ||
      !firstCard ||
      !firstDescription ||
      !firstIcon ||
      !firstIconNode
    ) {
      return null;
    }

    const heroRect = hero.getBoundingClientRect();
    const commandRect = command.getBoundingClientRect();
    const appsRect = apps.getBoundingClientRect();
    const cardRect = firstCard.getBoundingClientRect();
    const descriptionStyles = window.getComputedStyle(firstDescription);

    return {
      heroTop: heroRect.top,
      commandWidth: commandRect.width,
      commandHeight: commandRect.height,
      appsTop: appsRect.top,
      cardHeight: cardRect.height,
      cardWidth: cardRect.width,
      descriptionDisplay: descriptionStyles.display,
      generatedIconCount: document.querySelectorAll(".home-page .xs-icon-tile__image").length,
      iconTagName: firstIcon.tagName.toLowerCase(),
      backgroundLoaded: background.complete && background.naturalWidth > 0
    };
  });

  expect(metrics).not.toBeNull();
  expect(metrics!.backgroundLoaded).toBe(true);
  expect(metrics!.heroTop).toBeGreaterThanOrEqual(120);
  expect(metrics!.heroTop).toBeLessThanOrEqual(190);
  expect(metrics!.commandWidth).toBeGreaterThanOrEqual(980);
  expect(metrics!.commandWidth).toBeLessThanOrEqual(1120);
  expect(metrics!.commandHeight).toBeGreaterThanOrEqual(140);
  expect(metrics!.commandHeight).toBeLessThanOrEqual(176);
  expect(metrics!.appsTop).toBeGreaterThanOrEqual(400);
  expect(metrics!.appsTop).toBeLessThanOrEqual(560);
  expect(metrics!.cardHeight).toBeGreaterThanOrEqual(160);
  expect(metrics!.cardHeight).toBeLessThanOrEqual(190);
  expect(metrics!.cardWidth).toBeGreaterThanOrEqual(130);
  expect(metrics!.cardWidth).toBeLessThanOrEqual(170);
  expect(metrics!.descriptionDisplay).toBe("none");
  expect(metrics!.generatedIconCount).toBe(0);
  expect(metrics!.iconTagName).toBe("svg");
});

test("sidebar active item has a stronger selected state", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "我的看板" })).toBeVisible();

  const activeState = await page.getByRole("link", { name: /我的看板/ }).evaluate((element) => {
    const styles = window.getComputedStyle(element);

    return {
      backgroundColor: styles.backgroundColor,
      borderLeftColor: styles.borderLeftColor,
      borderLeftWidth: Number.parseFloat(styles.borderLeftWidth)
    };
  });

  expect(activeState.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(activeState.backgroundColor).not.toBe("rgb(255, 255, 255)");
  expect(activeState.borderLeftWidth).toBeGreaterThanOrEqual(3);
  expect(activeState.borderLeftColor).toMatch(/rgb\(22, 119, 255\)|rgb\(37, 99, 235\)/);
});

test("dashboard revenue card keeps KPI text inside the card", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "我的看板" })).toBeVisible();

  const revenueBounds = await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll(".board-card")).find((element) =>
      element.getAttribute("aria-label")?.includes("月度营收趋势")
    );
    const value = card?.querySelector(".revenue-value");
    const delta = card?.querySelector(".revenue-delta");

    if (!card || !value || !delta) {
      return null;
    }

    const cardRect = card.getBoundingClientRect();
    const valueRect = value.getBoundingClientRect();
    const deltaRect = delta.getBoundingClientRect();

    return {
      cardRight: cardRect.right,
      valueRight: valueRect.right,
      deltaRight: deltaRect.right
    };
  });

  expect(revenueBounds).not.toBeNull();
  expect(revenueBounds!.valueRight).toBeLessThanOrEqual(revenueBounds!.cardRight - 18);
  expect(revenueBounds!.deltaRight).toBeLessThanOrEqual(revenueBounds!.cardRight - 18);
});

test("dashboard alert title keeps the pending count readable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "我的看板" })).toBeVisible();

  const titleMetrics = await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll(".board-card")).find((element) =>
      element.getAttribute("aria-label")?.includes("智能预警")
    );
    const title = card?.querySelector("h2");

    if (!title) {
      return null;
    }

    return {
      clientWidth: title.clientWidth,
      scrollWidth: title.scrollWidth,
      text: title.textContent?.trim() ?? ""
    };
  });

  expect(titleMetrics).not.toBeNull();
  expect(titleMetrics!.text).toContain("2条未处理");
  expect(titleMetrics!.scrollWidth).toBeLessThanOrEqual(titleMetrics!.clientWidth + 1);
});

test.describe("xingshu welcome page visual smoke", () => {
  for (const viewport of welcomeViewports) {
    test(`renders welcome at ${viewport.name}`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          consoleErrors.push(message.text());
        }
      });

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/welcome");

      await expect(page.getByRole("main", { name: "星数欢迎页" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "欢迎来到星数" })).toBeVisible();
      await expect(page.getByRole("link", { name: "进入星数", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "开始智能问数" })).toBeVisible();
      await expect(page.getByRole("img", { name: "星数可信数据智能主视觉" })).toBeVisible();

      const heroOpacity = await page.locator(".welcome-page__visual img").evaluate((element) => {
        return Number.parseFloat(window.getComputedStyle(element).opacity);
      });
      expect(heroOpacity).toBeLessThan(0.95);

      const heroLayer = await page.locator(".welcome-page__visual").evaluate((element) => {
        const styles = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return {
          pointerEvents: styles.pointerEvents,
          position: styles.position,
          widthRatio: rect.width / window.innerWidth,
          zIndex: styles.zIndex
        };
      });
      expect(heroLayer.position).toBe("absolute");
      expect(heroLayer.pointerEvents).toBe("none");
      expect(heroLayer.widthRatio).toBeGreaterThan(0.5);
      expect(Number.parseInt(heroLayer.zIndex, 10)).toBeLessThan(1);

      if (viewport.width >= 2200) {
        const wideMetrics = await page.evaluate(() => {
          const shell = document.querySelector(".welcome-page__shell");
          const copy = document.querySelector(".welcome-page__copy");
          const firstCard = document.querySelector(".welcome-page__capability");

          if (!shell || !copy || !firstCard) {
            return null;
          }

          const shellRect = shell.getBoundingClientRect();
          const copyRect = copy.getBoundingClientRect();
          const cardRect = firstCard.getBoundingClientRect();

          return {
            shellWidthRatio: shellRect.width / window.innerWidth,
            copyCenterRatio: (copyRect.top + copyRect.height / 2) / window.innerHeight,
            copyLeftRatio: copyRect.left / window.innerWidth,
            cardWidth: cardRect.width,
            heroCenterRatio:
              (document.querySelector(".welcome-page__visual")!.getBoundingClientRect().top +
                document.querySelector(".welcome-page__visual")!.getBoundingClientRect().height / 2) /
              window.innerHeight
          };
        });

        expect(wideMetrics).not.toBeNull();
        expect(wideMetrics!.shellWidthRatio).toBeGreaterThanOrEqual(0.76);
        expect(wideMetrics!.copyCenterRatio).toBeGreaterThanOrEqual(0.43);
        expect(wideMetrics!.copyCenterRatio).toBeLessThanOrEqual(0.58);
        expect(wideMetrics!.copyLeftRatio).toBeLessThanOrEqual(0.14);
        expect(wideMetrics!.cardWidth).toBeGreaterThanOrEqual(220);
        expect(wideMetrics!.heroCenterRatio).toBeGreaterThanOrEqual(0.46);
        expect(wideMetrics!.heroCenterRatio).toBeLessThanOrEqual(0.6);
      }

      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(hasHorizontalOverflow).toBe(false);
      expect(consoleErrors).toEqual([]);

      await page.screenshot({
        path: `outputs/xingshu-homepage-system/qa/react/welcome-react-${viewport.name}.png`,
        fullPage: true
      });
    });
  }
});

test("mobile navigation reaches every product destination and account route", async ({ page }) => {
  const destinations: Array<{
    label: string;
    path: string;
    heading: string;
    charts?: number;
    readyText?: string;
  }> = [
    { label: "历史对话", path: "/history", heading: "历史对话", readyText: "还没有历史对话" },
    { label: "智能制表", path: "/table", heading: "智能制表" },
    { label: "智能写作", path: "/writing", heading: "智能写作" },
    { label: "我的看板", path: "/dashboard", heading: "我的看板", charts: 6 },
    { label: "我的云盘", path: "/cloud", heading: "我的云盘" },
    { label: "数据资产看板", path: "/data-dashboard", heading: "数据资产看板", charts: 4 },
    {
      label: "数据资产管理",
      path: "/data-management",
      heading: "数据资产管理",
      readyText: "财务审计知识库"
    }
  ];

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  for (const destination of destinations) {
    await page.getByRole("button", { name: "打开主导航" }).click();
    const drawer = page.getByRole("dialog", { name: "星数主导航" });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("link", { name: destination.label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${destination.path.replace("/", "\\/")}$`));
    await expect(page.getByRole("heading", { name: destination.heading, level: 1 })).toBeVisible();
    if (destination.readyText) {
      await expect(page.getByText(destination.readyText, { exact: false }).first()).toBeVisible();
    }
    if (destination.charts) {
      await expect(page.locator('[data-echarts-ready="true"]')).toHaveCount(destination.charts);
    }
    await expect(drawer).toBeHidden();
  }

  await page.getByRole("button", { name: "打开主导航" }).click();
  let drawer = page.getByRole("dialog", { name: "星数主导航" });
  await drawer.getByRole("button", { name: "新建对话" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "您好，张三", level: 1 })).toBeVisible();
  await expect(drawer).toBeHidden();

  await page.getByRole("button", { name: "打开主导航" }).click();
  drawer = page.getByRole("dialog", { name: "星数主导航" });
  await drawer.getByRole("button", { name: "移动端账户菜单" }).click();
  await expect(page.getByRole("menuitem", { name: /AI 配置/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /退出登录/ })).toBeVisible();
  await page.getByRole("menuitem", { name: /AI 配置/ }).click();
  await expect(page).toHaveURL(/\/settings\/ai$/);
  await expect(page.getByRole("heading", { name: "AI 配置", level: 1 })).toBeVisible();
});

test("reduced motion keeps feedback visible while suppressing nonessential motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "您好，张三", level: 1 })).toBeVisible();
  await expectReducedMotionStatic(page);

  await page.getByRole("button", { name: /选择 智能问数/ }).click();
  await expect(page.locator(".home-page__status")).toHaveText("已选择：智能问数");
  await expectReducedMotionStatic(page);

  await page.goto("/analysis");
  await expect(page.getByRole("region", { name: "星数命令输入区" })).toBeVisible();
  await expectReducedMotionStatic(page);
  await expectNoHorizontalOverflow(page);
});

test.describe("desktop content density", () => {
  const wideTrackCases = [
    { path: "/", selector: ".home-page__apps", minWidth: 1439, maxWidth: 1441 },
    { path: "/table", selector: ".xs-page", minWidth: 1439, maxWidth: 1441 },
    { path: "/writing", selector: ".xs-page", minWidth: 1439, maxWidth: 1441 },
    { path: "/analysis", selector: ".xs-page", minWidth: 1479, maxWidth: 1481 },
    { path: "/dashboard", selector: ".xs-page", minWidth: 1634, maxWidth: 1638 },
    { path: "/data-dashboard", selector: ".xs-page", minWidth: 1479, maxWidth: 1481 },
    { path: "/data-management", selector: ".xs-page", minWidth: 1479, maxWidth: 1481 }
  ];

  for (const pageCase of wideTrackCases) {
    test(`uses the segmented wide desktop rail on ${pageCase.path}`, async ({ page }) => {
      await page.setViewportSize({ width: 2200, height: 944 });
      await page.goto(pageCase.path);

      const trackWidth = await page.locator(pageCase.selector).first().evaluate((element) => {
        return element.getBoundingClientRect().width;
      });

      expect(trackWidth).toBeGreaterThanOrEqual(pageCase.minWidth);
      expect(trackWidth).toBeLessThanOrEqual(pageCase.maxWidth);
    });
  }

  test("uses denser card grids for list-heavy pages", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto("/table");
    await expect(page.locator(".sheet-list")).toHaveCSS("grid-template-columns", /\d+(?:\.\d+)?px \d+(?:\.\d+)?px/);

    await page.goto("/history");
    await expect(page.locator(".history-list")).toHaveCSS("grid-template-columns", /\d+(?:\.\d+)?px \d+(?:\.\d+)?px/);
  });
});
