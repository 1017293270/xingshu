import { Button, Input, Segmented } from "antd";
import {
  ArrowRight,
  ArrowsClockwise,
  ClockCounterClockwise,
  Database,
  MagnifyingGlass,
  Plus,
  Rows,
  SquaresFour
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { sessionQueryKey, useSessionQueryScope } from "@/app/sessionQuery";
import { resolveXsAsyncStatus, XsAsyncPanel } from "@/components/xs/XsAsyncPanel";
import { XsCountUpText } from "@/components/xs/XsCountUpText";
import { XsIconTile } from "@/components/xs/XsIconTile";
import { XsStatusBar } from "@/components/xs/XsStatusBar";
import cloudDriveIcon from "@/assets/cloud-icons/cloud-drive.png";
import documentTotalIcon from "@/assets/data-management-icons/metric-document-total.png";
import recentUpdateIcon from "@/assets/data-management-icons/metric-recent-update.png";
import { getDataHubKnowledgeAppLinks, openDataHubUrl } from "@/services/dataHubKnowledgeApp";
import { listDataHubKnowledgeBases } from "@/services/dataHubKnowledgeService";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import type { DataHubKnowledgeBase } from "@/types/dataHub";
import { PageFrame } from "./PageFrame";
import "./styles/cloud.css";

const knowledgeBaseTones = ["blue", "cyan", "green"] as const;

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

function knowledgeBaseDescription(knowledgeBase: DataHubKnowledgeBase) {
  return knowledgeBase.description?.trim() || "来自当前空间的 DataHub 知识库";
}

function ShareBar({ share, layout = "stacked" }: { share: number; layout?: "stacked" | "inline" }) {
  return (
    <span className={`cloud-share cloud-share--${layout}`}>
      <span className="cloud-share__track" aria-hidden="true">
        <i style={{ width: `${Math.max(share, 2)}%` }} />
      </span>
      <small>{layout === "inline" ? `${share}%` : `占空间文档 ${share}%`}</small>
    </span>
  );
}

function KnowledgeBaseCard({
  knowledgeBase,
  index,
  documentTotal
}: {
  knowledgeBase: DataHubKnowledgeBase;
  index: number;
  documentTotal?: number;
}) {
  const tone = knowledgeBaseTones[index % knowledgeBaseTones.length];
  const share = documentShare(knowledgeBase, documentTotal);
  const updatedAt = formatKnowledgeUpdatedAt(knowledgeBase.updatedAt);
  return (
    <Link
      to={`/cloud/${encodeURIComponent(knowledgeBase.id)}`}
      className="xs-card xs-card-lift xs-page-enter cloud-kb-card xs-card-link"
      style={{ animationDelay: `${160 + Math.min(index, 7) * 60}ms` }}
      aria-label={`知识库：${knowledgeBase.title}`}
    >
      <div className="cloud-kb-card__head">
        <XsIconTile icon={Database} label={knowledgeBase.title} tone={tone} />
        <div className="cloud-kb-card__heading">
          <h2>{knowledgeBase.title}</h2>
          <p>{knowledgeBaseDescription(knowledgeBase)}</p>
        </div>
      </div>
      <div className="cloud-kb-card__stats">
        <span className="cloud-kb-card__count">
          {knowledgeBase.documentCount != null ? (
            <>
              <strong>{knowledgeBase.documentCount.toLocaleString("zh-CN")}</strong>
              <small>份文档</small>
            </>
          ) : (
            <small>文档数待同步</small>
          )}
        </span>
        {share != null ? <ShareBar share={share} /> : null}
      </div>
      <div className="cloud-kb-card__foot">
        {updatedAt ? (
          <span className="cloud-kb-card__time">
            <ClockCounterClockwise size={14} aria-hidden="true" />
            <time dateTime={knowledgeBase.updatedAt}>{updatedAt}</time>
          </span>
        ) : (
          <span className="cloud-kb-card__time">更新时间待同步</span>
        )}
        <span className="cloud-kb-card__open">
          查看文档
          <ArrowRight size={14} aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}

function KnowledgeBaseRow({
  knowledgeBase,
  index,
  documentTotal
}: {
  knowledgeBase: DataHubKnowledgeBase;
  index: number;
  documentTotal?: number;
}) {
  const tone = knowledgeBaseTones[index % knowledgeBaseTones.length];
  const share = documentShare(knowledgeBase, documentTotal);
  const updatedAt = formatKnowledgeUpdatedAt(knowledgeBase.updatedAt);
  return (
    <Link
      to={`/cloud/${encodeURIComponent(knowledgeBase.id)}`}
      className="cloud-kb-row"
      aria-label={`知识库：${knowledgeBase.title}`}
    >
      <span className="cloud-kb-row__name">
        <XsIconTile icon={Database} label={knowledgeBase.title} tone={tone} />
        <span className="cloud-kb-row__text">
          <strong>{knowledgeBase.title}</strong>
          <small>{knowledgeBaseDescription(knowledgeBase)}</small>
        </span>
      </span>
      <span className="cloud-kb-row__count">
        {knowledgeBase.documentCount != null
          ? `${knowledgeBase.documentCount.toLocaleString("zh-CN")} 份`
          : "待同步"}
      </span>
      <span className="cloud-kb-row__share">
        {share != null ? <ShareBar share={share} layout="inline" /> : null}
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
  const appLinks = getDataHubKnowledgeAppLinks(spaceId);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<CloudSortKey>("updated");
  const [viewMode, setViewMode] = useState<CloudViewMode>("grid");
  const deferredQuery = useDeferredValue(query);
  const knowledgeBasesQuery = useQuery({
    queryKey: sessionQueryKey(sessionScope, "knowledge-bases"),
    queryFn: listDataHubKnowledgeBases,
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
      if (document.visibilityState === "visible") {
        void refetch();
      }
    };

    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [refetch]);

  const handleAddKnowledgeBase = () => {
    if (appLinks.manageUrl) {
      openDataHubUrl(appLinks.manageUrl);
    }
  };

  return (
    <PageFrame
      title="我的云盘"
      subtitle="集中查看当前空间已入库的知识库与文档规模"
      className="cloud-page"
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
          <section className="cloud-kpis" aria-label="云盘概览指标">
            <article className="xs-card xs-card-lift cloud-kpi xs-page-enter" style={{ animationDelay: "60ms" }}>
              <div>
                <span className="cloud-kpi__label">知识库</span>
                <strong className="cloud-kpi__value">
                  <XsCountUpText
                    value={String(overview.knowledgeBaseCount)}
                    previousValue={
                      previousOverviewRef.current
                        ? String(previousOverviewRef.current.knowledgeBaseCount)
                        : undefined
                    }
                  />
                </strong>
                <small className="cloud-kpi__caption">当前空间已入库</small>
              </div>
              <XsIconTile imageSrc={cloudDriveIcon} label="知识库总数" tone="blue" />
            </article>
            {overview.documentTotal != null ? (
              <article className="xs-card xs-card-lift cloud-kpi xs-page-enter" style={{ animationDelay: "100ms" }}>
                <div>
                  <span className="cloud-kpi__label">文档总数</span>
                  <strong className="cloud-kpi__value">
                    <XsCountUpText
                      value={overview.documentTotal.toLocaleString("zh-CN")}
                      previousValue={
                        previousOverviewRef.current?.documentTotal != null
                          ? previousOverviewRef.current.documentTotal.toLocaleString("zh-CN")
                          : undefined
                      }
                    />
                  </strong>
                  <small className="cloud-kpi__caption">可被问答与写作引用</small>
                </div>
                <XsIconTile imageSrc={documentTotalIcon} label="文档总数" tone="cyan" />
              </article>
            ) : null}
            {overview.latestUpdatedAt ? (
              <article className="xs-card xs-card-lift cloud-kpi xs-page-enter" style={{ animationDelay: "140ms" }}>
                <div>
                  <span className="cloud-kpi__label">最近更新</span>
                  <strong className="cloud-kpi__value cloud-kpi__value--time">{overview.latestUpdatedAt}</strong>
                  <small className="cloud-kpi__caption">来自 DataHub 同步时间</small>
                </div>
                <XsIconTile imageSrc={recentUpdateIcon} label="最近更新" tone="green" />
              </article>
            ) : null}
          </section>
        ) : null}

        {showToolbar ? (
          <>
            <section className="cloud-toolbar xs-page-enter" style={{ animationDelay: "180ms" }} aria-label="知识库筛选">
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
                : "当前空间还没有知识库。"
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
              {visibleKnowledgeBases.map((knowledgeBase, index) => (
                <KnowledgeBaseRow
                  key={knowledgeBase.id}
                  knowledgeBase={knowledgeBase}
                  index={index}
                  documentTotal={overview.documentTotal}
                />
              ))}
            </section>
          ) : (
            <section className="cloud-kb-grid" aria-label="知识库列表">
              {visibleKnowledgeBases.map((knowledgeBase, index) => (
                <KnowledgeBaseCard
                  key={knowledgeBase.id}
                  knowledgeBase={knowledgeBase}
                  index={index}
                  documentTotal={overview.documentTotal}
                />
              ))}
            </section>
          )}
        </XsAsyncPanel>
      </div>
    </PageFrame>
  );
}
