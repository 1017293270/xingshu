import type { CapabilityDescriptor } from "@/types/capability";
import { XsStatusBar, type XsStatusTone } from "./XsStatusBar";

type XsCapabilityStatusProps = {
  capability: CapabilityDescriptor;
};

const toneByState: Record<CapabilityDescriptor["state"], XsStatusTone> = {
  live: "success",
  preview: "warning",
  unavailable: "error"
};

export function XsCapabilityStatus({ capability }: XsCapabilityStatusProps) {
  return (
    <XsStatusBar
      tone={toneByState[capability.state]}
      label={capability.label}
      message={capability.message}
      announce={false}
    />
  );
}
