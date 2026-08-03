export function resolveQueryAssetFeatureEnabled(value: string | undefined) {
  return value !== "false";
}

export const queryAssetFeatureEnabled = resolveQueryAssetFeatureEnabled(
  import.meta.env.VITE_QUERY_ASSETS_ENABLED
);
