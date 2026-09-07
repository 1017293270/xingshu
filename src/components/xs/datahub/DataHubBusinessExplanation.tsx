import {
  CaretDown,
  CaretRight,
  CheckCircle,
  FileText,
  ListChecks,
  MagnifyingGlass,
  Quotes
} from "@phosphor-icons/react";
import { Modal } from "antd";
import { useEffect, useId, useRef, useState } from "react";
import { XsSafeMarkdown } from "@/components/xs/XsSafeMarkdown";
import {
  buildBusinessNarrative,
  scopeDetailRows,
  type BusinessNarrativeKind,
  type BusinessNarrativeStatus
} from "@/components/xs/datahub/businessNarrative";
import { formatDataHubCitationFragment } from "@/services/dataHubFormat";
import type { DataHubBusinessDocument, DataHubBusinessTrace } from "@/types/dataHub";
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
  /** 结束后折叠头展示「用时X秒」。 */
  durationMs?: number;
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
  durationMs
}: DataHubBusinessExplanationProps) {
  const bodyId = useId();
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
    ? "执行中"
    : status === "done"
      ? "已完成"
      : status === "cancelled"
        ? "已停止"
        : "失败";
  const { how, found } = buildBusinessNarrative({ trace: content, kind, status, question: intent });
  const detailRows = scopeDetailRows(content);

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
            {stateLabel}
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
            {/* __query-rules 是视觉 QA 用来定位口径区块的老类名，保留给 tests/visual。 */}
            {how.length ? (
              <section
                className="datahub-business-explanation__section datahub-business-explanation__query-rules"
                aria-label="怎么查"
              >
                <h3><MagnifyingGlass size={16} weight="duotone" aria-hidden="true" />怎么查</h3>
                <div className="datahub-business-explanation__prose">
                  {how.map((sentence, index) => (
                    <p
                      key={`${index}-${sentence}`}
                      data-state={status === "running" && index === how.length - 1
                        ? "running"
                        : undefined}
                    >
                      {sentence}
                    </p>
                  ))}
                </div>
              </section>
            ) : null}

            {found.length ? (
              <section className="datahub-business-explanation__section" aria-label="查到了什么">
                <h3><CheckCircle size={16} weight="duotone" aria-hidden="true" />查到了什么</h3>
                <ul className="datahub-business-explanation__findings">
                  {found.map((finding) => (
                    <li key={finding.key}>
                      {finding.document ? (
                        <button
                          type="button"
                          aria-label={`查看来源片段：${finding.document.docName}`}
                          onClick={() => setSelectedDocument(finding.document)}
                        >
                          <span className="datahub-business-explanation__document-icon" aria-hidden="true">
                            <FileText size={18} weight="duotone" />
                          </span>
                          <span>{finding.text}</span>
                          <span className="datahub-business-explanation__document-action">
                            查看片段<CaretRight size={14} aria-hidden="true" />
                          </span>
                        </button>
                      ) : (
                        <p data-state={status === "running" ? "running" : undefined}>
                          {finding.text}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

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
