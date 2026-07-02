export type AgentMessageInput = {
  conversationId?: string;
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
