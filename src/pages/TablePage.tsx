import { Button, Input, Tag } from "antd";
import { Lightning, Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import tableContactListIcon from "@/assets/table-icons/table-contact-list.png";
import tableExpenseStatisticsIcon from "@/assets/table-icons/table-expense-statistics.png";
import tableInventoryIcon from "@/assets/table-icons/table-inventory.png";
import tableRankingIcon from "@/assets/table-icons/table-ranking.png";
import { resolveXsAsyncStatus, XsAsyncPanel, XsStatusBar } from "@/components/xs";
import type { XsStatusTone } from "@/components/xs";
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

export function TablePage() {
  const [prompt, setPrompt] = useState("");
  const [submissionStatus, setSubmissionStatus] = useState("");
  const [submissionTone, setSubmissionTone] = useState<XsStatusTone>("info");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedTemplateId, setCopiedTemplateId] = useState<string | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const isGeneratingRef = useRef(false);
  const recentTablesQuery = useQuery({
    queryKey: ["recentTables"],
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
    setSubmissionStatus("正在提交制表需求");

    try {
      const result = await createTableFromPrompt(trimmedPrompt);
      if (result.status === "accepted") {
        setSubmissionTone("info");
        setSubmissionStatus(`制表需求已加入生成队列，尚未生成：${result.prompt}`);
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

  return (
    <PageFrame title="智能制表" className="table-page">
      <section
        className="sheet-prompt xs-page-enter"
        style={{ animationDelay: "80ms" }}
        aria-label="制表需求输入"
        aria-busy={isGenerating}
        data-state={isGenerating ? "submitting" : submissionTone}
      >
        <span className="sheet-prompt__addon" aria-hidden="true">
          <Plus size={18} weight="bold" />
        </span>
        <Input
          aria-label="制表需求"
          className="xs-focus-glow"
          placeholder={tablePromptPlaceholder}
          value={prompt}
          disabled={isGenerating}
          onChange={(event) => setPrompt(event.target.value)}
          onPressEnter={handleGenerate}
        />
        <Button
          type="primary"
          icon={<Lightning size={18} />}
          loading={isGenerating}
          disabled={isGenerating || !prompt.trim()}
          onClick={handleGenerate}
        >
          生成
        </Button>
      </section>
      <div className="workflow-status-slot table-page__status-slot">
        <XsStatusBar
          tone={submissionTone}
          label="操作"
          message={submissionStatus}
          transitionKey={`${submissionTone}:${submissionStatus}`}
          reserveSpace
        />
      </div>
      <h2 className="subsection-title xs-page-enter" style={{ animationDelay: "140ms" }}>
        最近制表
      </h2>
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
              className="xs-card xs-card-lift xs-page-enter sheet-row"
              style={{ animationDelay: `${200 + index * 60}ms` }}
              key={table.id}
              aria-label={`${table.title} ${table.description}`}
            >              <span className="sheet-icon" aria-hidden="true">
                <img src={sheetIconById[table.iconId]} alt="" />
              </span>
              <div className="sheet-row__body">
                <h2 className="sheet-row__title" title={table.title}>
                  {table.title}
                </h2>
                <p className="sheet-row__meta">
                  <Tag bordered={false} color="blue">
                    {table.tag}
                  </Tag>
                  <span>{table.description}</span>
                </p>
              </div>
              <Button disabled={isGenerating} onClick={() => handleCopyTemplate(table)}>
                {copiedTemplateId === table.id ? "已复制" : "复制制表要求"}
              </Button>
            </article>
          ))}
        </section>
      </XsAsyncPanel>
      <p className="page-disclaimer">内容由 AI 生成，仅供参考，请按实际业务需求调整。</p>
    </PageFrame>
  );
}
