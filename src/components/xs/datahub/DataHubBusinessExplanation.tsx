import {
  Brain,
  CaretDown,
  CaretRight,
  CheckCircle,
  Database,
  FileText,
  ListChecks,
  Quotes
} from "@phosphor-icons/react";
import { Modal } from "antd";
import { useEffect, useId, useRef, useState } from "react";
import { XsSafeMarkdown } from "@/components/xs/XsSafeMarkdown";
import { formatDataHubCitationFragment } from "@/services/dataHubFormat";
import type { DataHubBusinessTrace } from "@/types/dataHub";
import "../../../pages/styles/datahub-execution.css";

export type DataHubBusinessExplanationProps = {
  kind: "ASK_DATA" | "ASK_KNOWLEDGE" | "DOCUMENT_LOOKUP" | "AGENT";
  intent: string;
  status: "running" | "done" | "error" | "cancelled";
  trace?: DataHubBusinessTrace;
  dataSources?: string[];
  columns?: Array<{ key: string; title: string; type?: string }>;
  knowledgeBases?: string[];
  filters?: string[];
  dataAsOf?: string;
  /** 结束后折叠头展示「用时X秒」。 */
  durationMs?: number;
};

const stepLabels: Record<DataHubBusinessExplanationProps["kind"], string[]> = {
  ASK_DATA: ["理解统计意图", "确认数据范围与口径", "获取并校验结果"],
  ASK_KNOWLEDGE: ["理解知识问题", "检索可访问知识库", "复核来源并形成回答"],
  DOCUMENT_LOOKUP: ["理解文档条件", "检索可访问知识库", "复核文档身份并排序"],
  AGENT: ["理解任务", "分派企业内可用能力", "汇总并复核结果"]
};

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function compactValues(values: string[]) {
  const safe = unique(values);
  return safe.length > 8
    ? `${safe.slice(0, 8).join("、")}，另 ${safe.length - 8} 项`
    : safe.join("、");
}

function basicTrace({
  kind,
  intent,
  dataSources,
  columns,
  knowledgeBases,
  filters,
  dataAsOf
}: Omit<DataHubBusinessExplanationProps, "status" | "trace">): DataHubBusinessTrace {
  const sources = unique([...(dataSources ?? []), ...(knowledgeBases ?? [])]);
  const numericFields = unique((columns ?? [])
    .filter((column) => /int|float|double|decimal|number|numeric|count|ratio|percent/i.test(column.type ?? ""))
    .map((column) => column.title || column.key));
  const fallbackAgent = kind === "ASK_DATA"
    ? "问数智能体"
    : kind === "ASK_KNOWLEDGE"
      ? "问知智能体"
      : kind === "DOCUMENT_LOOKUP"
        ? "找文档智能体"
        : "编排智能体";
  return {
    intent: `用户希望：${intent}`,
    tasks: [{
      id: "task-1",
      agentName: fallbackAgent,
      question: intent,
      target: sources.join("、") || (kind === "ASK_DATA" ? "企业内可访问数据" : "企业内可访问知识库")
    }],
    steps: stepLabels[kind],
    dataSources: unique(dataSources ?? []),
    dataTables: [],
    fields: unique((columns ?? []).map((column) => column.title || column.key)),
    filters: unique(filters ?? []),
    calculations: numericFields.map((field) => `${field}：采用企业语义模型已发布的计算规则`),
    relationships: [],
    metricDefinitions: numericFields.map((field) => `${field}：采用企业语义模型中已发布的指标口径`),
    synonymMappings: [],
    time: dataAsOf ? [`数据截至 ${dataAsOf}`] : [],
    documents: []
  };
}

