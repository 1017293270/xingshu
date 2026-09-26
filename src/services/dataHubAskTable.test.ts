import { describe, expect, it } from "vitest";
import {
  ASK_TABLE_CHAT_MODE,
  ASK_TABLE_SESSION_PREFIX,
  createAskTableSessionId,
  formatAskTableSessionTitle,
  isAskTableSession,
  selectRecentAskTableTemplates
} from "./dataHubAskTable";
import type { DataHubChatSession } from "@/types/dataHub";

function session(partial: Partial<DataHubChatSession> & Pick<DataHubChatSession, "sessionId">): DataHubChatSession {
  return {
    id: partial.id ?? partial.sessionId,
    title: "未命名",
    ...partial
  };
}

describe("dataHubAskTable", () => {
  it("creates session ids with the DataHub ask-table prefix", () => {
    expect(createAskTableSessionId().startsWith(ASK_TABLE_SESSION_PREFIX)).toBe(true);
  });

  it("treats prefixed ids and ask_table chatMode as table records", () => {
    expect(isAskTableSession(session({ sessionId: "ask-table-abc" }))).toBe(true);
    expect(isAskTableSession(session({ sessionId: "session-abc", chatMode: ASK_TABLE_CHAT_MODE }))).toBe(true);
    expect(isAskTableSession(session({ sessionId: "session-abc", chatMode: "ask" }))).toBe(false);
  });

  it("keeps only recent ask-table sessions from the overall records list", () => {
    const tables = selectRecentAskTableTemplates([
      session({
        sessionId: "session-ask",
        title: "本月经营趋势",
        chatMode: "ask",
        updatedAt: "2026-08-17T12:00:00"
      }),
      session({
        sessionId: "ask-table-older",
        title: "各部门人员通讯录",
        updatedAt: "2026-08-16T09:00:00"
      }),
      session({
        sessionId: "ask-table-sales",
        title: "客户销售排行榜表",
        updatedAt: "2026-08-17T10:00:00"
      }),
      session({
        sessionId: "ask-table-expense",
        title: "月度费用统计报表",
        updatedAt: "2026-08-15T08:00:00"
      }),
      session({
        sessionId: "ask-table-stock",
        title: "库存表——日用百货",
        updatedAt: "2026-08-14T08:00:00"
      })
    ]);

    expect(tables.map((table) => table.id)).toEqual([
      "ask-table-sales",
      "ask-table-older",
      "ask-table-expense",
      "ask-table-stock"
    ]);
    expect(tables.map((table) => table.iconId)).toEqual([
      "ranking",
      "contact-list",
      "expense-statistics",
      "inventory"
    ]);
    expect(tables[0]).toMatchObject({
      title: "客户销售排行榜表",
      tag: "排行",
      prompt: "客户销售排行榜表",
      description: "2026-08-17 10:00"
    });
  });

  it("returns every ask-table session instead of cutting the list at a fixed count", () => {
    const tables = selectRecentAskTableTemplates(
      Array.from({ length: 23 }, (_, index) =>
        session({
          sessionId: `ask-table-${index}`,
          title: `制表会话 ${index}`,
          updatedAt: `2026-08-${String(index + 1).padStart(2, "0")}T09:00:00`
        })
      )
    );

    expect(tables).toHaveLength(23);
    expect(tables[0].id).toBe("ask-table-22");
    expect(tables.at(-1)?.id).toBe("ask-table-0");
  });

  it("titles a template-launched session by its first sentence, even when the backend cut the reference in half", () => {
    const [complete, halfCut, cutAtBreak] = selectRecentAskTableTemplates([
      session({
        sessionId: "ask-table-complete",
        title: "按年度统计合同\n\n表结构参考（按以下列生成）：合同编号、合同金额",
        updatedAt: "2026-08-17T10:00:00"
      }),
      session({
        sessionId: "ask-table-half-cut",
        title: "统计各事业部2025年签约合同的金额与数量并按季度汇总到一张表里需要区分新签续签\n\n表结...",
        updatedAt: "2026-08-16T10:00:00"
      }),
      session({
        sessionId: "ask-table-cut-at-break",
        title: "统计各事业部2025年签约合同的金额与数量并按季度汇总到一张表里需要区分新签和续签\n...",
        updatedAt: "2026-08-15T10:00:00"
      })
    ]);

    expect(complete).toMatchObject({ title: "按年度统计合同", prompt: "按年度统计合同" });
    expect(halfCut.title).toBe("统计各事业部2025年签约合同的金额与数量并按季度汇总到一张表里需要区分新签续签");
    expect(halfCut.prompt).toBe(halfCut.title);
    expect(cutAtBreak.prompt).toBe("统计各事业部2025年签约合同的金额与数量并按季度汇总到一张表里需要区分新签和续签");
  });

  it("keeps a multi-line requirement whole for copying but titles it by the first line", () => {
    const [table] = selectRecentAskTableTemplates([
      session({
        sessionId: "ask-table-multiline",
        title: "统计各客户的合同金额\n补充要求：\n1. 客户不包含我司",
        updatedAt: "2026-08-17T10:00:00"
      })
    ]);

    expect(table.title).toBe("统计各客户的合同金额");
    expect(table.prompt).toBe("统计各客户的合同金额\n补充要求：\n1. 客户不包含我司");
  });

  it("formats a session title from the first non-empty line with collapsed spacing", () => {
    expect(formatAskTableSessionTitle("\n  华东区   Q1 销售排行 \n按销售额降序")).toBe("华东区 Q1 销售排行");
    expect(formatAskTableSessionTitle("")).toBe("");
    expect(formatAskTableSessionTitle(undefined)).toBe("");
  });
});
