import {
  CaretRight,
  TreeStructure
} from "@phosphor-icons/react";
import type { CSSProperties } from "react";
import {
  assignSubagentTones,
  flattenSubagentTree,
  formatExecutionTime,
  sessionDisplayName
} from "./display";
import { DataHubAgentAvatar } from "./DataHubAgentAvatar";
import { DataHubExecutionStatus } from "./DataHubExecutionStatus";
import type { DataHubSubagentTreeProps } from "./types";

export function DataHubSubagentTree({
  nodes,
  selectedSessionId,
  onSelect
}: DataHubSubagentTreeProps) {
  const entries = flattenSubagentTree(nodes);
  const toneMap = assignSubagentTones(nodes);

  if (!entries.length) {
    return (
      <div className="xs-datahub-subagent-tree__empty">
        <TreeStructure size={24} weight="duotone" aria-hidden="true" />
        <strong>暂无子智能体</strong>
        <p>出现子任务调度后，将在这里展示父子关系与执行状态。</p>
      </div>
    );
  }

  return (
    <div className="xs-datahub-subagent-tree" role="tree" aria-label="子智能体执行树">
      {entries.map((node, index) => {
        const session = node.session;
        const sessionId = session.sessionId ?? session.subagentId ?? `subagent-${node.level}`;
        const selected = selectedSessionId === sessionId;
        const startedAt = formatExecutionTime(session.startedAt);
        const name = sessionDisplayName(session);
        return (
          <button
            key={sessionId}
            type="button"
            role="treeitem"
            aria-level={node.level + 1}
            aria-selected={selected}
            className={`xs-datahub-subagent-tree__item${
              selected ? " xs-datahub-subagent-tree__item--selected" : ""
            }`}
            style={
              {
                "--xs-datahub-tree-level": node.level,
                "--xs-datahub-stagger": index
              } as CSSProperties
            }
            onClick={() => onSelect(sessionId)}
          >
            <DataHubAgentAvatar
              name={name}
              identity={sessionId}
              size="small"
              tone={toneMap.get(sessionId)}
            />
            <span className="xs-datahub-subagent-tree__identity">
              <strong>{name}</strong>
              <small title={session.sessionId}>
                {startedAt || "时间未知"}
                {session.sessionId ? ` · ${session.sessionId}` : ""}
              </small>
            </span>
            <DataHubExecutionStatus status={session.status} compact />
            <CaretRight size={14} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