function groupedFactValues(values: string[]) {
  const safe = unique(values);
  const leadingCounts = new Map<string, number>();
  safe.forEach((value) => {
    const separator = value.indexOf("。");
    if (separator < 8) return;
    const leading = value.slice(0, separator).trim();
    leadingCounts.set(leading, (leadingCounts.get(leading) ?? 0) + 1);
  });
  const common = Array.from(leadingCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .find(([, count]) => count >= 2)?.[0];
  return {
    context: common,
    items: unique(safe.map((value) => common && value.startsWith(`${common}。`)
      ? value.slice(common.length + 1).replace(/^[。；:：,，\s]+/, "")
      : value))
  };
}

type ScopeRow = {
  label: string;
  /** 直接展示的前几项，已按分隔符连排。 */
  text: string;
  /** 该行去重后的总项数，用于「等 N 项」。 */
  total: number;
  /** 折叠区里的其余项，空串表示无需折叠。 */
  rest: string;
};

/** 口径行统一收敛成「标签 : 连排内容（+ 等 N 项折叠）」，超出上限的部分不丢、只收起。 */
function scopeRow(
  label: string,
  values: string[],
  { limit = 6, separator = "、" }: { limit?: number; separator?: string } = {}
): ScopeRow | undefined {
  const items = unique(values);
  if (!items.length) return undefined;
  return {
    label,
    text: items.slice(0, limit).join(separator),
    total: items.length,
    rest: items.slice(limit).join(separator)
  };
}

function ScopeRowList({ rows }: { rows: ScopeRow[] }) {
  return (
    <dl className="datahub-business-explanation__scope-rows">
      {rows.map((row) => (
        <div className="datahub-business-explanation__scope-row" key={row.label}>
          <dt>{row.label}</dt>
          <dd>
            {row.text}
            {row.rest ? (
              <details className="datahub-business-explanation__scope-more">
                <summary>等 {row.total} 项</summary>
                <p>{row.rest}</p>
              </details>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * 把 trace 里的结构化口径整理成业务口径区块：
 * 常读的数据/字段/筛选/时间/计算与检索范围直接成行，
 * 偏长且少读的指标定义、同义词映射、关联关系收进「口径细则」。
 */
function businessScope(content: DataHubBusinessTrace) {
  const contexts: string[] = [];
  const stripContext = (values: string[]) => {
    const { context, items } = groupedFactValues(values);
    if (context) contexts.push(context);
    return items;
  };
  const fields = stripContext(content.fields);
  const filters = stripContext(content.filters);
  const calculations = stripContext(content.calculations);
  const metricDefinitions = stripContext(content.metricDefinitions);
  const synonymMappings = stripContext(content.synonymMappings);
  const knowledgeBases = unique(content.documents.map((document) => document.kbName));
  const rows = [
    scopeRow("数据口径", [...content.dataSources, ...content.dataTables, ...contexts], {
      separator: " · ",
      limit: 4
    }),
    scopeRow("业务字段", fields),
    scopeRow("筛选条件", filters, { limit: 8 }),
    scopeRow("时间范围", content.time, { limit: 4 }),
    scopeRow("计算逻辑", calculations),
    scopeRow("知识库范围", knowledgeBases, { separator: " · ", limit: 4 }),
    content.documents.length
      ? { label: "文档命中", text: `${content.documents.length} 份文档`, total: 1, rest: "" }
      : undefined
  ].filter((row): row is ScopeRow => Boolean(row));
  const detailRows = [
    scopeRow("指标定义", metricDefinitions),
    scopeRow("同义词映射", synonymMappings),
    scopeRow("关联关系", content.relationships, { limit: 4 })
  ].filter((row): row is ScopeRow => Boolean(row));
  return { rows, detailRows };
}

function executionStepDetail(content: DataHubBusinessTrace, step: string) {
  const taskSummary = content.tasks
    .map((task) => `${task.agentName}负责“${task.question}”`)
    .join("；");
  const queryScope = compactValues([...content.dataSources, ...content.dataTables]);
  const queryRules = [
    content.fields.length ? `业务字段：${compactValues(content.fields)}` : "",
    content.filters.length ? `筛选：${compactValues(content.filters)}` : "",
    content.calculations.length ? `计算：${compactValues(content.calculations)}` : "",
    content.time.length ? `时间：${compactValues(content.time)}` : ""
  ].filter(Boolean).join("；");
  const documentSummary = content.documents
    .map((document) => {
      const location = [document.chapter, document.pageNumber].filter(Boolean).join(" · ");
      return `${document.kbName} → ${document.docName}${location ? `（${location}）` : ""}`;
    })
    .join("；");

  if (/理解|拆分/.test(step)) {
    return [content.intent, taskSummary].filter(Boolean).join("；");
  }
  if (/数据范围|业务数据|查询数据/.test(step)) {
    const scopeDetails = [
      queryScope ? `查询范围：${queryScope}` : "",
      content.fields.length ? `业务字段：${compactValues(content.fields)}` : "",
      content.time.length ? `时间：${compactValues(content.time)}` : ""
    ].filter(Boolean).join("；");
    return scopeDetails || queryRules;
  }
  if (/结构化结果/.test(step)) {
    const resultRules = [
      content.filters.length ? `筛选：${compactValues(content.filters)}` : "",
      content.calculations.length ? `计算：${compactValues(content.calculations)}` : ""
    ].filter(Boolean).join("；");
    return `${resultRules ? `${resultRules}；` : ""}结果已完成结构化校验，并用于最终回答和结果表。`;
  }
  if (/知识库|文档|知识证据/.test(step)) {
    return documentSummary ? `已核对：${documentSummary}` : "已在可访问的企业知识范围内完成检索。";
  }
  if (/汇总|复核|校验|回答/.test(step)) {
    const evidence = [
      content.dataTables.length ? "业务数据" : "",
      content.documents.length ? "知识证据" : ""
    ].filter(Boolean).join("和");
    return evidence
      ? `已将${evidence}映射到最终回答，并完成来源一致性复核。`
      : "已按当前可复核结果形成回答；未返回的口径或来源不会推测补写。";
  }
  return queryRules || documentSummary || taskSummary || content.intent;
}

function executionStepState(
  status: DataHubBusinessExplanationProps["status"],
  index: number,
  total: number
) {
  if (status === "done") return { value: "done", label: "已完成" };
  if (index < total - 1) return { value: "done", label: "已完成" };
  if (status === "running") return { value: "running", label: "执行中" };
  if (status === "cancelled") return { value: "cancelled", label: "已停止" };
  return { value: "error", label: "失败" };
}

export function DataHubBusinessExplanation({
  kind,
  intent,
  status,
  trace,
  dataSources = [],
  columns = [],
  knowledgeBases = [],
  filters = [],
  dataAsOf,
  durationMs
}: DataHubBusinessExplanationProps) {
  const bodyId = useId();
  const [expanded, setExpanded] = useState(status === "running");
  const [selectedDocument, setSelectedDocument] = useState<DataHubBusinessTrace["documents"][number]>();
  /* running 自动展开、结束自动收成一行；用户点过折叠头后交还控制权（有粘性）。 */
  const userPinnedRef = useRef(false);
  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (prevStatusRef.current === status) {
      return;
    }
    prevStatusRef.current = status;
    if (!userPinnedRef.current) {
      setExpanded(status === "running");
    }
  }, [status]);
  const bodyMountedRef = useRef(expanded);
  if (expanded) bodyMountedRef.current = true;
  const content = trace ?? basicTrace({
    kind,
    intent,
    dataSources,
    columns,
    knowledgeBases,
    filters,
    dataAsOf
  });
  const stateLabel = status === "running"
    ? "执行中"
    : status === "done"
      ? "已完成"
      : status === "cancelled"
        ? "已停止"
        : "失败";
  const scope = businessScope(content);

  return (
    <section className="datahub-business-explanation" aria-label="查询过程" data-status={status}>
      <header className="datahub-business-explanation__header">
        <button
          type="button"
          className="datahub-business-explanation__summary"
          aria-controls={bodyId}
          aria-expanded={expanded}
          onClick={() => {
            userPinnedRef.current = true;
            setExpanded((value) => !value);
          }}
        >
          <span><ListChecks size={16} />查询过程</span>
          <small>
            {stateLabel} · {content.steps.length} 步
            {status !== "running" && durationMs != null
              ? ` · 用时 ${Math.max(1, Math.round(durationMs / 1000))} 秒`
              : ""}
          </small>
          <CaretDown size={15} aria-hidden="true" />
        </button>
      </header>
      <div
        id={bodyId}
        className={`xs-datahub-collapse${expanded ? " xs-datahub-collapse--open" : ""}`}
        aria-hidden={!expanded}
      >
        <div className="xs-datahub-collapse__inner">
          {bodyMountedRef.current ? <div className="datahub-business-explanation__body">
        <section className="datahub-business-explanation__section">
          <h3><Brain size={16} weight="duotone" aria-hidden="true" />理解问题</h3>
          <p>{content.intent}</p>
        </section>

        <section className="datahub-business-explanation__section">
          <h3><CheckCircle size={16} weight="duotone" aria-hidden="true" />任务执行记录</h3>
          <ol className="datahub-business-explanation__steps">
            {content.steps.map((step, index) => {
              const stepState = executionStepState(status, index, content.steps.length);
              return (
                <li key={`${index}-${step}`} data-status={stepState.value}>
                  <span aria-hidden="true">{index + 1}</span>
                  <div>
                    <header>
                      <strong>{step}</strong>
                      <small>{stepState.label}</small>
                    </header>
                    <p>{executionStepDetail(content, step)}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {scope.rows.length || scope.detailRows.length ? (
          <section
            className="datahub-business-explanation__section datahub-business-explanation__query-rules"
            aria-label="业务口径"
          >
            <h3><Database size={16} weight="duotone" aria-hidden="true" />业务口径</h3>
            {scope.rows.length ? <ScopeRowList rows={scope.rows} /> : null}
            {scope.detailRows.length ? (
              <details className="datahub-business-explanation__scope-detail">
                <summary>口径细则</summary>
                <ScopeRowList rows={scope.detailRows} />
              </details>
            ) : null}
          </section>
        ) : null}

        {content.documents.length ? (
          <section className="datahub-business-explanation__section datahub-business-explanation__documents">
            <h3><FileText size={16} weight="duotone" aria-hidden="true" />知识来源</h3>
            <ul>
              {content.documents.map((document) => (
                <li key={`${document.kbName}::${document.docName}`}>
                  <button
                    type="button"
                    aria-label={`查看来源片段：${document.docName}`}
                    onClick={() => setSelectedDocument(document)}
                  >
                    <span className="datahub-business-explanation__document-icon" aria-hidden="true">
                      <FileText size={18} weight="duotone" />
                    </span>
                    <span>
                      <strong>{document.docName}</strong>
                      <small>
                        {[document.kbName, document.chapter, document.pageNumber].filter(Boolean).join(" · ")}
                      </small>
                    </span>
                    <span className="datahub-business-explanation__document-action">
                      查看片段<CaretRight size={14} aria-hidden="true" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="datahub-business-explanation__note">
          <FileText size={15} aria-hidden="true" />
          <p>仅展示可复核的业务过程；模型内部思考、SQL、物理表名、工具参数和原始 JSON 不对外展示。</p>
        </section>
          </div> : null}
        </div>
      </div>
      <Modal
        className="datahub-source-modal"
        open={Boolean(selectedDocument)}
        onCancel={() => setSelectedDocument(undefined)}
        footer={null}
        centered
        width={760}
        destroyOnHidden
        title={selectedDocument ? (
          <div className="datahub-source-modal__title">
            <span aria-hidden="true"><FileText size={20} weight="duotone" /></span>
            <div>
              <small>知识来源</small>
              <strong>{selectedDocument.docName}</strong>
            </div>
          </div>
        ) : null}
      >
        {selectedDocument ? (
          <div className="datahub-source-modal__body">
            <section className="datahub-source-modal__content" aria-label="来源片段">
              <header>
                <span><Quotes size={15} weight="duotone" aria-hidden="true" />原文片段</span>
                <small>
                  {[selectedDocument.kbName, selectedDocument.chapter, selectedDocument.pageNumber]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </header>
              <XsSafeMarkdown
                content={selectedDocument.fragments
                  .map(formatDataHubCitationFragment)
                  .filter(Boolean)
                  .join("\n\n") || "暂无可展示的来源片段。"}
              />
            </section>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
