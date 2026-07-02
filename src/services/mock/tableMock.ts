import type { TableTemplate } from "@/types/table";

export const recentTables: TableTemplate[] = [
  {
    id: "sales-ranking",
    title: "客户销售排行榜表",
    tag: "排行",
    description: "2024年Q1华东区TOP20",
    iconId: "ranking"
  },
  {
    id: "department-contacts",
    title: "各部门人员通讯录",
    tag: "清单",
    description: "姓名 · 部门 · 职位 · 联系方式",
    iconId: "contact-list"
  },
  {
    id: "monthly-expense",
    title: "月度费用统计报表",
    tag: "统计",
    description: "部门费用 · 同比环比",
    iconId: "expense-statistics"
  },
  {
    id: "inventory-daily",
    title: "库存表——日用百货",
    tag: "清单",
    description: "A/B/C类物料 · 数量 · 金额",
    iconId: "inventory"
  }
];
