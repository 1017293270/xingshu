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

export type DataHubChatMode = "ask" | "rag" | "document_lookup" | "agent";

export type DataHubChatRequest = {
  message: string;
  sessionId: string;
  globalSessionId: string;
  chatId: string;
  chatMode: DataHubChatMode;
};

export type DataHubChatSession = {
  id: number | string;
  sessionId: string;
  spaceId?: number;
  userId?: number;
  title?: string;
  chatMode?: DataHubChatMode;
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
  globalSessionId?: string;
  parentSessionId?: string;
  chatId?: string;
  seqNum?: number;
  type: string;
  data?: unknown;
  content?: unknown;
  agentName?: string;
  agentId?: string;
  subagentId?: string;
  label?: string;
  isThinking?: boolean;
  replyId?: string;
  modelCallIndex?: number;
  eventId?: string;
  sequence?: number;
  toolCallId?: string;
  timestamp?: number | string;
  finished?: boolean;
  createdAt?: string;
};

export type DataHubAskDataStatus = "idle" | "streaming" | "done" | "error" | "cancelled";

export type DataHubAskRunId = string;

export type DataHubSseEventType =
  | "agent_start"
  | "subagent_exposed"
  | "activity"
  | "thinking"
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
  | "data_source_selected"
  | "table"
  | "chart"
  | "ask_artifact"
  | "document_url"
  | "citation_document"
  | "hallucination"
  | "final_thinking"
  | "done"
  | "error";

export type DataHubActivityStatus =
  | "running"
  | "success"
  | "warning"
  | "failed"
  | "cancelled";

export type DataHubActivityData = {
  activityId: string;
  kind: "model" | "tool";
  action: string;
  label: string;
  status: DataHubActivityStatus;
  summary?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
};

