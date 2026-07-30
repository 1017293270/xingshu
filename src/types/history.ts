import type { DataHubChatMode } from "@/types/dataHub";

export type HistoryCategory = "知识快查" | "数据洞察" | "文档处理";

export type HistorySession = {
  id: string;
  sessionId?: string;
  title: string;
  summary: string;
  category: HistoryCategory;
  updatedAt: string;
  source?: "mock" | "data-hub";
  messageCount?: number;
  chatMode?: DataHubChatMode;
};

export type HistoryFilter = {
  keyword?: string;
  category?: HistoryCategory | "全部";
};
