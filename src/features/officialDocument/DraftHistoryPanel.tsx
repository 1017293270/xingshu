import { useSessionQueryScope, sessionQueryKey } from "@/app/sessionQuery";
import { useQuery } from "@tanstack/react-query";
import { Button, Drawer, Select, Tabs } from "antd";
import { useState } from "react";
import { XsStatusBar } from "@/components/xs/XsStatusBar";
import {
  downloadOfficialDocumentExport, listOfficialDocumentDraftContentVersions, listOfficialDocumentDraftExports
} from "@/services/officialDocumentService";
import type { OfficialDocumentDraftContent, OfficialDocumentDraftContentVersion, OfficialDocumentExportRecord } from "@/types/officialDocument";
import { formatDate, operationErrorMessage } from "./officialDocumentMeta";

function SnapshotContent({ content }: { content: OfficialDocumentDraftContent }) {
  return <div className="official-document-full-draft-preview__blocks" style={{ overflowWrap: "anywhere" }}>
    {content.fixedValues.map((field) => <p key={field.slotId}>{field.value}</p>)}
    {content.blocks.map((block) => <article key={block.id}>
      {block.role.startsWith("HEADING_") ? <h4>{block.text}</h4> : <p style={{ whiteSpace: "pre-wrap" }}>{block.text}</p>}
      {block.table ? <div style={{ overflowX: "auto" }}><table><thead><tr>{block.table.columns.map((column, index) => <th key={index}>{column}</th>)}</tr></thead>
        <tbody>{block.table.rows.map((row, index) => <tr key={index}>{row.map((cell, col) => <td key={col}>{cell}</td>)}</tr>)}</tbody></table></div> : null}
      {block.chart ? <img style={{ maxWidth: "100%" }} src={`data:${block.chart.mimeType};base64,${block.chart.base64}`} alt={block.chart.altText} /> : null}
    </article>)}
    <details><summary>资料与校对记录（{content.researchResults?.length ?? 0} 项资料）</summary>
      {(content.researchResults ?? []).map((result) => <section key={result.taskId}>
        <h4>{result.question}</h4><small>{({ PENDING: "待补充", RUNNING: "资料补充中", SUCCESS: "已有资料", NO_RESULT: "暂无结果", FAILED: "补充失败", SKIPPED: "保留待补充" })[result.status]}</small><p style={{ whiteSpace: "pre-wrap" }}>{result.summary || "暂无资料结果"}</p>
        {result.citations.map((citation, index) => <p key={index}>来源：{citation.docName || citation.kbName} · {citation.fragments.join("；")}</p>)}
        {result.querySource?.dataAsOf ? <small>数据时间：{formatDate(result.querySource.dataAsOf)}</small> : null}
      </section>)}
      {content.factReview ? <section><h4>事实校对</h4><p>{formatDate(content.factReview.reviewedAt)} · {content.factReview.confirmedAt ? "已记录人工核对" : "未记录人工核对"}</p>
        {content.factReview.issues.map((issue, index) => <p key={index}>{issue.sentence}（建议核对：{issue.additions.join("、")}）</p>)}
      </section> : <p>此版没有事实校对记录。</p>}
    </details>
  </div>;
}

