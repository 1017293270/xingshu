import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { useUiStore } from "@/stores/uiStore";
import { AnalysisPage } from "./AnalysisPage";

beforeEach(() => {
  useUiStore.getState().resetUiState();
  vi.spyOn(window, "fetch").mockRejectedValue(new Error("Unexpected network request in response-flow fixture"));
});
afterEach(() => vi.restoreAllMocks());

function renderPage(mode: "ask" | "rag" | "document_lookup" | "agent") {
  return render(<AppProviders><MemoryRouter><AnalysisPage mode={mode} /></MemoryRouter></AppProviders>);
}

function openResultTables(count: number, rows: number) {
  const result = screen.getByRole("region", { name: "分析结果" });
  expect(within(result).queryByRole("table")).not.toBeInTheDocument();
  const query = screen.getByRole("region", { name: "查询过程" });
  const queryToggle = within(query).getByRole("button", { name: /查询过程/ });
  expect(queryToggle).toHaveAttribute("aria-expanded", "true");
  const tables = within(query).getByRole("region", { name: "查询结果" });
  expect(within(tables).getAllByRole("table")).toHaveLength(count);
  expect(within(tables).getAllByRole("row")).toHaveLength(count + rows);
  return within(tables);
}

describe("analysis response phases", () => {
  it("restores a suspended native clarification instead of completed empty phases", () => {
    const identity = { sessionId: "history-source", chatId: "history-source-chat" };
    const options = ["整改清单", "结算台账", "案件跟进表", "经营分析记录"].map((label) => ({ label, value: label }));
    useUiStore.getState().restoreAskDataHistory({
      sessionId: identity.sessionId,
      question: "前述风险事项的整改安排是什么？",
      chatMode: "ask",
      events: [
        { ...identity, type: "text", content: "请先明确需要查询的事项来源。" },
        { ...identity, type: "clarification", content: { interactionId: "source-choice", question: "需要查询哪一类事项？", options, allowFreeText: true } },
        { ...identity, type: "done", content: { suspended: true }, finished: true }
      ]
    });
    renderPage("ask");
    const choices = screen.getByRole("region", { name: "需要你确认" });
    expect(choices).toHaveTextContent("需要查询哪一类事项？");
    expect(within(choices).getByRole("group", { name: "候选答案" }).querySelectorAll("button")).toHaveLength(4);
    expect(screen.getByText("等待你补充信息")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "思考过程" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "查询过程" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("正式回答")).toHaveTextContent("请先明确需要查询的事项来源。");
    expect(window.fetch).not.toHaveBeenCalled();
  });

  it("does not present a terminal child status sentence as model thinking", () => {
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("本月收入", null, "ask");
    const sessionId = useUiStore.getState().analysisTurns[0].sessionId!;
    store.appendAskDataEvent(runId, { type: "thinking", sessionId, content: "正在读取经营指标。" });
    store.appendAskDataEvent(runId, { type: "thinking", sessionId: "child-session-should-not-become-root",
      parentSessionId: sessionId, content: "子任务已完成。", finished: true });
    store.appendAskDataEvent(runId, { type: "text", sessionId, content: "本月收入为128万元。" });
    store.completeAskDataRun(runId);
    renderPage("ask");
    fireEvent.click(screen.getByRole("button", { name: /思考过程/ }));
    expect(screen.getByLabelText("模型思考")).toHaveTextContent("正在读取经营指标。");
    expect(screen.queryByText("子任务已完成。")).not.toBeInTheDocument();
    expect(screen.getByLabelText("正式回答")).toHaveTextContent("本月收入为128万元。");
  });

  it("preserves conflicting evidence ids from two child queries of the same document", () => {
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("综合验收条款", null, "agent");
    const sessionId = useUiStore.getState().analysisTurns[0].sessionId!;
    for (const [childId, text] of [["child-a", "甲片段"], ["child-b", "乙片段"]]) {
      const identity = { sessionId: childId, parentSessionId: sessionId, globalSessionId: sessionId };
      store.appendAskDataEvent(runId, { type: "subagent_exposed", ...identity,
        content: { sessionId: childId, agentId: "ask-knowledge", label: "合同查询" } });
      store.appendAskDataEvent(runId, { type: "citation_document", ...identity, content: {
        docId: "9001", kbId: "7", docName: "采购合同.pdf", sourceAvailable: true,
        fragments: [text], evidenceFragments: [{ evidenceId: "e4", text }]
      } });
    }
    store.appendAskDataEvent(runId, { type: "text", sessionId, content: "原文引用：见证据 `e4`。" });
    store.completeAskDataRun(runId);
    renderPage("agent");
    expect(screen.queryByRole("button", { name: "e4：查看引用原文片段" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "e4：查看本轮引用文档（暂未提供准确位置）" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("暂未提供准确位置");
  });

  it("opens the exact server-confirmed evidence fragment without guessing its ordinal", () => {
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("验收要求", null, "rag");
    store.appendAskDataEvent(runId, { type: "citation_document", content: {
      docId: "9001", kbId: "7", docName: "采购合同.pdf", sourceAvailable: true,
      fragments: ["不相关第一片段。", "双方签署验收证明。"],
      evidenceFragments: [{ evidenceId: "e4", text: "双方签署验收证明。" }]
    } });
    store.appendAskDataEvent(runId, { type: "text", content: "原文引用：见证据 `e4`。" });
    store.completeAskDataRun(runId);
    renderPage("rag");
    fireEvent.click(screen.getByRole("button", { name: "e4：查看引用原文片段" }));
    const fragment = within(screen.getByRole("dialog")).getByLabelText("e4 引用原文片段");
    expect(fragment).toHaveTextContent("双方签署验收证明。");
    expect(fragment).not.toHaveTextContent("不相关第一片段");
    expect(screen.getByRole("dialog")).not.toHaveTextContent("暂未提供准确位置");
  });

  it("keeps long quotes collapsed after the answer and opens an honest evidence fallback", () => {
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("验收要求是什么", null, "rag");
    store.appendAskDataEvent(runId, { type: "citation_document", content: {
      docId: "9001", kbId: "7", docName: "采购合同.pdf", kbName: "采购合同", sourceAvailable: true,
      fragments: ["完整合同片段原文。"]
    } });
    store.appendAskDataEvent(runId, { type: "text", content: "验收需双方签字。\n\n原文引用：见证据 `e4`、`e1`。" });
    store.completeAskDataRun(runId);
    renderPage("rag");
    const answer = screen.getByLabelText("正式回答");
    const quotes = screen.getByLabelText("引用原文");
    expect(quotes.tagName).toBe("DETAILS");
    expect(quotes).not.toHaveAttribute("open");
    expect(answer.compareDocumentPosition(quotes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(within(answer).getByRole("button", { name: "e4：查看本轮引用文档（暂未提供准确位置）" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("该引用暂未提供准确位置");
    expect(within(dialog).getByRole("button", { name: "浏览文档片段：采购合同.pdf" })).toBeInTheDocument();
    expect(window.fetch).not.toHaveBeenCalled();
  });

  it("counts only the authoritative query when the answer restates its three rows", () => {
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("合同年度数量排名前三", null, "ask");
    store.appendAskDataEvent(runId, { type: "table", content: {
      columns: [{ name: "count", title: "记录数", type: "number" }, { name: "year", title: "合同签订或归属年度" }],
      rows: [{ count: 34, year: 2024 }, { count: 24, year: 2023 }, { count: 22, year: 2025 }], totalRows: 3, source: "cube"
    } });
    store.appendAskDataEvent(runId, { type: "text", content: "## 结果表\n\n| 排名 | 合同年度 | 合同数量 |\n| --- | --- | --- |\n| 1 | 2024 | 34 |\n| 2 | 2023 | 24 |\n| 3 | 2025 | 22 |\n\n以上为前三名。" });
    store.completeAskDataRun(runId);
    renderPage("ask");
    const answer = screen.getByLabelText("正式回答");
    expect(within(answer).getByRole("heading", { name: "结果表" }).nextElementSibling).toHaveTextContent("合同年度");
    expect(within(answer).getAllByRole("row")).toHaveLength(4);
    const query = screen.getByRole("region", { name: "查询过程" });
    expect(within(query).getAllByRole("table")).toHaveLength(1);
    expect(within(query).getByText("已返回 3 行")).toBeVisible();
    expect(query).not.toHaveTextContent("共 6 行");
  });

  it("keeps metadata tables in the answer without claiming returned query rows", () => {
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("有哪些表", null, "ask");
    store.appendAskDataEvent(runId, { type: "text", content: "未发起任何 Cube 查询。\n\n## 表说明\n\n| Cube | 物理表 |\n| --- | --- |\n| A | a |\n| B | b |\n| C | c |\n| D | d |" });
    store.completeAskDataRun(runId);
    renderPage("ask");
    const answer = screen.getByLabelText("正式回答");
    expect(within(answer).getAllByRole("row")).toHaveLength(5);
    expect(answer).toHaveTextContent("未发起任何 Cube 查询");
    expect(screen.queryByText(/本次返回/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /展开结果表/ })).not.toBeInTheDocument();
  });


  it("shows returned child analysis and final thinking snapshots alongside the root introduction", () => {
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("合同数量前三", null, "agent");
    const sessionId = useUiStore.getState().analysisTurns[0].sessionId!;
    const child = { sessionId: "contract-analysis", parentSessionId: sessionId, globalSessionId: sessionId };
    store.appendAskDataEvent(runId, { type: "thinking", sessionId, content: "我来帮您查询合同数量排名前三的情况。" });
    store.appendAskDataEvent(runId, { type: "subagent_exposed", ...child,
      content: { sessionId: child.sessionId, agentId: "ask-data", label: "合同统计" } });
    store.appendAskDataEvent(runId, { type: "thinking", ...child, content: "已确认本次统计对象为合同乙方。", replyId: "child-plan", modelCallIndex: 1 });
    store.appendAskDataEvent(runId, { type: "thinking", ...child, content: "需要保留第三名的并列公司。", replyId: "child-check", modelCallIndex: 2 });
    store.appendAskDataEvent(runId, { type: "done", ...child, content: {
      thinkingContent: "已确认本次统计对象为合同乙方。\n\n需要保留第三名的并列公司。\n\n返回数据中已保留全部并列项。",
      summary: "共查询到四家公司。"
    } });
    store.completeAskDataRun(runId);
    renderPage("agent");
    fireEvent.click(screen.getByRole("button", { name: /思考过程/ }));
    const thinking = screen.getByLabelText("模型思考");
    expect(thinking).toHaveTextContent("合同统计");
    expect(thinking).toHaveTextContent("已确认本次统计对象为合同乙方。");
    expect(thinking).toHaveTextContent("需要保留第三名的并列公司。");
    expect(thinking).toHaveTextContent("返回数据中已保留全部并列项。");
    expect(thinking).not.toHaveTextContent("共查询到四家公司。");
    expect(thinking.textContent!.match(/已确认本次统计对象/g)).toHaveLength(1);
  });

  it.each(["ask", "agent"] as const)("keeps ranked company facts after a heading and methodology survive table extraction in %s", (mode) => {
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("和善治签合同的公司签合同数量top3", null, mode);
    store.appendAskDataEvent(runId, { type: "text", content: [
      "## 善治数字科技（成都）有限公司合同对手方数量排名（Top 3，并列全部列出）",
      "",
      "按合同乙方聚合统计，对甲方=善治数字科技（成都）有限公司的全量合同记录进行计数并降序排序：",
      "",
      "| 排名 | 对手方 | 合同数量 |",
      "| --- | --- | --- |",
      "| 1 | 广州思迈特软件有限公司 | 6 |",
      "| 2 | 杭州海康威视科技有限公司 | 5 |",
      "| 3 | 云南蚁象网络科技有限公司 | 3 |",
      "| 3 | 并列第三示例公司 | 3 |"
    ].join("\n") });
    store.completeAskDataRun(runId);
    renderPage(mode);
    const answer = screen.getByLabelText("正式回答");
    for (const [name, count] of [["广州思迈特软件有限公司", "6"], ["杭州海康威视科技有限公司", "5"],
      ["云南蚁象网络科技有限公司", "3"], ["并列第三示例公司", "3"]]) {
      const item = within(answer).getByText(name).closest("tr")!;
      expect(item).toHaveTextContent(count);
    }
    expect(answer).toHaveTextContent("按合同乙方聚合统计");
    expect(within(answer).getByRole("table")).toBeVisible();
    expect(within(answer).getAllByRole("row")).toHaveLength(5);
    expect(screen.queryByRole("button", { name: /展开结果表/ })).not.toBeInTheDocument();
  });

  it("keeps a useful summary when a model returns only a Markdown table", () => {
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("查询合同状态", null, "ask");
    store.appendAskDataEvent(runId, { type: "text", content: "| 名称 | 状态 |\n| --- | --- |\n| 合同甲 | 已签署 |" });
    store.completeAskDataRun(runId);
    renderPage("ask");
    expect(screen.getByLabelText("正式回答")).toHaveTextContent("合同甲");
    expect(screen.getByLabelText("正式回答")).toHaveTextContent("已签署");
    const tables = within(screen.getByLabelText("正式回答"));
    expect(tables.getByRole("cell", { name: "合同甲" })).toBeVisible();
    expect(tables.getByRole("cell", { name: "已签署" })).toBeVisible();
    expect(window.fetch).not.toHaveBeenCalled();
  });

  it.each(["ask", "agent"] as const)("does not let a stray thinking marker replace the data summary in %s", (mode) => {
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("合同有多少份", null, mode);
    const sessionId = useUiStore.getState().analysisTurns[0].sessionId!;
    const identity = mode === "agent"
      ? { sessionId: "contract-child", parentSessionId: sessionId, globalSessionId: sessionId }
      : { sessionId };
    if (mode === "agent") store.appendAskDataEvent(runId, { type: "subagent_exposed", ...identity,
      content: { sessionId: identity.sessionId, agentId: "ask-data" } });
    store.appendAskDataEvent(runId, { type: "table", ...identity, content: {
      columns: [{ name: "count", title: "合同数量", type: "number" }], rows: [{ count: 12 }], totalRows: 1
    } });
    store.appendAskDataEvent(runId, { type: "text", ...identity, content: "</mm:think>" });
    store.appendAskDataEvent(runId, { type: "done", ...identity, content: { summary: "</mm:think>" } });
    store.completeAskDataRun(runId);
    renderPage(mode);
    expect(screen.getByLabelText("正式回答")).toHaveTextContent("合同数量：12。");
    expect(screen.getByRole("region", { name: "分析结果" })).not.toHaveTextContent("mm:think");
  });

  it("keeps split thinking envelopes out of the formal answer while streaming", () => {
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("合同有多少份", null, "ask");
    renderPage("ask");
    act(() => store.appendAskDataEvent(runId, { type: "text", content: "<mm:thi", replyId: "reply-1" }));
    expect(screen.queryByLabelText("正式回答")).not.toBeInTheDocument();
    act(() => store.appendAskDataEvent(runId, { type: "text", content: "nk>核对合同数量。</mm:thi", replyId: "reply-1" }));
    expect(screen.queryByLabelText("正式回答")).not.toBeInTheDocument();
    act(() => {
      store.appendAskDataEvent(runId, { type: "text", content: "nk>合同共 **12** 份。", replyId: "reply-1" });
      store.completeAskDataRun(runId);
    });
    const answer = screen.getByLabelText("正式回答");
    expect(answer).toHaveTextContent("合同共 12 份。");
    expect(answer).not.toHaveTextContent("核对合同");
    expect(answer).not.toHaveTextContent("mm:think");
    fireEvent.click(screen.getByRole("button", { name: /思考过程/ }));
    expect(screen.getByLabelText("模型思考")).toHaveTextContent("核对合同数量。");
  });

  it.each([
    { mode: "ask" as const, answerEvent: "text", rootSummary: false },
    { mode: "agent" as const, answerEvent: "text", rootSummary: false },
    { mode: "agent" as const, answerEvent: "done", rootSummary: false },
    { mode: "agent" as const, answerEvent: "done", rootSummary: true }
  ])("preserves $answerEvent conclusions alongside child tables in $mode (root summary: $rootSummary)", ({ mode, answerEvent, rootSummary }) => {
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("和善治签合同的公司签合同数量top3", null, mode);
    const sessionId = useUiStore.getState().analysisTurns[0].sessionId!;
    const child = { sessionId: "contracts-child", parentSessionId: sessionId, globalSessionId: sessionId };
    store.appendAskDataEvent(runId, { type: "text", sessionId, content: "我来为您查询合同签订情况。" });
    store.appendAskDataEvent(runId, { type: "subagent_exposed", ...child,
      content: { sessionId: child.sessionId, agentId: "ask-data", label: "合同查询" } });
    store.appendAskDataEvent(runId, { type: "table", ...child, content: {
      columns: [{ name: "company", title: "公司" }, { name: "count", title: "合同数量", type: "number" }],
      rows: [{ company: "广州思迈特软件有限公司", count: 6 }, { company: "杭州海康威视科技有限公司", count: 5 },
        { company: "第三公司", count: 3 }], totalRows: 3, source: "cube"
    } });
    const conclusion = "签约数量前三名依次是广州思迈特软件有限公司（6份）、杭州海康威视科技有限公司（5份）和第三公司（3份）。";
    if (answerEvent === "text") store.appendAskDataEvent(runId, { type: "text", ...child, content: conclusion });
    store.appendAskDataEvent(runId, { type: "done", ...child,
      content: answerEvent === "done" ? { summary: conclusion } : {} });
    store.appendAskDataEvent(runId, { type: "done", sessionId,
      content: rootSummary ? { summary: `最终核验：${conclusion}` } : {} });
    store.completeAskDataRun(runId);
    renderPage(mode);
    const result = screen.getByRole("region", { name: "分析结果" });
    const answer = within(result).getByLabelText("正式回答");
    expect(answer).toHaveTextContent(rootSummary ? `最终核验：${conclusion}` : conclusion);
    expect(answer).not.toHaveTextContent("我来为您查询");
    expect(answer).not.toHaveTextContent("本次返回");
    const tables = openResultTables(1, 3);
    expect(tables.getByRole("cell", { name: "广州思迈特软件有限公司" })).toBeVisible();
    expect(tables.getByRole("cell", { name: "6" })).toBeVisible();
  });

  it.each(["ask", "agent"] as const)("keeps the top-three summary in the answer and all source rows in the query when %s has no final text", (mode) => {
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("和善治签合同的公司签合同数量top3", null, mode);
    const sessionId = useUiStore.getState().analysisTurns[0].sessionId!;
    const identity = mode === "agent"
      ? { sessionId: "contracts-child", parentSessionId: sessionId, globalSessionId: sessionId }
      : { sessionId };
    if (mode === "agent") store.appendAskDataEvent(runId, {
      type: "subagent_exposed", ...identity,
      content: { sessionId: identity.sessionId, agentId: "ask-data", label: "合同查询" }
    });
    store.appendAskDataEvent(runId, { type: "table", ...identity, content: {
      columns: [{ name: "count", title: "记录数", type: "number" }, { name: "company", title: "合同乙方单位名称" }],
      rows: [{ count: 2, company: "第四公司" }, { count: 6, company: "广州思迈特软件有限公司" },
        { count: 3, company: "第三公司" }, { count: 5, company: "杭州海康威视科技有限公司" }],
      totalRows: 4, source: "cube"
    } });
    store.completeAskDataRun(runId);
    renderPage(mode);
    const result = screen.getByRole("region", { name: "分析结果" });
    const summary = within(result).getByLabelText("正式回答");
    expect(summary).toBeVisible();
    expect(summary).toHaveTextContent("广州思迈特软件有限公司");
    expect(summary).toHaveTextContent("杭州海康威视科技有限公司");
    expect(summary).toHaveTextContent("第三公司");
    expect(summary).not.toHaveTextContent("第四公司");
    expect(summary.textContent!.indexOf("广州思迈特")).toBeLessThan(summary.textContent!.indexOf("杭州海康"));
    expect(summary.textContent!.indexOf("杭州海康")).toBeLessThan(summary.textContent!.indexOf("第三公司"));
    const tables = openResultTables(1, 4);
    expect(tables.getByRole("cell", { name: "第四公司" })).toBeVisible();
    expect(tables.getAllByRole("row")).toHaveLength(5);
  });

  it.each([
    { mode: "ask" as const, child: false, count: 2 },
    { mode: "agent" as const, child: true, count: 1 },
    { mode: "agent" as const, child: true, count: 2 }
  ])("keeps $count returned tables directly visible in query process in $mode", ({ mode, child, count }) => {
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("查询合同明细", null, mode);
    const turn = useUiStore.getState().analysisTurns[0];
    for (let index = 0; index < count; index += 1) {
      const identity = { sessionId: child ? `query-${index}` : turn.sessionId!,
        ...(child ? { parentSessionId: turn.sessionId!, globalSessionId: turn.sessionId! } : {}) };
      if (child) store.appendAskDataEvent(runId, {
        type: "subagent_exposed", ...identity,
        content: { sessionId: identity.sessionId, agentId: "ask-data", label: `合同查询 ${index + 1}` }
      });
      store.appendAskDataEvent(runId, { type: "table", ...identity, content: {
        columns: [{ name: "contract", title: "合同名称" }, { name: "amount", title: "金额", type: "number" }],
        rows: [{ contract: `采购合同 ${index + 1}`, amount: 8000 + index }], totalRows: 1, source: "cube"
      } });
    }
    store.completeAskDataRun(runId);
    renderPage(mode);
    const result = openResultTables(count, count);
    expect(result.getAllByRole("table")).toHaveLength(count);
    expect(result.getByRole("cell", { name: `采购合同 ${count}` })).toBeVisible();
    expect(result.getAllByRole("button", { name: "下载表格" })).toHaveLength(count);
    expect(result.getAllByRole("button", { name: "复制表格" })).toHaveLength(count);
    const collapse = screen.getByRole("button", { name: /查询过程/ });
    fireEvent.click(collapse);
    expect(collapse).toHaveAttribute("aria-expanded", "false");
    expect(result.queryByRole("table")).not.toBeInTheDocument();
    expect(window.fetch).not.toHaveBeenCalled();
  });
  it("keeps a returned scalar visible even when the model sends no answer text", () => {
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("合同多少份", null, "ask");
    store.appendAskDataEvent(runId, { type: "table", content: {
      columns: [{ name: "count", title: "合同数", type: "number" }],
      rows: [{ count: 12 }], totalRows: 1, source: "cube"
    } });
    store.completeAskDataRun(runId);
    renderPage("ask");
    expect(screen.getByLabelText("正式回答")).toHaveTextContent("合同数：12。");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
  it.each(["ask", "rag", "document_lookup", "agent"] as const)("advances thinking to nested query details to result in %s mode", (mode) => {
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("查询合同", null, mode);
    renderPage(mode);
    expect(screen.getByRole("region", { name: "思考过程" })).toHaveAttribute("data-status", "running");
    expect(screen.getByText("正在整理思路…")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "查询过程" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "分析结果" })).not.toBeInTheDocument();

    act(() => store.appendAskDataEvent(runId, { type: "thinking", data: "先确认合同范围。", isThinking: true }));
    expect(screen.getByLabelText("模型思考")).toHaveTextContent("先确认合同范围。");
    expect(screen.queryByRole("region", { name: "查询过程" })).not.toBeInTheDocument();

    act(() => store.appendAskDataEvent(runId, { type: "tool_call", data: { name: "search", arguments: { query: "合同" } } }));
    expect(screen.getByRole("region", { name: "思考过程" })).toHaveAttribute("data-status", "done");
    const query = screen.getByRole("region", { name: "查询过程" });
    expect(query).toHaveAttribute("data-status", "running");
    const execution = within(query).getByRole("region", { name: mode === "agent" ? "智能编排执行" : "执行细节" });
    expect(execution.closest(".datahub-business-explanation__body")).not.toBeNull();
    expect(within(execution).getByRole("button", { name: /执行/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "分析结果" })).not.toBeInTheDocument();

    act(() => {
      store.appendAskDataEvent(runId, { type: "text", data: "合同共 12 份。" });
      store.completeAskDataRun(runId);
    });
    expect(query).toHaveAttribute("data-status", "done");
    expect(within(query).getByRole("button", { name: /查询过程/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "分析结果" })).toBeInTheDocument();
    if (mode !== "document_lookup") expect(screen.getByLabelText("正式回答")).toHaveTextContent("合同共 12 份。");
    expect(screen.queryByText("任务动态")).not.toBeInTheDocument();
    expect(screen.queryByText("综合结果")).not.toBeInTheDocument();
    expect(window.fetch).not.toHaveBeenCalled();
  });

  it("shows an honest thinking placeholder on the second round and no scalar table", () => {
    const store = useUiStore.getState();
    const first = store.startAskDataRun("合同总数是多少", null, "ask");
    store.appendAskDataEvent(first, { type: "text", data: "合同共 12 份。" });
    store.completeAskDataRun(first);
    renderPage("ask");
    let second = "";
    act(() => { second = store.startAskDataRun("其中生效的有多少", useUiStore.getState().analysisTurns[0].sessionId, "ask"); });
    const turns = screen.getAllByRole("region", { name: "星数分析结果" });
    const current = within(turns[1]);
    expect(current.getByText("正在整理思路…")).toBeInTheDocument();
    act(() => {
      store.appendAskDataEvent(second, {
        type: "table", data: {
          columns: [{ name: "count", title: "生效合同数量", type: "number" }],
          rows: [{ count: 8 }], totalRows: 1, source: "cube"
        }
      });
      store.appendAskDataEvent(second, { type: "text", data: "生效合同共 8 份。" });
      store.completeAskDataRun(second);
    });
    expect(current.queryByRole("region", { name: "思考过程" })).not.toBeInTheDocument();
    expect(current.getByLabelText("正式回答")).toHaveTextContent("生效合同共 8 份。");
    expect(current.queryByRole("table")).not.toBeInTheDocument();
    expect(current.queryByRole("region", { name: "智能图表建议" })).not.toBeInTheDocument();
    expect(window.fetch).not.toHaveBeenCalled();
  });
});

it("keeps incomplete received text readable alongside its error without favorite actions", () => {
  const store = useUiStore.getState();
  const runId = store.startAskDataRun("统计总收入", null, "ask");
  const sessionId = useUiStore.getState().analysisTurns[0].sessionId!;
  store.appendAskDataEvent(runId, { type: "text", sessionId, content: "本年度总收入为" });
  store.failAskDataRun(runId, "回答未完成，连接已结束，请重试");
  renderPage("ask");
  expect(screen.getByText("本年度总收入为", { exact: true })).toBeVisible();
  expect(screen.getByLabelText("未完成回答")).toHaveTextContent("生成未完成");
  expect(screen.queryByLabelText("正式回答")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("回答未完成");
  expect(screen.queryByRole("button", { name: "收藏问数" })).not.toBeInTheDocument();
});
