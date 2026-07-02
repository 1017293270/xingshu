import type { EChartsOption } from "echarts";

export const analysisRows = [
  ["Q1", "6,230", "7,480", "1,250", "20.1%"],
  ["Q2", "7,120", "8,950", "1,830", "25.7%"],
  ["Q3", "8,340", "10,620", "2,280", "27.3%"],
  ["Q4", "9,010", "11,580", "2,570", "28.5%"],
  ["合计", "30,700", "38,630", "7,930", "25.8%"]
];

export const salesTrendOption: EChartsOption = {
  animation: false,
  color: ["#9BB9FF", "#1677FF"],
  tooltip: { trigger: "axis" },
  legend: { top: 0, right: 10, textStyle: { color: "#294469" } },
  grid: { left: 42, right: 26, top: 44, bottom: 34 },
  xAxis: {
    type: "category",
    data: ["Q1", "Q2", "Q3", "Q4"],
    axisTick: { show: false },
    axisLine: { lineStyle: { color: "#DCE8FB" } },
    axisLabel: { color: "#6B7F9D" }
  },
  yAxis: {
    type: "value",
    axisLabel: { color: "#6B7F9D" },
    splitLine: { lineStyle: { color: "#EDF2FB" } }
  },
  series: [
    { name: "2023年", type: "bar", barWidth: 24, data: [6230, 7120, 8340, 9010] },
    {
      name: "2024年",
      type: "bar",
      barWidth: 24,
      data: [7480, 8950, 10620, 11580],
      itemStyle: { borderRadius: [5, 5, 0, 0] }
    }
  ]
};

export const historySessions = [
  ["员工报销流程说明", "请问差旅费报销需要哪些附件？发票、行程单、审批单缺一不可...", "知识快查", "2026-06-05 09:32"],
  ["Q2销售业绩分析", "第二季度销售额同比增长23%，华东区贡献了42%的增量，主要驱动力是...", "数据洞察", "2026-06-05 09:15"],
  ["客户管理系统操作指南", "CRM系统的客户创建流程：进入客户管理模块，点击新增客户...", "知识快查", "2026-06-04 16:40"],
  ["库存周转率分析", "A类物料周转天数为12天，低于行业平均的18天，库存效率处于健康区间...", "数据洞察", "2026-06-04 14:22"],
  ["考勤制度有哪些新变化", "2026年度考勤制度主要更新了弹性工作制的适用范围，新增了远程办公...", "知识快查", "2026-06-03 15:30"]
];

export const sheetRows = [
  ["排", "客户销售排行榜表", "排行", "2024年Q1华东区TOP20", "red"],
  ["通", "各部门人员通讯录", "清单", "姓名 · 部门 · 职位 · 联系方式", "green"],
  ["费", "月度费用统计报表", "统计", "部门费用 · 同比环比", "orange"],
  ["库", "库存表——日用百货", "清单", "A/B/C类物料 · 数量 · 金额", "blue"]
];

export const writingDocs = [
  ["数据资产管理平台产品介绍", "产品介绍", "1,428 字", "2024-11-07 10:30"],
  ["2024年Q4数据分析报告总结", "报告总结", "2,156 字", "2024-11-06 16:45"],
  ["数据中台建设方案", "方案策划", "3,892 字", "2024-11-06 09:20"],
  ["产品部周报（11.4-11.8）", "工作汇报", "786 字", "2024-11-05 17:15"]
];

