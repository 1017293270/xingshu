import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { DashboardRecord, DashboardSchema } from "@/types/dashboardStudio";
import type {
  DashboardDesignerHandle,
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
  saveDraft: (schema: DashboardSchema, expectedRevision: number) => Promise<DashboardRecord>;
  publishDashboard: (schema: DashboardSchema, expectedRevision: number) => Promise<DashboardRecord>;
  onExit: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onChange?: (schema: DashboardSchema) => void;
  loader?: DashboardDesignerLoader;
};

const defaultLoader: DashboardDesignerLoader = () => import("./vue/mountDashboardDesigner");

export function DashboardDesignerIsland({
  record,
  saveDraft,
  publishDashboard,
  onExit,
  onDirtyChange,
  onChange,
  loader = defaultLoader
}: DashboardDesignerIslandProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const optionsRef = useRef({ saveDraft, publishDashboard, onExit, onDirtyChange, onChange });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  optionsRef.current = { saveDraft, publishDashboard, onExit, onDirtyChange, onChange };

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
          saveDraft: (...args) => optionsRef.current.saveDraft(...args),
          publishDashboard: (...args) => optionsRef.current.publishDashboard(...args),
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
  }, [loadAttempt, loader, record.id]);

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
