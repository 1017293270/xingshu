import type { AgentMessageInput, AgentMessageResult, ConversationSummary } from "@/types/agent";

export async function sendAgentMessage(input: AgentMessageInput): Promise<AgentMessageResult> {
  const conversationId = input.conversationId ?? "mock-conversation";

  return {
    conversationId,
    messageId: "mock-message",
    status: "accepted",
    content: input.content
  };
}

export async function createConversation(): Promise<ConversationSummary> {
  return {
    id: "mock-conversation",
    title: "新建对话",
    createdAt: "2026-07-02 00:00"
  };
}
