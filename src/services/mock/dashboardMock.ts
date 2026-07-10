import type { EChartsOption } from "echarts";
import type { AnalysisRow, DashboardChartOptions, DataAssetChartOptions } from "@/types/dashboard";

export const analysisRows: AnalysisRow[] = [
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
    axisLabel: { color: "#6B7F9D", align: "right" }
  },
  yAxis: {
    type: "value",
    axisLabel: { color: "#6B7F9D", align: "right" },
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

export const revenueMonths = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
export const revenueValues = [48, 56, 58, 70, 82, 100, 98, 94, 90, 88, 87, 94];
export const salesForecastLabels = ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"];
export const salesForecastValues = [24, 32, 26, 38, 46, 42, 52, 48];
export const channelLabels = ["搜索引擎", "社交媒体", "直接访问", "广告投放"];
export const channelValues = [35, 26, 20, 8];
export const customerLabels = ["企业客户", "中小客户", "个人用户"];
export const customerValues = [75, 15, 10];
export const regionLabels = ["华东", "华南", "华北", "西南", "华中"];
export const regionValues = [6820, 6120, 5720, 4350, 3680];
export const productLabels = ["AI 数据分析平台", "智能知识库系统", "数据可视化套件", "自动化报告引擎"];
export const productValues = [1.24, 0.86, 0.52, 0.38];

export const dashboardOptions: DashboardChartOptions = {
  revenue: {
    animation: false,
    grid: { left: 6, right: 6, top: 14, bottom: 4, containLabel: true },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: revenueMonths,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: "#6B7F9D", fontSize: 12, align: "center", interval: 1 }
    },
    yAxis: {
      type: "value",
      splitNumber: 3,
      axisLabel: { show: false },
      splitLine: { lineStyle: { color: "#EDF2FB" } },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    series: [
      {
        type: "bar",
        barWidth: 18,
        data: revenueValues.map((value, index) => ({
          value,
          itemStyle: {
            borderRadius: [4, 4, 0, 0],
            color: index === revenueValues.length - 1 ? "#1677FF" : "#8DB5FF"
          }
        }))
      }
    ]
  },
  channel: {
    animation: false,
    grid: { left: 8, right: 48, top: 14, bottom: 8, containLabel: true },
    xAxis: { type: "value", min: 0, max: 40, show: false },
    yAxis: {
      type: "category",
      inverse: true,
      data: channelLabels,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: "#294469", align: "right", fontSize: 13 }
    },
    series: [
      {
        type: "bar",
        barWidth: 13,
        data: channelValues.map((value, index) => ({
          value,
          itemStyle: { color: ["#1677FF", "#5B9BFF", "#8DB5FF", "#B7CFFF"][index], borderRadius: 8 }
        })),
        showBackground: true,
        backgroundStyle: { color: "#EEF4FF", borderRadius: 8 },
        label: { show: true, position: "right", formatter: "{c}%", color: "#081A3A", fontSize: 12 }
      }
    ]
  },
  salesLine: {
    animation: false,
    grid: { left: 6, right: 10, top: 14, bottom: 4, containLabel: true },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: salesForecastLabels,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: "#6B7F9D", fontSize: 12, align: "center", interval: 1 }
    },
    yAxis: {
      type: "value",
      splitNumber: 3,
      axisLabel: { show: false },
      splitLine: { lineStyle: { color: "#EDF2FB" } },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    series: [
      {
        type: "line",
        smooth: true,
        symbol: "circle",
        symbolSize: 5,
        data: salesForecastValues,
        lineStyle: { width: 3, color: "#1677FF" },
        itemStyle: { color: "#1677FF" },
        areaStyle: { color: "rgba(22, 119, 255, 0.10)" }
      }
    ]
  },
  customer: {
    animation: false,
    color: ["#1677FF", "#00C2FF", "#B7CFFF"],
    series: [
      {
        type: "pie",
        radius: ["46%", "72%"],
        center: ["50%", "50%"],
        label: { show: false },
        data: customerLabels.map((name, index) => ({ name, value: customerValues[index] }))
      }
    ]
  },
  region: {
    animation: false,
    grid: { left: 8, right: 92, top: 14, bottom: 8, containLabel: true },
    xAxis: { type: "value", min: 0, max: 7200, show: false },
    yAxis: {
      type: "category",
      inverse: true,
      data: regionLabels,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: "#294469", align: "right", fontSize: 13 }
    },
    series: [
      {
        type: "bar",
        barWidth: 13,
        data: regionValues.map((value, index) => ({
          value,
          itemStyle: { color: ["#1677FF", "#3D8BFF", "#5B9BFF", "#8DB5FF", "#B7CFFF"][index], borderRadius: 8 }
        })),
        showBackground: true,
        backgroundStyle: { color: "#EEF4FF", borderRadius: 8 },
        label: {
          show: true,
          position: "right",
          formatter: ({ value }) => `￥${Number(value).toLocaleString()}万`,
          color: "#081A3A",
          fontSize: 12
        }
      }
    ]
  },
  productRank: {
    animation: false,
    grid: { left: 8, right: 116, top: 14, bottom: 8, containLabel: true },
    xAxis: { type: "value", min: 0, max: 1.4, show: false },
    yAxis: {
      type: "category",
      inverse: true,
      data: productLabels,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: "#294469", align: "right", fontSize: 13 }
    },
    series: [
      {
        type: "bar",
        barWidth: 13,
        data: productValues.map((value, index) => ({
          value,
          itemStyle: { color: ["#1677FF", "#3D8BFF", "#5B9BFF", "#8DB5FF"][index], borderRadius: 8 }
        })),
        showBackground: true,
        backgroundStyle: { color: "#EEF4FF", borderRadius: 8 },
        label: {
          show: true,
          position: "right",
          fontSize: 12,
          color: "#081A3A",
          fontWeight: 700,
          formatter: ({ value, dataIndex }) => {
            const changes = ["{up|↑12%}", "{up|↑8%}", "{flat|—}", "{down|↓3%}"];
            return `￥${Number(value).toFixed(2)}亿 ${changes[dataIndex] ?? ""}`;
          },
          rich: {
            up: { color: "#16A37A", fontSize: 12, fontWeight: 700 },
            down: { color: "#FF4D4F", fontSize: 12, fontWeight: 700 },
            flat: { color: "#6B7F9D", fontSize: 12, fontWeight: 700 }
          }
        }
      }
    ]
  }
};

