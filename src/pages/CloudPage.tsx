import { Button, Input, Segmented } from "antd";
import { ArrowRight, ArrowsClockwise, MagnifyingGlass, Plus, Rows, SquaresFour } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { sessionQueryKey, useSessionQueryScope } from "@/app/sessionQuery";
import { resolveXsAsyncStatus, XsAsyncPanel } from "@/components/xs/XsAsyncPanel";
import { XsCountUpText } from "@/components/xs/XsCountUpText";
import { XsIconTile } from "@/components/xs/XsIconTile";
import { XsKnowledgeCard } from "@/components/xs/XsKnowledgeCard";
import { xsKnowledgeToneFor } from "@/components/xs/knowledgeTone";
import { XsStatCard } from "@/components/xs/XsStatCard";
import { xsEnterStep } from "@/components/xs/motion";
import { XsStatusBar } from "@/components/xs/XsStatusBar";
import {
  XsGlyphCloudDrive,
  XsGlyphDocumentTotal,
  XsGlyphKnowledgeTotal,
  XsGlyphRecentUpdate
} from "@/components/xs/XsMetricGlyphs";
import { getDataHubKnowledgeAppLinks, openDataHubUrl } from "@/services/dataHubKnowledgeApp";
import { cloudKnowledgeScopeFor, listDataHubKnowledgeBases } from "@/services/dataHubKnowledgeService";
import { useSpaceAdmin } from "@/services/useSpaceAdmin";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import type { DataHubKnowledgeBase } from "@/types/dataHub";
import { PageFrame } from "./PageFrame";
import "./styles/cloud.css";

type CloudSortKey = "updated" | "documents" | "name";
type CloudViewMode = "grid" | "list";

const sortOptions = [
  { label: "最近更新", value: "updated" },
  { label: "文档数", value: "documents" },
  { label: "名称", value: "name" }
];

function formatKnowledgeUpdatedAt(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }

  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)/);
  if (match) {
    return `${match[1]} ${match[2]}`;
  }

  return trimmed;
}

function latestUpdatedLabel(items: DataHubKnowledgeBase[]) {
  const dated = items
    .map((item) => ({
      label: item.updatedAt?.trim() ?? "",
      time: item.updatedAt ? Date.parse(item.updatedAt) : Number.NaN
    }))
    .filter((item) => item.label);
  if (dated.length === 0) {
    return undefined;
  }

  const parsed = dated.filter((item) => Number.isFinite(item.time));
  if (parsed.length > 0) {
    const latest = parsed.reduce((best, item) => (item.time > best.time ? item : best)).label;
    return formatKnowledgeUpdatedAt(latest);
  }

  return formatKnowledgeUpdatedAt(dated[0]?.label);
}

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

/** 只有归一化后的 "YYYY-MM-DD HH:mm" 才参与排序，其余保留 DataHub 返回顺序 */
function updatedAtSortKey(value?: string) {
  const normalized = formatKnowledgeUpdatedAt(value);
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(normalized) ? normalized : "";
}

function sortKnowledgeBases(items: DataHubKnowledgeBase[], sortKey: CloudSortKey) {
  const sorted = [...items];
  if (sortKey === "documents") {
    sorted.sort((left, right) => (right.documentCount ?? -1) - (left.documentCount ?? -1));
    return sorted;
  }
  if (sortKey === "name") {
    sorted.sort((left, right) => left.title.localeCompare(right.title, "zh-CN"));
    return sorted;
  }
  // 字典序等于时间序，避免依赖各浏览器对非 ISO 字符串的日期解析
  sorted.sort((left, right) => updatedAtSortKey(right.updatedAt).localeCompare(updatedAtSortKey(left.updatedAt)));
  return sorted;
}

function documentShare(knowledgeBase: DataHubKnowledgeBase, documentTotal?: number) {
  if (knowledgeBase.documentCount == null || !documentTotal) {
    return undefined;
  }
  return Math.round((knowledgeBase.documentCount / documentTotal) * 100);
}

type CloudScopeCopy = {
  subtitle: string;
  metricCaption: string;
  fallbackDescription: string;
  /** 占比条口径措辞，卡片与列表行共用一处，见 XsKnowledgeCard 的 scopeLabel。 */
  scopeLabel: string;
  emptyDescription: string;
};

