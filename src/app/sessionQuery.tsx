import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, type PropsWithChildren } from "react";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";

export type SessionQueryScope = readonly [
  "session",
  userId: number | "anonymous",
  spaceId: number | "none"
];

export function createSessionQueryScope(
  userId: number | null | undefined,
  spaceId: number | null | undefined
): SessionQueryScope {
  return ["session", userId ?? "anonymous", spaceId ?? "none"];
}

export function sessionQueryKey(scope: SessionQueryScope, ...segments: ReadonlyArray<unknown>) {
  return [...scope, ...segments] as const;
}

export function useSessionQueryScope() {
  const userId = useDataHubAuthStore((state) => state.user?.userId);
  const spaceId = useDataHubAuthStore((state) => state.currentSpaceId);

  return useMemo(() => createSessionQueryScope(userId, spaceId), [spaceId, userId]);
}

export function SessionQueryBoundary({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const token = useDataHubAuthStore((state) => state.token);
  const scope = useSessionQueryScope();
  const identity = `${token ? "authenticated" : "anonymous"}:${scope[1]}:${scope[2]}`;
  const previousIdentity = useRef(identity);

  useEffect(() => {
    if (previousIdentity.current !== identity) {
      queryClient.clear();
      previousIdentity.current = identity;
    }
  }, [identity, queryClient]);

  return children;
}
