import type { AgentMessageInput, AgentMessageResult, ConversationSummary } from "@/types/agent";
import {
  streamDataHubAskData,
  streamDataHubInteractionResponse,
  type DataHubAskDataStreamHandlers,
  type DataHubInteractionResponseInput
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
      globalSessionId: input.globalSessionId,
      chatId: input.chatId,
      chatMode: input.chatMode ?? "ask"
    },
    handlers
  );
}

/**
 * 回答一张受控澄清卡：答案回到原来那个 chatId 上继续跑，
 * 后端把它记成过程事件而不是第二条用户消息，所以这里不是"再发一次提问"。
 */
export function respondToAgentInteraction(
  input: DataHubInteractionResponseInput,
  handlers: DataHubAskDataStreamHandlers
): AbortController {
  return streamDataHubInteractionResponse(input, handlers);
}

export async function createConversation(): Promise<ConversationSummary> {
  return {
    id: "mock-conversation",
    title: "新建对话",
    createdAt: "2026-07-02 00:00"
  };
}
