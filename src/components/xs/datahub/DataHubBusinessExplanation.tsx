import {
  CaretRight,
  CheckCircle,
  FileText,
  Database,
  Quotes
} from "@phosphor-icons/react";
import { Modal } from "antd";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { XsSafeMarkdown } from "@/components/xs/XsSafeMarkdown";
import {
  buildBusinessNarrative,
  scopeDetailRows,
  type BusinessNarrativeKind,
  type BusinessNarrativeStatus
} from "@/components/xs/datahub/businessNarrative";
import { formatDataHubCitationFragment } from "@/services/dataHubFormat";
import type { DataHubBusinessDocument, DataHubBusinessTrace } from "@/types/dataHub";
import { useNow } from "./useNow";
import "../../../pages/styles/datahub-execution.css";

export type DataHubBusinessExplanationProps = {
  kind: BusinessNarrativeKind;
  intent: string;
  status: BusinessNarrativeStatus;
  trace?: DataHubBusinessTrace;
  dataSources?: string[];
  columns?: Array<{ key: string; title: string; type?: string }>;
  knowledgeBases?: string[];
  filters?: string[];
  dataAsOf?: string;
  /** 结束后折叠头展示本阶段实际耗时。 */
  durationMs?: number;
  startedAt?: number;
  /** 数据结果以完整表格下拉展示，替代重复的表格摘要卡；文档来源仍保留。 */
  resultTables?: ReactNode;
  children?: ReactNode;
};

