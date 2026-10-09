import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { sessionQueryKey, useSessionQueryScope } from "@/app/sessionQuery";
import { queryAssetFeatureEnabled } from "@/config/features";
import { DashboardDesignerIsland } from "@/features/dashboardStudio/DashboardDesignerIsland";
import { SmartDashboardPanel } from "@/features/dashboardStudio/smart/SmartDashboardPanel";
import type { DashboardDesignerHandle } from "@/features/dashboardStudio/vue/mountDashboardDesigner";
import {
  getDashboardEditorData,
  publishDashboard,
  refreshDashboardModules,
  saveDashboard
} from "@/services/dashboardAnalyticsService";
import { createBlankDashboard, replanLegacyDashboardDraft } from "@/services/dashboardGenerationService";
import {
  listQueryAssets,
  previewQueryAsset,
  promoteQueryVersion,
  reaskQueryAsset,
  changeQueryAssetVisibility
} from "@/services/queryAssetService";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import type { DashboardRecord, DashboardSchema } from "@/types/dashboardStudio";

function resolveEditorReturnPath(value: string | null) {
  return value === "/analysis" || value === "/ask-agent" || value === "/ask-data"
    ? value
    : "/dashboard";
}

/**
 * 不带 draft 打开编辑器时，画布上是一块只在本页存在的空白板：revision 0 表示服务端还没有它。
 * 用户第一次保存草稿或发布时，后端按这个 id 新建看板（新建只接受修订号 0）。
 */
function createUnsavedDashboardRecord(ownerUserId?: number): DashboardRecord {
  const schema = createBlankDashboard();
  return {
    id: schema.id,
    status: "draft",
    revision: 0,
    visibility: "PRIVATE",
    ownerUserId,
    schema,
    createdAt: schema.createdAt,
    updatedAt: schema.updatedAt
  };
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
  const userId = useDataHubAuthStore((state) => state.user?.userId);

  /* 地址栏没有 draft 时用本地空白板；draft 变化时跟着换，回到无 draft 的地址就重新起一块。 */
  const [unsavedRecord, setUnsavedRecord] = useState<DashboardRecord | null>(
    () => (draftId ? null : createUnsavedDashboardRecord(userId))
  );
  const [unsavedRecordDraftId, setUnsavedRecordDraftId] = useState(draftId);
  if (unsavedRecordDraftId !== draftId) {
    setUnsavedRecordDraftId(draftId);
    setUnsavedRecord(draftId ? null : createUnsavedDashboardRecord(userId));
  }

  /* 智享面板：设计器句柄 + 最近一次画布 schema，面板靠它们读写画布而不重挂设计器。 */
  const [smartOpen, setSmartOpen] = useState(smartRequested);
  const [liveSchema, setLiveSchema] = useState<DashboardSchema | null>(null);
  const designerRef = useRef<DashboardDesignerHandle | null>(null);

  const recordQuery = useQuery({
    queryKey: sessionQueryKey(sessionScope, "analytics-dashboard-editor", draftId),
    enabled: Boolean(draftId),
    retry: false,
    queryFn: async () => {
      const record = await getDashboardEditorData(draftId!);
      if (!record) throw new Error("找不到这份看板草稿，它可能已被删除或不属于当前空间。");
      const replanned = import.meta.env.MODE === "test" ? replanLegacyDashboardDraft(record) : null;
      return replanned ? saveDashboard(replanned, record.revision, record.visibility) : record;
    }
  });

  const updateRecord = useCallback((record: DashboardRecord) => {
    queryClient.setQueryData(sessionQueryKey(sessionScope, "analytics-dashboard-editor", record.id), record);
    return record;
  }, [queryClient, sessionScope]);

  /*
   * 本地空白板第一次保存或发布成功后，把 id 写进地址栏，刷新能回到同一块板；其余参数原样保留。
   * 先写缓存再 replace：id 不变、设计器的初始参数不变，设计器不会重挂。
   */
  const adoptSavedRecord = useCallback((saved: DashboardRecord) => {
    updateRecord(saved);
    if (!draftId) {
      const nextParams = new URLSearchParams({ draft: saved.id });
      searchParams.forEach((value, key) => {
        if (key !== "draft") nextParams.append(key, value);
      });
      navigate(`/dashboard-editor?${nextParams.toString()}`, { replace: true });
    }
    return saved;
  }, [draftId, navigate, searchParams, updateRecord]);

  const saveDraft = useCallback(async (
    schema: DashboardSchema,
    expectedRevision: number,
    visibility: "PRIVATE" | "SPACE"
  ) => adoptSavedRecord(await saveDashboard(schema, expectedRevision, visibility)), [adoptSavedRecord]);

  const publish = useCallback(async (
    schema: DashboardSchema,
    expectedRevision: number,
    visibility: "PRIVATE" | "SPACE"
  ) => adoptSavedRecord(await publishDashboard(schema, expectedRevision, visibility)), [adoptSavedRecord]);

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
    // 后端还没有 upgrade / schedule / layout-plan 接口（见 dashboardAnalyticsService），界面不开放入口；
    // 万一有路径调到，直接说暂未开放，别让用户看到一个 404。
    upgradeModule: async () => {
      throw new Error("查询版本升级暂未开放");
    },
    saveSchedule: async () => {
      throw new Error("模块刷新计划暂未开放");
    },
    planLayout: async () => ({ source: "LOCAL" as const, intents: [], message: "使用本地排版" })
  }), [draftId, updateRecord]);

  const record = draftId ? recordQuery.data : unsavedRecord;
  const recordSchema = record?.schema;
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

  const loadError = recordQuery.error;
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
          onClose={closeSmartPanel}
        />
      ) : null}
    </section>
  );
}
