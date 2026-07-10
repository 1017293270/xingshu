import { Button, Input, Segmented, Space } from "antd";
import { MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import metricKnowledge from "@/assets/data-management-icons/metric-knowledge-total.png";
import metricDocument from "@/assets/data-management-icons/metric-document-total.png";
import metricParsed from "@/assets/data-management-icons/metric-parsed-complete.png";
import metricToday from "@/assets/data-management-icons/metric-today-added.png";
import kbPolicy from "@/assets/data-management-icons/kb-enterprise-policy.png";
import kbLegal from "@/assets/data-management-icons/kb-contract-legal.png";
import kbHr from "@/assets/data-management-icons/kb-human-resources.png";
import kbMarket from "@/assets/data-management-icons/kb-market-marketing.png";
import kbTech from "@/assets/data-management-icons/kb-tech-rd.png";
import kbFinance from "@/assets/data-management-icons/kb-finance-audit.png";
import { resolveXsAsyncStatus, XsAsyncPanel, XsStatusBar } from "@/components/xs";
import { getKnowledgeBaseStats, listKnowledgeBases } from "@/services/dataAssetService";
import type { KnowledgeBaseIconId, KnowledgeBaseStatIconId } from "@/types/dataAsset";
import { PageFrame } from "./PageFrame";
import "./styles/data-assets.css";

const statIconById: Record<KnowledgeBaseStatIconId, string> = {
  "knowledge-total": metricKnowledge,
  "document-total": metricDocument,
  "parsed-complete": metricParsed,
  "today-added": metricToday
};

const knowledgeBaseIconById: Record<KnowledgeBaseIconId, string> = {
  "enterprise-policy": kbPolicy,
  "contract-legal": kbLegal,
  "human-resources": kbHr,
  "market-marketing": kbMarket,
  "tech-rd": kbTech,
  "finance-audit": kbFinance
};

const assetTabs = [
  { label: "知识库管理", value: "知识库管理" },
  { label: "数据源管理", value: "数据源管理", disabled: true },
  { label: "数据表管理", value: "数据表管理", disabled: true },
  { label: "数据接口管理", value: "数据接口管理", disabled: true },
  { label: "指标管理", value: "指标管理", disabled: true }
];

export function DataManagementPage() {
  const [query, setQuery] = useState("");
  const statsQuery = useQuery({
    queryKey: ["knowledgeBaseStats"],
    queryFn: getKnowledgeBaseStats
  });
  const knowledgeBasesQuery = useQuery({
    queryKey: ["knowledgeBases"],
    queryFn: listKnowledgeBases
  });
  const stats = statsQuery.data ?? [];
  const knowledgeBases = knowledgeBasesQuery.data ?? [];
  const statsStatus = resolveXsAsyncStatus({
    isPending: statsQuery.isPending,
    isFetching: statsQuery.isFetching,
    isError: statsQuery.isError,
    hasData: statsQuery.data !== undefined
  });
  const knowledgeBasesStatus = resolveXsAsyncStatus({
    isPending: knowledgeBasesQuery.isPending,
    isFetching: knowledgeBasesQuery.isFetching,
    isError: knowledgeBasesQuery.isError,
    hasData: knowledgeBasesQuery.data !== undefined
  });
  const normalizedQuery = query.trim().toLowerCase();
  const visibleKnowledgeBases = normalizedQuery
    ? knowledgeBases.filter((knowledgeBase) =>
      [knowledgeBase.title, knowledgeBase.description, knowledgeBase.docs, knowledgeBase.updatedAt]
        .some((field) => field.toLowerCase().includes(normalizedQuery))
    )
    : knowledgeBases;
  const statusText =
    knowledgeBasesStatus === "ready"
      ? normalizedQuery
        ? `已筛选 ${visibleKnowledgeBases.length} 个知识库`
        : `共 ${visibleKnowledgeBases.length} 个知识库`
      : "";

  const handleSearch = (value: string) => {
    setQuery(value);
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
            aria-describedby="knowledge-actions-availability"
            disabled
          >
            新增知识库
          </Button>
          <span id="knowledge-actions-availability" className="asset-tabs__availability">
            新增与知识库详情即将开放
          </span>
        </Space>
      )}
      className="data-management-page"
    >
      <nav className="asset-tabs" aria-label="资产管理类型">
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
      <section className="asset-filter" aria-label="知识库筛选">
        <Input
          aria-label="知识库搜索"
          allowClear
          type="search"
          prefix={<MagnifyingGlass size={18} />}
          placeholder="搜索知识库名称、说明或更新时间"
          value={query}
          onChange={(event) => handleSearch(event.target.value)}
        />
        <XsStatusBar
          tone="info"
          label={normalizedQuery ? "筛选结果" : "汇总"}
          message={statusText}
        />
      </section>
      <XsAsyncPanel
        status={statsStatus}
        empty={stats.length === 0}
        emptyDescription="暂无知识库统计。"
        error="知识库统计加载失败，请稍后重试。"
        onRetry={() => void statsQuery.refetch()}
      >
        <section className="manage-stats" aria-label="知识库统计">
          {stats.map((stat) => (
            <article className="xs-card stat-card" key={stat.id}>
              <div><span>{stat.label}</span><strong>{stat.value}</strong></div>
              <span className={`asset-image-tile asset-image-tile--${stat.tone}`}><img src={statIconById[stat.iconId]} alt="" /></span>
            </article>
          ))}
        </section>
      </XsAsyncPanel>
      <XsAsyncPanel
        status={knowledgeBasesStatus}
        empty={visibleKnowledgeBases.length === 0}
        emptyTitle={normalizedQuery ? "未找到匹配的知识库" : undefined}
        emptyDescription={normalizedQuery ? "调整搜索词后再试试。" : "暂无知识库。"}
        error="知识库列表加载失败，请稍后重试。"
        onRetry={() => void knowledgeBasesQuery.refetch()}
      >
        <section className="kb-grid" aria-label="知识库列表">
          {visibleKnowledgeBases.map((knowledgeBase) => (
            <article
              className="xs-card kb-card"
              key={knowledgeBase.id}
              aria-label={`知识库：${knowledgeBase.title}`}
            >
              <span className={`asset-image-tile asset-image-tile--${knowledgeBase.tone}`}><img src={knowledgeBaseIconById[knowledgeBase.iconId]} alt="" /></span>
              <h2>{knowledgeBase.title}</h2>
              <p>{knowledgeBase.description}</p>
              <div><strong>{knowledgeBase.docs}</strong><span>{knowledgeBase.updatedAt}</span></div>
              <Button
                type="link"
                aria-label={`查看 ${knowledgeBase.title} 详情`}
                aria-describedby="knowledge-actions-availability"
                disabled
              >
                查看详情
              </Button>
            </article>
          ))}
        </section>
      </XsAsyncPanel>
    </PageFrame>
  );
}