export type DataHubStreamEvent = {
  type: DataHubSseEventType | string;
  data?: unknown;
  content?: unknown;
  agentName?: string;
  agentId?: string;
  subagentId?: string;
  label?: string;
  isThinking?: boolean;
  sessionId?: string;
  globalSessionId?: string;
  parentSessionId?: string;
  replyId?: string;
  modelCallIndex?: number;
  chatId?: string;
  eventId?: string;
  sequence?: number;
  toolCallId?: string;
  rawType?: string;
  timestamp?: number | string;
  eventFinished?: boolean;
  requestFinished?: boolean;
  finished?: boolean;
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

export type DataHubAdaptiveCoverageData = {
  scopeKnown?: boolean;
  scopeTotal?: number;
  examined?: number;
  returned?: number;
  resolved?: number;
  unresolvedItemRefs?: string[];
  unresolvedSlotIds?: string[];
  complete?: boolean;
  completionBlockers?: string[];
};

export type DataHubAdaptiveSourceResult = {
  observationId?: string;
  sourceKind?: "data" | "knowledge" | string;
  status?: "answered" | "partial" | "no_capability" | "no_match" | "failed" | string;
  datasourceId?: string | number;
  datasourceName?: string;
  kbIds?: Array<string | number>;
  knowledgeNames?: string[];
  documentRefs?: string[];
};

export type DataHubDocumentLookupResult = {
  docId: string | number;
  docKey: string;
  kbId: string | number;
  title: string;
  docName?: string;
  fileName?: string;
  contentType?: string;
  excerpt?: string;
  matchReason?: string;
  docStatus?: string;
  sourceUrl?: string;
  source?: {
    url?: string;
  };
  sourceAvailable?: boolean;
};

export type DataHubDoneData = {
  mode?: string;
  summary?: string;
  tables?: number;
  loopRounds?: number;
  totalDurationMs?: number;
  thinkingContent?: string;
  askKnowledge?: boolean;
  failed?: boolean;
  citationDocuments?: unknown[];
  documentLookup?: boolean;
  documentResults?: unknown[];
  documentSelectionMode?: "single" | "multiple" | "uncertain" | "none" | string;
  adaptiveTeam?: boolean;
  completion?: "complete" | "partial" | "unknown" | string;
  coverage?: DataHubAdaptiveCoverageData;
  sourceResults?: DataHubAdaptiveSourceResult[];
};

export type DataHubContentBlock = {
  content: string;
  replyId?: string;
  modelCallIndex?: number;
};

export type DataHubDataSourceSelected = {
  datasourceId: string | number;
  datasourceName: string;
};

export type DataHubCitationDocument = {
  docId: string;
  docKey: string;
  kbId: string;
  docName?: string;
  fileName?: string;
  sourceAvailable: boolean;
  markdownAvailable?: boolean;
  fragments: string[];
};

export type DataHubTableColumn = {
  columnId?: string;
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
  sessionId?: string;
  chatId?: string;
  assistantContent: string;
  answerBlocks: DataHubContentBlock[];
  thinkingContent: string;
  thinkingBlocks: DataHubContentBlock[];
  infoMessages: string[];
  dataSources: DataHubDataSourceSelected[];
  citationDocuments: DataHubCitationDocument[];
  decompose?: DataHubRoutingDecomposeData;
  routingEvents: DataHubStreamEvent[];
  reactSteps: DataHubReactStepData[];
  toolCalls: DataHubToolCallData[];
  toolResults: DataHubToolResultData[];
  tableResults: DataHubTableResult[];
  chartResults: unknown[];
  done?: DataHubDoneData;
  artifact?: AskArtifactRef;
  error?: {
    code?: number;
    message: string;
  };
};

export type DataHubExecutionStatus =
  | "idle"
  | "running"
  | "done"
  | "error"
  | "cancelled";

export type DataHubExecutionBlock = {
  type: DataHubSseEventType | string;
  sourceType: DataHubSseEventType | string;
  content: unknown;
  isThinking: boolean;
  timestamp?: number | string;
  replyId?: string;
  modelCallIndex?: number;
  eventId?: string;
  sequence?: number;
  toolCallId?: string;
};

export type DataHubAgentExecutionCard = {
  id: string;
  agentName: string;
  startedAt?: number | string;
  updatedAt?: number | string;
  status: DataHubExecutionStatus;
  blocks: DataHubExecutionBlock[];
};

export type DataHubOrchestrationState = {
  routingEvents: DataHubStreamEvent[];
  decompose?: DataHubRoutingDecomposeData;
  reactSteps: DataHubStreamEvent[];
  toolCalls: DataHubStreamEvent[];
  toolResults: DataHubStreamEvent[];
};

export type DataHubExecutionSession = {
  sessionId?: string;
  globalSessionId?: string;
  parentSessionId?: string;
  chatId?: string;
  agentId?: string;
  agentName?: string;
  subagentId?: string;
  label?: string;
  startedAt?: number | string;
  updatedAt?: number | string;
  status: DataHubExecutionStatus;
  finished: boolean;
  cards: DataHubAgentExecutionCard[];
  orchestration: DataHubOrchestrationState;
  events: DataHubStreamEvent[];
  dataSources: unknown[];
  tableResults: unknown[];
  citationDocuments: unknown[];
  documentResults: unknown[];
  done?: DataHubDoneData;
  error?: {
    code?: number;
    message: string;
    detail?: unknown;
  };
};

export type DataHubExecutionProjection = {
  mainSession: DataHubExecutionSession;
  subagentSessions: DataHubExecutionSession[];
  orphanedSubagentEvents: DataHubStreamEvent[];
  eventCount: number;
  fallbackAgentName: string;
};

export type DataHubSubagentTreeNode = {
  session: DataHubExecutionSession;
  level: number;
  children: DataHubSubagentTreeNode[];
};

export type AskArtifactRef = {
  askRunId: string;
  resolvedQuestion: string;
  canFavorite: boolean;
};

export type DataHubKnowledgeBase = {
  id: string;
  title: string;
  description?: string;
  documentCount?: number;
  updatedAt?: string;
};
