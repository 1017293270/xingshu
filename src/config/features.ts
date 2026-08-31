export function resolveQueryAssetFeatureEnabled(value: string | undefined) {
  return value !== "false";
}

export const queryAssetFeatureEnabled = resolveQueryAssetFeatureEnabled(
  import.meta.env.VITE_QUERY_ASSETS_ENABLED
);

/**
 * 问数/问知/找文档的受控澄清依赖 ai-service beta0.3 契约
 * （prepareInteraction 放开三模式）；对接旧后端时设 VITE_CLARIFY_ALL_MODES=false
 * 退回「仅编排/问表」口径。
 */
export function resolveClarifyAllModesEnabled(value: string | undefined) {
  return value !== "false";
}

export const clarifyAllModesEnabled = resolveClarifyAllModesEnabled(
  import.meta.env.VITE_CLARIFY_ALL_MODES
);
