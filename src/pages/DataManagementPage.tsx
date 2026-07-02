import { Button } from "antd";
import { Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
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

export function DataManagementPage() {
  const { data: stats = [] } = useQuery({
    queryKey: ["knowledgeBaseStats"],
    queryFn: getKnowledgeBaseStats
  });
  const { data: knowledgeBases = [] } = useQuery({
    queryKey: ["knowledgeBases"],
    queryFn: listKnowledgeBases
  });

  return (
    <PageFrame title="数据资产管理" subtitle="统一管理企业数据资产，助力数据价值最大化" actions={<Button type="primary" icon={<Plus size={18} />}>新增知识库</Button>} className="data-management-page">
      <nav className="asset-tabs" aria-label="资产管理类型">
        {["知识库管理", "数据源管理", "数据量簇管理", "指标语义管理", "技能管理", "问题集管理"].map((tab, index) => <Button type={index === 0 ? "primary" : "default"} key={tab}>{tab}</Button>)}
      </nav>
      <section className="manage-stats" aria-label="知识库统计">
        {stats.map((stat) => (
          <article className="xs-card stat-card" key={stat.id}>
            <div><span>{stat.label}</span><strong>{stat.value}</strong></div>
            <span className={`asset-image-tile asset-image-tile--${stat.tone}`}><img src={statIconById[stat.iconId]} alt="" /></span>
          </article>
        ))}
      </section>
      <section className="kb-grid" aria-label="知识库列表">
        {knowledgeBases.map((knowledgeBase) => (
          <article className="xs-card kb-card" key={knowledgeBase.id}>
            <span className={`asset-image-tile asset-image-tile--${knowledgeBase.tone}`}><img src={knowledgeBaseIconById[knowledgeBase.iconId]} alt="" /></span>
            <h2>{knowledgeBase.title}</h2>
            <p>{knowledgeBase.description}</p>
            <div><strong>{knowledgeBase.docs}</strong><span>{knowledgeBase.updatedAt}</span></div>
          </article>
        ))}
      </section>
    </PageFrame>
  );
}
