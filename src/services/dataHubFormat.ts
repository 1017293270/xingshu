import type { DataHubTableResult } from "@/types/dataHub";

const dataHubColumnTitlePrefixes = [
  /^微信机器人(?:咨询记录|人事事件记录|项目信息|消息历史|事件记录|用户信息)表\s*/,
  /^微信机器人\S{0,12}表\s*/
];

const dataHubQualifiedFieldTitles: Record<string, string> = {
  "wechatyprojectinfo.projectname": "项目名称",
  "wechatyeventrecord.count": "事件记录数",
  "wechatyconsulationrecord.count": "咨询记录数"
};

const dataHubFieldTitles: Record<string, string> = {
  count: "记录数",
  createtime: "创建时间",
  eventcode: "事件类型编码",
  eventdetails: "事件详情",
  eventitem: "事件事项",
  eventlocation: "事件地址",
  eventoccurtime: "事件发生时间",
  eventstatus: "事件状态",
  eventtype: "事件类别",
  month: "月份",
  projectid: "项目ID",
  projectname: "项目名称",
  quarter: "季度",
  status: "状态",
  updatetime: "更新时间",
  year: "年份"
};

const dataHubColumnTitleAliases: Record<string, string> = {
  项目名称表: "项目名称"
};

function resolveDataHubFieldTitle(value: string) {
  const identifier = value.trim().replace(/^[`"']|[`"']$/g, "");
  const qualifiedTitle = dataHubQualifiedFieldTitles[identifier.toLowerCase()];

  if (qualifiedTitle) {
    return qualifiedTitle;
  }

  const fieldName = identifier.includes(".") ? identifier.slice(identifier.lastIndexOf(".") + 1) : identifier;
  return dataHubFieldTitles[fieldName.toLowerCase()];
}

export function formatDataHubColumnTitle(title: string, key = title) {
  const normalizedTitle = title.trim().replace(/\s+/g, " ");
  const compactTitle = dataHubColumnTitlePrefixes.reduce(
    (result, pattern) => result.replace(pattern, ""),
    normalizedTitle
  );
  const aliasedTitle = dataHubColumnTitleAliases[compactTitle] ?? compactTitle;

  if (/\p{Script=Han}/u.test(aliasedTitle)) {
    return aliasedTitle;
  }

  return (
    (aliasedTitle.includes(".") ? resolveDataHubFieldTitle(aliasedTitle) : undefined) ||
    resolveDataHubFieldTitle(key) ||
    resolveDataHubFieldTitle(aliasedTitle) ||
    aliasedTitle ||
    normalizedTitle ||
    title
  );
}

export function getDataHubColumnMinWidth(column: DataHubTableResult["columns"][number]) {
  const title = formatDataHubColumnTitle(column.title, column.key);
  const key = column.key.toLowerCase();

  if (/id$|_id$|日期|时间|单号|编号/.test(title) || key.includes("date") || key.includes("time")) {
    return 168;
  }

  if (title.length <= 4) {
    return 112;
  }

  return Math.min(260, Math.max(138, title.length * 18 + 36));
}
