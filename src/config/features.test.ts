import { describe, expect, it } from "vitest";
import { resolveQueryAssetFeatureEnabled } from "./features";

describe("resolveQueryAssetFeatureEnabled", () => {
  it("keeps query assets enabled by default for deterministic product tests", () => {
    expect(resolveQueryAssetFeatureEnabled(undefined)).toBe(true);
    expect(resolveQueryAssetFeatureEnabled("true")).toBe(true);
  });

  it("supports an explicit disabled state", () => {
    expect(resolveQueryAssetFeatureEnabled("false")).toBe(false);
  });
});
