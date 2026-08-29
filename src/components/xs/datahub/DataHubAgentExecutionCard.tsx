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
import {
  formatDataHubCitationFragment,
  formatDataHubColumnTitle
} from "@/services/dataHubFormat";
import { XsSafeMarkdown } from "../XsSafeMarkdown";
import {
  asNumber,
  asRecord,
  asString,
  asStringArray,
  executionBlockLabel,
  formatExecutionTime
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

function textContent(content: unknown): string | undefined {
  return asString(content);
}

const businessToolLabels: Record<string, string> = {
  list_datasources: "读取可用数据源",
  locate_datasource: "匹配可用数据源",
  get_skill: "读取业务语义",
  get_cube_meta: "读取语义模型",
  plan_with_datasource_skill: "制定查询方案",
  generate_query: "生成查询方案",
  execute_query: "执行数据查询",
  load_data: "执行数据查询",
  retrieve_knowledge: "检索知识证据",
  confirm_answer: "校验并整理回答",
  find_documents: "定位相关文档",
  confirm_document_selection: "复核文档结果",
  invoke_parallel: "分派并行任务"
};

function safeBusinessSummary(value?: string) {
  if (!value || /\bselect\b|\bsql\b|query\s*json|datasource\s*id|^(?:\[|\{)/i.test(value)) {
    return undefined;
  }
  return value;
}

function renderToolBlock(block: DataHubExecutionBlock) {
  const record = asRecord(block.content);
  const rawToolName =
    asString(record?.toolName) ??
    asString(record?.tool) ??
    asString(record?.name);
  const toolName = rawToolName
    ? businessToolLabels[rawToolName] ?? "调用企业能力"
    : "调用企业能力";
  const summary =
    safeBusinessSummary(asString(record?.summary)) ??
    safeBusinessSummary(asString(record?.resultSummary)) ??
    (block.type === "tool_call" ? "正在执行该步骤" : "该步骤已完成");

  return (
    <div className={`xs-datahub-agent-card__tool xs-datahub-agent-card__tool--${block.type}`}>
      <div>
        <Wrench size={15} weight="duotone" aria-hidden="true" />
        <strong>{toolName}</strong>
        <span>{block.type === "tool_call" ? "调用" : "返回"}</span>
      </div>
      <p>{summary}</p>
    </div>
  );
}

type TablePreview = {
  columns: Array<{ key: string; title: string }>;
  rows: Array<Record<string, unknown>>;
  totalRows?: number;
};

function tableCell(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .filter((item) => ["string", "number", "boolean"].includes(typeof item))
      .map(String)
      .join("、") || "结构化内容";
  }
  return "结构化内容";
}

function tablePreview(content: unknown): TablePreview | undefined {
  const record = asRecord(content);
  const nested = asRecord(record?.table) ?? record;
  const rawColumns = Array.isArray(nested?.columns) ? nested.columns : [];
  const columns = rawColumns.flatMap((column, index) => {
    const columnName = asString(column);
    if (columnName) {
      return [{ key: columnName, title: formatDataHubColumnTitle(columnName, columnName) }];
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
        title: formatDataHubColumnTitle(
          asString(columnRecord?.title) ??
            asString(columnRecord?.label) ??
            key ??
            `列 ${index + 1}`,
          key
        )
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
    Object.keys(rows[0]).forEach((key) => columns.push({
      key,
      title: formatDataHubColumnTitle(key, key)
    }));
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
    return <p>查询结果已返回，暂无可预览的表格内容。</p>;
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
                  <td key={column.key}>{tableCell(row[column.key])}</td>
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
  return (
    <div className="xs-datahub-agent-card__source">
      <Database size={17} weight="duotone" aria-hidden="true" />
      <span>
        <strong>{name}</strong>
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
  const location = [
    asString(record?.chapter) ?? asString(record?.sectionName) ?? asString(record?.heading),
    asString(record?.pageNumber) ?? asString(record?.page_number) ?? asString(record?.page) ?? asString(record?.page_idx)
  ].filter(Boolean).join(" · ");
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
      {location ? <small>{location}</small> : null}
      {fragments.length ? (
        <details>
          <summary>查看引用片段（{fragments.length}）</summary>
          <div>
            {fragments.map((fragment, index) => (
              <XsSafeMarkdown
                key={`${block.eventId ?? "citation"}-${index}`}
                content={formatDataHubCitationFragment(fragment)}
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
      <div className="xs-datahub-agent-card__thinking">
        <Brain size={15} weight="duotone" aria-hidden="true" />
        <p>{block.type === "final_thinking" ? "正在复核查询结果" : "正在理解问题并组织执行步骤"}</p>
      </div>
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
  const record = asRecord(block.content);
  const summary =
    safeBusinessSummary(asString(record?.summary)) ??
    safeBusinessSummary(asString(record?.message)) ??
    safeBusinessSummary(asString(record?.label));
  return <p>{summary || `${executionBlockLabel(block)}已记录`}</p>;
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
