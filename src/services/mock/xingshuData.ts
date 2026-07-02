import { historySessions as typedHistorySessions } from "./historyMock";
import { recentTables } from "./tableMock";
import { writingDocuments } from "./writingMock";

export { analysisRows, assetOptions, dashboardOptions, salesTrendOption } from "./dashboardMock";

export const historySessions = typedHistorySessions.map(
  (session) => [session.title, session.summary, session.category, session.updatedAt] as const
);

const tableMarkByIconId = {
  ranking: "排",
  "contact-list": "通",
  "expense-statistics": "费",
  inventory: "库"
} as const;

const tableToneByIconId = {
  ranking: "red",
  "contact-list": "green",
  "expense-statistics": "orange",
  inventory: "blue"
} as const;

export const sheetRows = recentTables.map(
  (table) =>
    [
      tableMarkByIconId[table.iconId],
      table.title,
      table.tag,
      table.description,
      tableToneByIconId[table.iconId]
    ] as const
);

export const writingDocs = writingDocuments.map(
  (document) => [document.name, document.type, document.words, document.updatedAt] as const
);
