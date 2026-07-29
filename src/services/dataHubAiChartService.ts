import { requestDataHub } from "@/services/dataHubClient";
import type { AiChartPlanRequestSummary, AiChartPlanResult } from "@/types/aiChart";

export type DataHubAiChartPlanner = (
  summary: AiChartPlanRequestSummary
) => Promise<AiChartPlanResult>;

export function requestDataHubAiChartPlan(
  summary: AiChartPlanRequestSummary
): Promise<AiChartPlanResult> {
  return requestDataHub<AiChartPlanResult>("/api/v1/chat/chart-plan", {
    method: "POST",
    body: JSON.stringify(summary),
    timeoutMs: 60_000
  });
}
