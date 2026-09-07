import { CheckCircle, CircleNotch, WarningCircle } from "@phosphor-icons/react";
import type {
  DataHubActivityStatus,
  DataHubExecutionBlock,
} from "@/types/dataHub";
import { XsSafeMarkdown } from "../XsSafeMarkdown";
import { splitDataHubThinkingEnvelope } from "@/services/dataHubThinkingEnvelope";
import {
  activityProgressLine,
  asNumber,
  asRecord,
  asString,
  executionTimeMs,
  formatExecutionDuration,
  formatExecutionTime
} from "./display";

type UnknownRecord = Record<string, unknown>;

export type DataHubModelActivity = {
  id: string;
  label: string;
  record: UnknownRecord;
  status: DataHubActivityStatus;
  blocks: DataHubExecutionBlock[];
  latestBlock: DataHubExecutionBlock;
  /** 同一次模型调用产出的解说文字，展开后紧跟在摘要之后。 */
  narrative: DataHubExecutionBlock[];
};

export type DataHubExecutionDisplayItem =
  | {
      kind: "block";
      block: DataHubExecutionBlock;
    }
  | {
      kind: "model-activity";
      block: DataHubExecutionBlock;
      activity: DataHubModelActivity;
    };

function modelActivityRecord(block: DataHubExecutionBlock) {
  const record = asRecord(block.content);
  const activityId = asString(record?.activityId);
  const kind = asString(record?.kind)?.toLowerCase();
  const action = asString(record?.action)?.toLowerCase();
  const isModelActivity =
    kind === "model" ||
    kind === "tool" ||
    (!kind &&
      (action?.startsWith("model_") === true || action === "model"));

  return activityId && isModelActivity && record
    ? { activityId, record }
    : undefined;
}

function mergeDefinedRecords(
  current: UnknownRecord,
  incoming: UnknownRecord
): UnknownRecord {
  const merged = { ...current };
  Object.entries(incoming).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      merged[key] = value;
    }
  });
  return merged;
}

function activityStatus(record: UnknownRecord): DataHubActivityStatus {
  const status = asString(record.status)?.toLowerCase();
  if (["error", "failed", "fail"].includes(status ?? "")) {
    return "failed";
  }
  if (["success", "done", "completed", "complete"].includes(status ?? "")) {
    return "success";
  }
  if (["warning", "warn"].includes(status ?? "")) {
    return "warning";
  }
  if (["cancelled", "canceled"].includes(status ?? "")) {
    return "cancelled";
  }
  return "running";
}

function activityLabel(record: UnknownRecord) {
  return (
    asString(record.label) ??
    asString(record.actionLabel) ??
    asString(record.action) ??
    "模型推理"
  );
}

function createActivity(
  id: string,
  record: UnknownRecord,
  blocks: DataHubExecutionBlock[],
  narrative: DataHubExecutionBlock[] = []
): DataHubModelActivity {
  return {
    id,
    label: activityLabel(record),
    record,
    status: activityStatus(record),
    blocks,
    latestBlock: blocks[blocks.length - 1],
    narrative
  };
}

/** 模型对某一步的解说：同一次模型调用里流出的正文片段。 */
function isNarrativeBlock(block: DataHubExecutionBlock) {
  return (
    !block.isThinking &&
    (block.type === "text" || block.type === "content") &&
    typeof block.content === "string" &&
    splitDataHubThinkingEnvelope(block.content).answer.trim().length > 0
  );
}

/**
 * 解说文字和活动是否属于同一次模型调用。后端把 replyId 与 modelCallIndex
 * 同时写在活动事件和该次调用产出的正文事件上，两者都对上才算同一步。
 */
function sharesModelCall(
  activity: DataHubModelActivity,
  block: DataHubExecutionBlock
) {
  return activity.blocks.some(
    (candidate) =>
      candidate.replyId !== undefined &&
      candidate.modelCallIndex !== undefined &&
      candidate.replyId === block.replyId &&
      candidate.modelCallIndex === block.modelCallIndex
  );
}

/**
 * 把紧跟在活动后面、属于同一次模型调用的正文并入该活动，让「这一步做了什么」
 * 和「模型怎么说」连在一起读。末尾的正文是本轮交付的答案，保持独立展示。
 */
function foldNarrativeIntoActivities(
  items: DataHubExecutionDisplayItem[]
): DataHubExecutionDisplayItem[] {
  const folded: DataHubExecutionDisplayItem[] = [];
  items.forEach((item, index) => {
    const previous = folded[folded.length - 1];
    if (
      index < items.length - 1 &&
      item.kind === "block" &&
      isNarrativeBlock(item.block) &&
      previous?.kind === "model-activity" &&
      sharesModelCall(previous.activity, item.block)
    ) {
      folded[folded.length - 1] = {
        ...previous,
        activity: {
          ...previous.activity,
          narrative: [...previous.activity.narrative, item.block]
        }
      };
      return;
    }
    folded.push(item);
  });
  return folded;
}

/**
 * Collapses lifecycle updates for the same model activity into one display
 * stage. Non-activity blocks keep their original order and representation.
 */
