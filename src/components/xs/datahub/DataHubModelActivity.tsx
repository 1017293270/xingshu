import {
  CheckCircle,
  CircleNotch,
  Code,
  WarningCircle
} from "@phosphor-icons/react";
import type {
  DataHubActivityStatus,
  DataHubExecutionBlock,
} from "@/types/dataHub";
import {
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
  blocks: DataHubExecutionBlock[]
): DataHubModelActivity {
  return {
    id,
    label: activityLabel(record),
    record,
    status: activityStatus(record),
    blocks,
    latestBlock: blocks[blocks.length - 1]
  };
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

  return items;
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
    return `${activity.label}失败，请查看技术详情`;
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
  return activity.label.startsWith("正在")
    ? `${activity.label}…`
    : `正在${activity.label}…`;
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
    return "工具调用";
  }
  if (kind === "model") {
    return "模型推理";
  }
  return "执行步骤";
}

function activityTechnicalDetails(
  activity: DataHubModelActivity,
  startedAt: string | number | undefined,
  duration: number | undefined
) {
  const completedAt =
    activityTimestamp(activity.record, "completedAt") ??
    (activity.status === "running" ? undefined : activity.latestBlock.timestamp);

  return [
    { label: "类型", value: activityKindLabel(activity.record) },
    { label: "动作", value: activity.label },
    { label: "状态", value: activityStatusLabel(activity.status) },
    {
      label: "开始时间",
      value: startedAt === undefined ? "—" : formatExecutionTime(startedAt)
    },
    {
      label: "完成时间",
      value: completedAt === undefined ? "—" : formatExecutionTime(completedAt)
    },
    {
      label: "耗时",
      value: duration === undefined ? "—" : formatExecutionDuration(duration)
    }
  ];
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
  const technicalDetails = activityTechnicalDetails(activity, startedAt, duration);
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

        {startedAt !== undefined ? (
          <dl className="xs-datahub-agent-card__activity-meta">
          {startedAt !== undefined ? (
            <div>
              <dt>开始时间</dt>
              <dd>{formatExecutionTime(startedAt)}</dd>
            </div>
          ) : null}
          </dl>
        ) : null}

        <section className="xs-datahub-agent-card__activity-detail">
          <div className="xs-datahub-agent-card__activity-detail-title">
            <Code size={13} aria-hidden="true" />
            技术详情
          </div>
          <dl
            className="xs-datahub-agent-card__activity-detail-list"
            role="group"
            aria-label="技术详情"
          >
            {technicalDetails.map((detail) => (
              <div key={detail.label}>
                <dt>{detail.label}</dt>
                <dd>{detail.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </details>
  );
}
