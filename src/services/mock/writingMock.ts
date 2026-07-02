import type { WritingDocument, WritingScene } from "@/types/writing";

export const writingScenes: WritingScene[] = [
  {
    id: "report-summary",
    title: "报告总结",
    description: "快速生成各类数据分析报告、总结报告",
    iconId: "report-summary",
    tone: "purple"
  },
  {
    id: "solution-plan",
    title: "方案策划",
    description: "生成项目方案、解决方案、实施计划等",
    iconId: "solution-plan",
    tone: "blue"
  },
  {
    id: "work-report",
    title: "工作汇报",
    description: "生成日报、周报、月报、述职报告等",
    iconId: "work-report",
    tone: "green"
  },
  {
    id: "copywriting",
    title: "文案创作",
    description: "撰写产品文案、宣传文案、营销文案等",
    iconId: "copywriting",
    tone: "orange"
  }
];

export const writingDocuments: WritingDocument[] = [
  {
    id: "data-asset-product-intro",
    name: "数据资产管理平台产品介绍",
    type: "产品介绍",
    words: "1,428 字",
    updatedAt: "2024-11-07 10:30"
  },
  {
    id: "q4-data-report",
    name: "2024年Q4数据分析报告总结",
    type: "报告总结",
    words: "2,156 字",
    updatedAt: "2024-11-06 16:45"
  },
  {
    id: "data-platform-plan",
    name: "数据中台建设方案",
    type: "方案策划",
    words: "3,892 字",
    updatedAt: "2024-11-06 09:20"
  },
  {
    id: "product-weekly",
    name: "产品部周报（11.4-11.8）",
    type: "工作汇报",
    words: "786 字",
    updatedAt: "2024-11-05 17:15"
  }
];
