import type { CapabilityDescriptor } from "@/types/capability";

export const productCapabilities = {
  askData: {
    id: "ask-data",
    label: "实时能力",
    state: "live",
    provenance: "datahub",
    message: "请求由当前登录空间的 DataHub 服务处理。"
  },
  dashboards: {
    id: "dashboards",
    label: "实时能力",
    state: "live",
    provenance: "datahub",
    message: "看板与查询数据由当前登录空间实时加载。"
  },
  writing: {
    id: "writing",
    label: "预览模式",
    state: "preview",
    provenance: "mock",
    message: "场景、历史文档和生成结果均为演示数据，不会写入企业系统。"
  },
  tables: {
    id: "tables",
    label: "预览模式",
    state: "preview",
    provenance: "mock",
    message: "模板、最近表格和生成结果均为演示数据，不会创建真实报表。"
  },
  cloud: {
    id: "cloud",
    label: "预览模式",
    state: "preview",
    provenance: "mock",
    message: "文件、容量和同步状态均为本地演示，不会上传或同步企业资料。"
  },
  dataAssets: {
    id: "data-assets",
    label: "演示数据",
    state: "preview",
    provenance: "mock",
    message: "当前指标、知识库和图表来自演示数据，并非当前空间的实时资产。"
  }
} as const satisfies Record<string, CapabilityDescriptor>;
