import { useQuery } from "@tanstack/react-query";
import { resolveXsAsyncStatus } from "@/components/xs/XsAsyncPanel";
import { loadOfficialDocumentWorkspace } from "@/services/officialDocumentService";
import {
  ANALYZING_POLL_INTERVAL_MS,
  hasAnalyzingTemplate,
  useOfficialDocumentWorkspaceKey
} from "./officialDocumentMeta";

/** 模板库与草稿箱共用同一份 workspace 快照，避免两个列表页各自拉取后出现数据漂移。 */
export function useOfficialDocumentWorkspace() {
  const workspaceKey = useOfficialDocumentWorkspaceKey();
  const query = useQuery({
    queryKey: workspaceKey,
    queryFn: loadOfficialDocumentWorkspace,
    refetchInterval: (current) => (
      hasAnalyzingTemplate(current.state.data?.templates ?? []) ? ANALYZING_POLL_INTERVAL_MS : false
    )
  });
  const status = resolveXsAsyncStatus({
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    hasData: query.data !== undefined
  });

  return { query, status };
}