export const assetTypeLabels = ["结构化数据", "半结构化数据", "非结构化数据", "API 数据", "其他"] as const;
export const assetTypeValues = [5861, 3123, 2402, 1080, 380] as const;
export const dataAssetSnapshot = {
  date: "06-04",
  assetCount: assetTypeValues.reduce((total, value) => total + value, 0),
  dataVolumeTb: 28.6
} as const;
export const dataAssetUpdate = {
  updatedAt: "2024-06-04T14:30:00+08:00",
  updatedAtLabel: "2024-06-04 14:30:00",
  staleAfterHours: 24
} as const;
export const assetGrowthLabels = ["01-01", "02-01", "03-01", "04-01", "05-01", dataAssetSnapshot.date] as const;
export const assetGrowthValues = {
  assetCount: [5200, 6900, 9300, 11000, 12400, dataAssetSnapshot.assetCount],
  dataVolumeTb: [12, 17, 23, 27, 28, dataAssetSnapshot.dataVolumeTb]
} as const;
export const assetApplicationLabels = ["经营分析", "客户洞察", "风险管理", "精准营销", "产品研发", "供应链", "财务", "人力", "市场", "其他"] as const;
export const assetApplicationValues = [14.2, 11.6, 9.8, 8.7, 6.9, 5.3, 4.2, 3.6, 2.8, 1.5] as const;
export const assetSourceLabels = ["业务系统", "数据平台", "第三方数据", "手工录入", "其他"] as const;
export const assetSourceValues = [42.3, 24.6, 15.8, 10.2, 7.1] as const;

