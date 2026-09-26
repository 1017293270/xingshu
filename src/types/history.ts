import type { DataHubChatMode } from "@/types/dataHub";

export type HistoryCategory = "知识快查" | "数据洞察" | "文档处理";

export type HistorySession = {
  id: string;
  sessionId?: string;
  title: string;
  summary: string;
  /**
   * 会话实际用到的能力，按「查数据 · 查知识 · 找文档」排序；编排会话可能有多个。
   * 空数组表示还不知道（后端列表不返回模式的旧会话），只出现在「全部」里。
   */
  categories: HistoryCategory[];
  updatedAt: string;
  source?: "mock" | "data-hub";
  messageCount?: number;
  chatMode?: DataHubChatMode;
};

export type HistoryFilter = {
  keyword?: string;
  category?: HistoryCategory | "全部";
};
