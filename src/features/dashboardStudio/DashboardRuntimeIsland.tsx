import { WarningCircle } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { DashboardRecord } from "@/types/dashboardStudio";
import "./dashboardStudio.css";

type RuntimeHandle = { unmount: () => void };
type RuntimeOptions = { fullscreen?: boolean };
type RuntimeLoader = () => Promise<{
  mountDashboardRuntime: (
    element: HTMLElement,
    record: DashboardRecord,
    options?: RuntimeOptions
  ) => RuntimeHandle;
}>;

const defaultLoader: RuntimeLoader = () => import("./vue/mountDashboardRuntime");

export function DashboardRuntimeIsland({
  record,
  fullscreen = false,
  loader = defaultLoader
}: {
  record: DashboardRecord;
  fullscreen?: boolean;
  loader?: RuntimeLoader;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    const element = mountRef.current;
    if (!element) return undefined;
    let disposed = false;
    let handle: RuntimeHandle | undefined;
    setError("");
    setLoading(true);

    void loader()
      .then((module) => {
        if (!disposed) {
          handle = module.mountDashboardRuntime(element, record, { fullscreen });
          setLoading(false);
        }
      })
      .catch((reason: unknown) => {
        if (!disposed) {
          setLoading(false);
          setError(reason instanceof Error ? reason.message : "大屏渲染器加载失败");
        }
      });

    return () => {
      disposed = true;
      handle?.unmount();
    };
  }, [fullscreen, loader, record, retryVersion]);

  return (
    <div
      className={`dashboard-runtime-island${fullscreen ? " is-fullscreen" : ""}`}
      aria-label="问数生成大屏"
    >
      <div ref={mountRef} className="dashboard-runtime-island__mount" />
      {loading ? (
        <div className="dashboard-runtime-island__state" aria-busy="true">
          <span className="dashboard-runtime-island__skeleton dashboard-runtime-island__skeleton--wide" />
          <span className="dashboard-runtime-island__skeleton" />
          <span className="dashboard-runtime-island__skeleton dashboard-runtime-island__skeleton--short" />
        </div>
      ) : null}
      {error ? (
        <div className="dashboard-runtime-island__state dashboard-runtime-island__state--error" role="alert">
          <WarningCircle size={28} aria-hidden="true" />
          <strong>运行态暂不可用</strong>
          <p>{error}</p>
          <button type="button" onClick={() => setRetryVersion((value) => value + 1)}>重试</button>
        </div>
      ) : null}
    </div>
  );
}
