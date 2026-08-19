import { describe, expect, it } from "vitest";
import {
  ASK_TABLE_CHAT_MODE,
  ASK_TABLE_SESSION_PREFIX,
  createAskTableSessionId,
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
});
