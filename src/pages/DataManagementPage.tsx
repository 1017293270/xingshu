import { Button, Input, Segmented } from "antd";
import { MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import { XsStatusBar } from "@/components/xs";
import { getKnowledgeBaseStats, listKnowledgeBases } from "@/services/dataAssetService";
import type { KnowledgeBaseIconId, KnowledgeBaseStatIconId } from "@/types/dataAsset";
import { PageFrame } from "./PageFrame";

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

const assetTabs = ["知识库管理", "数据源管理", "数据量簇管理", "指标语义管理", "技能管理", "问题集管理"];

export function DataManagementPage() {
  const [searchParams] = useSearchParams();
  const source = searchParams.get("source");
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("知识库管理");
  const [actionStatus, setActionStatus] = useState(source ? `已从看板定位：${source}` : "");
  const { data: stats = [] } = useQuery({
    queryKey: ["knowledgeBaseStats"],
    queryFn: getKnowledgeBaseStats
  });
  const { data: knowledgeBases = [] } = useQuery({
    queryKey: ["knowledgeBases"],
    queryFn: listKnowledgeBases
  });
  const normalizedQuery = query.trim().toLowerCase();
  const visibleKnowledgeBases = normalizedQuery
    ? knowledgeBases.filter((knowledgeBase) =>
      [knowledgeBase.title, knowledgeBase.description, knowledgeBase.docs, knowledgeBase.updatedAt]
        .some((field) => field.toLowerCase().includes(normalizedQuery))
    )
    : knowledgeBases;
  const statusText = actionStatus || (normalizedQuery ? `已筛选 ${visibleKnowledgeBases.length} 个知识库` : `共 ${visibleKnowledgeBases.length} 个知识库`);

  const handleSearch = (value: string) => {
    setQuery(value);
    setActionStatus("");
  };

  return (
    <PageFrame title="数据资产管理" subtitle="统一管理企业数据资产，助力数据价值最大化" actions={<Button type="primary" icon={<Plus size={18} />} onClick={() => setActionStatus("已创建知识库草稿")}>新增知识库</Button>} className="data-management-page">
      <nav className="asset-tabs" aria-label="资产管理类型">
        <Segmented
          aria-label="资产管理类型"
          options={assetTabs}
          value={activeTab}
          onChange={(value) => {
            setActiveTab(String(value));
            setActionStatus(`已切换到${value}`);
          }}
        />
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
          label={normalizedQuery || actionStatus ? "筛选结果" : "汇总"}
          message={statusText}
        />
      </section>
      <section className="manage-stats" aria-label="知识库统计">
        {stats.map((stat) => (
          <article className="xs-card stat-card" key={stat.id}>
            <div><span>{stat.label}</span><strong>{stat.value}</strong></div>
            <span className={`asset-image-tile asset-image-tile--${stat.tone}`}><img src={statIconById[stat.iconId]} alt="" /></span>
          </article>
        ))}
      </section>
      <section className="kb-grid" aria-label="知识库列表">
        {visibleKnowledgeBases.map((knowledgeBase) => (
          <button
            className="xs-card kb-card xs-card-button"
            key={knowledgeBase.id}
            type="button"
            aria-label={`${knowledgeBase.title}：${knowledgeBase.description}`}
            onClick={() => setActionStatus(`已打开知识库详情：${knowledgeBase.title}`)}
          >
            <span className={`asset-image-tile asset-image-tile--${knowledgeBase.tone}`}><img src={knowledgeBaseIconById[knowledgeBase.iconId]} alt="" /></span>
            <h2>{knowledgeBase.title}</h2>
            <p>{knowledgeBase.description}</p>
            <div><strong>{knowledgeBase.docs}</strong><span>{knowledgeBase.updatedAt}</span></div>
          </button>
        ))}
      </section>
    </PageFrame>
  );
}
