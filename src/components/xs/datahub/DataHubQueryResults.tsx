import { ArrowSquareOut, CaretRight, Database, FileText, Quotes } from "@phosphor-icons/react";
import { Modal } from "antd";
import { useState } from "react";
import { XsSafeMarkdown } from "@/components/xs/XsSafeMarkdown";
import { isDataHubScalarResult } from "@/services/aiChartPlannerService";
import { formatDataHubCitationFragment, formatDataHubColumnTitle, formatDataHubTableTitle } from "@/services/dataHubFormat";
import { formatDataHubTableCell } from "@/services/dataHubTableExport";
import type { DataHubQueryProcess, DataHubQueryProcessResult } from "@/services/dataHubQueryProcessPresenter";
import type { DataHubCitationDocument } from "@/types/dataHub";
import { DataHubResultTable } from "./DataHubResultTable";
import { citationDisplayTitle, citationLocationText } from "./citationLabels";
import type { BusinessNarrativeKind, BusinessNarrativeStatus } from "./businessNarrative";
import "../../../pages/styles/datahub-query-results.css";

type Props = {
  process: DataHubQueryProcess;
  status: BusinessNarrativeStatus;
  kind?: BusinessNarrativeKind;
  onStatus?: (message: string) => void;
  onOpenDocument?: (document: DataHubCitationDocument, group: DataHubCitationDocument[]) => void;
};

type DocumentResult = Exclude<DataHubQueryProcessResult, { kind: "table" }>;

function documentLocations(result: DocumentResult, fragment?: string) {
  const sources = result.documentSources?.map((source) => source.document) ?? [result.document];
  return [...new Set(sources.filter((source) => !fragment || source.fragments.includes(fragment))
    .map(citationLocationText).filter(Boolean))].join("、");
}

function readableCondition(value: string) {
  // Preserve calendar dates and time zones; only a complete unzoned day range becomes date-only.
  return value.replace(/(\d{4}-\d{2}-\d{2})T00:00:00\.000(\s*至\s*)(\d{4}-\d{2}-\d{2})T23:59:59\.999(?![\dZ+.-])/g, "$1$2$3")
    .replace(/(\d{4}-\d{2}-\d{2})T(?=\d{2}:\d{2})/g, "$1 ");
}

function resultIntroduction(results: DataHubQueryProcessResult[]) {
  const tables = results.filter((result) => result.kind === "table");
  const empty = tables.filter((result) => !result.table.rows.length && result.table.totalRows === 0).length;
  const metrics = tables.filter((result) => isDataHubScalarResult(result.table)).length;
  const tableCount = tables.length - empty - metrics;
  const citations = results.filter((result) => result.kind === "citation").length;
  const documents = results.filter((result) => result.kind === "document").length;
  const parts = [
    tableCount ? `${tableCount} 张结果表` : "",
    metrics ? `${metrics} 项数值结果` : "",
    citations ? `${citations} 份引用资料` : "",
    documents ? `${documents} 份文档` : ""
  ].filter(Boolean);
  if (!parts.length) return "暂未查到符合条件的数据，下面保留了本次查询的结果信息。";
  const introduction = `${tableCount || metrics ? "查到了" : "找到了"} ${parts.join("、")}，${tableCount || metrics ? "下面是查询结果" : "下面是相关资料"}。`;
  return empty ? `${introduction}另有 ${empty} 项结果为空。` : introduction;
}

function QueryTable({ result, onStatus }: {
  result: Extract<DataHubQueryProcessResult, { kind: "table" }>;
  onStatus?: Props["onStatus"];
}) {
  const { table, dataSource } = result;
  const query = table.business?.query;
  const rows = [
    { label: "数据表", values: table.usedAssets?.map((asset) => asset.assetName) ?? (query?.table ? [query.table] : []) },
    { label: "筛选", values: query?.filters ?? table.business?.filters ?? [] },
    { label: "时间", values: query?.time ?? table.business?.time ?? [] },
    { label: "分组", values: query?.dimensions ?? [] },
    { label: "统计", values: query?.measures.map((measure) => measure.aggregation === "按企业语义模型定义计算"
      ? measure.label : `${measure.label} · ${measure.aggregation}`) ?? [] }
  ].filter((row) => row.values.length > 0);
  const scope = [...(query?.filters ?? []), ...(query?.time ?? [])].join("；");
  const scalar = isDataHubScalarResult(table);
  const title = table.title || table.groupLabel || formatDataHubTableTitle(table);

  return <>
    <header className="datahub-query-result__head">
      <Database size={16} aria-hidden="true" />
      <h3 title={title}>{title}</h3>
      <span className="datahub-query-result__kind">数据查询</span>
    </header>
    {dataSource ? <p className="datahub-query-result__source" title={dataSource}>{dataSource}</p> : null}
    {rows.length > 0 ? <details className="datahub-query-result__conditions">
      <summary><CaretRight size={12} aria-hidden="true" /><span title={scope}>{readableCondition(scope) || "查询条件"}</span><small>查看细节</small></summary>
      <dl>{rows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd title={row.values.join("；")}>{readableCondition(row.values.join("；"))}</dd></div>)}</dl>
    </details> : null}
    {scalar ? <dl className="datahub-query-result__scalar">
      <dt>{formatDataHubColumnTitle(table.columns[0].title, table.columns[0].key)}</dt>
      <dd>{formatDataHubTableCell(table.rows[0][table.columns[0].key])}</dd>
    </dl> : !table.columns.length && !table.rows.length
      ? <p className="datahub-query-result__missing">本次返回 0 行数据。</p>
      : <DataHubResultTable table={table} compact onStatus={onStatus} />}
  </>;
}

