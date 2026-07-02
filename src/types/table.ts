export type TableTemplateIconId = "ranking" | "contact-list" | "expense-statistics" | "inventory";

export type TableTemplate = {
  id: string;
  title: string;
  tag: "排行" | "清单" | "统计";
  description: string;
  iconId: TableTemplateIconId;
};

export type TableGenerationResult = {
  id: string;
  status: "accepted";
  prompt: string;
};
