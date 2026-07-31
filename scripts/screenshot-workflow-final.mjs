import { chromium } from "@playwright/test";

const base = "http://127.0.0.1:5173";
const dir = "outputs/workflow-pages-qa";

const mockSessions = Array.from({ length: 9 }, (_, i) => ({
  id: i + 1,
  sessionId: `s-${i}`,
  title: ["员工报销流程说明", "Q2销售业绩分析", "客户管理系统操作指南", "库存周转率分析", "考勤制度有哪些新变化", "数据资产管理月报撰写", "合同审批规范文档处理", "华东区渠道经营周报", "新员工入职材料清单"][i],
  chatMode: "ask",
  createdAt: "2026-06-05T09:32:00",
  updatedAt: "2026-06-05T09:32:00"
}));

const routes = ["/history", "/table", "/writing", "/cloud"];
const shots = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "390x844", width: 390, height: 844 }
];

const browser = await chromium.launch();
for (const shot of shots) {
  for (const route of routes) {
    const page = await browser.newPage({ viewport: { width: shot.width, height: shot.height } });
    await page.addInitScript(() => {
      const user = { token: "playwright-visual-token", userId: 1, username: "张三", isAdmin: true };
      window.localStorage.setItem("xingshu_datahub_token", user.token);
      window.localStorage.setItem("xingshu_datahub_user", JSON.stringify(user));
      window.localStorage.setItem("xingshu_datahub_space_id", "1");
    });
    await page.route("**/api/v1/chat/sessions/list", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 200, message: "ok", data: mockSessions }) })
    );
    await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${dir}/${route.slice(1)}-${shot.name}.png` });
    await page.close();
    console.log(`done ${route}-${shot.name}`);
  }
}
await browser.close();
