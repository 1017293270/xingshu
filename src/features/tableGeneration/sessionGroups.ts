import type { TableTemplate } from "@/types/table";

export type TableSessionGroup = {
  label: string;
  items: TableTemplate[];
};

/** 后端时间戳没有时区标记时按本地时间解析，避免跨天分组整体偏移。 */
function parseSessionDate(value?: string) {
  if (!value) {
    return null;
  }

  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : value.replace(" ", "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function labelFor(date: Date | null, now: Date) {
  if (!date) {
    return "更早";
  }

  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (dayDiff <= 0) {
    return "今天";
  }
  if (dayDiff === 1) {
    return "昨天";
  }
  if (dayDiff < 7) {
    return "近 7 天";
  }
  if (dayDiff < 30) {
    return "近 30 天";
  }

  return "更早";
}

const groupOrder = ["当前会话", "今天", "昨天", "近 7 天", "近 30 天", "更早"];

/**
 * 按时间把会话分成"今天 / 昨天 / 近 7 天 / …"。
 * 分组把每条重复的时间戳收敛成一个组标题，会话项因此可以只占一行。
 */
export function groupTableSessions(items: TableTemplate[], now = new Date()): TableSessionGroup[] {
  const buckets = new Map<string, TableTemplate[]>();

  for (const item of items) {
    // 尚未落库的当前会话没有时间戳，单独成组，避免被归进"更早"。
    const label = item.description === "当前会话" ? "当前会话" : labelFor(parseSessionDate(item.updatedAt), now);
    const bucket = buckets.get(label);

    if (bucket) {
      bucket.push(item);
    } else {
      buckets.set(label, [item]);
    }
  }

  return groupOrder
    .filter((label) => buckets.has(label))
    .map((label) => ({ label, items: buckets.get(label) ?? [] }));
}
