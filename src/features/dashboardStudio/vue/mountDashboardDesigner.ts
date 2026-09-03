import { createApp, type App as VueApp } from "vue";
import type { DashboardRecord, DashboardSchema } from "@/types/dashboardStudio";
import type {
  LayoutPlan,
  QueryAsset,
  QueryExecution,
  RefreshSchedule,
  RefreshScheduleInput
} from "@/types/analytics";
import DashboardDesignerApp from "./DashboardDesignerApp.vue";

export type DashboardDesignerMountOptions = {
  record: DashboardRecord;
  initialResourcePanel?: "assets";
  initialAssetId?: string;
  /** 智享面板的初始开合；工具栏按钮切换时通过 onSmartPanelToggle 告诉 React 侧显隐面板。 */
  initialSmartPanelOpen?: boolean;
  onSmartPanelToggle?: (open: boolean) => void;
  saveDraft: (schema: DashboardSchema, expectedRevision: number, visibility: "PRIVATE" | "SPACE") => Promise<DashboardRecord>;
  publishDashboard: (schema: DashboardSchema, expectedRevision: number, visibility: "PRIVATE" | "SPACE") => Promise<DashboardRecord>;
  exit: () => void;
  dataActions?: DashboardDesignerDataActions;
  onReady?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onChange?: (schema: DashboardSchema) => void;
  onError?: (error: Error) => void;
};

export type DashboardDesignerDataActions = {
  listAssets: (input?: { keyword?: string; scope?: "PRIVATE" | "SPACE" }) => Promise<QueryAsset[]>;
  previewAsset: (assetId: string, input?: { versionId?: string; parameters?: Record<string, unknown>; force?: boolean }) => Promise<QueryExecution>;
  reaskAsset: (assetId: string, input: { baseVersionId?: string; resolvedQuestion?: string; parameters?: Record<string, unknown> }) => Promise<QueryAsset>;
  promoteVersion: (assetId: string, versionId: string) => Promise<QueryAsset>;
  changeAssetVisibility: (assetId: string, visibility: "PRIVATE" | "SPACE") => Promise<QueryAsset>;
  refreshModule: (moduleId: string) => Promise<DashboardRecord>;
  upgradeModule: (moduleId: string, input: {
    queryVersionId: string;
    outputKey?: string;
    confirmedSchemaChange: boolean;
    columnMapping?: Record<string, string>;
  }) => Promise<DashboardRecord>;
  saveSchedule: (moduleId: string, input: RefreshScheduleInput) => Promise<RefreshSchedule>;
  planLayout: (request: unknown) => Promise<LayoutPlan>;
};

export type DashboardDesignerHandle = {
  unmount: () => void;
  /** 当前画布上的 schema（深拷贝）。 */
  getSchema: () => DashboardSchema;
  /** 整份替换画布并落成一步撤销历史，画布上会弹出提示。 */
  applySchema: (schema: DashboardSchema, notice?: string) => Promise<void>;
  /** React 侧关掉面板后同步工具栏按钮的按压态。 */
  setSmartPanelOpen: (open: boolean) => void;
};

/** DashboardDesignerApp 通过 defineExpose 暴露给宿主的那几个方法。 */
type DashboardDesignerExposed = Pick<DashboardDesignerHandle, "getSchema" | "applySchema" | "setSmartPanelOpen">;

const mountedApps = new WeakMap<HTMLElement, VueApp>();
const unavailableDataActions: DashboardDesignerDataActions = {
  listAssets: async () => [],
  previewAsset: async () => { throw new Error("查询资产服务尚未连接"); },
  reaskAsset: async () => { throw new Error("查询资产服务尚未连接"); },
  promoteVersion: async () => { throw new Error("查询资产服务尚未连接"); },
  changeAssetVisibility: async () => { throw new Error("查询资产服务尚未连接"); },
  refreshModule: async () => { throw new Error("看板刷新服务尚未连接"); },
  upgradeModule: async () => { throw new Error("看板版本服务尚未连接"); },
  saveSchedule: async () => { throw new Error("看板调度服务尚未连接"); },
  planLayout: async () => ({ source: "LOCAL", intents: [], message: "使用本地排版" })
};

export function mountDashboardDesigner(
  element: HTMLElement,
  options: DashboardDesignerMountOptions
): DashboardDesignerHandle {
  mountedApps.get(element)?.unmount();

  const app = createApp(DashboardDesignerApp, {
    initialSchema: options.record.schema,
    initialRevision: options.record.revision,
    initialStatus: options.record.status,
    initialVisibility: options.record.visibility ?? "PRIVATE",
    initialResourcePanel: options.initialResourcePanel,
    initialAssetId: options.initialAssetId,
    initialSmartPanelOpen: options.initialSmartPanelOpen,
    onSmartPanelToggle: options.onSmartPanelToggle,
    saveDraft: options.saveDraft,
    publishDashboard: options.publishDashboard,
    dataActions: options.dataActions ?? unavailableDataActions,
    exit: options.exit,
    onDirtyChange: options.onDirtyChange,
    onChange: options.onChange,
    onReady: options.onReady
  });

  app.config.errorHandler = (error) => {
    options.onError?.(error instanceof Error ? error : new Error(String(error)));
  };
  const exposed = app.mount(element) as unknown as DashboardDesignerExposed;
  mountedApps.set(element, app);

  return {
    unmount() {
      if (mountedApps.get(element) === app) {
        mountedApps.delete(element);
      }
      app.unmount();
      element.replaceChildren();
    },
    getSchema: () => exposed.getSchema(),
    applySchema: (schema, notice) => exposed.applySchema(schema, notice),
    setSmartPanelOpen: (open) => exposed.setSmartPanelOpen(open)
  };
}