export const dashboardOptions: Record<string, EChartsOption> = {
  revenue: {
    animation: false,
    grid: { left: 8, right: 8, top: 10, bottom: 20 },
    xAxis: { type: "category", data: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"], axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: "#6B7F9D", fontSize: 10 } },
    yAxis: { show: false },
    series: [{ type: "bar", barWidth: 18, data: [48, 56, 58, 70, 82, 100, 98, 94, 90, 88, 87, 94], itemStyle: { borderRadius: [4, 4, 0, 0], color: "#8DB5FF" } }]
  },
  channel: {
    animation: false,
    grid: { left: 78, right: 48, top: 8, bottom: 8 },
    xAxis: { type: "value", min: 0, max: 40, show: false },
    yAxis: { type: "category", inverse: true, data: ["搜索引擎", "社交媒体", "直接访问", "广告投放"], axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: "#294469" } },
    series: [{ type: "bar", barWidth: 12, data: [35, 26, 20, 8], showBackground: true, backgroundStyle: { color: "#D9E7FF", borderRadius: 8 }, label: { show: true, position: "right", formatter: "{c}%", color: "#081A3A" }, itemStyle: { borderRadius: 8, color: "#1677FF" } }]
  },
  salesLine: {
    animation: false,
    grid: { left: 8, right: 8, top: 16, bottom: 8 },
    xAxis: { show: false, type: "category", data: [1, 2, 3, 4, 5, 6, 7, 8] },
    yAxis: { show: false },
    series: [{ type: "line", smooth: true, symbol: "none", data: [24, 32, 26, 38, 46, 42, 52, 48], lineStyle: { width: 3, color: "#81A4FF" } }]
  },
  customer: {
    animation: false,
    color: ["#7FA2FF", "#63D5AC", "#F5B0A8"],
    series: [{ type: "pie", radius: ["48%", "76%"], center: ["50%", "48%"], label: { show: false }, data: [75, 15, 10] }]
  },
  ops: {
    animation: false,
    grid: { left: 0, right: 0, top: 4, bottom: 0 },
    xAxis: { show: false, type: "category", data: [1, 2, 3, 4, 5, 6, 7, 8] },
    yAxis: { show: false },
    series: [{ type: "bar", barWidth: 22, data: [40, 32, 52, 47, 60, 50, 44, 53], itemStyle: { borderRadius: [3, 3, 0, 0], color: "#99B8FF" } }]
  },
  region: {
    animation: false,
    grid: { left: 52, right: 78, top: 4, bottom: 4 },
    xAxis: { type: "value", min: 0, max: 7200, show: false },
    yAxis: { type: "category", inverse: true, data: ["华东", "华南", "华北", "西南", "华中"], axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: "#294469" } },
    series: [{ type: "bar", barWidth: 12, data: [6820, 6120, 5720, 4350, 3680], showBackground: true, backgroundStyle: { color: "#D9E7FF", borderRadius: 8 }, label: { show: true, position: "right", formatter: ({ value }) => `￥${Number(value).toLocaleString()}万`, color: "#081A3A" }, itemStyle: { borderRadius: 8, color: "#1677FF" } }]
  }
};

export const assetOptions: Record<string, EChartsOption> = {
  donut: {
    animation: false,
    color: ["#2C75FF", "#75C9F2", "#91DFAD", "#F1DB3D", "#E9A7FF"],
    series: [{ type: "pie", radius: ["44%", "72%"], center: ["38%", "50%"], label: { show: false }, data: [5861, 3123, 2402, 1080, 380] }]
  },
  growth: {
    animation: false,
    color: ["#1677FF", "#75C6F5"],
    grid: { left: 42, right: 34, top: 36, bottom: 34 },
    legend: { top: 0, left: 70, itemWidth: 18, itemHeight: 4, textStyle: { color: "#294469", fontSize: 12 } },
    xAxis: { type: "category", data: ["01-01", "02-01", "03-01", "04-01", "05-01", "06-01"], axisTick: { show: false }, axisLine: { lineStyle: { color: "#DCE8FB" } }, axisLabel: { color: "#6B7F9D" } },
    yAxis: [{ type: "value", min: 0, max: 15000, interval: 3000, splitLine: { lineStyle: { color: "#EDF2FB" } }, axisLabel: { color: "#6B7F9D" } }],
    series: [
      { name: "数据资产总量（个）", type: "line", smooth: true, symbolSize: 6, data: [5200, 6900, 9300, 11000, 12400, 13900], lineStyle: { width: 3 } },
      { name: "数据总量（TB）", type: "line", smooth: true, symbolSize: 6, data: [12, 17, 23, 27, 32, 37], lineStyle: { width: 3 } }
    ]
  },
  top: {
    animation: false,
    grid: { left: 34, right: 8, top: 20, bottom: 34 },
    xAxis: { type: "category", data: ["经营分析", "客户洞察", "风险管理", "精准营销", "产品研发", "供应链", "财务", "人力", "市场", "其他"], axisTick: { show: false }, axisLine: { lineStyle: { color: "#DCE8FB" } }, axisLabel: { color: "#4B5D77", fontSize: 11 } },
    yAxis: { type: "value", min: 0, max: 15, interval: 3, splitLine: { lineStyle: { color: "#EDF2FB" } }, axisLabel: { color: "#6B7F9D" } },
    series: [{ type: "bar", barWidth: 28, data: [14.2, 11.6, 9.8, 8.7, 6.9, 5.3, 4.2, 3.6, 2.8, 1.5], label: { show: true, position: "top", color: "#081A3A" }, itemStyle: { borderRadius: [4, 4, 0, 0], color: "#2F7CF7" } }]
  },
  source: {
    animation: false,
    grid: { left: 86, right: 48, top: 10, bottom: 10 },
    xAxis: { type: "value", min: 0, max: 50, show: false },
    yAxis: {
      type: "category",
      inverse: true,
      data: ["业务系统", "数据平台", "第三方数据", "手工录入", "其他"],
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: "#294469", fontSize: 13 }
    },
    series: [{
      type: "bar",
      barWidth: 14,
      data: [42.3, 24.6, 15.8, 10.2, 7.1],
      showBackground: true,
      backgroundStyle: { color: "#EDF5FF", borderRadius: 9 },
      label: { show: true, position: "right", formatter: "{c}%", color: "#294469", fontSize: 13, fontWeight: 700 },
      itemStyle: { borderRadius: 9, color: "#1677FF" }
    }]
  }
};
