import { DASHBOARD_SMART_HANDOFF_KEY, type DashboardSmartHandoff } from "@/types/dashboardDesign";

/**
 * 入口页 → 编辑器的一次性交接。
 * 走 sessionStorage 而不是 URL：需求原话可能很长，塞进 query 会被日志和 Referer 带走。
 * 读一次即清——刷新编辑器不该重新触发一轮模型调用。
 */

function getStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function writeDashboardSmartHandoff(handoff: DashboardSmartHandoff): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(DASHBOARD_SMART_HANDOFF_KEY, JSON.stringify(handoff));
  } catch {
    // 隐私模式下写不进去就退回「打开编辑器但不自动发起设计」，不该因此拦住跳转。
  }
}

export function clearDashboardSmartHandoff(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(DASHBOARD_SMART_HANDOFF_KEY);
  } catch {
    // 清不掉也不影响下一次覆盖写。
  }
}

/** 只把交给这份草稿的需求还回去；草稿对不上说明用户已经换了一块板。 */
export function consumeDashboardSmartHandoff(draftId: string): DashboardSmartHandoff | null {
  const storage = getStorage();
  if (!storage) return null;

  let raw: string | null = null;
  try {
    raw = storage.getItem(DASHBOARD_SMART_HANDOFF_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearDashboardSmartHandoff();
    return null;
  }

  if (
    !parsed
    || typeof parsed !== "object"
    || (parsed as DashboardSmartHandoff).version !== 1
    || (parsed as DashboardSmartHandoff).draftId !== draftId
  ) {
    return null;
  }

  const handoff = parsed as DashboardSmartHandoff;
  clearDashboardSmartHandoff();
  return {
    version: 1,
    draftId: handoff.draftId,
    brief: typeof handoff.brief === "string" ? handoff.brief : "",
    assetIds: Array.isArray(handoff.assetIds)
      ? handoff.assetIds.filter((id): id is string => typeof id === "string")
      : [],
    createdAt: typeof handoff.createdAt === "string" ? handoff.createdAt : new Date().toISOString()
  };
}
