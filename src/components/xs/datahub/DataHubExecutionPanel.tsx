import {
  CaretDown,
  Robot,
  TreeStructure
} from "@phosphor-icons/react";
import { useId, useMemo, useRef, useState } from "react";
import { buildDataHubSubagentTree } from "@/services/dataHubExecutionProjector";
import { DataHubAgentExecutionCard } from "./DataHubAgentExecutionCard";
import { DataHubExecutionStatus } from "./DataHubExecutionStatus";
import { DataHubExecutionTimeline } from "./DataHubExecutionTimeline";
import { DataHubOrchestrationOverview } from "./DataHubOrchestrationOverview";
import { DataHubSubagentDrawer } from "./DataHubSubagentDrawer";
import { flattenSubagentTree } from "./display";
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

export function DataHubExecutionPanel({
  projection,
  subagentTree,
  title = "编排执行过程",
  className = "",
  emptyDescription = "本次响应没有可展示的编排事件。",
  defaultExpanded = true,
  drawerOpen,
  defaultDrawerOpen = false,
  onDrawerOpenChange,
  selectedSubagentId,
  onSelectedSubagentChange,
  onCitationOpen,
  renderBlock
}: DataHubExecutionPanelProps) {
  const titleId = useId();
  const bodyId = useId();
  const agentsTitleId = useId();
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
  const flattenedSubagents = useMemo(
    () => flattenSubagentTree(resolvedSubagentTree),
    [resolvedSubagentTree]
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

  const openDrawer = () => {
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

        <button
          ref={drawerTriggerRef}
          type="button"
          className="xs-datahub-execution__subagent-trigger"
          disabled={!flattenedSubagents.length}
          aria-haspopup="dialog"
          aria-expanded={isDrawerOpen}
          aria-label={`查看子智能体（${flattenedSubagents.length}）`}
          onClick={openDrawer}
        >
          <Robot size={17} weight="duotone" aria-hidden="true" />
          <span>子智能体</span>
          <strong key={flattenedSubagents.length}>{flattenedSubagents.length}</strong>
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
              {hasContent ? (
                <>
                  <DataHubOrchestrationOverview
                    session={projection.mainSession}
                    eventCount={projection.eventCount}
                    agentCount={allAgentNames.size}
                    subagentCount={projection.subagentSessions.length}
                  />
                  <DataHubExecutionTimeline session={projection.mainSession} />
                  <section
                    className="xs-datahub-execution__agents"
                    aria-labelledby={agentsTitleId}
                  >
                    <header className="xs-datahub-section-title">
                      <div>
                        <span>AGENT RUNS</span>
                        <h3 id={agentsTitleId}>智能体执行卡</h3>
                      </div>
                      <small>{projection.mainSession.cards.length} 个</small>
                    </header>
                    {projection.mainSession.cards.length ? (
                      <div className="xs-datahub-execution__agent-list">
                        {projection.mainSession.cards.map((card, index) => (
                          <DataHubAgentExecutionCard
                            key={card.id}
                            card={card}
                            staggerIndex={index}
                            onCitationOpen={onCitationOpen}
                            renderBlock={renderBlock}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="xs-datahub-execution__waiting">
                        <span aria-hidden="true" />
                        <div>
                          <strong>
                            {projection.mainSession.status === "running"
                              ? "等待智能体执行事件"
                              : "没有主智能体执行卡"}
                          </strong>
                          <p>路由和子智能体事件仍会按原始会话关系展示。</p>
                        </div>
                      </div>
                    )}
                  </section>
                </>
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
