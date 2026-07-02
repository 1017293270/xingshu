export type XsTone = "blue" | "cyan" | "green" | "orange" | "purple" | "red" | "gold" | "teal";

export type DataAssetKpiIconId =
  | "data-assets"
  | "data-volume"
  | "media-documents"
  | "data-tables"
  | "data-apis"
  | "service-calls";

export type DataAssetKpi = {
  id: DataAssetKpiIconId;
  label: string;
  value: string;
  delta: string;
  iconId: DataAssetKpiIconId;
  tone: Extract<XsTone, "blue" | "cyan" | "green" | "orange" | "purple">;
};

export type KnowledgeBaseStatIconId = "knowledge-total" | "document-total" | "parsed-complete" | "today-added";

export type KnowledgeBaseStat = {
  id: KnowledgeBaseStatIconId;
  label: string;
  value: string;
  iconId: KnowledgeBaseStatIconId;
  tone: Extract<XsTone, "blue" | "green" | "orange" | "teal">;
};

export type KnowledgeBaseIconId =
  | "enterprise-policy"
  | "contract-legal"
  | "human-resources"
  | "market-marketing"
  | "tech-rd"
  | "finance-audit";

export type KnowledgeBase = {
  id: KnowledgeBaseIconId;
  title: string;
  description: string;
  docs: string;
  updatedAt: string;
  iconId: KnowledgeBaseIconId;
  tone: Extract<XsTone, "blue" | "green" | "red" | "gold" | "teal">;
};
