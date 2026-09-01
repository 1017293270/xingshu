import { Button, Input, Popconfirm, Segmented, Tooltip } from "antd";
import { AsteriskSimple, Check, CopySimple, PaperPlaneTilt, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
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
import { TableTemplateModal } from "@/features/tableGeneration/TableTemplateModal";
import { createAskTableSessionId } from "@/services/dataHubAskTable";
import { listRecentTables } from "@/services/tableService";
import {
  buildTemplateLaunchPrompt,
  createTableTemplate,
  deleteTableTemplate,
  listTableTemplates,
  parseTableStructureColumns,
  updateTableTemplate,
  type DataHubTableTemplate,
  type TableTemplateInput
} from "@/services/tableTemplateService";
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

type TableHomeTab = "recent" | "mine" | "templates";

export function TablePage() {
  const navigate = useNavigate();
  const sessionScope = useSessionQueryScope();
  const [prompt, setPrompt] = useState("");
  const [submissionStatus, setSubmissionStatus] = useState("");
  const [submissionTone, setSubmissionTone] = useState<XsStatusTone>("info");
  const [copiedTemplateId, setCopiedTemplateId] = useState<string | null>(null);
  const [promptPulse, setPromptPulse] = useState<"idle" | "filled">("idle");
  const [activeTab, setActiveTab] = useState<TableHomeTab>("recent");
  const [templateModal, setTemplateModal] = useState<
    { mode: "create" } | { mode: "edit"; template: DataHubTableTemplate } | null
  >(null);
  const [templateSaving, setTemplateSaving] = useState(false);
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
  const templatesQuery = useQuery({
    queryKey: sessionQueryKey(sessionScope, "tableTemplates"),
    queryFn: listTableTemplates,
    enabled: activeTab === "templates"
  });
  const templates = templatesQuery.data ?? [];
  const templatesStatus = resolveXsAsyncStatus({
    isPending: templatesQuery.isPending,
    isFetching: templatesQuery.isFetching,
    isError: templatesQuery.isError,
    hasData: templatesQuery.data !== undefined
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

  /** 从模板发起制表：提示词 + 结构参考注入首轮，走同一条问表链路。 */
  const handleLaunchTemplate = (template: DataHubTableTemplate) => {
    const sessionId = createAskTableSessionId();
    const launchPrompt = buildTemplateLaunchPrompt(template);
    queueTableSessionLaunch(sessionId, launchPrompt);
    navigate(tableSessionPath(sessionId), { state: { prompt: launchPrompt } });
  };

  const handleSaveTemplate = async (input: TableTemplateInput) => {
    if (!templateModal) {
      return;
    }
    setTemplateSaving(true);
    try {
      if (templateModal.mode === "edit") {
        await updateTableTemplate(templateModal.template.id, input);
      } else {
        await createTableTemplate(input);
      }
      setTemplateModal(null);
      setSubmissionTone("success");
      setSubmissionStatus(templateModal.mode === "edit" ? "模板已更新" : "模板已保存");
      void templatesQuery.refetch();
    } catch (error) {
      setSubmissionTone("error");
      setSubmissionStatus(
        error instanceof Error ? `模板保存失败：${error.message}` : "模板保存失败，请稍后重试"
      );
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleDeleteTemplate = async (template: DataHubTableTemplate) => {
    try {
      await deleteTableTemplate(template.id);
      setSubmissionTone("success");
      setSubmissionStatus(`已删除模板：${template.name}`);
      void templatesQuery.refetch();
    } catch (error) {
      setSubmissionTone("error");
      setSubmissionStatus(
        error instanceof Error ? `模板删除失败：${error.message}` : "模板删除失败，请稍后重试"
      );
    }
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
      <div className="table-home-tabs xs-page-enter" style={xsEnterStep(2)}>
        <Segmented
          aria-label="制表内容切换"
          value={activeTab}
          onChange={(value) => setActiveTab(value as TableHomeTab)}
          /* title 置空：rc-segmented 默认把 label 复制成 title，鼠标扫过就会飘一条原生提示，
             而这三个词本身已自说明，不需要重复一遍。 */
          options={[
            { label: "最近制表", value: "recent", title: "" },
            { label: "我的表格", value: "mine", title: "" },
            { label: "表格模板", value: "templates", title: "" }
          ]}
        />
      </div>
      {activeTab === "recent" ? (
      <section className="table-recent" aria-label="最近制表记录">
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
      ) : null}
      {activeTab === "mine" ? (
        <section className="table-recent" aria-label="我的表格">
          <div className="section-title-row section-title-row--compact">
            <h2 className="subsection-title">我的表格</h2>
            <span className="section-title-meta">由制表会话生成的结果表 · 点击直接打开</span>
          </div>
          <XsAsyncPanel
            status={recentTablesStatus}
            empty={recentTables.length === 0}
            emptyDescription="还没有生成过结果表，先在上面描述一张表试试。"
            error="表格列表加载失败，请稍后重试。"
            onRetry={() => void recentTablesQuery.refetch()}
            loadingVariant="rows"
            contentKey={recentTablesQuery.dataUpdatedAt}
          >
            <div className="sheet-list">
              {recentTables.map((table) => {
                const SheetGlyph = sheetGlyphById[table.iconId];
                return (
                  <article className="sheet-row" key={table.id} aria-label={table.title}>
                    <Link
                      className="sheet-row__main"
                      to={tableSessionPath(table.id)}
                      aria-label={`打开结果表：${table.title}`}
                    >
                      <span className="sheet-icon" aria-hidden="true">
                        <SheetGlyph size={SHEET_GLYPH_SIZE} />
                      </span>
                      <span className="sheet-row__text">
                        <h3 className="sheet-row__title" title={table.title}>{table.title}</h3>
                        <span className="sheet-row__meta">
                          <span className="sheet-row__type">{table.tag}</span>
                          <em aria-hidden="true">·</em>
                          <time className="sheet-row__time" dateTime={table.updatedAt} title={table.description}>
                            {formatRecentTime(table)}
                          </time>
                        </span>
                      </span>
                    </Link>
                  </article>
                );
              })}
            </div>
          </XsAsyncPanel>
        </section>
      ) : null}
      {activeTab === "templates" ? (
        <section className="table-recent" aria-label="表格模板">
          <div className="section-title-row section-title-row--compact">
            <h2 className="subsection-title">表格模板</h2>
            <span className="section-title-meta">保存常用的制表提示词与表结构，一键复用</span>
            <Button
              type="primary"
              size="small"
              icon={<Plus size={14} aria-hidden="true" />}
              onClick={() => setTemplateModal({ mode: "create" })}
            >
              新建模板
            </Button>
          </div>
          <XsAsyncPanel
            status={templatesStatus}
            empty={templates.length === 0}
            emptyDescription="还没有表格模板。可以点「新建模板」，或在制表会话的结果表侧栏里「存为模板」。"
            error="模板列表加载失败，请稍后重试。"
            onRetry={() => void templatesQuery.refetch()}
            loadingVariant="rows"
            contentKey={templatesQuery.dataUpdatedAt}
          >
            <div className="sheet-list">
              {templates.map((template) => {
                const columns = parseTableStructureColumns(template.structureJson);
                return (
                  <article className="sheet-row" key={template.id} aria-label={`模板：${template.name}`}>
                    <button
                      type="button"
                      className="sheet-row__main"
                      aria-label={`用模板制表：${template.name}`}
                      onClick={() => handleLaunchTemplate(template)}
                    >
                      <span className="sheet-icon" aria-hidden="true">
                        <XsGlyphTableChecklist size={SHEET_GLYPH_SIZE} />
                      </span>
                      <span className="sheet-row__text">
                        <h3 className="sheet-row__title" title={template.name}>{template.name}</h3>
                        <span className="sheet-row__meta">
                          <span className="sheet-row__type" title={template.prompt}>
                            {template.prompt.length > 42 ? `${template.prompt.slice(0, 42)}…` : template.prompt}
                          </span>
                          {columns.length > 0 ? (
                            <>
                              <em aria-hidden="true">·</em>
                              <span>{columns.length} 列结构</span>
                            </>
                          ) : null}
                        </span>
                      </span>
                    </button>
                    <span className="sheet-row__actions">
                      <Tooltip title="编辑模板" placement="top">
                        <Button
                          type="text"
                          aria-label={`编辑模板：${template.name}`}
                          icon={<PencilSimple size={15} aria-hidden="true" />}
                          onClick={() => setTemplateModal({ mode: "edit", template })}
                        />
                      </Tooltip>
                      <Popconfirm
                        title="删除这个模板？"
                        description="删除后不可恢复，不影响已生成的结果表。"
                        okText="删除"
                        cancelText="取消"
                        onConfirm={() => void handleDeleteTemplate(template)}
                      >
                        <Button
                          type="text"
                          aria-label={`删除模板：${template.name}`}
                          icon={<Trash size={15} aria-hidden="true" />}
                        />
                      </Popconfirm>
                    </span>
                  </article>
                );
              })}
            </div>
          </XsAsyncPanel>
        </section>
      ) : null}
      <TableTemplateModal
        open={templateModal !== null}
        title={templateModal?.mode === "edit" ? "编辑模板" : "新建模板"}
        initial={templateModal?.mode === "edit" ? templateModal.template : undefined}
        saving={templateSaving}
        onSave={(input) => void handleSaveTemplate(input)}
        onClose={() => setTemplateModal(null)}
      />
    </PageFrame>
  );
}
