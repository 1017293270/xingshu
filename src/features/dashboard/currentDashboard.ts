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

function latestUpdated(records: DashboardRecord[]): DashboardRecord | null {
  return records.reduce<DashboardRecord | null>(
    (latest, record) => (latest && latest.updatedAt >= record.updatedAt ? latest : record),
    null
  );
}

/**
 * 判断一块看板是不是当前用户名下的。
 *
 * 后端列表 SQL 是 `owner_user_id = ? OR visibility = 'SPACE'`，所以：
 * - 有 ownerUserId（新后端）时直接比对，最准；
 * - 字段缺席（老后端还没部署）时退到启发式：能出现在列表里的 PRIVATE 板必然是自己的，
 *   否则 SQL 那条 OR 不会放它进来。极限是 SPACE 板分不出归属——自己发布成 SPACE 的板
 *   会被误判成别人的，这是没有 ownerUserId 时前端能做到的上限，宁可漏判也不错判。
 */
function isOwnedByUser(record: DashboardRecord, userId?: number): boolean {
  if (record.ownerUserId != null) return userId != null && record.ownerUserId === userId;
  return record.visibility === "PRIVATE";
}

/**
 * 存下的 id 读不到、或那块看板已经不在列表里（被归档、换了账号/空间）时，
 * 优先回退到「自己名下最近更新的一块」——列表里混着他人共享到空间的看板，
 * 直接取全量最近更新会让「我的看板」默认停在别人的板上。
 * 自己名下一块都没有时才退回全量最近更新；列表为空返回 null，由页面出空态。
 */
export function resolveCurrentDashboard(
  records: DashboardRecord[],
  storedId: string | null,
  userId?: number
): DashboardRecord | null {
  const stored = storedId ? records.find((record) => record.id === storedId) : undefined;
  if (stored) return stored;

  const owned = records.filter((record) => isOwnedByUser(record, userId));
  return latestUpdated(owned) ?? latestUpdated(records);
}