export function DraftHistoryPanel({ draftId, title, open, currentContent, onClose, onRestore }: {
  draftId: string; title: string; open: boolean; currentContent?: OfficialDocumentDraftContent;
  onClose: () => void; onRestore: (version: OfficialDocumentDraftContentVersion) => Promise<void>;
}) {
  const scope = useSessionQueryScope();
  const [selectedRevision, setSelectedRevision] = useState<number>();
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string }>();
  const versions = useQuery({ queryKey: sessionQueryKey(scope, "official-document", "draft-content-history", draftId, open),
    queryFn: () => listOfficialDocumentDraftContentVersions(draftId), enabled: open });
  const exports = useQuery({ queryKey: sessionQueryKey(scope, "official-document", "draft-export-history", draftId, open),
    queryFn: () => listOfficialDocumentDraftExports(draftId), enabled: open });
  const selected = versions.data?.find((version) => version.revision === selectedRevision) ?? versions.data?.[0];
  const changedBlocks = selected && currentContent ? new Set([
    ...selected.content.blocks.map((block) => block.id), ...currentContent.blocks.map((block) => block.id)
  ].filter((id) => JSON.stringify(selected.content.blocks.find((block) => block.id === id))
    !== JSON.stringify(currentContent.blocks.find((block) => block.id === id)))).size : 0;
  const restore = async () => {
    if (!selected || busy) return;
    setBusy("restore"); setMessage(undefined);
    try {
      await onRestore(selected);
      setMessage({ tone: "success", text: `历史正文 v${selected.revision} 已恢复为新版本；恢复前的当前内容已保存。` });
      await versions.refetch();
    } catch (error) { setMessage({ tone: "error", text: operationErrorMessage(error) }); }
    finally { setBusy(undefined); }
  };
  const download = async (record: OfficialDocumentExportRecord) => {
    setBusy(record.id); setMessage(undefined);
    try {
      const blob = await downloadOfficialDocumentExport(record.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url;
      anchor.download = `${title.replace(/[^\p{L}\p{N}._-]+/gu, "_") || "report"}-v${record.contentRevision ?? "unknown"}.${record.format.toLowerCase()}`;
      anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setMessage({ tone: "success", text: "已开始下载该次导出的文件。" });
    } catch (error) { setMessage({ tone: "error", text: operationErrorMessage(error) }); }
    finally { setBusy(undefined); }
  };
  return <Drawer title="正文与导出历史" width="min(1080px, 100vw)" open={open} onClose={onClose}>
    {message ? <XsStatusBar tone={message.tone} message={message.text} /> : null}
    <Tabs items={[{ key: "content", label: "正文版本", children: <>
      {versions.isPending ? <p>正在加载正文版本…</p> : versions.isError ? <><XsStatusBar tone="error" message={operationErrorMessage(versions.error)} /><Button onClick={() => void versions.refetch()}>重新加载正文版本</Button></> : !selected ? <p>暂无正文历史。</p> : <>
        <Select aria-label="选择正文历史版本" style={{ width: "min(100%, 440px)" }} value={selected.revision} onChange={setSelectedRevision}
          options={versions.data?.map((version) => ({ value: version.revision, label: `正文 v${version.revision} · ${formatDate(version.savedAt)}` }))} />
        <p>与当前正文相比：{changedBlocks} 个正文节点有变化；固定字段{JSON.stringify(selected.content.fixedValues) === JSON.stringify(currentContent?.fixedValues) ? "相同" : "有变化"}。</p>
        <Button type="primary" loading={busy === "restore"} disabled={Boolean(busy)} onClick={() => void restore()}>恢复此版为新版本</Button>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 24, marginTop: 20 }}>
          <section aria-label="历史正文"><h3>历史正文 v{selected.revision}</h3><SnapshotContent content={selected.content} /></section>
          <section aria-label="当前正文"><h3>当前正文{currentContent ? ` v${currentContent.revision}` : ""}</h3>{currentContent ? <SnapshotContent content={currentContent} /> : <p>正在加载当前正文…</p>}</section>
        </div>
      </>}
    </> }, { key: "exports", label: "导出记录", children: <>
      {exports.isPending ? <p>正在加载导出记录…</p> : exports.isError ? <><XsStatusBar tone="error" message={operationErrorMessage(exports.error)} /><Button onClick={() => void exports.refetch()}>重新加载导出记录</Button></> : !exports.data?.length ? <p>暂无导出记录。</p> : exports.data.map((record) => <article key={record.id} style={{ padding: "16px 0", borderBottom: "1px solid var(--xs-border-color, #e5eaf2)" }}>
        <strong>{record.format} · {record.contentRevision == null ? "正文版本未记录" : `正文 v${record.contentRevision}`}</strong>
        <p>{formatDate(record.createdAt)} · {record.status === "GENERATED" ? "已生成" : "未生成"} {record.message}</p>
        {record.status === "GENERATED" ? <Button loading={busy === record.id} disabled={Boolean(busy)} onClick={() => void download(record)}>下载 {record.format}</Button> : null}
      </article>)}
    </> }]} />
  </Drawer>;
}
