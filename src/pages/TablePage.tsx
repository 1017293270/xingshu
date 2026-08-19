import { Button, Input } from "antd";
import { Check, CopySimple, Lightning } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { sessionQueryKey, useSessionQueryScope } from "@/app/sessionQuery";
import { XsCapabilityStatus } from "@/components/xs/XsCapabilityStatus";
import { productCapabilities } from "@/config/capabilities";
import tableContactListIcon from "@/assets/table-icons/table-contact-list.png";
import tableExpenseStatisticsIcon from "@/assets/table-icons/table-expense-statistics.png";
import tableInventoryIcon from "@/assets/table-icons/table-inventory.png";
import tableRankingIcon from "@/assets/table-icons/table-ranking.png";
import { resolveXsAsyncStatus, XsAsyncPanel } from "@/components/xs/XsAsyncPanel";
import { XsStatusBar, type XsStatusTone } from "@/components/xs/XsStatusBar";
import { tableSessionPath, queueTableSessionLaunch } from "@/features/tableGeneration/useTableGeneration";
import { createAskTableSessionId } from "@/services/dataHubAskTable";
import { listRecentTables } from "@/services/tableService";
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

export function TablePage() {
  const navigate = useNavigate();
  const sessionScope = useSessionQueryScope();
  const [prompt, setPrompt] = useState("");
  const [submissionStatus, setSubmissionStatus] = useState("");
  const [submissionTone, setSubmissionTone] = useState<XsStatusTone>("info");
  const [copiedTemplateId, setCopiedTemplateId] = useState<string | null>(null);
  const [promptPulse, setPromptPulse] = useState<"idle" | "filled">("idle");
  const copiedTimerRef = useRef<number | null>(null);
  const filledTimerRef = useRef<number | null>(null);
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
    if (filledTimerRef.current !== null) {
      window.clearTimeout(filledTimerRef.current);
    }
  }, []);

  const pulsePrompt = () => {
    setPromptPulse("filled");
    if (filledTimerRef.current !== null) {
      window.clearTimeout(filledTimerRef.current);
    }
    filledTimerRef.current = window.setTimeout(() => setPromptPulse("idle"), 260);
  };

  const handleGenerate = () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      return;
    }

    const sessionId = createAskTableSessionId();
    queueTableSessionLaunch(sessionId, trimmedPrompt);
    navigate(tableSessionPath(sessionId), {
      state: { prompt: trimmedPrompt }
    });
  };

  const handleCopyTemplate = (table: TableTemplate) => {
    const nextPrompt = table.prompt ?? `${table.title}：${table.description}`;
    setPrompt(nextPrompt);
    pulsePrompt();
    setSubmissionTone("success");
    setSubmissionStatus(`已复制制表要求：${table.title}`);
    setCopiedTemplateId(table.id);
    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current);
    }
    copiedTimerRef.current = window.setTimeout(() => setCopiedTemplateId(null), 1200);
  };

  const handleUseSuggestion = (suggestion: string) => {
    setPrompt(suggestion);
    pulsePrompt();
    setSubmissionTone("info");
    setSubmissionStatus(`已填入制表示例：${suggestion}`);
  };

  const promptState = promptPulse === "filled" ? "filled" : submissionTone;

  return (
    <PageFrame
      title="智能制表"
      subtitle="用自然语言描述表格结构，问表智能体帮你生成企业表格"
      className="table-page"
    >
      <XsCapabilityStatus capability={productCapabilities.tables} />
      <div className="sheet-workbench">
        <section className="xs-card sheet-console xs-page-enter" style={{ animationDelay: "80ms" }}>
          <div className="sheet-console__head">
            <h2>描述制表需求</h2>
            <p>写清主题、字段与统计口径。生成后进入独立的问表会话，结果表会标注数据源、字段数与行数。</p>
          </div>
          <section
            className="sheet-prompt xs-focus-glow"
            aria-label="制表需求输入"
            data-state={promptState}
          >
            <Input.TextArea
              aria-label="制表需求"
              variant="borderless"
              autoSize={{ minRows: 3, maxRows: 10 }}
              placeholder={tablePromptPlaceholder}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onPressEnter={(event) => {
                if (event.shiftKey) {
                  return;
                }
                event.preventDefault();
                handleGenerate();
              }}
            />
            <div className="sheet-prompt__bar">
              <div className="sheet-suggestions" role="group" aria-label="快捷制表示例">
                <span>试试</span>
                {tableSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => handleUseSuggestion(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              <span className="sheet-prompt__shortcut" aria-hidden="true">Enter 生成 · Shift + Enter 换行</span>
              <Button
                type="primary"
                icon={<Lightning size={18} weight="fill" aria-hidden="true" />}
                disabled={!prompt.trim()}
                onClick={handleGenerate}
              >
                生成表格
              </Button>
            </div>
          </section>
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
      <section aria-label="最近制表">
        <div className="section-title-row section-title-row--compact xs-page-enter" style={{ animationDelay: "140ms" }}>
          <h2 className="subsection-title">最近制表</h2>
          <span className="section-title-meta">{recentTables.length} 条记录 · 点击打开当时的结果表</span>
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
          <div className="sheet-list">
            {/* 列名条只是视觉上的表头，行本身已带完整可访问名称，不做假的 table 语义 */}
            <div className="sheet-list__head" aria-hidden="true">
              <span>表名</span>
              <span>类型</span>
              <span>更新时间</span>
              <span>操作</span>
            </div>
            {recentTables.map((table, index) => (
              <article
                className="xs-page-enter sheet-row"
                style={{ animationDelay: `${200 + index * 40}ms` }}
                key={table.id}
                aria-label={`${table.title} ${table.description}`}
              >
                <Link
                  className="sheet-row__main"
                  to={tableSessionPath(table.id)}
                  aria-label={`打开制表结果：${table.title}`}
                >
                  <span className="sheet-icon" aria-hidden="true">
                    <img src={sheetIconById[table.iconId]} alt="" />
                  </span>
                  <h2 className="sheet-row__title" title={table.title}>
                    {table.title}
                  </h2>
                  <span className="sheet-row__type">{table.tag}</span>
                  <span className="sheet-row__time">{table.description}</span>
                </Link>
                <Button
                  type="text"
                  className="sheet-row__copy"
                  icon={
                    copiedTemplateId === table.id
                      ? <Check size={15} aria-hidden="true" />
                      : <CopySimple size={15} aria-hidden="true" />
                  }
                  onClick={() => handleCopyTemplate(table)}
                >
                  {copiedTemplateId === table.id ? "已复制" : "复制制表要求"}
                </Button>
              </article>
            ))}
          </div>
        </XsAsyncPanel>
      </section>
    </PageFrame>
  );
}
