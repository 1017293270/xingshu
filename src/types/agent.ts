import type { DataHubRequestChatMode } from "@/types/dataHub";

export type AgentMessageInput = {
  conversationId?: string;
  sessionId?: string;
  globalSessionId?: string;
  chatId?: string;
  chatMode?: DataHubRequestChatMode;
  content: string;
};

export type AgentMessageResult = {
  conversationId: string;
  messageId: string;
  status: "accepted";
  content: string;
};

export type ConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
};