function unique(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim() ?? "").filter(Boolean)));
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
    steps: [],
    dataSources: unique(dataSources ?? []),
    dataTables: [],
    fields: unique((columns ?? []).map((column) => column.title || column.key)),
    filters: unique(filters ?? []),
    calculations: [],
    relationships: [],
    metricDefinitions: [],
    synonymMappings: [],
    time: dataAsOf ? [`数据截至 ${dataAsOf}`] : [],
    documents: []
  };
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
  durationMs,
  startedAt,
  resultTables,
  children
}: DataHubBusinessExplanationProps) {
  const bodyId = useId();
  const now = useNow(1000, status === "running" && startedAt != null);
  const elapsedMs = status === "running" && startedAt != null ? Math.max(0, now - startedAt) : durationMs;
  const [expanded, setExpanded] = useState(status === "running");
  const [selectedDocument, setSelectedDocument] = useState<DataHubBusinessDocument>();
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
    ? ""
    : status === "done"
      ? "已完成"
      : status === "cancelled"
        ? "已停止"
        : "失败";
  const { process, found, statusMessage } = buildBusinessNarrative({ trace: content, kind, status, question: intent });
  const findings = resultTables ? found.filter((item) => item.document) : found;
  const detailRows = scopeDetailRows(content);
  const stateText = [stateLabel, elapsedMs != null ? `${Math.max(0, Math.round(elapsedMs / 1000))}秒` : ""]
    .filter(Boolean);

  return (
    <section className="datahub-business-explanation" aria-label="查询过程" data-status={status}>
      <header className="datahub-business-explanation__header">
        <button
          type="button"
          className="datahub-business-explanation__summary"
          aria-label={`查询过程 （${stateText.join("，") || "进行中"}）`}
          aria-controls={bodyId}
          aria-expanded={expanded}
          onClick={() => {
            userPinnedRef.current = true;
            setExpanded((value) => !value);
          }}
        >
          <CaretRight size={12} aria-hidden="true" />
          <span className="datahub-phase-title">查询过程</span>
          <small>{stateText.join(" · ") || "进行中"}</small>
        </button>
      </header>
      <div
        id={bodyId}
        className={`xs-datahub-collapse${expanded ? " xs-datahub-collapse--open" : ""}`}
        aria-hidden={!expanded}
      >
        <div className="xs-datahub-collapse__inner">
          {bodyMountedRef.current ? <div className="datahub-business-explanation__body">
            {process.length > 0 ? (
              <section className="datahub-business-explanation__query-rules" aria-label="查询条件">
                {process.map((group) => {
                  const fields = <dl className="datahub-business-explanation__fields">
                      {group.rows.map((row) => (
                        <div className="datahub-business-explanation__field" key={row.label}>
                          <dt>{row.label}</dt>
                          <dd>
                            <ul className={`datahub-business-explanation__values${["知识库", "数据源", "数据表"].includes(row.label) ? " datahub-business-explanation__values--sources" : ""}`}>
                              {row.values.map((value) => <li key={value} title={value}>{value}</li>)}
                            </ul>
                          </dd>
                        </div>
                      ))}
                    </dl>;
                  return (
                    <div className="datahub-business-explanation__query-group" key={group.key}>
                      {group.title && process.length > 1 ? <p className="datahub-business-explanation__query-title">{group.title}</p> : null}
                      {group.steps?.length ? <>
                        <ol className="datahub-business-explanation__steps" aria-label="查询步骤">
                          {group.steps.map((step, index) => (
                            <li key={`${index}-${step.title}`}>
                              <span className="datahub-business-explanation__step-index" aria-hidden="true">{index + 1}</span>
                              <div>
                                <h4>{step.title}</h4>
                                <p>{step.description}</p>
                              </div>
                            </li>
                          ))}
                        </ol>
                        <details className="datahub-business-explanation__query-details">
                          <summary><CaretRight size={12} aria-hidden="true" />查看查询细节</summary>
                          {fields}
                        </details>
                      </> : fields}
                    </div>
                  );
                })}
              </section>
            ) : null}

            <section className="datahub-business-explanation__results" aria-label="查询结果">
              {(!resultTables || findings.length > 0) ? <header className="datahub-business-explanation__results-head">
                <h3><CheckCircle size={16} aria-hidden="true" />查询结果</h3>
                {findings.length > 0 ? <span>{findings.length} {findings.every((item) => item.document) ? "份文档" : "项结果"}</span> : null}
              </header> : null}
              {resultTables}
              {findings.length > 0 ? (
                <ul className="datahub-business-explanation__findings">
                  {findings.map((finding, findingIndex) => {
                    const content = (
                      <>
                        <span className="datahub-business-explanation__result-icon" aria-hidden="true">
                          {finding.document ? <FileText size={20} /> : <Database size={20} />}
                        </span>
                        <span className="datahub-business-explanation__result-copy">
                          <span className="datahub-business-explanation__result-title" title={finding.title}>{finding.title}</span>
                          {finding.metadata.length > 0 ? (
                            <span className="datahub-business-explanation__result-meta" id={`${bodyId}-source-${findingIndex}`}>
                              {finding.metadata.map((item, index) => <span key={`${index}-${item}`} title={item}>{item}</span>)}
                            </span>
                          ) : null}
                          {finding.preview?.length ? (
                            <span className="datahub-business-explanation__preview">
                              {finding.preview.map((item, index) => (
                                <span key={`${index}-${item.label}`}>
                                  <span>{item.label}</span><span>{item.value}</span>
                                </span>
                              ))}
                            </span>
                          ) : null}
                        </span>
                      </>
                    );
                    return (
                      <li key={finding.key}>
                        {finding.document ? (
                          <button type="button" className="datahub-business-explanation__result"
                            aria-label={`查看来源片段：${finding.document.docName}`}
                            aria-describedby={finding.metadata.length ? `${bodyId}-source-${findingIndex}` : undefined}
                            onClick={() => setSelectedDocument(finding.document)}>
                            {content}
                            <span className="datahub-business-explanation__document-action">查看引用<CaretRight size={14} aria-hidden="true" /></span>
                          </button>
                        ) : <div className="datahub-business-explanation__result">{content}</div>}
                      </li>
                    );
                  })}
                </ul>
              ) : !resultTables ? <p className="datahub-business-explanation__empty" role="status">{statusMessage}</p> : null}
            </section>

            {detailRows.length ? (
              <details className="datahub-business-explanation__scope-detail">
                <summary>口径细则</summary>
                <dl className="datahub-business-explanation__scope-rows">
                  {detailRows.map((row) => (
                    <div className="datahub-business-explanation__scope-row" key={row.label}>
                      <dt>{row.label}</dt>
                      <dd>{row.values.join("、")}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            ) : null}
            {children}
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
