import { Button, Input, Segmented, Space } from "antd";
import { Database, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { Link } from "react-router";
import { sessionQueryKey, useSessionQueryScope } from "@/app/sessionQuery";
import { XsCapabilityStatus } from "@/components/xs/XsCapabilityStatus";
import { productCapabilities } from "@/config/capabilities";
import metricKnowledge from "@/assets/data-management-icons/metric-knowledge-total.png";
import metricDocument from "@/assets/data-management-icons/metric-document-total.png";
import metricRecent from "@/assets/data-management-icons/metric-recent-update.png";
import { resolveXsAsyncStatus, XsAsyncPanel } from "@/components/xs/XsAsyncPanel";
import { XsCountUpText } from "@/components/xs/XsCountUpText";
import { XsIconTile } from "@/components/xs/XsIconTile";
import { XsStatusBar } from "@/components/xs/XsStatusBar";
import { getDataHubKnowledgeAppLinks, openDataHubUrl } from "@/services/dataHubKnowledgeApp";
import { listDataHubKnowledgeBases } from "@/services/dataHubKnowledgeService";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import type { DataHubKnowledgeBase } from "@/types/dataHub";
import { PageFrame } from "./PageFrame";
import "./styles/data-assets.css";

const knowledgeBaseTones = ["blue", "cyan", "green"] as const;

const assetTabs = [
  { label: "知识库管理", value: "知识库管理" },
  { label: "数据源管理", value: "数据源管理", disabled: true },
  { label: "数据表管理", value: "数据表管理", disabled: true },
  { label: "数据接口管理", value: "数据接口管理", disabled: true },
  { label: "指标管理", value: "指标管理", disabled: true }
];

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

export function DataManagementPage() {
  const sessionScope = useSessionQueryScope();
  const spaceId = useDataHubAuthStore((state) => state.currentSpaceId);
  const appLinks = getDataHubKnowledgeAppLinks(spaceId);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const knowledgeBasesQuery = useQuery({
    queryKey: sessionQueryKey(sessionScope, "knowledge-bases"),
    queryFn: listDataHubKnowledgeBases,
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
      actions={(
        <Space size={8} wrap>
          <Button
            type="primary"
            icon={<Plus size={18} />}
            aria-describedby="knowledge-add-availability"
            disabled={!appLinks.canAdd}
            onClick={handleAddKnowledgeBase}
          >
            新增知识库
          </Button>
          <span
            id="knowledge-add-availability"
            className={appLinks.canAdd ? "sr-only" : "asset-tabs__availability"}
          >
            {appLinks.canAdd ? "将在新标签页打开 DataHub 知识库管理页" : appLinks.addDisabledReason}
          </span>
        </Space>
      )}
      className="data-management-page"
    >
      <XsCapabilityStatus capability={productCapabilities.dataAssets} />
      <nav className="asset-tabs xs-page-enter" style={{ animationDelay: "60ms" }} aria-label="资产管理类型">
        <Segmented
          aria-label="资产管理类型"
          aria-describedby="asset-tabs-availability"
          options={assetTabs}
          value="知识库管理"
        />
        <p id="asset-tabs-availability" className="asset-tabs__availability">
          当前仅开放知识库管理；数据源、数据表、数据接口和指标管理即将开放。
        </p>
      </nav>
      <section className="asset-filter xs-page-enter" style={{ animationDelay: "120ms" }} aria-label="知识库筛选">
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
        <XsStatusBar
          tone="info"
          label={normalizedQuery ? "筛选结果" : "汇总"}
          message={statusText}
          transitionKey={normalizedQuery || "all"}
          reserveSpace
        />
      </section>
      {showMetrics ? (
        <section className="manage-stats" aria-label="知识库统计">
          <article className="xs-card xs-card-lift stat-card data-stat-card--enter">
            <div>
              <span>知识库总数</span>
              <strong><XsCountUpText value={overview.knowledgeBaseCount.toLocaleString("zh-CN")} durationMs={650} /></strong>
            </div>
            <XsIconTile imageSrc={metricKnowledge} label="知识库总数" tone="blue" />
          </article>
          {overview.documentTotal != null ? (
            <article className="xs-card xs-card-lift stat-card data-stat-card--enter" style={{ animationDelay: "40ms" }}>
              <div>
                <span>文档总数</span>
                <strong><XsCountUpText value={overview.documentTotal.toLocaleString("zh-CN")} durationMs={650} /></strong>
              </div>
              <XsIconTile imageSrc={metricDocument} label="文档总数" tone="cyan" />
            </article>
          ) : null}
          {overview.latestUpdatedAt ? (
            <article className="xs-card xs-card-lift stat-card data-stat-card--enter" style={{ animationDelay: "80ms" }}>
              <div>
                <span>最近更新</span>
                <strong><time dateTime={overview.latestUpdatedAt}>{overview.latestUpdatedAt}</time></strong>
              </div>
              <XsIconTile imageSrc={metricRecent} label="最近更新" tone="green" />
            </article>
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
        <section className="kb-grid" aria-label="知识库列表">
          {visibleKnowledgeBases.map((knowledgeBase, index) => {
            const updatedAt = formatKnowledgeUpdatedAt(knowledgeBase.updatedAt);
            return (
              <article
                className={`xs-card xs-card-lift kb-card${index < 8 ? " kb-card--enter" : ""}`}
                style={index < 8 ? { animationDelay: `${Math.min(index * 32, 256)}ms` } : undefined}
                key={knowledgeBase.id}
                aria-label={`知识库：${knowledgeBase.title}`}
              >
                <XsIconTile
                  icon={Database}
                  label={knowledgeBase.title}
                  tone={knowledgeBaseTones[index % knowledgeBaseTones.length]}
                />
                <h2>{knowledgeBase.title}</h2>
                <p>{knowledgeBaseDescription(knowledgeBase)}</p>
                <div>
                  <strong>
                    {knowledgeBase.documentCount != null
                      ? `${knowledgeBase.documentCount.toLocaleString("zh-CN")} 篇文档`
                      : "文档数待同步"}
                  </strong>
                  {updatedAt ? <time dateTime={updatedAt}>更新于 {updatedAt}</time> : <span>更新时间待同步</span>}
                </div>
                <Link
                  className="xs-mini-link"
                  aria-label={`查看 ${knowledgeBase.title} 详情`}
                  to={`/cloud/${encodeURIComponent(knowledgeBase.id)}`}
                >
                  查看详情
                </Link>
              </article>
            );
          })}
        </section>
      </XsAsyncPanel>
    </PageFrame>
  );
}
