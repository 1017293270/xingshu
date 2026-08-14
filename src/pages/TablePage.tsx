import { Button, Input } from "antd";
import { Check, CopySimple, Lightning } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { sessionQueryKey, useSessionQueryScope } from "@/app/sessionQuery";
import { XsCapabilityStatus } from "@/components/xs/XsCapabilityStatus";
import { productCapabilities } from "@/config/capabilities";
import tableContactListIcon from "@/assets/table-icons/table-contact-list.png";
import tableExpenseStatisticsIcon from "@/assets/table-icons/table-expense-statistics.png";
import tableInventoryIcon from "@/assets/table-icons/table-inventory.png";
import tableRankingIcon from "@/assets/table-icons/table-ranking.png";
import { resolveXsAsyncStatus, XsAsyncPanel } from "@/components/xs/XsAsyncPanel";
import { XsStatusBar, type XsStatusTone } from "@/components/xs/XsStatusBar";
import { createTableFromPrompt, listRecentTables } from "@/services/tableService";
import type { TableTemplate, TableTemplateIconId } from "@/types/table";
import { PageFrame } from "./PageFrame";
import "./styles/workflows.css";

const sheetIconById: Record<TableTemplateIconId, string> = {
  ranking: tableRankingIcon,
  "contact-list": tableContactListIcon,
  "expense-statistics": tableExpenseStatisticsIcon,
  inventory: tableInventoryIcon
};

const tablePromptPlaceholder = "描述您需要的表格，如「华东区Q1销售排行」「各部门人员通讯录」...";

const tableSuggestions = ["华东区Q1销售排行", "各部门人员通讯录", "月度费用统计报表"];

const templateTagTone: Record<TableTemplate["tag"], string> = {
  排行: "blue",
  清单: "cyan",
  统计: "green"
};

