import { useQuery } from "@tanstack/react-query";
import { sessionQueryKey, useSessionQueryScope } from "@/app/sessionQuery";
import { listDataHubSpaces } from "@/services/dataHubSpaceService";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";

/**
 * 空间管理员的角色名字面量。后端 SpaceMembershipService.hasSuperAdminRole 是按
 * role_type='system' AND role_name='超级管理员' 精确匹配的，这里必须一字不差。
 */
export const DATA_HUB_SPACE_ADMIN_ROLE = "超级管理员";

/** 空间角色列表 5 分钟内复用，避免每个页面都重新拉一次 /api/spaces */
const SPACE_ROLE_STALE_TIME_MS = 5 * 60_000;

export type SpaceAdminState = {
  /** 当前用户在当前空间是否管理员：系统管理员 或 该空间持有「超级管理员」角色 */
  isSpaceAdmin: boolean;
  /** 判定是否已经落定（含请求失败后的保守回退），未落定时调用方应门住依赖口径的查询 */
  resolved: boolean;
};

export function spaceAdminFromRoles(myRoles?: string[]) {
  return myRoles?.includes(DATA_HUB_SPACE_ADMIN_ROLE) === true;
}

/**
 * 云盘等按归属分流的页面共用的管理员判定。
 *
 * JWT 里的 isAdmin 是**系统管理员**（sys 后台账号），不是空间管理员；空间管理员的权威来源是
 * GET /api/spaces 返回的 SpaceVO.myRoles 里是否含「超级管理员」。两者是 OR 关系：
 * 系统管理员直接算管理员，不必等空间列表。
 *
 * 空间列表拉取失败或当前没有选中空间时，保守回退到个人口径（isSpaceAdmin=false）并把
 * resolved 置为 true，宁可少看见也不要把页面卡在 loading。
 */
export function useSpaceAdmin(): SpaceAdminState {
  const sessionScope = useSessionQueryScope();
  const spaceId = useDataHubAuthStore((state) => state.currentSpaceId);
  const isSystemAdmin = useDataHubAuthStore((state) => state.user?.isAdmin === true);
  // 系统管理员已经能定下判定，没必要再问一次空间列表
  const needsSpaceRoles = !isSystemAdmin && spaceId != null;
  const spacesQuery = useQuery({
    queryKey: sessionQueryKey(sessionScope, "spaces"),
    queryFn: () => listDataHubSpaces(),
    enabled: needsSpaceRoles,
    staleTime: SPACE_ROLE_STALE_TIME_MS,
    retry: false
  });

  if (isSystemAdmin) {
    return { isSpaceAdmin: true, resolved: true };
  }

  if (!needsSpaceRoles) {
    return { isSpaceAdmin: false, resolved: true };
  }

  const currentSpace = spacesQuery.data?.find((space) => space.id === spaceId);
  return {
    isSpaceAdmin: spaceAdminFromRoles(currentSpace?.myRoles),
    resolved: spacesQuery.isSuccess || spacesQuery.isError
  };
}
