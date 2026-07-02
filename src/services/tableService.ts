import type { TableGenerationResult } from "@/types/table";
import { recentTables } from "./mock/tableMock";

export async function listRecentTables() {
  return recentTables;
}

export async function createTableFromPrompt(prompt: string): Promise<TableGenerationResult> {
  return {
    id: "table-generation-mock",
    status: "accepted",
    prompt
  };
}