/** 云盘归属措辞跟着空间角色走：空间管理员是空间口径，普通成员是个人口径。 */
function cloudScopeCopy(isSpaceAdmin: boolean): CloudScopeCopy {
  if (isSpaceAdmin) {
    return {
      subtitle: "集中查看当前空间已入库的知识库与文档规模",
      metricCaption: "当前空间已入库",
      fallbackDescription: "来自当前空间的 DataHub 知识库",
      scopeLabel: "空间",
      emptyDescription: "当前空间还没有知识库。"
    };
  }

  return {
    subtitle: "集中查看个人已入库的知识库与文档规模",
    metricCaption: "个人已入库",
    fallbackDescription: "来自个人的 DataHub 知识库",
    scopeLabel: "个人",
    emptyDescription: "当前还没有个人知识库。"
  };
}

function knowledgeBaseDescription(knowledgeBase: DataHubKnowledgeBase, copy: CloudScopeCopy) {
  return knowledgeBase.description?.trim() || copy.fallbackDescription;
}

function ShareBar({
  share,
  copy,
  layout = "stacked"
}: {
  share: number;
  copy: CloudScopeCopy;
  layout?: "stacked" | "inline";
}) {
  return (
    <span className={`cloud-share cloud-share--${layout}`}>
      <span className="cloud-share__track" aria-hidden="true">
        <i style={{ width: `${Math.max(share, 2)}%` }} />
      </span>
      <small>{layout === "inline" ? `${share}%` : `占${copy.scopeLabel}文档 ${share}%`}</small>
    </span>
  );
}

function KnowledgeBaseRow({
  knowledgeBase,
  documentTotal,
  copy
}: {
  knowledgeBase: DataHubKnowledgeBase;
  documentTotal?: number;
  copy: CloudScopeCopy;
}) {
  const tone = xsKnowledgeToneFor(knowledgeBase.id);
  const share = documentShare(knowledgeBase, documentTotal);
  const updatedAt = formatKnowledgeUpdatedAt(knowledgeBase.updatedAt);
  return (
    <Link
      to={`/cloud/${encodeURIComponent(knowledgeBase.id)}`}
      className="cloud-kb-row"
      aria-label={`知识库：${knowledgeBase.title}`}
    >
      <span className="cloud-kb-row__name">
        <XsIconTile glyph={XsGlyphKnowledgeTotal} label={knowledgeBase.title} tone={tone} />
        <span className="cloud-kb-row__text">
          <strong>{knowledgeBase.title}</strong>
          <small>{knowledgeBaseDescription(knowledgeBase, copy)}</small>
        </span>
      </span>
      <span className="cloud-kb-row__count">
        {knowledgeBase.documentCount != null
          ? `${knowledgeBase.documentCount.toLocaleString("zh-CN")} 份`
          : "待同步"}
      </span>
      <span className="cloud-kb-row__share">
        {share != null ? <ShareBar share={share} copy={copy} layout="inline" /> : null}
      </span>
      <span className="cloud-kb-row__time">
        {updatedAt ? <time dateTime={knowledgeBase.updatedAt}>{updatedAt}</time> : "待同步"}
      </span>
      <span className="cloud-kb-row__go" aria-hidden="true">
        <ArrowRight size={16} />
      </span>
    </Link>
  );
}

