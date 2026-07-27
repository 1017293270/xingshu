import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { DashboardRecord, DashboardSchema } from "@/types/dashboardStudio";
import type {
  DashboardDesignerHandle,
  DashboardDesignerDataActions,
  DashboardDesignerMountOptions
} from "./vue/mountDashboardDesigner";
import "./dashboardStudio.css";

type DashboardDesignerLoader = () => Promise<{
  mountDashboardDesigner: (
    element: HTMLElement,
    options: DashboardDesignerMountOptions
  ) => DashboardDesignerHandle;
}>;

type DashboardDesignerIslandProps = {
  record: DashboardRecord;
  saveDraft: (schema: DashboardSchema, expectedRevision: number, visibility: "PRIVATE" | "SPACE") => Promise<DashboardRecord>;
  publishDashboard: (schema: DashboardSchema, expectedRevision: number, visibility: "PRIVATE" | "SPACE") => Promise<DashboardRecord>;
  dataActions?: DashboardDesignerDataActions;
  initialResourcePanel?: "assets";
  initialAssetId?: string;
  onExit: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onChange?: (schema: DashboardSchema) => void;
  loader?: DashboardDesignerLoader;
};

const defaultLoader: DashboardDesignerLoader = () => import("./vue/mountDashboardDesigner");
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

export function DashboardDesignerIsland({
  record,
  saveDraft,
  publishDashboard,
  dataActions,
  initialResourcePanel,
  initialAssetId,
  onExit,
  onDirtyChange,
  onChange,
  loader = defaultLoader
}: DashboardDesignerIslandProps) {
  const effectiveDataActions = dataActions ?? unavailableDataActions;
  const mountRef = useRef<HTMLDivElement | null>(null);
  const optionsRef = useRef({ saveDraft, publishDashboard, dataActions: effectiveDataActions, onExit, onDirtyChange, onChange });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  optionsRef.current = { saveDraft, publishDashboard, dataActions: effectiveDataActions, onExit, onDirtyChange, onChange };

  useEffect(() => {
    const element = mountRef.current;
    if (!element) {
      return undefined;
    }

    let disposed = false;
    let handle: DashboardDesignerHandle | undefined;
    setState("loading");
    setErrorMessage("");

    void loader()
      .then((module) => {
        if (disposed) {
          return;
        }
        handle = module.mountDashboardDesigner(element, {
          record,
          initialResourcePanel,
          initialAssetId,
          saveDraft: (...args) => optionsRef.current.saveDraft(...args),
          publishDashboard: (...args) => optionsRef.current.publishDashboard(...args),
          dataActions: {
            listAssets: (...args) => optionsRef.current.dataActions.listAssets(...args),
            previewAsset: (...args) => optionsRef.current.dataActions.previewAsset(...args),
            reaskAsset: (...args) => optionsRef.current.dataActions.reaskAsset(...args),
            promoteVersion: (...args) => optionsRef.current.dataActions.promoteVersion(...args),
            changeAssetVisibility: (...args) => optionsRef.current.dataActions.changeAssetVisibility(...args),
            refreshModule: (...args) => optionsRef.current.dataActions.refreshModule(...args),
            upgradeModule: (...args) => optionsRef.current.dataActions.upgradeModule(...args),
            saveSchedule: (...args) => optionsRef.current.dataActions.saveSchedule(...args),
            planLayout: (...args) => optionsRef.current.dataActions.planLayout(...args)
          },
          exit: () => optionsRef.current.onExit(),
          onDirtyChange: (dirty) => optionsRef.current.onDirtyChange?.(dirty),
          onChange: (schema) => optionsRef.current.onChange?.(schema),
          onReady: () => {
            if (!disposed) setState("ready");
          },
          onError: (error) => {
            if (!disposed) {
              setState("error");
              setErrorMessage(error.message);
            }
          }
        });
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setState("error");
          setErrorMessage(error instanceof Error ? error.message : "设计器模块加载失败");
        }
      });

    return () => {
      disposed = true;
      handle?.unmount();
    };
  }, [initialAssetId, initialResourcePanel, loadAttempt, loader, record.id]);

  return (
    <div className="dashboard-designer-island" data-state={state}>
      <div ref={mountRef} className="dashboard-designer-island__mount" />
      {state === "loading" ? (
        <div className="dashboard-designer-island__overlay" role="status" aria-live="polite">
          <span className="dashboard-designer-island__loader" aria-hidden="true" />
          <strong>正在准备大屏设计器</strong>
          <p>加载画布、图表渲染器和问数数据绑定…</p>
        </div>
      ) : null}
      {state === "error" ? (
        <div className="dashboard-designer-island__overlay" role="alert">
          <span className="dashboard-designer-island__error-icon" aria-hidden="true">
            <WarningCircle size={24} />
          </span>
          <strong>大屏设计器暂时无法加载</strong>
          <p>{errorMessage || "请检查浏览器资源后重试。"}</p>
          <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
            <ArrowClockwise size={17} aria-hidden="true" />
            重新加载
          </button>
        </div>
      ) : null}
    </div>
  );
}
