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

export type DataHubChatSession = {
  id: number | string;
  sessionId: string;
  spaceId?: number;
  userId?: number;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type DataHubChatMessage = {
  id: number | string;
  sessionId: string;
  chatId?: string;
  role: "user" | "assistant" | "system" | string;
  content: string;
  seqNum?: number;
  createdAt?: string;
};

export type DataHubChatEvent = {
  id: number | string;
  sessionId: string;
  chatId?: string;
  seqNum?: number;
  type: string;
  data?: unknown;
  createdAt?: string;
};

export type DataHubAskDataStatus = "idle" | "streaming" | "done" | "error" | "cancelled";

export type DataHubAskRunId = string;

export type DataHubSseEventType =
  | "routing_intent"
  | "routing_skill"
  | "routing_strategy"
  | "routing_decompose"
  | "react_step"
  | "tool_call"
  | "tool_result"
  | "info"
  | "content"
  | "text"
  | "table"
  | "chart"
  | "hallucination"
  | "final_thinking"
  | "done"
  | "error";

export type DataHubStreamEvent = {
  type: DataHubSseEventType | string;
  data?: unknown;
  sessionId?: string;
  chatId?: string;
  timestamp?: number;
};

export type DataHubRoutingDecomposeData = {
  executionMode?: "SIMPLE" | "COMPLEX" | "CHAIN" | string;
  subQuestions?: string[];
};

export type DataHubReactStepData = {
  round?: number;
  stepNum?: number;
  action?: string;
  stepType?: "think" | "act" | "observe" | string;
  status?: "running" | "success" | "error" | "fail" | string;
  summary?: string;
  content?: string;
  resultSummary?: string;
  reason?: string;
  durationMs?: number;
};

export type DataHubToolCallData = {
  toolName?: string;
  tool?: string;
  name?: string;
  step?: string;
  args?: unknown;
  params?: unknown;
};

export type DataHubToolResultData = {
  toolName?: string;
  tool?: string;
  name?: string;
  status?: string;
  summary?: string;
  result?: unknown;
  query?: unknown;
  sql?: string;
  rows?: number | unknown[];
  cubes?: unknown;
  durationMs?: number;
};

export type DataHubDoneData = {
  mode?: string;
  summary?: string;
  tables?: number;
  loopRounds?: number;
  totalDurationMs?: number;
  thinkingContent?: string;
};

export type DataHubTableColumn = {
  key: string;
  title: string;
  type?: string;
};

export type DataHubTableResult = {
  columns: DataHubTableColumn[];
  rows: Record<string, unknown>[];
  totalRows: number;
  groupIndex?: number;
  groupLabel?: string;
  source?: string;
  tableIndex?: number;
};

export type DataHubAskTurn = {
  question: string;
  status: DataHubAskDataStatus;
  assistantContent: string;
  infoMessages: string[];
  decompose?: DataHubRoutingDecomposeData;
  routingEvents: DataHubStreamEvent[];
  reactSteps: DataHubReactStepData[];
  toolCalls: DataHubToolCallData[];
  toolResults: DataHubToolResultData[];
  tableResults: DataHubTableResult[];
  chartResults: unknown[];
  done?: DataHubDoneData;
  error?: {
    code?: number;
    message: string;
  };
};
