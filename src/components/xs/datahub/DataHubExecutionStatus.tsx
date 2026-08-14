import {
  CheckCircle,
  CircleNotch,
  Clock,
  StopCircle,
  WarningCircle
} from "@phosphor-icons/react";
import type { DataHubExecutionStatus } from "@/types/dataHub";
import { executionStatusLabel } from "./display";

export type DataHubExecutionStatusProps = {
  status: DataHubExecutionStatus;
  compact?: boolean;
};

export function DataHubExecutionStatus({
  status,
  compact = false
}: DataHubExecutionStatusProps) {
  const Icon =
    status === "done"
      ? CheckCircle
      : status === "error"
        ? WarningCircle
        : status === "cancelled"
          ? StopCircle
        : status === "running"
          ? CircleNotch
          : Clock;

  return (
    <span
      className={`xs-datahub-status xs-datahub-status--${status}${
        compact ? " xs-datahub-status--compact" : ""
      }`}
      aria-label={executionStatusLabel[status]}
    >
      <Icon
        size={compact ? 13 : 14}
        weight={status === "running" ? "regular" : "fill"}
        aria-hidden="true"
      />
      <span>{executionStatusLabel[status]}</span>
    </span>
  );
}
