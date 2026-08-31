import { Button, Input, Tooltip } from "antd";
import { AsteriskSimple, Check, CopySimple, PaperPlaneTilt } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { sessionQueryKey, useSessionQueryScope } from "@/app/sessionQuery";
import { XsComposerBox } from "@/components/xs/conversation";
import { xsEnterStep } from "@/components/xs/motion";
import { resolveXsAsyncStatus, XsAsyncPanel } from "@/components/xs/XsAsyncPanel";
import { XsStatusBar, type XsStatusTone } from "@/components/xs/XsStatusBar";
import type { XsIconComponent } from "@/components/xs/XsIconTile";
import {
  XsGlyphTableChecklist,
  XsGlyphTableInventory,
  XsGlyphTableRanking,
  XsGlyphTableStatistics
} from "@/components/xs/XsMetricGlyphs";
import { tableSessionPath, queueTableSessionLaunch } from "@/features/tableGeneration/useTableGeneration";
import { createAskTableSessionId } from "@/services/dataHubAskTable";
import { listRecentTables } from "@/services/tableService";
import type { TableTemplate, TableTemplateIconId } from "@/types/table";
import { PageFrame } from "./PageFrame";
import "./styles/workflows.css";

/** 制表类型图标固定 18px：34 网格里留出呼吸，笔画仍落在 1.25px 上。 */
const SHEET_GLYPH_SIZE = 18;

const sheetGlyphById: Record<TableTemplateIconId, XsIconComponent> = {
  ranking: XsGlyphTableRanking,
  "contact-list": XsGlyphTableChecklist,
  "expense-statistics": XsGlyphTableStatistics,
  inventory: XsGlyphTableInventory
};

const tablePromptPlaceholder = "描述您需要的表格，如「华东区Q1销售排行」「各部门人员通讯录」...";

function padTwo(value: number) {
  return String(value).padStart(2, "0");
}

/**
 * 最近列表按「今天 / 昨天 / 年内 / 跨年」四档收敛时间：
 * 完整年月日时分只在跨年记录上出现，近三天的记录一眼就能读出远近。
 */
function formatRecentTime(table: TableTemplate) {
  const raw = table.updatedAt?.trim();
  if (!raw) {
    return table.description;
  }

  const updated = new Date(raw.replace(" ", "T"));
  if (Number.isNaN(updated.getTime())) {
    return table.description;
  }

  const clock = `${padTwo(updated.getHours())}:${padTwo(updated.getMinutes())}`;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = new Date(updated.getFullYear(), updated.getMonth(), updated.getDate()).getTime();
  const dayDistance = Math.round((today - day) / 86_400_000);

  if (dayDistance === 0) {
    return `今天 ${clock}`;
  }
  if (dayDistance === 1) {
    return `昨天 ${clock}`;
  }
  if (updated.getFullYear() === now.getFullYear()) {
    return `${padTwo(updated.getMonth() + 1)}-${padTwo(updated.getDate())} ${clock}`;
  }

  return `${updated.getFullYear()}-${padTwo(updated.getMonth() + 1)}-${padTwo(updated.getDate())}`;
}

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

  return (
    <PageFrame
      title="智能制表"
      className="table-page"
      track="data"
      hideHeader
    >
      {/* 入口和会话是同一套对话：这里只是它的空态 */}
      <section className="table-hero xs-page-enter" aria-label="制表需求输入" style={xsEnterStep(1)}>
        <header className="table-hero__head">
          <AsteriskSimple size={40} weight="bold" aria-hidden="true" />
          <h1>想做一张什么表？</h1>
        </header>
        <XsComposerBox
          className={`table-hero__composer${promptPulse === "filled" ? " table-hero__composer--filled" : ""}`}
          mode="hero"
          toolbarLead="Enter 生成 · Shift + Enter 换行"
          toolbarTail={(
            <Button
              type="primary"
              icon={<PaperPlaneTilt size={17} weight="fill" aria-hidden="true" />}
              disabled={!prompt.trim()}
              onClick={handleGenerate}
            >
              生成表格
            </Button>
          )}
          footnote="生成后进入独立的问表会话，结果表会标注数据源、字段数与行数。"
        >
          <Input.TextArea
            aria-label="制表需求"
            variant="borderless"
            autoSize={{ minRows: 2, maxRows: 10 }}
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
        </XsComposerBox>
      </section>
      <div className="workflow-status-slot table-page__status-slot">
        <XsStatusBar
          tone={submissionTone}
          message={submissionStatus}
          transitionKey={`${submissionTone}:${submissionStatus}`}
          reserveSpace
        />
      </div>
      <section className="table-recent" aria-label="最近制表">
        <div className="section-title-row section-title-row--compact xs-page-enter" style={xsEnterStep(2)}>
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
          {/* 一行一条记录：表名是主角，类型与时间退到副行，动作只在指针进来时现身 */}
          <div className="sheet-list">
            {recentTables.map((table, index) => {
              const timeText = formatRecentTime(table);
              const copied = copiedTemplateId === table.id;

              return (
                <article
                  className="xs-page-enter sheet-row"
                  style={xsEnterStep(3 + Math.min(index, 2))}
                  key={table.id}
                  aria-label={`${table.title} ${timeText}`}
                >
                  <Link
                    className="sheet-row__main"
                    to={tableSessionPath(table.id)}
                    aria-label={`打开制表结果：${table.title}`}
                  >
                    <span className="sheet-icon" aria-hidden="true">
                      {(() => {
                        const SheetGlyph = sheetGlyphById[table.iconId];
                        return <SheetGlyph size={SHEET_GLYPH_SIZE} />;
                      })()}
                    </span>
                    <span className="sheet-row__text">
                      <h3 className="sheet-row__title" title={table.title}>
                        {table.title}
                      </h3>
                      <span className="sheet-row__meta">
                        <span className="sheet-row__type">{table.tag}</span>
                        <em aria-hidden="true">·</em>
                        <time className="sheet-row__time" dateTime={table.updatedAt} title={table.description}>
                          {timeText}
                        </time>
                      </span>
                    </span>
                  </Link>
                  <Tooltip title={copied ? "已复制到制表需求" : "复制制表要求"} placement="top">
                    <Button
                      type="text"
                      className="sheet-row__copy"
                      data-copied={copied ? "true" : undefined}
                      aria-label={copied ? "已复制制表要求" : "复制制表要求"}
                      icon={
                        copied
                          ? <Check size={15} aria-hidden="true" />
                          : <CopySimple size={15} aria-hidden="true" />
                      }
                      onClick={() => handleCopyTemplate(table)}
                    />
                  </Tooltip>
                </article>
              );
            })}
          </div>
        </XsAsyncPanel>
      </section>
    </PageFrame>
  );
}