export function groupDataHubModelActivities(
  blocks: readonly DataHubExecutionBlock[]
): DataHubExecutionDisplayItem[] {
  const items: DataHubExecutionDisplayItem[] = [];
  const activityIndexes = new Map<string, number>();

  blocks.forEach((block) => {
    const parsed = modelActivityRecord(block);
    if (!parsed) {
      items.push({ kind: "block", block });
      return;
    }

    const existingIndex = activityIndexes.get(parsed.activityId);
    if (existingIndex === undefined) {
      activityIndexes.set(parsed.activityId, items.length);
      items.push({
        kind: "model-activity",
        block,
        activity: createActivity(parsed.activityId, parsed.record, [block])
      });
      return;
    }

    const existing = items[existingIndex];
    if (existing.kind !== "model-activity") {
      return;
    }
    const nextBlocks = [...existing.activity.blocks, block];
    const nextRecord = mergeDefinedRecords(
      existing.activity.record,
      parsed.record
    );
    items[existingIndex] = {
      kind: "model-activity",
      block,
      activity: createActivity(parsed.activityId, nextRecord, nextBlocks)
    };
  });

  return foldNarrativeIntoActivities(items);
}

function activityTimestamp(record: UnknownRecord, key: string) {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return asString(value);
}

function activityDuration(activity: DataHubModelActivity) {
  const explicit = asNumber(activity.record.durationMs);
  if (explicit !== undefined) {
    return explicit;
  }
  const startedAt =
    activityTimestamp(activity.record, "startedAt") ??
    activity.blocks[0]?.timestamp;
  const completedAt =
    activityTimestamp(activity.record, "completedAt") ??
    activity.latestBlock.timestamp;
  const startedMs = executionTimeMs(startedAt);
  const completedMs = executionTimeMs(completedAt);
  return startedMs !== undefined && completedMs !== undefined
    ? Math.max(0, completedMs - startedMs)
    : undefined;
}

function activitySummary(activity: DataHubModelActivity) {
  const summary = asString(activity.record.summary);
  if (summary) {
    return summary;
  }
  if (activity.status === "failed") {
    return `${activity.label}失败，请查看执行信息`;
  }
  if (activity.status === "success") {
    return `${activity.label}已完成`;
  }
  if (activity.status === "warning") {
    return `${activity.label}需要关注`;
  }
  if (activity.status === "cancelled") {
    return `${activity.label}未完成`;
  }
  return activityProgressLine(activity.label);
}

function activityStatusLabel(status: DataHubActivityStatus) {
  if (status === "success") {
    return "已完成";
  }
  if (status === "failed") {
    return "失败";
  }
  if (status === "warning") {
    return "需关注";
  }
  if (status === "cancelled") {
    return "未完成";
  }
  return "进行中";
}

function activityKindLabel(record: UnknownRecord) {
  const kind = asString(record.kind)?.toLowerCase();
  if (kind === "tool") {
    return "企业能力";
  }
  if (kind === "model") {
    return "任务分析";
  }
  return "执行步骤";
}

/** 一行淡色元信息：「{类型} · {开始}–{完成}」，缺时间就只留类型。 */
function activityMetaLine(
  activity: DataHubModelActivity,
  startedAt: string | number | undefined
) {
  const completedAt =
    activityTimestamp(activity.record, "completedAt") ??
    (activity.status === "running" ? undefined : activity.latestBlock.timestamp);
  const started = startedAt === undefined ? "" : formatExecutionTime(startedAt);
  const completed =
    completedAt === undefined ? "" : formatExecutionTime(completedAt);
  const range = started
    ? completed && completed !== started
      ? `${started}–${completed}`
      : `${started} 开始`
    : "";
  return [activityKindLabel(activity.record), range].filter(Boolean).join(" · ");
}

export function DataHubModelActivityCard({
  activity,
  expanded,
  onExpandedChange
}: {
  activity: DataHubModelActivity;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const startedAt =
    activityTimestamp(activity.record, "startedAt") ??
    activity.blocks[0]?.timestamp;
  const duration = activityDuration(activity);
  const metaLine = activityMetaLine(activity, startedAt);
  const StatusIcon =
    activity.status === "success"
      ? CheckCircle
      : activity.status !== "running"
        ? WarningCircle
        : CircleNotch;

  return (
    <details
      className="xs-datahub-agent-card__activity"
      data-status={activity.status}
      aria-label={`模型活动：${activity.label}`}
      role="region"
      open={expanded}
      onToggle={(event) => {
        if (event.currentTarget.open !== expanded) {
          onExpandedChange(event.currentTarget.open);
        }
      }}
    >
      <summary className="xs-datahub-agent-card__activity-header">
        <span className="xs-datahub-agent-card__activity-node" aria-hidden="true">
          <StatusIcon
            size={13}
            weight={activity.status === "running" ? "regular" : "fill"}
          />
        </span>
        <strong>{activity.label}</strong>
        <span className="xs-datahub-agent-card__activity-state">
          {activityStatusLabel(activity.status)}
          {duration !== undefined ? ` · ${formatExecutionDuration(duration)}` : ""}
        </span>
        <span className="xs-datahub-agent-card__activity-toggle" aria-hidden="true" />
      </summary>

      <div className="xs-datahub-agent-card__activity-body">
        <p className="xs-datahub-agent-card__activity-summary">
          {activitySummary(activity)}
        </p>

        {activity.narrative.map((block, index) => (
          <XsSafeMarkdown
            key={block.eventId ?? `${activity.id}-narrative-${index}`}
            className="xs-datahub-agent-card__activity-narrative"
            content={splitDataHubThinkingEnvelope(String(block.content)).answer}
          />
        ))}

        {metaLine ? (
          <p className="xs-datahub-agent-card__activity-meta">{metaLine}</p>
        ) : null}
      </div>
    </details>
  );
}
