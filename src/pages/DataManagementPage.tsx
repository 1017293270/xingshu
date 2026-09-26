import { Button, Input, Segmented, Space } from "antd";
import { ArrowSquareOut, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { sessionQueryKey, useSessionQueryScope } from "@/app/sessionQuery";
import {
  XsGlyphDataApis,
  XsGlyphDataTables,
  XsGlyphDocumentTotal,
  XsGlyphKnowledgeTotal,
  XsGlyphRecentUpdate,
  XsGlyphTableStatistics
} from "@/components/xs/XsMetricGlyphs";
import { resolveXsAsyncStatus, XsAsyncPanel } from "@/components/xs/XsAsyncPanel";
import { XsCountUpText } from "@/components/xs/XsCountUpText";
import { XsIconTile, type XsIconComponent } from "@/components/xs/XsIconTile";
import { XsKnowledgeCard } from "@/components/xs/XsKnowledgeCard";
import { xsKnowledgeToneFor } from "@/components/xs/knowledgeTone";
import { XsStatCard } from "@/components/xs/XsStatCard";
import { xsEnterStep } from "@/components/xs/motion";
import {
  getDataHubKnowledgeAppLinks,
  getDataHubWorkspaceLink,
  openDataHubUrl,
  type DataHubWorkspacePage
} from "@/services/dataHubKnowledgeApp";
import { listDataHubKnowledgeBases } from "@/services/dataHubKnowledgeService";
import { useSpaceAdmin } from "@/services/useSpaceAdmin";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import type { DataHubKnowledgeBase } from "@/types/dataHub";
import { PageFrame } from "./PageFrame";
import "./styles/data-assets.css";

type AssetTab = "knowledge" | "datasources" | "tables" | "interfaces" | "metrics";
type ReviewTab = "datasources" | "tables" | "metrics";
type ReviewAccess = "pending" | "admin" | "member";

const assetTabs: Array<{ label: string; value: AssetTab; disabled?: boolean }> = [
  { label: "知识库管理", value: "knowledge" },
  { label: "数据源管理", value: "datasources" },
  { label: "数据表管理", value: "tables" },
  // DataHub 没有数据接口页面，入口无处可去，继续占位
  { label: "数据接口管理", value: "interfaces", disabled: true },
  { label: "指标管理", value: "metrics" }
];

type ReviewEntry = {
  glyph: XsIconComponent;
  title: string;
  description: string;
  /** DataHub 的工作台页面只放空间管理员进，其他成员给了按钮也会被送回知识库页 */
  memberNote: string;
  actions: Array<{ page: DataHubWorkspacePage; label: string }>;
};

/**
 * 首次构建后，AI 生成的表注释、表间关系和语义必须由空间管理员人工确认。
 * 编辑页都在 DataHub，星数只说清每个页签要核对什么，再把人送到对应页面。
 */
const reviewEntries: Record<ReviewTab, ReviewEntry> = {
  datasources: {
    glyph: XsGlyphDataApis,
    title: "核对数据源的首次构建结果",
    description:
      "数据源接入并完成首次构建后，AI 会自动生成表注释、表间关系和语义说明。正式用于问数前，请在 DataHub 里逐个核对，有问题先改。",
    memberNote: "需要空间管理员权限。数据源由空间管理员在 DataHub 中维护，如需调整请联系空间管理员。",
    actions: [{ page: "datasources", label: "打开 DataHub 数据源" }]
  },
  tables: {
    glyph: XsGlyphDataTables,
    title: "核对表注释与表间关系",
    description:
      "在 DataHub 打开对应数据源，依次检查「选表」里的表注释、「选字段」里的字段注释、「关系」里的表间关系和「语义」分组：表名要和业务叫法一致，缺的关系要补上。",
    memberNote: "需要空间管理员权限。表注释和表间关系由空间管理员在 DataHub 中核对，发现问题请联系空间管理员。",
    actions: [{ page: "datasources", label: "打开 DataHub 数据源" }]
  },
  metrics: {
    glyph: XsGlyphTableStatistics,
    title: "核对指标与口语说法",
    description:
      "DataHub 的指标目录列出语义层里的度量和维度，可按数据源核对名称和口径；用户常用的说法和指标名称对不上时，在口语词典里补一条解释。",
    memberNote: "需要空间管理员权限。指标和口语词典由空间管理员在 DataHub 中维护，发现问题请联系空间管理员。",
    actions: [
      { page: "metrics", label: "打开指标目录" },
      { page: "glossary", label: "打开口语词典" }
    ]
  }
};

function isReviewTab(tab: AssetTab): tab is ReviewTab {
  return tab in reviewEntries;
}

/** DataHub 的更新时间可能是 ISO 或已格式化字符串，统一到 "YYYY-MM-DD HH:mm" 再展示 */
function formatKnowledgeUpdatedAt(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }

  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)/);
  return match ? `${match[1]} ${match[2]}` : trimmed;
}

