import type { ReactNode, RefObject } from "react";
import type {
  DataHubAgentExecutionCard,
  DataHubExecutionBlock,
  DataHubExecutionProjection,
  DataHubExecutionSession,
  DataHubStreamEvent,
  DataHubSubagentTreeNode
} from "@/types/dataHub";

export type DataHubExecutionRenderContext = {
  card: DataHubAgentExecutionCard;
  block: DataHubExecutionBlock;
};

export type DataHubExecutionPanelProps = {
  projection: DataHubExecutionProjection;
  subagentTree?: readonly DataHubSubagentTreeNode[];
  title?: string;
  className?: string;
  emptyDescription?: string;
  defaultExpanded?: boolean;
  drawerOpen?: boolean;
  defaultDrawerOpen?: boolean;
  onDrawerOpenChange?: (open: boolean) => void;
  selectedSubagentId?: string;
  onSelectedSubagentChange?: (sessionId?: string) => void;
  showMainDocumentBlocks?: boolean;
  onCitationOpen?: (content: unknown, block: DataHubExecutionBlock) => void;
  renderBlock?: (context: DataHubExecutionRenderContext) => ReactNode;
};

export type DataHubAgentExecutionCardProps = {
  card: DataHubAgentExecutionCard;
  defaultExpanded?: boolean;
  expandLatestActivity?: boolean;
  compact?: boolean;
  staggerIndex?: number;
  onCitationOpen?: (content: unknown, block: DataHubExecutionBlock) => void;
  renderBlock?: (context: DataHubExecutionRenderContext) => ReactNode;
};

export type DataHubOrchestrationOverviewProps = {
  session: DataHubExecutionSession;
  eventCount: number;
  agentCount: number;
  subagentCount: number;
};

export type DataHubExecutionTimelineProps = {
  session: DataHubExecutionSession;
};

export type DataHubSubagentDagProps = {
  mainSession: DataHubExecutionSession;
  nodes: readonly DataHubSubagentTreeNode[];
  onSelect: (sessionId: string, trigger: HTMLButtonElement) => void;
};

export type DataHubSubagentTreeProps = {
  nodes: readonly DataHubSubagentTreeNode[];
  selectedSessionId?: string;
  onSelect: (sessionId: string) => void;
};

export type DataHubSubagentDrawerProps = {
  open: boolean;
  nodes: readonly DataHubSubagentTreeNode[];
  selectedSessionId?: string;
  onSelectedSessionChange: (sessionId?: string) => void;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onCitationOpen?: (content: unknown, block: DataHubExecutionBlock) => void;
  renderBlock?: (context: DataHubExecutionRenderContext) => ReactNode;
};

export type DataHubExecutionEventView = {
  id: string;
  event: DataHubStreamEvent;
  type: string;
  title: string;
  summary?: string;
  status: "idle" | "running" | "done" | "error";
  timestamp?: number | string;
  durationMs?: number;
  agentName?: string;
};
