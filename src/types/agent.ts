export type AgentMessageInput = {
  conversationId?: string;
  sessionId?: string;
  chatId?: string;
  content: string;
  datasourceId?: number;
  spaceId?: number;
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
