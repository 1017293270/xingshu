import { ArrowsClockwise, ChartBar, Database, FileText, PlusCircle, Sparkle, WarningCircle } from "@phosphor-icons/react";
import { Button, Checkbox, Input, Select, Tag } from "antd";
import { useEffect, useRef, useState } from "react";
import { XsCommandBox } from "@/components/xs/XsCommandBox";
import { XsSafeMarkdown } from "@/components/xs/XsSafeMarkdown";
import { resolveDataHubFinalAnswer } from "@/services/dataHubAskDataPresenter";
import {
  executeOfficialDocumentDataTable,
  type OfficialDocumentGeneratedDataAsset
} from "@/services/officialDocumentResearchService";
import {
  stripOfficialDocumentAnchors,
  type OfficialDocumentWritingAction
} from "@/services/officialDocumentFullDraft";
import { useWritingChat } from "./useWritingChat";

const END_OF_DRAFT = "__end__";

type DataTableTask = {
  question: string;
  sectionId: string;
  includeChart: boolean;
  status: "confirm" | "running" | "ready" | "inserting" | "inserted" | "error";
  error: string;
  result?: OfficialDocumentGeneratedDataAsset;
};

type WritingSectionOption = { value: string; label: string; searchText?: string };

export type WritingChatPanelProps = {
  draftId: string;
  draftTitle: string;
  templateName: string;
  /** 把回答落进结构化正文；由草稿编辑器提供，未就绪时按钮不出现。 */
  onInsert?: (text: string) => void;
  /** 兼容已有调用；正式页面使用 resolveWritingContext 读取发送瞬间的草稿。 */
  writingContext?: Record<string, unknown>;
  resolveWritingContext?: (action: OfficialDocumentWritingAction) => Record<string, unknown> | undefined;
  canGenerateFullDraft?: boolean;
  generateDisabledReason?: string;
  onFullDraftPreview?: (text: string) => void;
  generationRequest?: number;
  sectionOptions?: WritingSectionOption[];
  chartAllowed?: boolean;
  onInsertDataAsset?: (input: {
    question: string;
    sectionId?: string;
    result: OfficialDocumentGeneratedDataAsset;
  }) => Promise<void>;
};

function isFullDraftRequest(value: string) {
  const text = value.replace(/\s+/g, "");
  return /全文|整篇|完整.{0,8}(?:报告|汇报|公文|文章|文稿)|(?:写|生成|起草|重写|完善).{0,8}(?:整份|整篇)|(?:详细|完整).{0,4}(?:写|起草|生成).{0,12}(?:报告|汇报|公文|文章|文稿)|(?:写|起草|生成).{0,8}(?:一份|一个).{0,8}(?:报告|汇报|公文|文章|文稿)/.test(text);
}

function hasSectionAnchors(value: string) {
  return /(^|\n)\s*\[\[XS_SECTION:[^\]\r\n]+\]\]\s*(?:\n|$)/.test(value);
}

function isDataTableRequest(value: string) {
  const text = value.replace(/\s+/g, "");
  return /(?:(?:生成|制作|创建|查询|统计|汇总|插入|补充|添加|回填|做成|整理成).{0,48}(?:数据表|统计表|明细表|对比表|表格|图表)|(?:数据表|统计表|明细表|对比表|表格|图表).{0,48}(?:生成|制作|创建|查询|统计|汇总|插入|补充|添加|回填|展示|呈现))/.test(text);
}

