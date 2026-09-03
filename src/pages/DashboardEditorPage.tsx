import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { sessionQueryKey, useSessionQueryScope } from "@/app/sessionQuery";
import { queryAssetFeatureEnabled } from "@/config/features";
import { DashboardDesignerIsland } from "@/features/dashboardStudio/DashboardDesignerIsland";
import { SmartDashboardPanel } from "@/features/dashboardStudio/smart/SmartDashboardPanel";
import type { DashboardDesignerHandle } from "@/features/dashboardStudio/vue/mountDashboardDesigner";
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
import { consumeDashboardSmartHandoff } from "@/services/dashboardDesignHandoffService";
import { createBlankDashboard, replanLegacyDashboardDraft } from "@/services/dashboardGenerationService";
import {
  listQueryAssets,
  previewQueryAsset,
  promoteQueryVersion,
  reaskQueryAsset,
  changeQueryAssetVisibility
} from "@/services/queryAssetService";
import type { DashboardSmartHandoff } from "@/types/dashboardDesign";
import type { DashboardRecord, DashboardSchema } from "@/types/dashboardStudio";

function resolveEditorReturnPath(value: string | null) {
  return value === "/analysis" || value === "/ask-agent" || value === "/ask-data"
    ? value
    : "/dashboard";
}

export function DashboardEditorPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionScope = useSessionQueryScope();
  const [searchParams] = useSearchParams();
  const draftId = searchParams.get("draft");
  const favoriteAssetId = searchParams.get("asset") || undefined;
  const openFavoriteAssets =
    queryAssetFeatureEnabled &&
    (searchParams.get("source") === "favorites" || Boolean(favoriteAssetId));
  const smartRequested = searchParams.get("smart") === "1";
  const returnPath = resolveEditorReturnPath(searchParams.get("returnTo"));
  const creationStarted = useRef(false);

  /* 智享面板：设计器句柄 + 最近一次画布 schema，面板靠它们读写画布而不重挂设计器。 */
  const [smartOpen, setSmartOpen] = useState(smartRequested);
  const [liveSchema, setLiveSchema] = useState<DashboardSchema | null>(null);
  const designerRef = useRef<DashboardDesignerHandle | null>(null);
  const handoffRef = useRef<{ draftId: string; handoff: DashboardSmartHandoff | null } | null>(null);

  const recordQuery = useQuery({
    queryKey: sessionQueryKey(sessionScope, "analytics-dashboard-editor", draftId),
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
      queryClient.setQueryData(sessionQueryKey(sessionScope, "analytics-dashboard-editor", record.id), record);
      const nextParams = new URLSearchParams({ draft: record.id });
      if (openFavoriteAssets) nextParams.set("source", "favorites");
      if (favoriteAssetId) nextParams.set("asset", favoriteAssetId);
      if (smartRequested) nextParams.set("smart", "1");
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

  /* 入口页的交接单只读一次；ref 挡住 StrictMode 的二次求值，换草稿再读。 */
  const handoff = useMemo(() => {
    if (!draftId) return null;
    if (handoffRef.current?.draftId !== draftId) {
      handoffRef.current = { draftId, handoff: consumeDashboardSmartHandoff(draftId) };
    }
    return handoffRef.current.handoff;
  }, [draftId]);

  const updateRecord = useCallback((record: DashboardRecord) => {
    queryClient.setQueryData(sessionQueryKey(sessionScope, "analytics-dashboard-editor", record.id), record);
    return record;
  }, [queryClient, sessionScope]);

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

  const recordSchema = recordQuery.data?.schema;
  const getSchema = useCallback(
    () => designerRef.current?.getSchema() ?? liveSchema ?? recordSchema ?? createBlankDashboard(),
    [liveSchema, recordSchema]
  );

  const applySchema = useCallback(async (schema: DashboardSchema, notice?: string) => {
    const handle = designerRef.current;
    if (!handle) throw new Error("设计器尚未就绪，请稍后再试");
    await handle.applySchema(schema, notice);
  }, []);

  /* 这两个回调交给 React Compiler 自动记忆化；手写 useCallback 会被它判定依赖不符而跳过整组件。 */
  function handleSchemaChange(schema: DashboardSchema) {
    setLiveSchema(schema);
  }

  const previewAsset = useCallback((assetId: string) => previewQueryAsset(assetId), []);

  function closeSmartPanel() {
    setSmartOpen(false);
    designerRef.current?.setSmartPanelOpen(false);
  }

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
    <section
      className={`dashboard-studio-page${smartOpen ? " dashboard-studio-page--smart" : ""}`}
      aria-label="看板编辑器工作区"
    >
      <h1 className="sr-only">看板编辑器</h1>
      <div className="dashboard-studio-page__designer">
        <DashboardDesignerIsland
          key={record.id}
          record={record}
          saveDraft={saveDraft}
          publishDashboard={publish}
          dataActions={dataActions}
          initialResourcePanel={openFavoriteAssets ? "assets" : undefined}
          initialAssetId={favoriteAssetId}
          initialSmartPanelOpen={smartRequested}
          onSmartPanelToggle={setSmartOpen}
          onHandle={(handle) => { designerRef.current = handle; }}
          onChange={handleSchemaChange}
          onExit={() => navigate(returnPath)}
        />
      </div>
      {smartOpen ? (
        <SmartDashboardPanel
          getSchema={getSchema}
          applySchema={applySchema}
          listAssets={listQueryAssets}
          previewAsset={previewAsset}
          schema={liveSchema ?? record.schema}
          initialBrief={handoff?.brief}
          initialAssetIds={handoff?.assetIds}
          onClose={closeSmartPanel}
        />
      ) : null}
    </section>
  );
}
