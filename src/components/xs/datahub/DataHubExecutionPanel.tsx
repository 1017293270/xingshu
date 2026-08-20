import {
  CaretDown,
  TreeStructure
} from "@phosphor-icons/react";
import { useId, useMemo, useRef, useState } from "react";
import { buildDataHubSubagentTree } from "@/services/dataHubExecutionProjector";
import { DataHubExecutionStatus } from "./DataHubExecutionStatus";
import { DataHubExecutionTimeline } from "./DataHubExecutionTimeline";
import { DataHubAgentExecutionCard } from "./DataHubAgentExecutionCard";
import { DataHubOrchestrationOverview } from "./DataHubOrchestrationOverview";
import { DataHubSubagentDag, dataHubDagGhostVisible } from "./DataHubSubagentDag";
import { DataHubSubagentDrawer } from "./DataHubSubagentDrawer";
import { asRecord, asString } from "./display";
import type { DataHubExecutionPanelProps } from "./types";
import "../../../pages/styles/datahub-execution.css";

function useControllableBoolean(
  controlled: boolean | undefined,
  defaultValue: boolean,
  onChange?: (value: boolean) => void
) {
  const [internal, setInternal] = useState(defaultValue);
  const value = controlled ?? internal;
  const update = (next: boolean) => {
    if (controlled === undefined) {
      setInternal(next);
    }
    onChange?.(next);
  };
  return [value, update] as const;
}

function useControllableSelection(
  controlled: string | undefined,
  onChange?: (value?: string) => void
) {
  const [internal, setInternal] = useState<string | undefined>();
  const value = controlled ?? internal;
  const update = (next?: string) => {
    if (controlled === undefined) {
      setInternal(next);
    }
    onChange?.(next);
  };
  return [value, update] as const;
}

function citationIdentity(content: unknown): string {
  const record = asRecord(content);
  const docId = asString(record?.docId) ?? asString(record?.doc_id);
  const docKey = asString(record?.docKey)?.trim();
  if (docId) return `doc:${docId}`;
  return docKey ? `key:${docKey}` : "";
}

