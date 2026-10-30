import { getDataHubEventPayload } from "@/services/dataHubEventAdapter";
import type { DataHubDataTrustLevel, DataHubStreamEvent } from "@/types/dataHub";

/** 浮层里最多列出的指标数，多出的写成「另有 N 项」。 */
const DATA_TRUST_MAX_MEASURES = 6;

/** 回答下方可信状态的展示数据：文案已按等级定好，指标已去重、排序、截断。 */
export type DataHubDataTrustView = {
  level: DataHubDataTrustLevel;
  label: string;
  /** 「?」点开后的说明；NOT_TRUSTED 没有。 */
  explanation?: string;
  measures: { title: string; trusted: boolean }[];
  hiddenMeasureCount: number;
  unstructuredData: boolean;
};

/** 文案照后端《可信指标前端对接文档》原文，不改字。 */
const dataTrustCopy: Record<DataHubDataTrustLevel, { label: string; explanation?: string }> = {
  TRUSTED: {
    label: "可信指标",
    explanation: "可信指标是指统计口径、数据来源已经人工确认的指标"
  },
  PARTIAL: {
    label: "部分可信",
    explanation: "部分指标已人工确认"
  },
  NOT_TRUSTED: {
    label: "数据由AI提取，注意辨别"
  }
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonMaybe(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function isDataTrustLevel(value: unknown): value is DataHubDataTrustLevel {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(dataTrustCopy, value);
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 找本轮的根任务完成事件：type 为 done、finished 为 true，且不带 parentSessionId / subagentId。
 * 子智能体的完成事件 finished 为 false，也不带可信指标，不能让它顶替根事件。
 * 实时流与历史回放走同一个适配器，两边拿到的事件形状一致。
 */
export function findDataHubRootDone(events: readonly DataHubStreamEvent[]): unknown {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (
      event.type === "done" &&
      event.finished === true &&
      !event.parentSessionId &&
      !event.subagentId
    ) {
      return getDataHubEventPayload(event);
    }
  }
  return undefined;
}

/**
 * 从根完成事件的内容里读出可信指标并归一成展示数据。
 * 没有 dataTrust、等级不是三种之一（含 NOT_APPLICABLE）、字段形状不对，或这一轮本身失败，都返回 null：
 * 不显示任何提示，也不按回答内容自行推断。
 */
export function readDataHubDataTrust(done: unknown): DataHubDataTrustView | null {
  let record = parseJsonMaybe(done);
  if (isRecord(record) && !("dataTrust" in record) && typeof record.type === "string" && "data" in record) {
    record = parseJsonMaybe(record.data);
  }
  if (!isRecord(record) || record.failed === true) {
    return null;
  }

  const trust = parseJsonMaybe(record.dataTrust);
  if (
    !isRecord(trust) ||
    !isDataTrustLevel(trust.level) ||
    !Array.isArray(trust.usedMeasures) ||
    typeof trust.unstructuredData !== "boolean"
  ) {
    return null;
  }

  // 同一指标因定义变化会被后端记成多条（trustHash 不同），对读者是同一个名字，按名字和确认状态合并。
  const seen = new Set<string>();
  const measures: DataHubDataTrustView["measures"] = [];
  for (const item of trust.usedMeasures) {
    if (!isRecord(item) || typeof item.trusted !== "boolean") {
      continue;
    }
    const title = asText(item.title) || asText(item.member);
    const key = `${item.trusted ? 1 : 0}|${title}`;
    if (!title || seen.has(key)) {
      continue;
    }
    seen.add(key);
    measures.push({ title, trusted: item.trusted });
  }
  // 已确认的排前面；同组内保持后端给出的先后。
  const ordered = [...measures.filter((item) => item.trusted), ...measures.filter((item) => !item.trusted)];

  return {
    level: trust.level,
    ...dataTrustCopy[trust.level],
    measures: ordered.slice(0, DATA_TRUST_MAX_MEASURES),
    hiddenMeasureCount: Math.max(0, ordered.length - DATA_TRUST_MAX_MEASURES),
    unstructuredData: trust.unstructuredData
  };
}
