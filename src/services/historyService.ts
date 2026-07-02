import type { HistoryFilter } from "@/types/history";
import { historySessions } from "./mock/historyMock";

export async function listHistorySessions() {
  return historySessions;
}

export async function filterHistorySessions(filter: HistoryFilter) {
  const keyword = filter.keyword?.trim();

  return historySessions.filter((session) => {
    const matchesCategory =
      !filter.category || filter.category === "全部" || session.category === filter.category;
    const matchesKeyword =
      !keyword || session.title.includes(keyword) || session.summary.includes(keyword);

    return matchesCategory && matchesKeyword;
  });
}
