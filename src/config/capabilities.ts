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
    label: "实时能力",
    state: "live",
    provenance: "datahub",
    message: "模板、草稿、问数绑定和导出由公文服务实时处理。"
  },
  tables: {
    id: "tables",
    label: "预览模式",
    state: "preview",
    provenance: "mock",
    message: "模板、最近表格和生成结果均为演示数据，不会创建真实报表。"
  },
  dataAssets: {
    id: "data-assets",
    label: "实时能力",
    state: "live",
    provenance: "datahub",
    message: "指标仅统计当前空间内由当前登录用户本人创建或上传的一级数据资产。"
  }
} as const satisfies Record<string, CapabilityDescriptor>;