function latestUpdatedLabel(items: DataHubKnowledgeBase[]) {
  const dated = items
    .map((item) => ({
      label: item.updatedAt?.trim() ?? "",
      time: item.updatedAt ? Date.parse(item.updatedAt) : Number.NaN
    }))
    .filter((item) => item.label);
  if (dated.length === 0) {
    return "";
  }

  const parsed = dated.filter((item) => Number.isFinite(item.time));
  if (parsed.length > 0) {
    return formatKnowledgeUpdatedAt(parsed.reduce((best, item) => (item.time > best.time ? item : best)).label);
  }

  return formatKnowledgeUpdatedAt(dated[0]?.label);
}

/** 只统计 DataHub 真实返回的字段；文档数缺失时不补零，避免展示出假的总量。 */
function summarizeKnowledgeBases(items: DataHubKnowledgeBase[]) {
  const hasDocumentCounts = items.some((item) => item.documentCount != null);
  return {
    knowledgeBaseCount: items.length,
    documentTotal: hasDocumentCounts
      ? items.reduce((sum, item) => sum + (item.documentCount ?? 0), 0)
      : undefined,
    latestUpdatedAt: latestUpdatedLabel(items)
  };
}

function knowledgeBaseDescription(knowledgeBase: DataHubKnowledgeBase) {
  return knowledgeBase.description?.trim() || "来自当前空间的 DataHub 知识库";
}

function DataHubReviewPanel({
  tab,
  access,
  spaceId
}: {
  tab: ReviewTab;
  access: ReviewAccess;
  spaceId: number | null;
}) {
  const entry = reviewEntries[tab];
  const titleId = `asset-review-title-${tab}`;
  const hintId = `asset-review-hint-${tab}`;
  const actions = entry.actions.map((action) => ({
    ...action,
    link: getDataHubWorkspaceLink(action.page, spaceId)
  }));
  const unavailableReason = actions.find((action) => !action.link.url)?.link.unavailableReason;

  return (
    <section
      className="xs-card asset-review xs-page-enter"
      style={xsEnterStep(2)}
      aria-labelledby={titleId}
    >
      <XsIconTile glyph={entry.glyph} label={entry.title} />
      <div className="asset-review__body">
        <h2 id={titleId}>{entry.title}</h2>
        {access === "admin" ? (
          <>
            <p className="asset-review__description">{entry.description}</p>
            <div className="asset-review__actions">
              {actions.map(({ page, label, link }, index) => (
                <Button
                  key={page}
                  type={index === 0 ? "primary" : "default"}
                  icon={<ArrowSquareOut size={16} />}
                  aria-describedby={hintId}
                  disabled={!link.url}
                  onClick={() => {
                    if (link.url) {
                      openDataHubUrl(link.url);
                    }
                  }}
                >
                  {label}
                </Button>
              ))}
              <span id={hintId} className={unavailableReason ? "asset-review__note" : "sr-only"}>
                {unavailableReason ?? "将在新标签页打开 DataHub"}
              </span>
            </div>
          </>
        ) : (
          <p className="asset-review__note" role={access === "pending" ? "status" : undefined}>
            {access === "pending" ? "正在确认空间管理员权限…" : entry.memberNote}
          </p>
        )}
      </div>
    </section>
  );
}

