import type { DataAssetKpi, KnowledgeBase, KnowledgeBaseStat } from "@/types/dataAsset";

export const dataAssetKpis: DataAssetKpi[] = [
  {
    id: "data-assets",
    label: "数据资产总量",
    value: "12,846 ↑",
    delta: "较昨日 ↑ 5.2%",
    iconId: "data-assets",
    tone: "blue"
  },
  {
    id: "data-volume",
    label: "数据总量",
    value: "28.6 TB",
    delta: "较昨日 ↑ 8.1%",
    iconId: "data-volume",
    tone: "green"
  },
  {
    id: "media-documents",
    label: "多媒体文档数量",
    value: "8,532",
    delta: "较昨日 ↑ 6.7%",
    iconId: "media-documents",
    tone: "purple"
  },
  {
    id: "data-tables",
    label: "数据表数量",
    value: "4,328",
    delta: "较昨日 ↑ 7.3%",
    iconId: "data-tables",
    tone: "blue"
  },
  {
    id: "data-apis",
    label: "数据接口数量",
    value: "1,256",
    delta: "较昨日 ↑ 3.4%",
    iconId: "data-apis",
    tone: "orange"
  },
  {
    id: "service-calls",
    label: "数据服务调用量",
    value: "32.8 万次",
    delta: "较昨日 ↑ 12.3%",
    iconId: "service-calls",
    tone: "cyan"
  }
];

export const knowledgeBaseStats: KnowledgeBaseStat[] = [
  { id: "knowledge-total", label: "知识库总数", value: "6", iconId: "knowledge-total", tone: "blue" },
  { id: "document-total", label: "文档总数", value: "12,846", iconId: "document-total", tone: "green" },
  { id: "parsed-complete", label: "解析完成", value: "12,098", iconId: "parsed-complete", tone: "teal" },
  { id: "today-added", label: "今日新增", value: "86", iconId: "today-added", tone: "orange" }
];

export const knowledgeBases: KnowledgeBase[] = [
  {
    id: "enterprise-policy",
    title: "企业制度文档库",
    description: "管理制度、流程规范、标准文件",
    docs: "2,346 篇文档",
    updatedAt: "更新于 06-04",
    iconId: "enterprise-policy",
    tone: "red"
  },
  {
    id: "contract-legal",
    title: "合同与法务文件库",
    description: "合同模板、法律文件、合规文档",
    docs: "1,892 篇文档",
    updatedAt: "更新于 06-04",
    iconId: "contract-legal",
    tone: "green"
  },
  {
    id: "human-resources",
    title: "人力资源知识库",
    description: "人事制度、绩效考核、培训资料",
    docs: "1,568 篇文档",
    updatedAt: "更新于 06-03",
    iconId: "human-resources",
    tone: "gold"
  },
  {
    id: "market-marketing",
    title: "市场营销知识库",
    description: "营销方案、市场分析、品牌资料",
    docs: "2,104 篇文档",
    updatedAt: "更新于 06-04",
    iconId: "market-marketing",
    tone: "blue"
  },
  {
    id: "tech-rd",
    title: "技术研发知识库",
    description: "技术文档、API规范、架构设计",
    docs: "3,256 篇文档",
    updatedAt: "更新于 06-04",
    iconId: "tech-rd",
    tone: "red"
  },
  {
    id: "finance-audit",
    title: "财务审计知识库",
    description: "财务报表、审计流程、税务政策",
    docs: "1,680 篇文档",
    updatedAt: "更新于 06-02",
    iconId: "finance-audit",
    tone: "teal"
  }
];
