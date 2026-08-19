export type TableTemplateIconId = "ranking" | "contact-list" | "expense-statistics" | "inventory";

export type TableTemplate = {
  id: string;
  title: string;
  tag: "排行" | "清单" | "统计";
  description: string;
  iconId: TableTemplateIconId;
  /** 复制到制表需求框的原文；缺省时使用标题。 */
  prompt?: string;
  /** 原始更新时间（ISO 串）；用于会话栏按日期分组，展示文案仍走 description。 */
  updatedAt?: string;
};
