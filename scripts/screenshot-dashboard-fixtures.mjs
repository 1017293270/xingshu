// 看板截图脚本共用的「beta0.4 反馈」夹具，不是独立脚本。
// 复刻线上三张出错卡片背后的收藏问数：每份收藏存着整轮问数的全部查询（探查、0 行、最终作答），
// 列名是「cube 描述 + 空格 + 字段名」。与 src/features/dashboardStudio/testing/favoriteAnswerFixtures.ts
// 同一份形状——脚本跑在 Node 里读不了 TS，只能在这里再写一遍。

/** 目标服务地址：并行开发时各自起在不同端口，用 XS_QA_BASE_URL 指过去。 */
export const baseUrl = (process.env.XS_QA_BASE_URL ?? "http://127.0.0.1:5173").replace(/\/$/, "");

const PROJECT_CUBE = "项目签约台账，记录项目名称、客户与签约金额";
const CONTRACT_CUBE = "合同主数据清单，记录合同编号、名称、年度、签约双方及合同金额";
const FLOW_CUBE = "交通银行账户交易流水明细，记录与合同相关的收付款流水";

const column = (key, label, type = "string") => ({ columnId: `column-${key}`, key, label, title: label, type });
const output = (outputKey, columns, rows) => ({
  outputKey,
  columns,
  rows,
  totalRows: rows.length,
  updatedAt: "2026-09-23T10:20:00.000Z"
});

const detailColumns = [
  column("ContractList.count", `${CONTRACT_CUBE} 记录数`, "number"),
  column("ContractList.contractName", `${CONTRACT_CUBE} 合同名称，合同的中文全称`),
  column("ContractList.contractNo", `${CONTRACT_CUBE} 合同编号，合同的业务唯一标识`),
  column("BankFlow.tradeDate", `${FLOW_CUBE} 交易日期`, "time"),
  column("BankFlow.counterparty", `${FLOW_CUBE} 对方户名`),
  column("BankFlow.amount", `${FLOW_CUBE} 交易金额（元）`, "number")
];
const detailRows = Array.from({ length: 20 }, (_, index) => ({
  "ContractList.count": 1,
  "ContractList.contractName": `四川才子数字化运营服务合同第${index + 1}期`,
  "ContractList.contractNo": `SZ-2025-${String(index + 1).padStart(3, "0")}`,
  "BankFlow.tradeDate": `2025-${String((index % 9) + 1).padStart(2, "0")}-01 00:00:00`,
  "BankFlow.counterparty": "善治科技",
  "BankFlow.amount": 18_000 + index * 1_250
}));
const monthlyColumns = [
  column("BankFlow.tradeDate.month", `${FLOW_CUBE} 交易日期`, "time"),
  column("BankFlow.amount", `${FLOW_CUBE} 交易金额（元）`, "number")
];
const monthlyRows = Array.from({ length: 9 }, (_, index) => ({
  "BankFlow.tradeDate.month": `2025-${String(index + 1).padStart(2, "0")}-01T00:00:00.000`,
  "BankFlow.amount": 120_000 + index * 8_600
}));

/** 按后端调用顺序排列的结果表；每份收藏的最后一次非空查询才是作答用的那张。 */
const favoriteOutputs = {
  "asset-sales": [
    output("output_001", [
      column("ProjectSign.projectName", `${PROJECT_CUBE} 项目名称，项目的中文全称`),
      column("ProjectSign.customerName", `${PROJECT_CUBE} 客户名称`),
      column("ProjectSign.projectCount", `${PROJECT_CUBE} 项目数量`, "number")
    ], [{
      "ProjectSign.projectName": "四川才子数字化运营服务项目",
      "ProjectSign.customerName": "善治科技",
      "ProjectSign.projectCount": 4
    }]),
    output("output_002", [column("ProjectSign.status", `${PROJECT_CUBE} 项目状态`)], []),
    output("output_003", [column("ProjectSign.signAmount", `${PROJECT_CUBE} 签约金额（万元），含税`, "number")], [
      { "ProjectSign.signAmount": 1286.5 }
    ])
  ],
  "asset-presign": [
    output("output_001", [
      column("ProjectSign.projectName", `${PROJECT_CUBE} 项目名称，项目的中文全称`),
      column("ProjectSign.projectCount", `${PROJECT_CUBE} 项目数量`, "number")
    ], [{ "ProjectSign.projectName": "四川才子数字化运营服务项目", "ProjectSign.projectCount": 4 }]),
    output("output_002", [column("ProjectSign.presignAmount", `${PROJECT_CUBE} 预签金额（万元），尚未正式签约`, "number")], [
      { "ProjectSign.presignAmount": 862.4 }
    ])
  ],
  "asset-must-sign": [
    output("output_001", [
      column("ContractList.signYear", `${CONTRACT_CUBE} 合同签订或归属年度`),
      column("ContractList.contractAmount", `${CONTRACT_CUBE} 合同金额（万元），含税合同总价`, "number")
    ], []),
    output("output_002", [
      column("ContractList.contractAmount", `${CONTRACT_CUBE} 合同金额（万元），含税合同总价`, "number")
    ], [])
  ],
  "asset-monthly-income": [
    output("output_001", detailColumns, detailRows),
    output("output_002", monthlyColumns, monthlyRows)
  ]
};