export function CloudPage() {
  const sessionScope = useSessionQueryScope();
  const spaceId = useDataHubAuthStore((state) => state.currentSpaceId);
  const { isSpaceAdmin, resolved: roleResolved } = useSpaceAdmin();
  const knowledgeScope = cloudKnowledgeScopeFor(isSpaceAdmin);
  const copy = cloudScopeCopy(isSpaceAdmin);
  const appLinks = getDataHubKnowledgeAppLinks(spaceId);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<CloudSortKey>("updated");
  const [viewMode, setViewMode] = useState<CloudViewMode>("grid");
  const deferredQuery = useDeferredValue(query);
  const knowledgeBasesQuery = useQuery({
    // 口径进缓存键：管理员的空间口径与普通成员的个人口径不能互相复用
    queryKey: sessionQueryKey(sessionScope, "knowledge-bases", knowledgeScope ?? "SPACE"),
    queryFn: () => listDataHubKnowledgeBases(knowledgeScope),
    // 角色未落定前不发请求：否则会先按个人口径拉一遍再闪切到空间口径
    enabled: roleResolved,
    retry: false
  });
  const knowledgeBases = knowledgeBasesQuery.data ?? [];
  const status = resolveXsAsyncStatus({
    isPending: knowledgeBasesQuery.isPending,
    isFetching: knowledgeBasesQuery.isFetching,
    isError: knowledgeBasesQuery.isError,
    hasData: knowledgeBasesQuery.data !== undefined
  });
  const overview = summarizeKnowledgeBases(knowledgeBases);
  const previousOverviewRef = useRef<ReturnType<typeof summarizeKnowledgeBases> | null>(null);
  const refetch = knowledgeBasesQuery.refetch;
  const showMetrics = knowledgeBasesQuery.data !== undefined;
  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const matchedKnowledgeBases = normalizedQuery
    ? knowledgeBases.filter((knowledgeBase) =>
      [knowledgeBase.title, knowledgeBase.description, formatKnowledgeUpdatedAt(knowledgeBase.updatedAt)]
        .some((field) => field?.toLowerCase().includes(normalizedQuery))
    )
    : knowledgeBases;
  const visibleKnowledgeBases = sortKnowledgeBases(matchedKnowledgeBases, sortKey);
  const showToolbar = showMetrics && knowledgeBases.length > 0;
  // 概览指标已给出总量，这里只在筛选时补充命中数量
  const filterSummary = normalizedQuery
    ? `已筛选 ${visibleKnowledgeBases.length} / ${knowledgeBases.length} 个知识库`
    : undefined;

  useEffect(() => {
    previousOverviewRef.current = overview;
  }, [overview]);

  useEffect(() => {
    const refreshIfVisible = () => {
      // refetch 会绕过 enabled，这里再挡一次角色未落定的情况
      if (roleResolved && document.visibilityState === "visible") {
        void refetch();
      }
    };

    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [refetch, roleResolved]);

  const handleAddKnowledgeBase = () => {
    if (appLinks.manageUrl) {
      openDataHubUrl(appLinks.manageUrl);
    }
  };

  return (
    <PageFrame
      title="我的云盘"
      subtitle={copy.subtitle}
      className="cloud-page"
      track="data"
      actions={(
        <>
          <Button
            icon={<ArrowsClockwise size={18} />}
            loading={knowledgeBasesQuery.isFetching && !knowledgeBasesQuery.isPending}
            onClick={() => void refetch()}
          >
            刷新
          </Button>
          <Button
            type="primary"
            icon={<Plus size={18} />}
            disabled={!appLinks.canAdd}
            aria-describedby="cloud-add-availability"
            onClick={handleAddKnowledgeBase}
          >
            添加知识库
          </Button>
          <span id="cloud-add-availability" className={appLinks.canAdd ? "sr-only" : "cloud-add-hint"}>
            {appLinks.canAdd ? "将在新标签页打开 DataHub 知识库管理页" : appLinks.addDisabledReason}
          </span>
        </>
      )}
    >
      <div aria-label="我的云盘内容">
        {showMetrics ? (
          <section className="xs-stat-row" aria-label="云盘概览指标">
            <XsStatCard
              label="知识库总数"
              value={(
                <XsCountUpText
                  value={String(overview.knowledgeBaseCount)}
                  previousValue={
                    previousOverviewRef.current
                      ? String(previousOverviewRef.current.knowledgeBaseCount)
                      : undefined
                  }
                />
              )}
              caption={copy.metricCaption}
              glyph={XsGlyphCloudDrive}
              tone="blue"
              step={1}
            />
            {overview.documentTotal != null ? (
              <XsStatCard
                label="文档总数"
                value={(
                  <XsCountUpText
                    value={overview.documentTotal.toLocaleString("zh-CN")}
                    previousValue={
                      previousOverviewRef.current?.documentTotal != null
                        ? previousOverviewRef.current.documentTotal.toLocaleString("zh-CN")
                        : undefined
                    }
                  />
                )}
                caption="可被问答与写作引用"
                glyph={XsGlyphDocumentTotal}
                tone="cyan"
                step={2}
              />
            ) : null}
            {overview.latestUpdatedAt ? (
              <XsStatCard
                label="最近更新"
                value={overview.latestUpdatedAt}
                valueType="text"
                caption="来自 DataHub 同步时间"
                glyph={XsGlyphRecentUpdate}
                tone="green"
                step={3}
              />
            ) : null}
          </section>
        ) : null}

        {showToolbar ? (
          <>
            <section className="cloud-toolbar xs-page-enter" style={xsEnterStep(4)} aria-label="知识库筛选">
              <Input
                aria-label="知识库搜索"
                allowClear
                type="search"
                className="xs-focus-glow"
                prefix={<MagnifyingGlass size={18} />}
                placeholder="搜索知识库名称、说明或更新时间"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="cloud-toolbar__controls">
                <Segmented
                  aria-label="知识库排序方式"
                  options={sortOptions}
                  value={sortKey}
                  onChange={(value) => setSortKey(value as CloudSortKey)}
                />
                <Segmented
                  aria-label="知识库展示方式"
                  className="cloud-toolbar__view"
                  options={[
                    {
                      value: "grid",
                      label: (
                        <span>
                          <SquaresFour size={16} aria-hidden="true" />
                          卡片
                        </span>
                      )
                    },
                    {
                      value: "list",
                      label: (
                        <span>
                          <Rows size={16} aria-hidden="true" />
                          列表
                        </span>
                      )
                    }
                  ]}
                  value={viewMode}
                  onChange={(value) => setViewMode(value as CloudViewMode)}
                />
              </div>
            </section>
            <XsStatusBar
              tone="info"
              label="筛选结果"
              message={filterSummary}
              transitionKey={normalizedQuery}
            />
          </>
        ) : null}

        <XsAsyncPanel
          status={status}
          empty={visibleKnowledgeBases.length === 0}
          emptyTitle={normalizedQuery ? "未找到匹配的知识库" : "暂无知识库"}
          emptyDescription={
            normalizedQuery
              ? "换个关键词，或清空搜索查看全部知识库。"
              : appLinks.canAdd
                ? "到 DataHub 添加知识库后，返回此页即可看到。"
                : copy.emptyDescription
          }
          emptyActionLabel={!normalizedQuery && appLinks.canAdd ? "去 DataHub 添加" : undefined}
          onEmptyAction={!normalizedQuery && appLinks.canAdd ? handleAddKnowledgeBase : undefined}
          error={
            knowledgeBasesQuery.error instanceof Error
              ? knowledgeBasesQuery.error.message
              : "知识库列表加载失败，请稍后重试。"
          }
          onRetry={() => void refetch()}
          loadingVariant={viewMode === "list" ? "rows" : "cards"}
          contentKey={`${knowledgeBasesQuery.dataUpdatedAt}-${viewMode}-${sortKey}-${normalizedQuery}`}
        >
          {viewMode === "list" ? (
            <section className="cloud-kb-table xs-page-enter" aria-label="知识库列表">
              <div className="cloud-kb-table__head" aria-hidden="true">
                <span>知识库</span>
                <span>文档数</span>
                <span>文档占比</span>
                <span>最近更新</span>
                <span />
              </div>
              {visibleKnowledgeBases.map((knowledgeBase) => (
                <KnowledgeBaseRow
                  key={knowledgeBase.id}
                  knowledgeBase={knowledgeBase}
                  documentTotal={overview.documentTotal}
                  copy={copy}
                />
              ))}
            </section>
          ) : (
            <section className="xs-card-grid" aria-label="知识库列表">
              {visibleKnowledgeBases.map((knowledgeBase) => (
                <XsKnowledgeCard
                  key={knowledgeBase.id}
                  id={knowledgeBase.id}
                  title={knowledgeBase.title}
                  description={knowledgeBaseDescription(knowledgeBase, copy)}
                  documentCount={knowledgeBase.documentCount}
                  updatedAt={formatKnowledgeUpdatedAt(knowledgeBase.updatedAt)}
                  updatedAtValue={knowledgeBase.updatedAt}
                  share={documentShare(knowledgeBase, overview.documentTotal)}
                  scopeLabel={copy.scopeLabel}
                  tone={xsKnowledgeToneFor(knowledgeBase.id)}
                />
              ))}
            </section>
          )}
        </XsAsyncPanel>
      </div>
    </PageFrame>
  );
}
