import {
  Brain,
  CaretDown,
  ChartLine,
  Code,
  Database,
  FileText,
  LinkSimple,
  Table,
  Wrench
} from "@phosphor-icons/react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";
import type {
  DataHubAgentExecutionCard,
  DataHubExecutionBlock
} from "@/types/dataHub";
import { XsSafeMarkdown } from "../XsSafeMarkdown";
import {
  asNumber,
  asRecord,
  asString,
  asStringArray,
  executionBlockLabel,
  formatExecutionTime,
  formatStructuredContent
} from "./display";
import { DataHubExecutionStatus } from "./DataHubExecutionStatus";
import {
  DataHubModelActivityCard,
  groupDataHubModelActivities,
  type DataHubExecutionDisplayItem
} from "./DataHubModelActivity";
import type { DataHubAgentExecutionCardProps } from "./types";

function blockIcon(block: DataHubExecutionBlock) {
  if (block.isThinking || block.type === "thinking" || block.type === "final_thinking") {
    return Brain;
  }
  if (block.type === "tool_call" || block.type === "tool_result") {
    return Wrench;
  }
  if (block.type === "data_source_selected") {
    return Database;
  }
  if (block.type === "table") {
    return Table;
  }
  if (block.type === "chart") {
    return ChartLine;
  }
  if (block.type === "citation_document" || block.type === "document_url") {
    return FileText;
  }
  if (block.type.startsWith("routing_") || block.type === "react_step") {
    return Code;
  }
  return FileText;
}

function startsModelCall(
  blocks: readonly DataHubExecutionBlock[],
  index: number
) {
  const block = blocks[index];
  const callIndex = block?.modelCallIndex;
  if (callIndex === undefined) {
    return false;
  }
  const previous = blocks[index - 1];
  return (
    index === 0 ||
    previous?.modelCallIndex !== callIndex ||
    previous?.replyId !== block.replyId
  );
}

function textContent(content: unknown): string | undefined {
  return asString(content);
}

function renderToolBlock(block: DataHubExecutionBlock) {
  const record = asRecord(block.content);
  const toolName =
    asString(record?.toolName) ??
    asString(record?.tool) ??
    asString(record?.name) ??
    "未命名工具";
  const summary =
    asString(record?.summary) ??
    asString(record?.resultSummary) ??
    asString(record?.status);
  const detail =
    block.type === "tool_call"
      ? record?.args ?? record?.params ?? record?.input
      : record?.result ?? record?.data ?? record?.output ?? record?.sql;

  return (
    <div className={`xs-datahub-agent-card__tool xs-datahub-agent-card__tool--${block.type}`}>
      <div>
        <Wrench size={15} weight="duotone" aria-hidden="true" />
        <strong>{toolName}</strong>
        <span>{block.type === "tool_call" ? "调用" : "返回"}</span>
      </div>
      {summary ? <p>{summary}</p> : null}
      {detail !== undefined ? (
        <details>
          <summary>{block.type === "tool_call" ? "查看参数" : "查看结果"}</summary>
          <pre>{formatStructuredContent(detail)}</pre>
        </details>
      ) : null}
    </div>
  );
}

type TablePreview = {
  columns: Array<{ key: string; title: string }>;
  rows: Array<Record<string, unknown>>;
  totalRows?: number;
};

function tablePreview(content: unknown): TablePreview | undefined {
  const record = asRecord(content);
  const nested = asRecord(record?.table) ?? record;
  const rawColumns = Array.isArray(nested?.columns) ? nested.columns : [];
  const columns = rawColumns.flatMap((column, index) => {
    const columnName = asString(column);
    if (columnName) {
      return [{ key: columnName, title: columnName }];
    }
    const columnRecord = asRecord(column);
    const key =
      asString(columnRecord?.key) ??
      asString(columnRecord?.name) ??
      asString(columnRecord?.dataIndex) ??
      asString(columnRecord?.columnId);
    if (!key) {
      return [];
    }
    return [
      {
        key,
        title:
          asString(columnRecord?.title) ??
          asString(columnRecord?.label) ??
          key ??
          `列 ${index + 1}`
      }
    ];
  });
  const rawRows = nested?.rows ?? nested?.data;
  const rows = Array.isArray(rawRows)
    ? rawRows.flatMap((row) => {
        const rowRecord = asRecord(row);
        if (rowRecord) {
          return [rowRecord];
        }
        if (Array.isArray(row) && columns.length) {
          return [
            Object.fromEntries(
              columns.map((column, index) => [column.key, row[index]])
            )
          ];
        }
        return [];
      })
    : [];
  if (!columns.length && rows[0]) {
    Object.keys(rows[0]).forEach((key) => columns.push({ key, title: key }));
  }
  if (!columns.length && !rows.length) {
    return undefined;
  }
  return {
    columns,
    rows,
    totalRows: asNumber(nested?.totalRows ?? nested?.total)
  };
}

