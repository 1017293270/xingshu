export type CapabilityState = "live" | "preview" | "unavailable";

export type DataProvenance = "datahub" | "cache" | "mock" | "local";

export type FreshnessState = "fresh" | "stale" | "unknown";

export type CapabilityDescriptor = {
  id: string;
  label: string;
  state: CapabilityState;
  provenance: DataProvenance;
  message: string;
};
