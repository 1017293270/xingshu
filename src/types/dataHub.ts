export type DataHubApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export type DataHubLoginRequest = {
  username: string;
  password: string;
};

export type DataHubLoginResponse = {
  token: string;
  userId: number;
  username: string;
  isAdmin: boolean;
};

export type DataHubSpace = {
  id: number;
  spaceName: string;
  avatar?: string;
  description?: string;
  ownerId: number;
  myRole: string;
  memberCount: number;
  createdAt: string;
};

export type DataHubSpaceCreateInput = {
  spaceName: string;
  description?: string;
};

export type DataHubChatMode = "ask" | "agent" | "chat";

export type DataHubAskStrategy = "cube_only" | "ai_only" | "cube_fallback" | "agent";

export type DataHubChatRequest = {
  message: string;
  sessionId?: string;
  chatId: string;
  chatMode: DataHubChatMode;
  askStrategy: DataHubAskStrategy;
  datasourceId?: number;
  model?: string;
  providerId?: number;
  spaceId?: number;
};

export type DataHubStreamEvent = {
  type: string;
  data?: unknown;
  sessionId?: string;
  chatId?: string;
};
