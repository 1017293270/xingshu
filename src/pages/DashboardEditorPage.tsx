import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { queryAssetFeatureEnabled } from "@/config/features";
import { DashboardDesignerIsland } from "@/features/dashboardStudio/DashboardDesignerIsland";
import {
  createDashboard,
  getDashboardEditorData,
  planDashboardLayout,
  publishDashboard,
  refreshDashboardModules,
  saveDashboard,
  saveRefreshSchedule,
  upgradeDashboardModule
} from "@/services/dashboardAnalyticsService";
import { createBlankDashboard, replanLegacyDashboardDraft } from "@/services/dashboardGenerationService";
import {
  listQueryAssets,
  previewQueryAsset,
  promoteQueryVersion,
  reaskQueryAsset,
  changeQueryAssetVisibility
} from "@/services/queryAssetService";
import type { DashboardRecord, DashboardSchema } from "@/types/dashboardStudio";

function resolveEditorReturnPath(value: string | null) {
  return value === "/analysis" || value === "/ask-agent" || value === "/ask-data"
    ? value
    : "/dashboard";
}

export function DashboardEditorPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const draftId = searchParams.get("draft");
  const favoriteAssetId = searchParams.get("asset") || undefined;
  const openFavoriteAssets =
    queryAssetFeatureEnabled &&
    (searchParams.get("source") === "favorites" || Boolean(favoriteAssetId));
  const returnPath = resolveEditorReturnPath(searchParams.get("returnTo"));
  const creationStarted = useRef(false);

  const recordQuery = useQuery({
    queryKey: ["analytics-dashboard-editor", draftId],
    enabled: Boolean(draftId),
    retry: false,
    queryFn: async () => {
      const record = await getDashboardEditorData(draftId!);
      if (!record) throw new Error("找不到这份看板草稿，它可能已归档或不属于当前空间。");
      const replanned = import.meta.env.MODE === "test" ? replanLegacyDashboardDraft(record) : null;
      return replanned ? saveDashboard(replanned, record.revision, record.visibility) : record;
    }
  });

  const createMutation = useMutation({
    mutationFn: () => createDashboard(createBlankDashboard()),
    onSuccess: (record) => {
      queryClient.setQueryData(["analytics-dashboard-editor", record.id], record);
      const nextParams = new URLSearchParams({ draft: record.id });
      if (openFavoriteAssets) nextParams.set("source", "favorites");
      if (favoriteAssetId) nextParams.set("asset", favoriteAssetId);
      if (returnPath !== "/dashboard") nextParams.set("returnTo", returnPath);
      navigate(`/dashboard-editor?${nextParams.toString()}`, { replace: true });
    }
  });

  useEffect(() => {
    if (!draftId && !creationStarted.current) {
      creationStarted.current = true;
      createMutation.mutate();
    }
  }, [createMutation, draftId]);

  const updateRecord = useCallback((record: DashboardRecord) => {
    queryClient.setQueryData(["analytics-dashboard-editor", record.id], record);
    return record;
  }, [queryClient]);

  const saveDraft = useCallback(async (
    schema: DashboardSchema,
    expectedRevision: number,
    visibility: "PRIVATE" | "SPACE"
  ) => updateRecord(await saveDashboard(schema, expectedRevision, visibility)), [updateRecord]);

  const publish = useCallback(async (
    schema: DashboardSchema,
    expectedRevision: number,
    visibility: "PRIVATE" | "SPACE"
  ) => updateRecord(await publishDashboard(schema, expectedRevision, visibility)), [updateRecord]);

  const dataActions = useMemo(() => ({
    listAssets: listQueryAssets,
    previewAsset: previewQueryAsset,
    reaskAsset: reaskQueryAsset,
    promoteVersion: promoteQueryVersion,
    changeAssetVisibility: changeQueryAssetVisibility,
    refreshModule: async (moduleId: string) => {
      if (!draftId) throw new Error("看板草稿尚未创建");
      await refreshDashboardModules(draftId, [moduleId], true);
      const refreshed = await getDashboardEditorData(draftId);
      if (!refreshed) throw new Error("刷新后无法读取看板草稿");
      return updateRecord(refreshed);
    },
    upgradeModule: async (
      moduleId: string,
      input: {
        queryVersionId: string;
        outputKey?: string;
        confirmedSchemaChange: boolean;
        columnMapping?: Record<string, string>;
      }
    ) => {
      if (!draftId || !recordQuery.data) throw new Error("看板草稿尚未加载");
      await upgradeDashboardModule(draftId, moduleId, {
        ...input,
        expectedRevision: recordQuery.data.revision
      });
      const refreshed = await getDashboardEditorData(draftId);
      if (!refreshed) throw new Error("升级后无法读取看板草稿");
      return updateRecord(refreshed);
    },
    saveSchedule: async (moduleId: string, input: Parameters<typeof saveRefreshSchedule>[2]) => {
      if (!draftId) throw new Error("看板草稿尚未创建");
      return saveRefreshSchedule(draftId, moduleId, input);
    },
    planLayout: async (request: unknown) => {
      if (!draftId) throw new Error("看板草稿尚未创建");
      return planDashboardLayout(draftId, request);
    }
  }), [draftId, recordQuery.data, updateRecord]);

  const record = recordQuery.data;
  const loadError = recordQuery.error ?? createMutation.error;
  if (loadError) {
    return (
      <section className="dashboard-studio-page" aria-label="看板编辑器工作区">
        <h1>看板编辑器</h1>
        <div className="dashboard-studio-page__error" role="alert">
          <strong>看板草稿不可用</strong>
          <p>{loadError instanceof Error ? loadError.message : "看板服务暂不可用"}</p>
          <button type="button" onClick={() => navigate("/dashboard-editor", { replace: true })}>新建大屏</button>
        </div>
      </section>
    );
  }

  if (!record) {
    return (
      <section className="dashboard-studio-page" aria-label="看板编辑器工作区">
        <h1 className="sr-only">看板编辑器</h1>
        <div className="dashboard-editor-layout-skeleton" role="status" aria-label="正在读取服务端看板草稿">
          <span className="sr-only">正在读取服务端看板草稿…</span>
          <i aria-hidden="true" />
          <i aria-hidden="true" />
          <i aria-hidden="true" />
        </div>
      </section>
    );
  }

  return (
    <section className="dashboard-studio-page" aria-label="看板编辑器工作区">
      <h1 className="sr-only">看板编辑器</h1>
      <DashboardDesignerIsland
        key={record.id}
        record={record}
        saveDraft={saveDraft}
        publishDashboard={publish}
        dataActions={dataActions}
        initialResourcePanel={openFavoriteAssets ? "assets" : undefined}
        initialAssetId={favoriteAssetId}
        onExit={() => navigate(returnPath)}
      />
    </section>
  );
}
