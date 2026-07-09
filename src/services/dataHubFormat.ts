import type { DataHubTableResult } from "@/types/dataHub";

const dataHubColumnTitlePrefixes = [
  /^微信机器人(?:咨询记录|人事事件记录|项目信息|消息历史|事件记录|用户信息)表\s*/,
  /^微信机器人\S{0,12}表\s*/
];

export function formatDataHubColumnTitle(title: string) {
  const normalizedTitle = title.trim().replace(/\s+/g, " ");
  const compactTitle = dataHubColumnTitlePrefixes.reduce(
    (result, pattern) => result.replace(pattern, ""),
    normalizedTitle
  );

  return compactTitle || normalizedTitle || title;
}

export function getDataHubColumnMinWidth(column: DataHubTableResult["columns"][number]) {
  const title = formatDataHubColumnTitle(column.title);
  const key = column.key.toLowerCase();

  if (/id$|_id$|日期|时间|单号|编号/.test(title) || key.includes("date") || key.includes("time")) {
    return 168;
  }

  if (title.length <= 4) {
    return 112;
  }

  return Math.min(260, Math.max(138, title.length * 18 + 36));
}