function renderTableBlock(
  block: DataHubExecutionBlock,
  options?: {
    compact?: boolean;
    expanded?: boolean;
    onExpandedChange?: (expanded: boolean) => void;
  }
) {
  const preview = tablePreview(block.content);
  if (!preview) {
    return <pre className="xs-datahub-agent-card__json">{formatStructuredContent(block.content)}</pre>;
  }
  const visibleRows = preview.rows.slice(0, 5);
  const table = (
    <div className="xs-datahub-agent-card__table">
      <div className="xs-datahub-agent-card__table-meta">
        <span>{preview.totalRows ?? preview.rows.length} 行数据</span>
        {preview.rows.length > visibleRows.length ? <small>展示前 5 行</small> : null}
      </div>
      <div>
        <table>
          <caption className="sr-only">子智能体查询结果预览</caption>
          <thead>
            <tr>
              {preview.columns.map((column) => (
                <th key={column.key} scope="col">
                  {column.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {preview.columns.map((column) => (
                  <td key={column.key}>{formatStructuredContent(row[column.key] ?? "—")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (!options?.compact) {
    return table;
  }

  return (
    <details
      className="xs-datahub-agent-card__table-disclosure"
      open={options.expanded}
      onToggle={(event) => {
        if (event.currentTarget.open !== options.expanded) {
          options.onExpandedChange?.(event.currentTarget.open);
        }
      }}
    >
      <summary>
        <span>
          <Table size={13} aria-hidden="true" />
          查询结果
        </span>
        <small>{preview.totalRows ?? preview.rows.length} 行</small>
      </summary>
      {table}
    </details>
  );
}

function displayItemKey(
  cardId: string,
  item: DataHubExecutionDisplayItem,
  index: number
) {
  if (item.kind === "model-activity") {
    return `activity:${item.activity.id}`;
  }
  const block = item.block;
  return (
    block.eventId ??
    `${cardId}-${block.sourceType}-${block.sequence ?? index}-${index}`
  );
}

function renderDataSource(block: DataHubExecutionBlock) {
  const record = asRecord(block.content);
  const name =
    asString(record?.datasourceName) ??
    asString(record?.dataSourceName) ??
    asString(record?.name) ??
    "已选择数据源";
  const id = asString(record?.datasourceId ?? record?.dataSourceId ?? record?.id);
  return (
    <div className="xs-datahub-agent-card__source">
      <Database size={17} weight="duotone" aria-hidden="true" />
      <span>
        <strong>{name}</strong>
        {id ? <small>ID：{id}</small> : null}
      </span>
    </div>
  );
}

function renderCitation(
  block: DataHubExecutionBlock,
  onCitationOpen?: DataHubAgentExecutionCardProps["onCitationOpen"]
) {
  const record = asRecord(block.content);
  const title =
    asString(record?.docName) ??
    asString(record?.fileName) ??
    asString(record?.title) ??
    asString(record?.docKey) ??
    "引用文档";
  const fragments = asStringArray(record?.fragments);
  const sourceAvailable = record?.sourceAvailable !== false;
  return (
    <div className="xs-datahub-agent-card__citation">
      <div className="xs-datahub-agent-card__citation-head">
        <FileText size={17} weight="duotone" aria-hidden="true" />
        <strong title={title}>{title}</strong>
        <button
          type="button"
          disabled={!sourceAvailable || !onCitationOpen}
          onClick={() => onCitationOpen?.(block.content, block)}
          aria-label={`打开原文：${title}`}
        >
          <LinkSimple size={14} aria-hidden="true" />
          {sourceAvailable ? "打开原文" : "原文不可用"}
        </button>
      </div>
      {fragments.length ? (
        <details>
          <summary>查看引用片段（{fragments.length}）</summary>
          <div>
            {fragments.map((fragment, index) => (
              <XsSafeMarkdown
                key={`${block.eventId ?? "citation"}-${index}`}
                content={fragment}
              />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function defaultBlockContent(
  block: DataHubExecutionBlock,
  onCitationOpen?: DataHubAgentExecutionCardProps["onCitationOpen"],
  tableOptions?: {
    compact?: boolean;
    expanded?: boolean;
    onExpandedChange?: (expanded: boolean) => void;
  }
): ReactNode {
  const isThinking =
    block.isThinking || block.type === "thinking" || block.type === "final_thinking";
  const text = textContent(block.content);
  if (isThinking) {
    return (
      <details className="xs-datahub-agent-card__thinking" open>
        <summary>
          <Brain size={15} weight="duotone" aria-hidden="true" />
          {executionBlockLabel(block)}
        </summary>
        {text ? (
          <XsSafeMarkdown content={text} />
        ) : (
          <pre>{formatStructuredContent(block.content)}</pre>
        )}
      </details>
    );
  }
  if (block.type === "tool_call" || block.type === "tool_result") {
    return renderToolBlock(block);
  }
  if (block.type === "table") {
    return renderTableBlock(block, tableOptions);
  }
  if (block.type === "data_source_selected") {
    return renderDataSource(block);
  }
  if (block.type === "citation_document" || block.type === "document_url") {
    return renderCitation(block, onCitationOpen);
  }
  if (text) {
    return <XsSafeMarkdown content={text} />;
  }
  return <pre className="xs-datahub-agent-card__json">{formatStructuredContent(block.content)}</pre>;
}

export function DataHubAgentExecutionCard({
  card,
  defaultExpanded = true,
  expandLatestActivity = true,
  compact = false,
  staggerIndex,
  onCitationOpen,
  renderBlock
}: DataHubAgentExecutionCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  // 首次展开后才挂载内容：折叠初始态下保持 DOM 为空（与条件渲染一致），
  // 之后保持挂载以支持平滑收起动画。
  const blocksMountedRef = useRef(expanded);
  if (expanded) {
    blocksMountedRef.current = true;
  }
  const startedAt = formatExecutionTime(card.startedAt);
  const updatedAt = formatExecutionTime(card.updatedAt);
  const displayItems: DataHubExecutionDisplayItem[] = renderBlock
    ? card.blocks.map((block) => ({ kind: "block", block }))
    : groupDataHubModelActivities(card.blocks);
  const displayBlocks = displayItems.map((item) => item.block);
  const activityItems = displayItems.filter(
    (
      item
    ): item is Extract<DataHubExecutionDisplayItem, { kind: "model-activity" }> =>
      item.kind === "model-activity"
  );
  const runningActivityId = [...activityItems]
    .reverse()
    .find((item) => item.activity.status === "running")?.activity.id;
  const latestActivityId = activityItems.at(-1)?.activity.id;
  const [expandedActivityId, setExpandedActivityId] = useState<
    string | undefined
  >(expandLatestActivity ? runningActivityId ?? latestActivityId : undefined);
  const tableItemKeys = displayItems.flatMap((item, index) =>
    item.kind === "block" && item.block.type === "table"
      ? [displayItemKey(card.id, item, index)]
      : []
  );
  const latestTableKey = tableItemKeys.at(-1);
  const [expandedTableKey, setExpandedTableKey] = useState<string | undefined>(
    latestTableKey
  );
  const previousLatestTableKeyRef = useRef(latestTableKey);

  useEffect(() => {
    if (expandLatestActivity && runningActivityId) {
      setExpandedActivityId(runningActivityId);
    }
  }, [expandLatestActivity, runningActivityId]);

  useEffect(() => {
    if (
      latestTableKey &&
      latestTableKey !== previousLatestTableKeyRef.current
    ) {
      previousLatestTableKeyRef.current = latestTableKey;
      setExpandedTableKey(latestTableKey);
    }
  }, [latestTableKey]);

  return (
    <article
      className={`xs-datahub-agent-card${
        compact ? " xs-datahub-agent-card--compact" : ""
      }`}
      data-status={card.status}
      style={
        staggerIndex === undefined
          ? undefined
          : ({ "--xs-datahub-stagger": staggerIndex } as CSSProperties)
      }
    >
      <header className="xs-datahub-agent-card__header">
        <span className="xs-datahub-agent-card__agent-icon" aria-hidden="true">
          <Brain size={18} weight="duotone" />
        </span>
        <div className="xs-datahub-agent-card__identity">
          <h4>{card.agentName}</h4>
          <p>
            {`${displayItems.length} 个执行阶段`}
            {startedAt ? ` · ${startedAt}` : ""}
            {updatedAt && updatedAt !== startedAt ? `–${updatedAt}` : ""}
          </p>
        </div>
        <DataHubExecutionStatus status={card.status} compact />
        <button
          type="button"
          className="xs-datahub-agent-card__toggle"
          aria-expanded={expanded}
          aria-label={`${expanded ? "收起" : "展开"}${card.agentName}执行详情`}
          onClick={() => setExpanded((value) => !value)}
        >
          <CaretDown size={16} aria-hidden="true" />
        </button>
      </header>

      <div
        className={`xs-datahub-collapse${expanded ? " xs-datahub-collapse--open" : ""}`}
        aria-hidden={!expanded}
      >
        <div className="xs-datahub-collapse__inner">
          {blocksMountedRef.current
            ? displayItems.length
              ? (
                <ol
                  className="xs-datahub-agent-card__blocks"
                  aria-label={`${card.agentName}执行时间轴`}
                >
                  {displayItems.map((item, index) => {
                    const block = item.block;
                    const Icon = blockIcon(block);
                    const modelCallIndex = block.modelCallIndex;
                    const itemKey = displayItemKey(card.id, item, index);
                    const customContent =
                      item.kind === "block"
                        ? renderBlock?.({ card, block })
                        : undefined;
                    return (
                      <li
                        key={itemKey}
                        className={`xs-datahub-agent-card__block xs-datahub-agent-card__block--${
                          item.kind === "model-activity"
                            ? "model-activity"
                            : block.isThinking
                              ? "thinking"
                              : block.type
                        }`}
                        style={{ "--xs-datahub-stagger": index } as CSSProperties}
                      >
                        {!compact &&
                        startsModelCall(displayBlocks, index) &&
                        modelCallIndex !== undefined ? (
                          <div className="xs-datahub-agent-card__model-call">
                            <span>第 {modelCallIndex} 次模型调用</span>
                            {item.kind === "block" && block.replyId ? (
                              <small title={block.replyId}>回复 {block.replyId}</small>
                            ) : null}
                          </div>
                        ) : null}
                        {item.kind === "block" &&
                        !block.isThinking &&
                        block.type !== "thinking" &&
                        block.type !== "final_thinking" &&
                        !(compact && block.type === "table") ? (
                          <div className="xs-datahub-agent-card__block-label">
                            <Icon size={14} weight="duotone" aria-hidden="true" />
                            <span>{executionBlockLabel(block)}</span>
                          </div>
                        ) : null}
                        {item.kind === "model-activity" ? (
                          <DataHubModelActivityCard
                            activity={item.activity}
                            expanded={expandedActivityId === item.activity.id}
                            onExpandedChange={(nextExpanded) =>
                              setExpandedActivityId(
                                nextExpanded ? item.activity.id : undefined
                              )
                            }
                          />
                        ) : customContent !== undefined ? (
                          customContent
                        ) : (
                          defaultBlockContent(block, onCitationOpen, {
                            compact,
                            expanded: expandedTableKey === itemKey,
                            onExpandedChange: (nextExpanded) =>
                              setExpandedTableKey(
                                nextExpanded ? itemKey : undefined
                              )
                          })
                        )}
                      </li>
                    );
                  })}
                </ol>
              )
              : (
                <div className="xs-datahub-agent-card__empty">
                  <span aria-hidden="true" />
                  <p>{card.status === "running" ? "等待智能体返回执行事件…" : "没有可展示的执行事件"}</p>
                </div>
              )
            : null}
        </div>
      </div>
    </article>
  );
}
