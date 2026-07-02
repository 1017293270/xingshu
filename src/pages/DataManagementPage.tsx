import { Button } from "antd";
import { Plus } from "@phosphor-icons/react";
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
import { PageFrame } from "./PageFrame";

const stats = [
  ["知识库总数", "6", metricKnowledge, "blue"],
  ["文档总数", "12,846", metricDocument, "green"],
  ["解析完成", "12,098", metricParsed, "teal"],
  ["今日新增", "86", metricToday, "orange"]
];

const kbs = [
  ["企业制度文档库", "管理制度、流程规范、标准文件", "2,346 篇文档", "更新于 06-04", kbPolicy, "red"],
  ["合同与法务文件库", "合同模板、法律文件、合规文档", "1,892 篇文档", "更新于 06-04", kbLegal, "green"],
  ["人力资源知识库", "人事制度、绩效考核、培训资料", "1,568 篇文档", "更新于 06-03", kbHr, "gold"],
  ["市场营销知识库", "营销方案、市场分析、品牌资料", "2,104 篇文档", "更新于 06-04", kbMarket, "blue"],
  ["技术研发知识库", "技术文档、API规范、架构设计", "3,256 篇文档", "更新于 06-04", kbTech, "red"],
  ["财务审计知识库", "财务报表、审计流程、税务政策", "1,680 篇文档", "更新于 06-02", kbFinance, "teal"]
];

export function DataManagementPage() {
  return (
    <PageFrame title="数据资产管理" subtitle="统一管理企业数据资产，助力数据价值最大化" actions={<Button type="primary" icon={<Plus size={18} />}>新增知识库</Button>} className="data-management-page">
      <nav className="asset-tabs" aria-label="资产管理类型">
        {["知识库管理", "数据源管理", "数据量簇管理", "指标语义管理", "技能管理", "问题集管理"].map((tab, index) => <Button type={index === 0 ? "primary" : "default"} key={tab}>{tab}</Button>)}
      </nav>
      <section className="manage-stats" aria-label="知识库统计">
        {stats.map(([label, value, icon, tone]) => (
          <article className="xs-card stat-card" key={label}>
            <div><span>{label}</span><strong>{value}</strong></div>
            <span className={`asset-image-tile asset-image-tile--${tone}`}><img src={icon} alt="" /></span>
          </article>
        ))}
      </section>
      <section className="kb-grid" aria-label="知识库列表">
        {kbs.map(([title, desc, docs, updated, icon, tone]) => (
          <article className="xs-card kb-card" key={title}>
            <span className={`asset-image-tile asset-image-tile--${tone}`}><img src={icon} alt="" /></span>
            <h2>{title}</h2>
            <p>{desc}</p>
            <div><strong>{docs}</strong><span>{updated}</span></div>
          </article>
        ))}
      </section>
    </PageFrame>
  );
}
