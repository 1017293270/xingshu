import type { DataHubTableResult } from "@/types/dataHub";

const citationHtmlEntities: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: "\""
};

function decodeCitationHtmlEntities(value: string) {
  let decoded = value;
  for (let pass = 0; pass < 2; pass += 1) {
    const next = decoded.replace(
      /&(?:#x([0-9a-f]+)|#([0-9]+)|(amp|apos|gt|lt|nbsp|quot));/gi,
      (entity, hex: string | undefined, decimal: string | undefined, named: string | undefined) => {
        if (named) {
          return citationHtmlEntities[named.toLowerCase()] ?? entity;
        }
        const codePoint = Number.parseInt(hex ?? decimal ?? "", hex ? 16 : 10);
        return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : entity;
      }
    );
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

function citationTableToMarkdown(value: string) {
  const rows = Array.from(value.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi), (row) =>
    Array.from(row[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)\s*>/gi), (cell) =>
      cell[1]
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\|/g, "\\|")
    )
  ).filter((row) => row.length > 0);
  if (!rows.length) return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  const width = Math.max(...rows.map((row) => row.length));
  const line = (row: string[]) => `| ${Array.from({ length: width }, (_, index) => row[index] ?? "").join(" | ")} |`;
  // ponytail: DataHub citation tables use their first row as the header; add header inference only if headerless tables appear.
  return [line(rows[0]), line(Array.from({ length: width }, () => "---")), ...rows.slice(1).map(line)].join("\n");
}

