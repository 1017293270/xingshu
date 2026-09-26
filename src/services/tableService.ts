import { requestDataHub } from "@/services/dataHubClient";
import { selectRecentAskTableTemplates } from "@/services/dataHubAskTable";
import { readDataHubSession } from "@/services/dataHubSession";
import type { DataHubChatSession } from "@/types/dataHub";
import type { TableTemplate } from "@/types/table";

function shouldSkipLiveTables() {
  return import.meta.env.MODE === "test";
}

/** 当前空间里的全部制表会话，最近更新的在前；不截断，露出多少由列表页与会话下拉各自决定。 */
export async function listRecentTables(): Promise<TableTemplate[]> {
  if (shouldSkipLiveTables()) {
    return [];
  }

  const session = readDataHubSession();
  if (!session.spaceId) {
    return [];
  }

  const sessions = await requestDataHub<DataHubChatSession[]>("/api/v1/chat/sessions/list", {
    method: "POST",
    body: JSON.stringify({ spaceId: session.spaceId }),
    spaceId: session.spaceId
  });

  return selectRecentAskTableTemplates(sessions);
}