export function TablePage() {
  const sessionScope = useSessionQueryScope();
  const [prompt, setPrompt] = useState("");
  const [submissionStatus, setSubmissionStatus] = useState("");
  const [submissionTone, setSubmissionTone] = useState<XsStatusTone>("info");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedTemplateId, setCopiedTemplateId] = useState<string | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const isGeneratingRef = useRef(false);
  const recentTablesQuery = useQuery({
    queryKey: sessionQueryKey(sessionScope, "recentTables"),
    queryFn: listRecentTables
  });
  const recentTables = recentTablesQuery.data ?? [];
  const recentTablesStatus = resolveXsAsyncStatus({
    isPending: recentTablesQuery.isPending,
    isFetching: recentTablesQuery.isFetching,
    isError: recentTablesQuery.isError,
    hasData: recentTablesQuery.data !== undefined
  });

  useEffect(() => () => {
    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current);
    }
  }, []);

  const handleGenerate = async () => {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt || isGeneratingRef.current) {
      return;
    }

    isGeneratingRef.current = true;
    setIsGenerating(true);
    setSubmissionTone("loading");
    setSubmissionStatus("正在创建制表预览");

    try {
      const result = await createTableFromPrompt(trimmedPrompt);
      if (result.status === "accepted") {
        setSubmissionTone("info");
        setSubmissionStatus(`预览需求已记录，不会创建真实报表：${result.prompt}`);
      }
    } catch {
      setSubmissionTone("error");
      setSubmissionStatus("制表需求提交失败，请稍后重试");
    } finally {
      isGeneratingRef.current = false;
      setIsGenerating(false);
    }
  };

  const handleCopyTemplate = (table: TableTemplate) => {
    if (isGeneratingRef.current) {
      return;
    }

    const nextPrompt = `${table.title}：${table.description}`;
    setPrompt(nextPrompt);
    setSubmissionTone("success");
    setSubmissionStatus(`已复制制表要求：${table.title}`);
    setCopiedTemplateId(table.id);
    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current);
    }
    copiedTimerRef.current = window.setTimeout(() => setCopiedTemplateId(null), 1200);
  };

  const handleUseSuggestion = (suggestion: string) => {
    if (isGeneratingRef.current) {
      return;
    }

    setPrompt(suggestion);
    setSubmissionTone("info");
    setSubmissionStatus(`已填入制表示例：${suggestion}`);
  };

  return (
    <PageFrame
      title="智能制表"
      subtitle="用自然语言描述表格结构，AI 帮你生成企业表格"
      className="table-page"
    >
      <XsCapabilityStatus capability={productCapabilities.tables} />
      <div className="sheet-workbench">
        <section className="xs-card sheet-console xs-page-enter" style={{ animationDelay: "80ms" }}>
          <div className="sheet-console__head">
            <span className="sheet-console__eyebrow">制表工作台</span>
            <h2>描述制表需求</h2>
            <p>说明表格主题、字段与统计口径；当前可预览需求组织方式</p>
          </div>
          <section
            className="sheet-prompt xs-focus-glow"
            aria-label="制表需求输入"
            aria-busy={isGenerating}
            data-state={isGenerating ? "submitting" : submissionTone}
          >
            <Input.TextArea
              aria-label="制表需求"
              variant="borderless"
              autoSize={{ minRows: 4, maxRows: 10 }}
              placeholder={tablePromptPlaceholder}
              value={prompt}
              disabled={isGenerating}
              onChange={(event) => setPrompt(event.target.value)}
              onPressEnter={(event) => {
                if (event.shiftKey) {
                  return;
                }
                event.preventDefault();
                void handleGenerate();
              }}
            />
            <div className="sheet-prompt__bar">
              <span className="sheet-prompt__shortcut" aria-hidden="true">Enter 预览 · Shift + Enter 换行</span>
              <Button
                type="primary"
                icon={<Lightning size={18} />}
                loading={isGenerating}
                disabled={isGenerating || !prompt.trim()}
                onClick={handleGenerate}
              >
                预览需求
              </Button>
            </div>
          </section>
          <div className="sheet-suggestions" aria-label="快捷制表示例">
            <span>试试</span>
            {tableSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={isGenerating}
                onClick={() => handleUseSuggestion(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </section>
      </div>
      <div className="workflow-status-slot table-page__status-slot">
        <XsStatusBar
          tone={submissionTone}
          label="操作"
          message={submissionStatus}
          transitionKey={`${submissionTone}:${submissionStatus}`}
          reserveSpace
        />
      </div>
      <div className="section-title-row section-title-row--compact xs-page-enter" style={{ animationDelay: "140ms" }}>
        <h2 className="subsection-title">最近制表</h2>
        <span className="section-title-meta">{recentTables.length} 个模板 · 可一键复制为制表需求</span>
      </div>
      <XsAsyncPanel
        status={recentTablesStatus}
        empty={recentTables.length === 0}
        emptyDescription="暂无最近制表记录。"
        error="最近制表加载失败，请稍后重试。"
        onRetry={() => void recentTablesQuery.refetch()}
        loadingVariant="rows"
        contentKey={recentTablesQuery.dataUpdatedAt}
      >
        <section className="sheet-list" aria-label="最近制表">
          {recentTables.map((table, index) => (
            <article
              className="xs-page-enter sheet-row"
              style={{ animationDelay: `${200 + index * 60}ms` }}
              key={table.id}
              aria-label={`${table.title} ${table.description}`}
            >
              <span className="sheet-icon" aria-hidden="true">
                <img src={sheetIconById[table.iconId]} alt="" />
              </span>
              <div className="sheet-row__body">
                <div className="sheet-row__head">
                  <h2 className="sheet-row__title" title={table.title}>
                    {table.title}
                  </h2>
                  <span className={`sheet-row__tag sheet-row__tag--${templateTagTone[table.tag]}`}>
                    {table.tag}
                  </span>
                </div>
                <p className="sheet-row__meta">{table.description}</p>
              </div>
              <Button
                type="text"
                className="sheet-row__copy"
                icon={
                  copiedTemplateId === table.id
                    ? <Check size={16} aria-hidden="true" />
                    : <CopySimple size={16} aria-hidden="true" />
                }
                disabled={isGenerating}
                onClick={() => handleCopyTemplate(table)}
              >
                {copiedTemplateId === table.id ? "已复制" : "复制制表要求"}
              </Button>
            </article>
          ))}
        </section>
      </XsAsyncPanel>
      <p className="page-disclaimer">当前为预览数据，不会生成或保存真实企业表格。</p>
    </PageFrame>
  );
}