/** 把知识库返回的表格和文档制品标记转成可读文本；普通引用保持原样。 */
export function formatDataHubCitationFragment(value: string) {
  const original = value.trim();
  if (!original) return "";

  const decoded = decodeCitationHtmlEntities(original);
  if (!/<\/?(?:table|thead|tbody|tfoot|tr|td|th|details|summary|drawing)\b/i.test(decoded)
    && !/^(?:tr|td|th)\b[^>]*>/i.test(decoded)) {
    return original;
  }

  if (/<table\b[^>]*>[\s\S]*?<\/table\s*>/i.test(decoded)) {
    return decoded
      .replace(/<summary\b[^>]*>[\s\S]*?<\/summary\s*>/gi, "")
      .replace(
        /<table\b[^>]*>[\s\S]*?<\/table\s*>/gi,
        (table) => `\n\n${citationTableToMarkdown(table)}\n\n`
      )
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?[a-z][^>]*>/gi, "")
      .replace(/<[^>]*$/g, "")
      .replace(/(^|[：:。；;]\s*)#{1,6}\s+([^\n]+)/gm, "$1\n\n### $2")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  const separated = decoded
    .replace(/^(?:tr|td|th)\b[^>]*>/i, "")
    .replace(/<summary\b[^>]*>[\s\S]*?<\/summary\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(?:td|th)\s*>/gi, "\t")
    .replace(/<\/tr\s*>/gi, "\n")
    .replace(/<\/?(?:table|thead|tbody|tfoot|tr|td|th)\b[^>]*>/gi, "")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/<[^>]*$/g, "")
    .replace(/(^|[：:]\s*)#{1,6}\s+/g, "$1");

  return separated
    .split(/\n+/)
    .map((row) => row
      .split("\t")
      .map((cell) => cell.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(" ｜ "))
    .filter(Boolean)
    .join("； ");
}

const dataHubColumnTitlePrefixes = [
  /^微信机器人(?:咨询记录|人事事件记录|项目信息|消息历史|事件记录|用户信息)表\s*/,
  /^微信机器人\S{0,12}表\s*/
];

const dataHubQualifiedFieldTitles: Record<string, string> = {
  "contractlist.contractamount": "合同金额",
  "contractlist.contractname": "合同名称",
  "contractlist.contractno": "合同编号",
  "contractlist.contractyear": "归属年度",
  "contractlist.partyaname": "合同甲方单位",
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

/**
 * 历史轮次的表头可能是后端旧格式「contractNo（合同编号）」（英文字段在前、
 * 中文业务名在括号里）；只保留中文业务名。中文在前的「金额（元）」「占比（%）」
 * 属于单位注记，不在此剥离范围。与后端 BusinessColumnLabels 只出中文互为双向防御。
 */
function stripBilingualColumnTitle(title: string) {
  const englishFirst = title.match(
    /^[\w.$\s-]*[A-Za-z][\w.$\s-]*[（(]\s*([^（）()]*\p{Script=Han}[^（）()]*)\s*[)）]$/u
  );
  return englishFirst ? englishFirst[1].trim() : title;
}

export function formatDataHubColumnTitle(title: string, key = title) {
  const normalizedTitle = stripBilingualColumnTitle(title.trim().replace(/\s+/g, " "));
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

const dataHubLocalDateTimePattern = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)(\.\d+)?$/;

/**
 * Cube 查询把时间写成 `2026-09-10T17:37:03.000`：去掉 T 和全零毫秒，零点整只留日期。
 * 带时区的值要先定换算口径，这里原样返回。
 */
export function formatDataHubDateTime(value: string) {
  const matched = value.trim().match(dataHubLocalDateTimePattern);
  if (!matched) {
    return value;
  }

  const [, date, time, fraction = ""] = matched;
  const wholeSecond = /^\.?0*$/.test(fraction);
  if (wholeSecond && /^00:00(?::00)?$/.test(time)) {
    return date;
  }
  return `${date} ${time}${wholeSecond ? "" : fraction}`;
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

const genericTableTitlePattern = /^(?:结果表|查询结果|数据结果|结果|table)\s*\d*$/i;
const technicalTableNames = new Set(["cube", "data-hub", "datahub", "table", "result", "query"]);

const dataHubEnglishTableTitles: Record<string, string> = {
  wechatyconsulationrecord: "微信机器人咨询记录表",
  wechatyeventrecord: "微信机器人事件记录表",
  wechatyhreventrecord: "微信机器人人事事件记录表",
  wechatymessagehistory: "微信机器人消息历史表",
  wechatyprojectinfo: "微信机器人项目信息表",
  wechatyuserinfo: "微信机器人用户信息表"
};

export function hasHanScript(value: string | null | undefined): value is string {
  return typeof value === "string" && /\p{Script=Han}/u.test(value);
}

export function pickHanLabel(values: Array<string | undefined>, maxLength = 48) {
  return values
    .map((value) => value?.trim() ?? "")
    .find((value) => hasHanScript(value) && value.length <= maxLength && !/[。；;]/.test(value));
}

/** 从「微信机器人项目信息表 项目名称」或「发票明细表.含税金额」里取出中文表名。 */
export function extractChineseTableName(value: string) {
  const text = value.trim().replace(/\s+/g, " ");
  if (!text || !hasHanScript(text)) {
    return undefined;
  }

  const prefixed = text.match(/^([\p{Script=Han}A-Za-z0-9]{2,24}表)(?:\s+|[.·／/_-]+)/u);
  if (prefixed?.[1]) {
    return prefixed[1];
  }

  return undefined;
}

function localizeTableName(name: string) {
  return dataHubEnglishTableTitles[name.toLowerCase()] || extractChineseTableName(name) || name;
}

function tableOrdinal(table: DataHubTableResult, fallbackIndex = 0) {
  return (table.tableIndex ?? fallbackIndex) + 1;
}

function isGenericTableTitle(value?: string) {
  const text = value?.trim();
  if (!text) {
    return true;
  }

  if (technicalTableNames.has(text.toLowerCase())) {
    return true;
  }

  return genericTableTitlePattern.test(text);
}

function identifierTableName(value: string) {
  const identifier = value.trim().replace(/^[`"[\]]+|[`"[\]]+$/g, "");
  const parts = identifier.split(".").filter(Boolean);
  if (parts.length < 2) {
    return undefined;
  }

  return parts[parts.length - 2];
}

function derivedTableName(table: DataHubTableResult) {
  const counts = new Map<string, { label: string; chinese: boolean; count: number }>();

  for (const column of table.columns) {
    const chinese =
      extractChineseTableName(column.title) || extractChineseTableName(column.key);
    const english = identifierTableName(column.key) || identifierTableName(column.title);
    const mapped = english ? dataHubEnglishTableTitles[english.toLowerCase()] : undefined;
    const label = chinese || mapped;
    const name = label || (english && !technicalTableNames.has(english.toLowerCase()) ? english : undefined);
    if (!name) {
      continue;
    }

    const key = name.toLowerCase();
    const current = counts.get(key);
    if (current) {
      current.count += 1;
      if (hasHanScript(name)) {
        current.label = name;
        current.chinese = true;
      }
    } else {
      counts.set(key, { label: localizeTableName(name), chinese: hasHanScript(localizeTableName(name)), count: 1 });
    }
  }

  const ranked = [...counts.values()].sort(
    (left, right) =>
      Number(right.chinese) - Number(left.chinese) ||
      right.count - left.count ||
      left.label.localeCompare(right.label, "zh-CN")
  );
  if (ranked.length === 0) {
    return undefined;
  }

  const preferred = ranked.filter((item) => item.chinese === ranked[0].chinese && item.count === ranked[0].count);
  if (preferred.length > 1 && preferred.length <= 2) {
    return preferred.map((item) => item.label).join("、");
  }

  return ranked[0].label;
}

/** 结果表标题：保留序号，优先中文表名，没有中文再退回英文标识。 */
export function formatDataHubTableTitle(table: DataHubTableResult, fallbackIndex = 0) {
  const numbered = `结果表 ${tableOrdinal(table, fallbackIndex)}`;
  const labeled = table.groupLabel?.trim();
  const derived = derivedTableName(table);
  const specific =
    (!isGenericTableTitle(labeled) && labeled && hasHanScript(labeled) ? labeled : undefined) ||
    derived ||
    (!isGenericTableTitle(labeled) ? labeled : undefined);

  if (!specific || specific === numbered) {
    return numbered;
  }

  if (specific.startsWith(`${numbered} - `) || specific.startsWith(numbered)) {
    return specific;
  }

  return `${numbered} - ${specific}`;
}