export function DataHubQueryResults({ process, status, kind = "AGENT", onStatus, onOpenDocument }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string>();
  const { results } = process;
  const selectedResult = results.find((result): result is DocumentResult => result.key === selectedKey && result.kind !== "table");
  const selectedDocument = selectedResult?.document;
  const visible = showAll ? results : results.slice(0, 3);
  const documents = results.flatMap((result) => result.kind === "table" ? [] : [result.document]);
  // A tool may finish many times within one query. Only the user task and actual results drive this status.
  const searchingText = kind === "ASK_DATA" ? "正在查询相关数据，查到后会展示在这里。"
    : kind === "ASK_KNOWLEDGE" ? "正在查找相关资料，确认后会展示引用内容。"
      : kind === "DOCUMENT_LOOKUP" ? "正在查找相关文档，找到后会展示在这里。"
        : "正在查询相关数据和资料，查到后会展示在这里。";
  const emptyText = status === "running" ? searchingText
    : status === "error" ? "本次查询未能完成，暂时没有返回结果。"
      : status === "cancelled" ? "本次查询已停止，暂时没有返回结果。"
        : "本次查询已结束，但没有返回结果。";

  return <section className="datahub-query-results" aria-label="查询结果">
    <div className="datahub-query-results__status" role="status">
      {results.length ? <><span className="datahub-query-results__introduction">{resultIntroduction(results)}</span>
        <span>{status === "running" ? "仍在处理你的问题，有新的结果会继续补充。"
          : status === "error" ? "查询未能全部完成，已查到的内容保留如下。"
            : status === "cancelled" ? "查询已停止，已查到的内容保留如下。" : ""}</span></> : emptyText}
    </div>
    {results.length ? <ol className="datahub-query-results__list">
      {visible.map((result) => <li key={result.key}>
        <article className="datahub-query-result" data-result-kind={result.kind}>
          {result.kind === "table" ? <QueryTable result={result} onStatus={onStatus} /> : <>
            <header className="datahub-query-result__head">
              <FileText size={16} aria-hidden="true" />
              <h3 title={citationDisplayTitle(result.document)}>{citationDisplayTitle(result.document)}</h3>
              <span className="datahub-query-result__kind">{result.kind === "citation" ? "引用资料" : "已确认文档"}</span>
            </header>
            <p className="datahub-query-result__source">
              {[result.document.kbName, documentLocations(result)].filter(Boolean).join(" · ")}
            </p>
            {result.document.fragments[0] || result.excerpt ? <div className="datahub-query-result__excerpt">
              <XsSafeMarkdown renderImages={false} content={(() => {
                const text = formatDataHubCitationFragment(result.document.fragments[0] || result.excerpt || "");
                return text.length > 180 ? `${text.slice(0, 180)}…` : text;
              })()} />
            </div> : <p className="datahub-query-result__missing">未提供引用片段</p>}
            <div className="datahub-query-result__actions">
              {result.document.fragments.length ? <button type="button" onClick={() => setSelectedKey(result.key)}
                aria-label={`查看来源片段：${citationDisplayTitle(result.document)}`}>
                <Quotes size={14} aria-hidden="true" />查看引用<span>{result.document.fragments.length} 个片段</span>
              </button> : null}
              {onOpenDocument ? <button type="button" disabled={!result.document.sourceAvailable && !result.document.markdownAvailable}
                onClick={() => onOpenDocument(result.document, documents)} aria-label={`查看原文：${citationDisplayTitle(result.document)}`}>
                <ArrowSquareOut size={14} aria-hidden="true" />查看原文
              </button> : null}
            </div>
          </>}
          {result.status === "error" || result.status === "cancelled"
            ? <p className="datahub-query-result__incomplete">{result.status === "error" ? "该查询未完成" : "该查询已停止"}，以上为已返回内容。</p> : null}
        </article>
      </li>)}
    </ol> : null}
    {results.length > 3 ? <button type="button" className="datahub-query-results__more" aria-expanded={showAll}
      onClick={() => setShowAll((value) => !value)}>{showAll ? "收起更多结果" : `查看其余 ${results.length - 3} 项结果`}<CaretRight size={14} aria-hidden="true" /></button> : null}
    <Modal className="datahub-source-modal" open={Boolean(selectedDocument)} onCancel={() => setSelectedKey(undefined)}
      footer={null} centered width={760} destroyOnHidden title={selectedDocument ? citationDisplayTitle(selectedDocument) : "引用资料"}>
      {selectedDocument ? <div className="datahub-source-modal__body">
        <p className="datahub-query-result__source">{selectedDocument.kbName}</p>
        <section className="datahub-source-modal__content" aria-label="来源片段">
          {selectedDocument.fragments.map((fragment, index) => <div className="datahub-query-result__fragment" key={index}>
            {selectedResult ? <p className="datahub-query-result__source">{documentLocations(selectedResult, fragment)}</p> : null}
            <XsSafeMarkdown renderImages={false} content={formatDataHubCitationFragment(fragment)} />
          </div>)}
        </section>
      </div> : null}
    </Modal>
  </section>;
}