function normalizedSectionText(value: string) {
  return value
    .replace(/^(?:第[一二三四五六七八九十百零〇两\d]+[章节篇部分]|[一二三四五六七八九十百零〇两]+[、.]|（[一二三四五六七八九十百零〇两\d]+）|\d+(?:\.\d+)*[、.]?)\s*/, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLocaleLowerCase();
}

function looksLikeFullDraftAnswer(value: string, options: WritingSectionOption[]) {
  if (hasSectionAnchors(value)) return true;
  if (value.length < 300 || options.length < 2 || (value.match(/^#{1,3}\s+.+$/gm)?.length ?? 0) < 2) return false;
  const normalized = normalizedSectionText(value);
  const matched = options.filter((option) => {
    const label = normalizedSectionText(option.label);
    return label.length >= 2 && normalized.includes(label);
  }).length;
  return matched === options.length;
}

function placementBigrams(value: string) {
  const chars = [...normalizedSectionText(value).replace(/(?:请|帮我|生成|制作|创建|查询|统计|汇总|插入|补充|添加|回填|做成|整理成|一张|数据表|统计表|明细表|表格|图表)/g, "")];
  return new Set(chars.slice(0, -1).map((char, index) => `${char}${chars[index + 1]}`));
}

function suggestedSectionId(question: string, options: WritingSectionOption[]) {
  const normalizedQuestion = normalizedSectionText(question);
  const exact = options
    .map((option) => ({ ...option, normalizedLabel: normalizedSectionText(option.label) }))
    .filter((option) => option.normalizedLabel.length >= 2 && normalizedQuestion.includes(option.normalizedLabel))
    .sort((left, right) => right.normalizedLabel.length - left.normalizedLabel.length)[0]?.value;
  if (exact) return exact;
  const questionBigrams = placementBigrams(question);
  const ranked = options.map((option) => ({
    value: option.value,
    score: [...placementBigrams(`${option.label}${option.searchText ?? ""}`)]
      .filter((token) => questionBigrams.has(token)).length
  })).sort((left, right) => right.score - left.score);
  return ranked[0]?.score >= 2 ? ranked[0].value : "";
}

export function WritingChatPanel({
  draftId,
  draftTitle,
  onInsert,
  writingContext,
  resolveWritingContext,
  canGenerateFullDraft = false,
  generateDisabledReason,
  onFullDraftPreview,
  generationRequest = 0,
  sectionOptions = [],
  chartAllowed = true,
  onInsertDataAsset
}: WritingChatPanelProps) {
  const { messages, busy, send, stop, reset } = useWritingChat(draftId);
  const [draft, setDraft] = useState("");
  const [localError, setLocalError] = useState("");
  const [dataTable, setDataTable] = useState<DataTableTask>();
  const streamRef = useRef<HTMLDivElement | null>(null);
  const dataTaskRef = useRef<HTMLElement | null>(null);
  const dataTableBusy = dataTable?.status === "running" || dataTable?.status === "inserting";
  const anyBusy = busy || dataTableBusy;

  useEffect(() => {
    const container = streamRef.current;
    if (!container) return;
    container.scrollTop = dataTaskRef.current
      ? Math.max(0, dataTaskRef.current.offsetTop - container.offsetTop - 4)
      : container.scrollHeight;
  }, [messages, dataTable?.status]);

  useEffect(() => {
    setDataTable(undefined);
    setLocalError("");
  }, [draftId]);

  const submit = () => {
    const question = draft.trim();
    if (!question || anyBusy) return;
    if (dataTable && dataTable.status !== "inserted") {
      setLocalError("请先确认或取消当前数据表任务");
      return;
    }
    if (isFullDraftRequest(question)) {
      const context = resolveWritingContext?.("FULL_DRAFT") ?? writingContext;
      if (!context || !canGenerateFullDraft) {
        setLocalError(generateDisabledReason || "请先确认内容方案并完成必需资料，再生成全文");
        return;
      }
      setLocalError("");
      send(
        `${question}\n\n请严格按已确认章节生成完整正文，每节使用指定的 [[XS_SECTION:section-id]] 锚点，不新增或遗漏章节。`,
        { writingContext: context, purpose: "full-draft", displayQuestion: question }
      );
      setDraft("");
      return;
    }
    if (onInsertDataAsset && isDataTableRequest(question)) {
      prepareDataTable(question);
      return;
    }
    const context = resolveWritingContext?.("DRAFT_ASSIST") ?? writingContext;
    if (resolveWritingContext && !context) {
      setLocalError("草稿内容仍在加载，请稍后再试");
      return;
    }
    setLocalError("");
    send(question, { writingContext: context });
    setDraft("");
  };

  const generateFullDraft = () => {
    const context = resolveWritingContext?.("FULL_DRAFT") ?? writingContext;
    if (!context || !canGenerateFullDraft || anyBusy) return;
    send(
      "请依据已确认的行文逻辑、原始内容和资料结果生成完整报告正文。每个章节必须使用指定的 [[XS_SECTION:section-id]] 锚点，章节不得遗漏或新增。",
      { writingContext: context, purpose: "full-draft", displayQuestion: "生成全文" }
    );
  };

  const prepareDataTable = (value = draft) => {
    const question = value.trim();
    if (!question || anyBusy) return;
    if (resolveWritingContext && !resolveWritingContext("DRAFT_ASSIST")) {
      setLocalError("草稿内容仍在加载，请稍后再试");
      return;
    }
    setDataTable({
      question,
      sectionId: sectionOptions.length ? suggestedSectionId(question, sectionOptions) : END_OF_DRAFT,
      includeChart: true,
      status: "confirm",
      error: ""
    });
    setLocalError("");
    setDraft("");
  };

  const executeDataTable = async () => {
    if (!dataTable || !dataTable.question.trim() || !dataTable.sectionId || dataTableBusy) return;
    setDataTable({ ...dataTable, status: "running", error: "" });
    try {
      const result = await executeOfficialDocumentDataTable(
        dataTable.question,
        dataTable.includeChart && chartAllowed
      );
      setDataTable((current) => current ? { ...current, status: "ready", result, error: "" } : current);
    } catch (error) {
      setDataTable((current) => current ? {
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : "数据表生成失败"
      } : current);
    }
  };

  const insertDataTable = async () => {
    if (!dataTable?.result || !onInsertDataAsset || dataTableBusy || dataTable.status === "inserted") return;
    setDataTable({ ...dataTable, status: "inserting", error: "" });
    try {
      await onInsertDataAsset({
        question: dataTable.question,
        sectionId: dataTable.sectionId === END_OF_DRAFT ? undefined : dataTable.sectionId,
        result: dataTable.result
      });
      setDataTable((current) => current ? { ...current, status: "inserted", error: "" } : current);
    } catch (error) {
      setDataTable((current) => current ? {
        ...current,
        status: "ready",
        error: error instanceof Error ? error.message : "数据表回填失败"
      } : current);
    }
  };

  useEffect(() => {
    if (generationRequest > 0) generateFullDraft();
    // generationRequest is an explicit one-shot signal from the research panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generationRequest]);

  return (
    <aside className="writing-chat" aria-label="报告智写对话">
      <div className="official-document-workspace-panel-head">
        <h4>智写助手</h4>
        <div className="writing-chat__head-actions">
          <Button
            size="small"
            type="primary"
            icon={<FileText size={14} />}
            disabled={!canGenerateFullDraft || anyBusy}
            title={generateDisabledReason}
            onClick={generateFullDraft}
          >
            生成全文
          </Button>
          {messages.length || dataTable ? (
            <Button
              type="text"
              size="small"
              icon={<ArrowsClockwise size={14} />}
              aria-label="清空对话"
              onClick={() => {
                reset();
                setDataTable(undefined);
                setLocalError("");
              }}
            />
          ) : null}
        </div>
      </div>

      <div className="writing-chat__stream" ref={streamRef}>
        {messages.length === 0 && !dataTable ? (
          <div className="writing-chat__empty">
            <Sparkle size={26} aria-hidden="true" />
            <strong>说一句你想写什么</strong>
            <p>会结合《{draftTitle}》当前的结构化正文来写，生成结果可以直接插入对应节点。</p>
          </div>
        ) : null}

        {messages.map((message) => {
          const answer = resolveDataHubFinalAnswer(
            message.ask.done?.summary,
            message.ask.assistantContent,
            message.status === "error",
            { keepRicherStreamedAnswer: true }
          );
          const visibleAnswer = stripOfficialDocumentAnchors(answer);
          const streaming = message.status === "streaming";
          const fullDraftAnswer = message.purpose === "full-draft" || looksLikeFullDraftAnswer(answer, sectionOptions);
          return (
            <div className="writing-chat__turn" key={message.id}>
              <p className="writing-chat__question">{message.question}</p>
              <div className="writing-chat__answer" data-streaming={streaming || undefined}>
                {streaming && !visibleAnswer ? (
                  <p className="writing-chat__thinking" role="status">
                    <span className="xs-status-bar__pulse" aria-hidden="true"><i /><i /><i /></span>
                    正在起草
                  </p>
                ) : null}
                {visibleAnswer ? <XsSafeMarkdown content={visibleAnswer} /> : null}
                {message.status === "error" ? (
                  <p className="writing-chat__error" role="alert">
                    <WarningCircle size={14} weight="bold" aria-hidden="true" />
                    {message.error || "生成失败，请重试"}
                  </p>
                ) : null}
                {message.status === "cancelled" ? (
                  <p className="writing-chat__error">已停止生成。</p>
                ) : null}
                {answer && !streaming && fullDraftAnswer && onFullDraftPreview ? (
                  <Button
                    className="writing-chat__insert"
                    size="small"
                    type="primary"
                    icon={<FileText size={14} />}
                    onClick={() => onFullDraftPreview(answer)}
                  >
                    预览全文
                  </Button>
                ) : answer && !streaming && onInsert ? (
                  <Button
                    className="writing-chat__insert"
                    size="small"
                    icon={<PlusCircle size={14} />}
                    onClick={() => onInsert(answer)}
                  >
                    插入到正文
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}

        {dataTable ? (
          <article ref={dataTaskRef} className="writing-chat__data-task" data-status={dataTable.status}>
            <header>
              <Database size={17} aria-hidden="true" />
              <strong>智写数据表</strong>
              <Tag bordered={false} color={dataTable.status === "inserted" ? "success" : dataTable.status === "error" ? "error" : "blue"}>
                {dataTable.status === "confirm" ? "待确认" : dataTable.status === "running" ? "查询中" : dataTable.status === "inserting" ? "回填中" : dataTable.status === "inserted" ? "已回填" : dataTable.status === "error" ? "失败" : "待回填"}
              </Tag>
            </header>

            {["confirm", "error"].includes(dataTable.status) ? (
              <div className="writing-chat__data-form">
                <label>
                  <span>查询问题</span>
                  <Input.TextArea
                    autoSize={{ minRows: 2, maxRows: 5 }}
                    value={dataTable.question}
                    onChange={(event) => setDataTable({ ...dataTable, question: event.target.value })}
                  />
                </label>
                <label>
                  <span>回填位置</span>
                  <Select
                    value={dataTable.sectionId || undefined}
                    placeholder="选择目标章节"
                    options={sectionOptions.length ? sectionOptions : [{ value: END_OF_DRAFT, label: "文末" }]}
                    onChange={(sectionId) => setDataTable({ ...dataTable, sectionId })}
                  />
                </label>
                <Checkbox
                  checked={dataTable.includeChart}
                  disabled={!chartAllowed}
                  onChange={(event) => setDataTable({ ...dataTable, includeChart: event.target.checked })}
                >
                  适合时附加图表{chartAllowed ? "" : "（已达到3张上限）"}
                </Checkbox>
                {dataTable.error ? <p className="writing-chat__error"><WarningCircle size={14} />{dataTable.error}</p> : null}
                <footer>
                  <Button size="small" onClick={() => setDataTable(undefined)}>取消</Button>
                  <Button
                    size="small"
                    type="primary"
                    disabled={!dataTable.question.trim() || !dataTable.sectionId}
                    onClick={() => void executeDataTable()}
                  >执行查询</Button>
                </footer>
              </div>
            ) : dataTable.status === "running" ? (
              <p className="writing-chat__thinking" role="status">
                <span className="xs-status-bar__pulse" aria-hidden="true"><i /><i /><i /></span>
                正在查询并冻结数据快照
              </p>
            ) : dataTable.result ? (
              <div className="writing-chat__data-result">
                {dataTable.result.summary ? <XsSafeMarkdown content={dataTable.result.summary} /> : null}
                {dataTable.result.table ? (
                  <div className="writing-chat__data-table">
                    <table>
                      <thead><tr>{dataTable.result.table.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                      <tbody>{dataTable.result.table.rows.slice(0, 5).map((row, rowIndex) => (
                        <tr key={rowIndex}>{row.map((cell, columnIndex) => <td key={columnIndex}>{cell}</td>)}</tr>
                      ))}</tbody>
                    </table>
                    <small>正文写入 {dataTable.result.table.rows.length} 行，共 {dataTable.result.table.totalRows} 行</small>
                  </div>
                ) : null}
                {dataTable.result.chart ? (
                  <figure>
                    <img src={`data:${dataTable.result.chart.mimeType};base64,${dataTable.result.chart.base64}`} alt={dataTable.result.chart.altText} />
                    <figcaption><ChartBar size={14} />{dataTable.result.chart.altText}</figcaption>
                  </figure>
                ) : null}
                {dataTable.result.querySource?.dataAsOf ? <small>数据时间：{dataTable.result.querySource.dataAsOf}</small> : null}
                {dataTable.error ? <p className="writing-chat__error"><WarningCircle size={14} />{dataTable.error}</p> : null}
                <footer>
                  {dataTable.status === "inserted" ? (
                    <span><PlusCircle size={14} />已写入正文</span>
                  ) : (
                    <>
                      <Button size="small" onClick={() => setDataTable(undefined)}>取消</Button>
                      <Button size="small" type="primary" loading={dataTable.status === "inserting"} onClick={() => void insertDataTable()}>
                        回填正文
                      </Button>
                    </>
                  )}
                </footer>
              </div>
            ) : null}
          </article>
        ) : null}
      </div>

      <div className="writing-chat__composer">
        <XsCommandBox
          value={draft}
          onChange={setDraft}
          onSubmit={submit}
          onStop={busy ? stop : undefined}
          busy={anyBusy}
          submitOnEnter
          placeholder="续写、润色，或插入数据表"
        />
        {localError ? <p className="writing-chat__error"><WarningCircle size={14} />{localError}</p> : null}
      </div>
    </aside>
  );
}
