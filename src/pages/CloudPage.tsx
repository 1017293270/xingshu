import { Button } from "antd";
import { ArrowsClockwise, Database, Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { sessionQueryKey, useSessionQueryScope } from "@/app/sessionQuery";
import { resolveXsAsyncStatus, XsAsyncPanel } from "@/components/xs/XsAsyncPanel";
import { XsCapabilityStatus } from "@/components/xs/XsCapabilityStatus";
import { XsCountUpText } from "@/components/xs/XsCountUpText";
import { XsIconTile } from "@/components/xs/XsIconTile";
import { productCapabilities } from "@/config/capabilities";
import cloudDriveIcon from "@/assets/cloud-icons/cloud-drive.png";
import { getDataHubKnowledgeAppLinks, openDataHubUrl } from "@/services/dataHubKnowledgeApp";
import { listDataHubKnowledgeBases } from "@/services/dataHubKnowledgeService";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import type { DataHubKnowledgeBase } from "@/types/dataHub";
import { PageFrame } from "./PageFrame";
import "./styles/cloud.css";

const knowledgeBaseTones = ["blue", "cyan", "green"] as const;

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
    return parsed.reduce((best, item) => (item.time > best.time ? item : best)).label;
  }

  return dated[0]?.label;
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

function KnowledgeBaseCard({
  knowledgeBase,
  index,
  detailUrl
}: {
  knowledgeBase: DataHubKnowledgeBase;
  index: number;
  detailUrl: string | null;
}) {
  const tone = knowledgeBaseTones[index % knowledgeBaseTones.length];
  const className = `xs-card xs-card-lift xs-page-enter cloud-lane${detailUrl ? " xs-card-button" : ""}`;
  const style = { animationDelay: `${160 + Math.min(index, 7) * 60}ms` };
  const body = (
    <>
      <XsIconTile icon={Database} label={knowledgeBase.title} tone={tone} />
      <div className="cloud-lane__body">
        <div className="cloud-lane__head">
          <h2>{knowledgeBase.title}</h2>
          {knowledgeBase.documentCount != null ? (
            <strong>{knowledgeBase.documentCount.toLocaleString("zh-CN")} 份文档</strong>
          ) : null}
        </div>
        <p>{knowledgeBase.description || "来自当前空间的 DataHub 知识库"}</p>
        {knowledgeBase.updatedAt ? <span>{knowledgeBase.updatedAt}</span> : null}
      </div>
    </>
  );

  if (detailUrl) {
    return (
      <button
        type="button"
        className={className}
        style={style}
        aria-label={`知识库：${knowledgeBase.title}`}
        onClick={() => openDataHubUrl(detailUrl)}
      >
        {body}
      </button>
    );
  }

  return (
    <article className={className} style={style} aria-label={`知识库：${knowledgeBase.title}`}>
      {body}
    </article>
  );
}

export function CloudPage() {
  const sessionScope = useSessionQueryScope();
  const spaceId = useDataHubAuthStore((state) => state.currentSpaceId);
  const appLinks = getDataHubKnowledgeAppLinks(spaceId);
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
      subtitle="查看当前空间已入库的知识库"
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
      <XsCapabilityStatus capability={productCapabilities.cloud} />
      <div aria-label="我的云盘内容">
        <section className="xs-card xs-page-enter cloud-workbench" style={{ animationDelay: "80ms" }}>
          <div className="cloud-workbench__intro">
            <XsIconTile imageSrc={cloudDriveIcon} label="我的云盘" tone="cyan" />
            <div>
              <span className="cloud-eyebrow">企业知识库</span>
              <h2>查看当前空间已入库的知识库</h2>
              <p>新增请到 DataHub 完成，星数只读取当前空间的知识库。</p>
            </div>
          </div>
          {showMetrics ? (
            <div className="cloud-workbench__metrics" aria-label="云盘概览指标">
              <div>
                <span>知识库</span>
                <strong>
                  <XsCountUpText
                    value={String(overview.knowledgeBaseCount)}
                    previousValue={
                      previousOverviewRef.current
                        ? String(previousOverviewRef.current.knowledgeBaseCount)
                        : undefined
                    }
                  />
                </strong>
              </div>
              {overview.documentTotal != null ? (
                <div>
                  <span>文档总数</span>
                  <strong>
                    <XsCountUpText
                      value={overview.documentTotal.toLocaleString("zh-CN")}
                      previousValue={
                        previousOverviewRef.current?.documentTotal != null
                          ? previousOverviewRef.current.documentTotal.toLocaleString("zh-CN")
                          : undefined
                      }
                    />
                  </strong>
                </div>
              ) : null}
              {overview.latestUpdatedAt ? (
                <div>
                  <span>最近更新</span>
                  <strong>{overview.latestUpdatedAt}</strong>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <XsAsyncPanel
          status={status}
          empty={knowledgeBases.length === 0}
          emptyTitle="暂无知识库"
          emptyDescription={
            appLinks.canAdd
              ? "到 DataHub 添加知识库后，返回此页即可看到。"
              : "当前空间还没有知识库。"
          }
          emptyActionLabel={appLinks.canAdd ? "去 DataHub 添加" : undefined}
          onEmptyAction={appLinks.canAdd ? handleAddKnowledgeBase : undefined}
          error={
            knowledgeBasesQuery.error instanceof Error
              ? knowledgeBasesQuery.error.message
              : "知识库列表加载失败，请稍后重试。"
          }
          onRetry={() => void refetch()}
          loadingVariant="cards"
          contentKey={knowledgeBasesQuery.dataUpdatedAt}
        >
          <section className="cloud-lane-grid" aria-label="知识库列表">
            {knowledgeBases.map((knowledgeBase, index) => (
              <KnowledgeBaseCard
                key={knowledgeBase.id}
                knowledgeBase={knowledgeBase}
                index={index}
                detailUrl={appLinks.detailUrlFor(knowledgeBase.id)}
              />
            ))}
          </section>
        </XsAsyncPanel>
      </div>
    </PageFrame>
  );
}
