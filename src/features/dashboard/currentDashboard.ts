import type { DashboardRecord } from "@/types/dashboardStudio";

/** 「我的看板」当前展示的看板 id；跨会话记住用户最后停留的那一块。 */
export const CURRENT_DASHBOARD_STORAGE_KEY = "xs-dashboard-current";

export function readCurrentDashboardId(): string | null {
  try {
    return window.localStorage.getItem(CURRENT_DASHBOARD_STORAGE_KEY);
  } catch {
    /* 无痕模式等场景读不到，按"未选择"处理，交给回退逻辑 */
    return null;
  }
}

export function writeCurrentDashboardId(id: string) {
  try {
    window.localStorage.setItem(CURRENT_DASHBOARD_STORAGE_KEY, id);
  } catch {
    /* 写不进去不影响本次会话内的切换 */
  }
}

export function clearCurrentDashboardId() {
  try {
    window.localStorage.removeItem(CURRENT_DASHBOARD_STORAGE_KEY);
  } catch {
    /* 同上 */
  }
}

/**
 * 存下的 id 读不到、或那块看板已经不在列表里（被归档、换了账号/空间）时，
 * 回退到最近更新的一块；列表为空返回 null，由页面出空态。
 */
export function resolveCurrentDashboard(
  records: DashboardRecord[],
  storedId: string | null
): DashboardRecord | null {
  const stored = storedId ? records.find((record) => record.id === storedId) : undefined;
  if (stored) return stored;

  return records.reduce<DashboardRecord | null>(
    (latest, record) => (latest && latest.updatedAt >= record.updatedAt ? latest : record),
    null
  );
}