const favoriteMeta = [
  ["asset-sales", "善治今年的销售额", "2026-09-20T06:30:00.000Z"],
  ["asset-presign", "善治今年的项目预签金额", "2026-09-21T02:10:00.000Z"],
  ["asset-must-sign", "善治今年的必签项目金额", "2026-09-21T02:40:00.000Z"],
  ["asset-monthly-income", "善治每月收入", "2026-09-18T09:05:00.000Z"]
];

export const feedbackAssets = favoriteMeta.map(([id, question, createdAt]) => ({
  id,
  name: question,
  originalQuestion: question,
  resolvedQuestion: question,
  datasourceId: 2000001,
  ownerUserId: 1,
  visibility: "PRIVATE",
  stableVersionId: `${id}-v1`,
  status: "ACTIVE",
  stableVersion: {
    id: `${id}-v1`,
    versionNo: 1,
    resolvedQuestion: question,
    engine: "CUBE",
    parameters: [],
    // 后端的输出定义没有业务名，label 就是 outputKey。
    outputs: favoriteOutputs[id].map((item) => ({
      outputKey: item.outputKey,
      label: item.outputKey,
      rowCount: item.totalRows,
      columns: item.columns
    })),
    schemaHash: `${id}-hash`,
    status: "VALIDATED",
    createdAt
  },
  createdAt,
  updatedAt: createdAt
}));

export function feedbackPreview(assetId) {
  const asset = feedbackAssets.find((item) => item.id === assetId) ?? feedbackAssets[0];
  return {
    id: `${asset.id}-preview`,
    assetId: asset.id,
    versionId: asset.stableVersionId,
    status: "SUCCESS",
    triggerType: "PREVIEW",
    durationMs: 18,
    createdAt: "2026-09-23T10:20:00.000Z",
    outputs: structuredClone(favoriteOutputs[asset.id])
  };
}

export function findFeedbackAssetId(url) {
  return feedbackAssets.map((item) => item.id).find((id) => url.includes(`/${id}/`));
}

const CARD_STYLE = {
  background: "#FFFFFF",
  borderColor: "#E3ECF9",
  borderRadius: 12,
  color: "#294469",
  accent: "#1677FF",
  locked: false,
  visible: true
};
const SERIES = ["#1677FF", "#00A6E8", "#16A37A", "#F59E0B", "#6C7FF2", "#F26D6D"];

/**
 * 「善治经营看板」：按修复后的规则落好的板（指标卡取最终合计、0 行落暂无数据的指标卡、每月收入取按月汇总），
 * 外加一张沿用旧绑定的明细表——老看板的持久化表头仍是全称，用来确认回放时也被清洗。
 * datasets 是运行态接口回放的行，列名保持后端原样（全称）。
 */