export function DataManagementPage() {
  const sessionScope = useSessionQueryScope();
  const spaceId = useDataHubAuthStore((state) => state.currentSpaceId);
  const appLinks = getDataHubKnowledgeAppLinks(spaceId);
  // 进页就确认角色，切到核对页签时不必再等一轮 /api/spaces
  const { isSpaceAdmin, resolved: roleResolved } = useSpaceAdmin();
  const reviewAccess: ReviewAccess = !roleResolved ? "pending" : isSpaceAdmin ? "admin" : "member";
  const [activeTab, setActiveTab] = useState<AssetTab>("knowledge");
  const isKnowledgeTab = activeTab === "knowledge";
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const knowledgeBasesQuery = useQuery({
    queryKey: sessionQueryKey(sessionScope, "knowledge-bases"),
    queryFn: () => listDataHubKnowledgeBases(),
    retry: false
  });
  const knowledgeBases = knowledgeBasesQuery.data ?? [];
  const knowledgeBasesStatus = resolveXsAsyncStatus({
    isPending: knowledgeBasesQuery.isPending,
    isFetching: knowledgeBasesQuery.isFetching,
    isError: knowledgeBasesQuery.isError,
    hasData: knowledgeBasesQuery.data !== undefined
  });
  const overview = summarizeKnowledgeBases(knowledgeBases);
  const showMetrics = knowledgeBasesQuery.data !== undefined;
  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const isFiltering = query !== deferredQuery;
  const visibleKnowledgeBases = normalizedQuery
    ? knowledgeBases.filter((knowledgeBase) =>
      [knowledgeBase.title, knowledgeBase.description, formatKnowledgeUpdatedAt(knowledgeBase.updatedAt)]
        .some((field) => field?.toLowerCase().includes(normalizedQuery))
    )
    : knowledgeBases;
  const statusText =
    knowledgeBasesStatus === "ready"
      ? normalizedQuery
        ? `已筛选 ${visibleKnowledgeBases.length} / ${knowledgeBases.length} 个知识库`
        : `共 ${visibleKnowledgeBases.length} 个知识库`
      : "";

  const handleSearch = (value: string) => {
    setQuery(value);
  };

  const handleAddKnowledgeBase = () => {
    if (appLinks.manageUrl) {
      openDataHubUrl(appLinks.manageUrl);
    }
  };

  return (
    <PageFrame
      title="数据资产管理"
      subtitle="统一管理企业数据资产，助力数据价值最大化"
      // 「添加知识库」只属于知识库页签，挂在其他页签的页头会被误读成那里的动作
      actions={isKnowledgeTab ? (
        <Space size={8} wrap>
          <Button
            type="primary"
            icon={<Plus size={18} />}
            aria-describedby="knowledge-add-availability"
            disabled={!appLinks.canAdd}
            onClick={handleAddKnowledgeBase}
          >
            添加知识库
          </Button>
          <span
            id="knowledge-add-availability"
            className={appLinks.canAdd ? "sr-only" : "asset-tabs__availability"}
          >
            {appLinks.canAdd ? "将在新标签页打开 DataHub 知识库管理页" : appLinks.addDisabledReason}
          </span>
        </Space>
      ) : undefined}
      className="data-management-page"
      track="data"
    >
      <nav className="asset-tabs xs-page-enter" style={xsEnterStep(1)} aria-label="资产管理类型">
        <Segmented<AssetTab>
          aria-label="资产管理类型"
          aria-describedby="asset-tabs-availability"
          options={assetTabs}
          value={activeTab}
          onChange={setActiveTab}
        />
        <p id="asset-tabs-availability" className="asset-tabs__availability">
          数据接口管理即将开放。
        </p>
      </nav>
      {isReviewTab(activeTab) ? (
        <DataHubReviewPanel key={activeTab} tab={activeTab} access={reviewAccess} spaceId={spaceId} />
      ) : null}
      {isKnowledgeTab ? (
        <>
          <section className="asset-filter xs-page-enter" style={xsEnterStep(2)} aria-label="知识库筛选">
            <Input
              aria-label="知识库搜索"
              allowClear
              type="search"
              className="xs-focus-glow"
              prefix={<MagnifyingGlass size={18} />}
              placeholder="搜索知识库名称、说明或更新时间"
              value={query}
              onChange={(event) => handleSearch(event.target.value)}
            />
            {statusText ? (
              <span className="asset-filter__count" role="status" aria-live="polite">{statusText}</span>
            ) : null}
          </section>
          {showMetrics ? (
            <section className="xs-stat-row" aria-label="知识库统计">
              <XsStatCard
                label="知识库总数"
                value={<XsCountUpText value={overview.knowledgeBaseCount.toLocaleString("zh-CN")} durationMs={650} />}
                glyph={XsGlyphKnowledgeTotal}
                tone="blue"
                step={3}
              />
              {overview.documentTotal != null ? (
                <XsStatCard
                  label="文档总数"
                  value={<XsCountUpText value={overview.documentTotal.toLocaleString("zh-CN")} durationMs={650} />}
                  glyph={XsGlyphDocumentTotal}
                  tone="cyan"
                  step={4}
                />
              ) : null}
              {overview.latestUpdatedAt ? (
                <XsStatCard
                  label="最近更新"
                  value={<time dateTime={overview.latestUpdatedAt}>{overview.latestUpdatedAt}</time>}
                  valueType="text"
                  glyph={XsGlyphRecentUpdate}
                  tone="green"
                  step={5}
                />
              ) : null}
            </section>
          ) : null}
          <XsAsyncPanel
            status={isFiltering && knowledgeBasesStatus === "ready" ? "refreshing" : knowledgeBasesStatus}
            empty={visibleKnowledgeBases.length === 0}
            emptyTitle={normalizedQuery ? "未找到匹配的知识库" : undefined}
            emptyDescription={
              normalizedQuery
                ? "调整搜索词后再试试。"
                : appLinks.canAdd
                  ? "当前空间还没有知识库，去 DataHub 添加后会同步到这里。"
                  : "当前空间还没有知识库。"
            }
            emptyActionLabel={!normalizedQuery && appLinks.canAdd ? "去 DataHub 添加" : undefined}
            onEmptyAction={!normalizedQuery && appLinks.canAdd ? handleAddKnowledgeBase : undefined}
            error="知识库列表加载失败，请稍后重试。"
            onRetry={() => void knowledgeBasesQuery.refetch()}
            loadingVariant="cards"
            contentKey={normalizedQuery || "all"}
            preserveContentWhileRefreshing
            staggerLimit={8}
          >
            <section className="xs-card-grid" aria-label="知识库列表">
              {visibleKnowledgeBases.map((knowledgeBase) => (
                <XsKnowledgeCard
                  key={knowledgeBase.id}
                  id={knowledgeBase.id}
                  title={knowledgeBase.title}
                  description={knowledgeBaseDescription(knowledgeBase)}
                  documentCount={knowledgeBase.documentCount}
                  updatedAt={formatKnowledgeUpdatedAt(knowledgeBase.updatedAt)}
                  updatedAtValue={knowledgeBase.updatedAt}
                  scopeLabel="空间"
                  tone={xsKnowledgeToneFor(knowledgeBase.id)}
                />
              ))}
            </section>
          </XsAsyncPanel>
        </>
      ) : null}
    </PageFrame>
  );
}
