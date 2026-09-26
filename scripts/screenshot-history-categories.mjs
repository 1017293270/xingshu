import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

/**
 * 历史对话的分类标签与筛选：前缀认出的单模式会话、本机记下的编排会话（多个能力）、
 * 还没记下的编排会话与旧会话（未知，不打标签，只在「全部」里）。
 * 会话列表与后端同形（没有 chatMode），其余接口一律给空成功响应，不依赖业务后端。
 */
const base = process.env.XS_QA_BASE_URL || "http://127.0.0.1:4175";
const dir = process.env.HISTORY_QA_DIR || "outputs/beta04-history";

const sessions = [
  ["ask-data-6f1c", "本月各区域销售额排名", "2026-09-22T16:40:00"],
  ["agent-3b72", "分析区域业绩并核对考核制度", "2026-09-22T15:10:00"],
  ["ask-knowledge-91ad", "合同审批需要经过哪些环节", "2026-09-22T11:05:00"],
  ["agent-c4e0", "合同金额与盖章附件核对", "2026-09-21T17:20:00"],
  ["document-lookup-5d20", "找最新版员工手册", "2026-09-21T10:00:00"],
  ["agent-e913", "刚跑完但本机没有记录的编排", "2026-09-20T14:30:00"],
  ["session-2f8a", "经营数据分析（旧会话）", "2026-08-12T09:00:00"]
].map(([sessionId, title, updatedAt], index) => ({
  id: index + 1,
  sessionId,
  spaceId: 1,
  userId: 1,
  title,
  createdAt: updatedAt,
  updatedAt
}));

// 编排会话跑完时记下的实际能力（sessionId → 类别），与 src/services/historySessionKind 的存储格式一致。
const rememberedKinds = {
  "agent-3b72": { chatMode: "agent", categories: ["数据洞察", "知识快查"], updatedAt: 2 },
  "agent-c4e0": { chatMode: "agent", categories: ["数据洞察", "文档处理"], updatedAt: 1 }
};

const expectedLabels = {
  本月各区域销售额排名: "查数据",
  分析区域业绩并核对考核制度: "查数据 · 查知识",
  合同审批需要经过哪些环节: "查知识",
  "合同金额与盖章附件核对": "查数据 · 找文档",
  找最新版员工手册: "找文档",
  刚跑完但本机没有记录的编排: "",
  "经营数据分析（旧会话）": ""
};

const expectedByTab = {
  全部: sessions.map((session) => session.title),
  查知识: ["分析区域业绩并核对考核制度", "合同审批需要经过哪些环节"],
  查数据: ["本月各区域销售额排名", "分析区域业绩并核对考核制度", "合同金额与盖章附件核对"],
  找文档: ["合同金额与盖章附件核对", "找最新版员工手册"]
};

await mkdir(dir, { recursive: true });
const browser = await chromium.launch();

async function openHistory(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.addInitScript((kinds) => {
    const user = { token: "playwright-visual-token", userId: 1, username: "张三", isAdmin: true };
    window.localStorage.setItem("xingshu_datahub_token", user.token);
    window.localStorage.setItem("xingshu_datahub_user", JSON.stringify(user));
    window.localStorage.setItem("xingshu_datahub_space_id", "1");
    window.localStorage.setItem("xingshu_history_session_kinds", JSON.stringify(kinds));
  }, rememberedKinds);
  // 兜底先注册：Playwright 后注册的路由优先。
  await page.route("**/api/**", (route) =>
    route.fulfill({ json: { code: 200, message: "ok", data: null } })
  );
  await page.route("**/api/v1/chat/sessions/list", (route) =>
    route.fulfill({ json: { code: 200, message: "ok", data: sessions } })
  );
  await page.goto(`${base}/history`, { waitUntil: "networkidle" });
  await page.locator(".history-card").first().waitFor();
  return page;
}

async function visibleCards(page) {
  return page.locator(".history-card").evaluateAll((cards) =>
    cards.map((card) => ({
      title: card.querySelector(".history-card__title")?.textContent?.trim() ?? "",
      label: card.querySelector(".history-card__type")?.textContent?.trim() ?? "",
      name: card.getAttribute("aria-label") ?? ""
    }))
  );
}

try {
  const page = await openHistory(1440, 900);
  const all = await visibleCards(page);
  for (const card of all) {
    assert.equal(card.label, expectedLabels[card.title], `${card.title} 的类型标签`);
    if (!card.label) assert(!card.name.includes("查"), `${card.title} 未知类型不应读出标签`);
  }
  await page.screenshot({ path: `${dir}/history-all-1440.png`, fullPage: true });

  for (const [tab, titles] of Object.entries(expectedByTab)) {
    await page.locator(".ant-segmented-item", { hasText: tab }).click();
    await page.waitForTimeout(400);
    const cards = await visibleCards(page);
    assert.deepEqual(cards.map((card) => card.title), titles, `「${tab}」页签`);
    await page.screenshot({ path: `${dir}/history-tab-${tab}-1440.png`, fullPage: true });
    console.log(`${tab}：${cards.map((card) => `${card.title}（${card.label || "无标签"}）`).join("、")}`);
  }
  await page.close();

  const mobile = await openHistory(390, 844);
  const overflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  assert(overflow <= 1, `390 宽横向溢出 ${overflow}px`);
  await mobile.screenshot({ path: `${dir}/history-all-390.png`, fullPage: true });
  await mobile.close();
  console.log(`done · 截图在 ${dir}`);
} finally {
  await browser.close();
}