export const assetOptions: DataAssetChartOptions = {
  donut: {
    animation: false,
    color: ["#2C75FF", "#75C9F2", "#91DFAD", "#F1DB3D", "#E9A7FF"],
    legend: {
      orient: "vertical",
      right: 0,
      top: "middle",
      data: [...assetTypeLabels],
      textStyle: { color: "#294469", fontSize: 12 }
    },
    series: [{
      type: "pie",
      radius: ["44%", "72%"],
      center: ["38%", "50%"],
      label: { show: false },
      data: assetTypeLabels.map((name, index) => ({ name, value: assetTypeValues[index] }))
    }]
  },
  growth: {
    animation: false,
    color: ["#1677FF", "#75C6F5"],
    grid: { left: 42, right: 46, top: 36, bottom: 34 },
    legend: { top: 0, left: 70, itemWidth: 18, itemHeight: 4, textStyle: { color: "#294469", fontSize: 12 } },
    xAxis: { type: "category", data: [...assetGrowthLabels], axisTick: { show: false }, axisLine: { lineStyle: { color: "#DCE8FB" } }, axisLabel: { color: "#6B7F9D", align: "right" } },
    yAxis: [
      {
        name: "个",
        type: "value",
        position: "left",
        min: 0,
        max: 15000,
        interval: 3000,
        splitLine: { lineStyle: { color: "#EDF2FB" } },
        axisLabel: { color: "#6B7F9D", align: "right" }
      },
      {
        name: "TB",
        type: "value",
        position: "right",
        min: 0,
        max: 40,
        interval: 8,
        splitLine: { show: false },
        axisLabel: { color: "#6B7F9D", align: "left" }
      }
    ],
    series: [
      { name: "数据资产总量（个）", type: "line", smooth: true, symbolSize: 6, data: [...assetGrowthValues.assetCount], lineStyle: { width: 3 } },
      { name: "数据总量（TB）", type: "line", yAxisIndex: 1, smooth: true, symbolSize: 6, data: [...assetGrowthValues.dataVolumeTb], lineStyle: { width: 3 } }
    ]
  },
  top: {
    animation: false,
    grid: { left: 34, right: 42, top: 20, bottom: 34 },
    xAxis: { type: "category", data: [...assetApplicationLabels], axisTick: { show: false }, axisLine: { lineStyle: { color: "#DCE8FB" } }, axisLabel: { color: "#4B5D77", fontSize: 11, align: "right" } },
    yAxis: { type: "value", min: 0, max: 15, interval: 3, splitLine: { lineStyle: { color: "#EDF2FB" } }, axisLabel: { color: "#6B7F9D", align: "right" } },
    series: [{ type: "bar", barWidth: 28, data: [...assetApplicationValues], label: { show: true, position: "right", color: "#081A3A" }, itemStyle: { borderRadius: [4, 4, 0, 0], color: "#2F7CF7" } }]
  },
  source: {
    animation: false,
    grid: { left: 86, right: 48, top: 10, bottom: 10 },
    xAxis: { type: "value", min: 0, max: 50, show: false },
    yAxis: {
      type: "category",
      inverse: true,
      data: [...assetSourceLabels],
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: "#294469", fontSize: 13, align: "right" }
    },
    series: [{
      type: "bar",
      barWidth: 14,
      data: [...assetSourceValues],
      showBackground: true,
      backgroundStyle: { color: "#EDF5FF", borderRadius: 9 },
      label: { show: true, position: "right", formatter: "{c}%", color: "#294469", fontSize: 13, fontWeight: 700 },
      itemStyle: { borderRadius: 9, color: "#1677FF" }
    }]
  }
};
