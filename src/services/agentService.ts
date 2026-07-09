import type { AgentMessageInput, AgentMessageResult, ConversationSummary } from "@/types/agent";
import {
  streamDataHubAskData,
  type DataHubAskDataStreamHandlers
} from "@/services/dataHubAskDataService";

export async function sendAgentMessage(input: AgentMessageInput): Promise<AgentMessageResult> {
  const conversationId = input.conversationId ?? "mock-conversation";

  return {
    conversationId,
    messageId: "mock-message",
    status: "accepted",
    content: input.content
  };
}

export function streamAgentMessage(input: AgentMessageInput, handlers: DataHubAskDataStreamHandlers): AbortController {
  return streamDataHubAskData(
    {
      message: input.content,
      sessionId: input.sessionId,
      chatId: input.chatId,
      datasourceId: input.datasourceId,
      spaceId: input.spaceId,
      chatMode: "agent",
      askStrategy: "cube_fallback"
    },
    handlers
  );
}

export async function createConversation(): Promise<ConversationSummary> {
  return {
    id: "mock-conversation",
    title: "新建对话",
    createdAt: "2026-07-02 00:00"
  };
}