export function DataHubExecutionPanel({
  projection,
  subagentTree,
  title = "编排执行过程",
  className = "",
  emptyDescription = "本次响应没有可展示的编排事件。",
  defaultExpanded = true,
  preferDirectMainExecution = false,
  drawerOpen,
  defaultDrawerOpen = false,
  onDrawerOpenChange,
  selectedSubagentId,
  onSelectedSubagentChange,
  showMainDocumentBlocks = true,
  onCitationOpen,
  renderBlock
}: DataHubExecutionPanelProps) {
  const titleId = useId();
  const bodyId = useId();
  const [expanded, setExpanded] = useState(defaultExpanded);
  // 首次展开后才挂载内容：折叠初始态下保持 DOM 为空（与条件渲染一致），
  // 之后保持挂载以支持平滑收起动画。
  const bodyMountedRef = useRef(expanded);
  if (expanded) {
    bodyMountedRef.current = true;
  }
  const [isDrawerOpen, setDrawerOpen] = useControllableBoolean(
    drawerOpen,
    defaultDrawerOpen,
    onDrawerOpenChange
  );
  const [selectedSessionId, setSelectedSessionId] = useControllableSelection(
    selectedSubagentId,
    onSelectedSubagentChange
  );
  const drawerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const resolvedSubagentTree = useMemo(
    () => subagentTree ?? buildDataHubSubagentTree(projection),
    [projection, subagentTree]
  );
  const allAgentNames = new Set([
    ...projection.mainSession.cards.map((card) => card.agentName),
    ...projection.subagentSessions.flatMap((session) =>
      session.cards.map((card) => card.agentName)
    )
  ]);
  const hasContent =
    projection.eventCount > 0 ||
    projection.mainSession.cards.length > 0 ||
    projection.subagentSessions.length > 0;
  const orchestration = projection.mainSession.orchestration;
  const hasOrchestrationStructure = Boolean(
    projection.subagentSessions.length ||
      orchestration.decompose ||
      orchestration.routingEvents.length ||
      orchestration.reactSteps.length ||
      orchestration.toolCalls.length ||
      orchestration.toolResults.length
  );
  const showDirectMainExecution =
    projection.mainSession.cards.length > 0 &&
    (preferDirectMainExecution || !hasOrchestrationStructure);
  const directMainCards = projection.mainSession.cards.map((card) => {
    const seenCitations = new Set<string>();
    const stageBlocks = card.blocks.filter((block) => {
      if (block.type === "table") {
        return false;
      }
      if (block.type === "citation_document" || block.type === "document_url") {
        if (!showMainDocumentBlocks) {
          return false;
        }
        const identity = citationIdentity(block.content);
        if (identity && seenCitations.has(identity)) {
          return false;
        }
        if (identity) seenCitations.add(identity);
      }
      return true;
    });
    return stageBlocks.length && stageBlocks.length !== card.blocks.length
      ? { ...card, blocks: stageBlocks }
      : card;
  });
  // 提问后的首个事件到达前：用幽灵编排画布填充面板，避免空白空状态框
  const ghostVisible = dataHubDagGhostVisible(
    projection.mainSession,
    resolvedSubagentTree.length > 0
  );

  const openDrawer = (
    sessionId: string,
    trigger: HTMLButtonElement
  ) => {
    drawerTriggerRef.current = trigger;
    setSelectedSessionId(sessionId);
    setDrawerOpen(true);
  };
  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedSessionId(undefined);
  };

  return (
    <section
      className={`xs-datahub-execution${className ? ` ${className}` : ""}`}
      aria-labelledby={titleId}
      data-status={projection.mainSession.status}
      aria-busy={projection.mainSession.status === "running"}
    >
      <header className="xs-datahub-execution__header">
        <button
          type="button"
          className="xs-datahub-execution__heading"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="xs-datahub-execution__heading-icon" aria-hidden="true">
            <TreeStructure size={19} weight="duotone" />
          </span>
          <span>
            <small>AGENT EXECUTION</small>
            <strong id={titleId}>{title}</strong>
          </span>
          <DataHubExecutionStatus status={projection.mainSession.status} compact />
          <CaretDown size={16} aria-hidden="true" />
        </button>
      </header>

      <div
        id={bodyId}
        className={`xs-datahub-collapse${expanded ? " xs-datahub-collapse--open" : ""}`}
        aria-hidden={!expanded}
      >
        <div className="xs-datahub-collapse__inner">
          {bodyMountedRef.current ? (
            <div className="xs-datahub-execution__body">
              {hasContent || ghostVisible ? (
                showDirectMainExecution ? (
                  <>
                  <div
                    className="xs-datahub-execution__main-cards"
                    aria-label="主智能体执行过程"
                  >
                    {directMainCards.map((card, index) => (
                      <DataHubAgentExecutionCard
                        key={card.id}
                        card={card}
                        compact
                        expandLatestActivity={false}
                        staggerIndex={index}
                        onCitationOpen={onCitationOpen}
                        renderBlock={renderBlock}
                      />
                    ))}
                  </div>
                  {preferDirectMainExecution && hasOrchestrationStructure ? (
                    <DataHubSubagentDag
                      mainSession={projection.mainSession}
                      nodes={resolvedSubagentTree}
                      onSelect={openDrawer}
                    />
                  ) : null}
                  </>
                ) : (
                  <>
                  {hasContent ? (
                    <DataHubOrchestrationOverview
                      session={projection.mainSession}
                      eventCount={projection.eventCount}
                      agentCount={allAgentNames.size}
                      subagentCount={projection.subagentSessions.length}
                    />
                  ) : null}
                  <DataHubSubagentDag
                    mainSession={projection.mainSession}
                    nodes={resolvedSubagentTree}
                    onSelect={openDrawer}
                  />
                  {hasContent ? (
                    <DataHubExecutionTimeline session={projection.mainSession} />
                  ) : null}
                  </>
                )
              ) : (
                <div className="xs-datahub-execution__empty">
                  <TreeStructure size={28} weight="duotone" aria-hidden="true" />
                  <strong>暂无编排记录</strong>
                  <p>{emptyDescription}</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <DataHubSubagentDrawer
        open={isDrawerOpen}
        nodes={resolvedSubagentTree}
        selectedSessionId={selectedSessionId}
        onSelectedSessionChange={setSelectedSessionId}
        onClose={closeDrawer}
        returnFocusRef={drawerTriggerRef}
        onCitationOpen={onCitationOpen}
        renderBlock={renderBlock}
      />
    </section>
  );
}