export function feedbackBoard({ id = "feedback-board", title = "善治经营看板", ownerUserId = 1, visibility = "PRIVATE" } = {}) {
  const asset = (assetId) => feedbackAssets.find((item) => item.id === assetId);
  const pick = (assetId, outputKey) => favoriteOutputs[assetId].find((item) => item.outputKey === outputKey);
  const shortColumns = (columns, titles) => columns.map((item, index) => ({
    columnId: item.columnId,
    key: item.key,
    title: titles[index],
    type: item.type,
    fullTitle: item.label
  }));
  const slots = [
    { key: "sales", assetId: "asset-sales", outputKey: "output_003", type: "metric", titles: ["签约金额（万元）"], metric: "ProjectSign.signAmount" },
    { key: "presign", assetId: "asset-presign", outputKey: "output_002", type: "metric", titles: ["预签金额（万元）"], metric: "ProjectSign.presignAmount" },
    { key: "must-sign", assetId: "asset-must-sign", outputKey: "output_002", type: "metric", titles: ["合同金额（万元）"], metric: "ContractList.contractAmount" },
    { key: "monthly", assetId: "asset-monthly-income", outputKey: "output_002", type: "line", titles: ["交易日期", "交易金额（元）"] },
    // 旧看板沿用的明细绑定：持久化的表头还是全称。
    { key: "legacy-detail", assetId: "asset-monthly-income", outputKey: "output_001", type: "table", titles: null }
  ];
  const positions = {
    sales: { x: 14, y: 110, w: 624, h: 230 },
    presign: { x: 648, y: 110, w: 624, h: 230 },
    "must-sign": { x: 1282, y: 110, w: 624, h: 230 },
    monthly: { x: 14, y: 350, w: 941, h: 716 },
    "legacy-detail": { x: 965, y: 350, w: 941, h: 716 }
  };
  const dataBindings = {};
  const modules = {};
  const datasets = {};
  const moduleStatuses = {};
  const widgets = [{
    id: `${id}-title`,
    type: "text",
    title,
    subtitle: "收藏问数的答案：销售额、预签与必签金额、每月收入",
    mapping: {},
    style: { accent: "#1677FF", color: "#0F2B50", fontSize: 30, fontWeight: 800, textAlign: "center", locked: false, visible: true, zIndex: 1 },
    position: { x: 14, y: 14, w: 1892, h: 86 }
  }];

  slots.forEach((slot, index) => {
    const source = asset(slot.assetId);
    const result = pick(slot.assetId, slot.outputKey);
    const bindingId = `binding-${slot.key}`;
    const moduleId = `module-${slot.key}`;
    const widgetId = `widget-${slot.key}`;
    const sourceRef = {
      kind: "query-asset",
      assetId: source.id,
      queryVersionId: source.stableVersionId,
      outputKey: slot.outputKey,
      parameterValues: {}
    };
    dataBindings[bindingId] = {
      id: bindingId,
      label: source.name,
      mode: "live",
      sourceQueryId: source.id,
      resultKind: slot.type === "metric" ? "metric" : slot.type === "line" ? "time-series" : "table",
      metricLabel: slot.titles?.[slot.titles.length - 1]?.replace(/（.*）/, ""),
      status: "idle",
      sourceRef,
      refreshPolicy: { mode: "manual" },
      refreshable: true,
      dataAsOf: source.stableVersion.createdAt,
      table: {
        columns: slot.titles
          ? shortColumns(result.columns, slot.titles)
          : result.columns.map((item) => ({ columnId: item.columnId, key: item.key, title: item.label, type: item.type })),
        rows: [],
        totalRows: result.totalRows,
        groupLabel: source.name,
        source: "query-asset"
      }
    };
    modules[moduleId] = { id: moduleId, title: source.name, bindingId, widgetIds: [widgetId], source: sourceRef };
    datasets[bindingId] = structuredClone(result);
    moduleStatuses[bindingId] = "SUCCESS";
    const metricColumn = slot.metric ? result.columns.find((item) => item.key === slot.metric) : undefined;
    widgets.push({
      id: widgetId,
      moduleId,
      bindingId,
      type: slot.type,
      name: slot.type === "metric" ? "指标卡" : slot.type === "line" ? "折线图" : "数据表格",
      title: slot.type === "table" ? "善治每月收入明细" : source.name,
      subtitle: slot.type === "metric"
        ? source.name
        : slot.type === "line" ? `趋势变化 · ${result.rows.length} 个周期` : `共 ${result.totalRows} 行 · ${source.name}`,
      // 与 appendQueryAssetChart 一致：指标卡的单位与小数写进 props。
      props: slot.type === "metric"
        ? { valuePrefix: "", valueSuffix: "万元", precision: result.rows.length > 0 ? 1 : 0 }
        : undefined,
      mapping: slot.type === "metric"
        ? { metricColumnIds: [metricColumn.columnId], metricKeys: [metricColumn.key], valueMode: "first", displayUnit: "万元" }
        : slot.type === "line"
          ? {
              dimensionColumnId: result.columns[0].columnId,
              dimensionKey: result.columns[0].key,
              metricColumnIds: [result.columns[1].columnId],
              metricKeys: [result.columns[1].key]
            }
          : {},
      position: positions[slot.key],
      style: {
        ...CARD_STYLE,
        seriesColors: slot.type === "line" ? SERIES : undefined,
        showLegend: false,
        showTrend: slot.type === "metric" ? false : undefined,
        smooth: slot.type === "line" ? true : undefined,
        zIndex: index + 2
      }
    });
  });

  const now = "2026-09-23T10:30:00.000Z";
  const schema = {
    schemaVersion: 2,
    id: `dashboard-${id}`,
    title,
    description: "收藏问数落到看板的回归样例",
    canvas: { width: 1920, height: 1080, columns: 12, rows: 12, background: "#EFF4FB", scaleMode: "fit-screen" },
    source: { kind: "blank", generatedAt: now, plannerVersion: 2 },
    dataBindings,
    modules,
    widgets,
    createdAt: now,
    updatedAt: now
  };
  const record = {
    id,
    status: "published",
    revision: 3,
    ownerUserId,
    visibility,
    schema,
    publishedSchema: structuredClone(schema),
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
    versions: []
  };
  return { record, datasets, moduleStatuses };
}

/** 设计器起步用的空板：同一块看板，去掉全部组件与绑定。 */
export function emptyFeedbackBoard() {
  const { record } = feedbackBoard({ id: "feedback-designer", title: "善治经营看板（设计器）" });
  const schema = { ...record.schema, widgets: [], dataBindings: {}, modules: {} };
  return { ...record, status: "draft", schema, publishedSchema: undefined, publishedAt: undefined };
}
