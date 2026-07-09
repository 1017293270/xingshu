import { Button } from "antd";
import { ArrowSquareOut, ArrowsClockwise } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { XsAsyncPanel } from "@/components/xs";
import { normalizeDashboardEditorUrl, probeDashboardEditor } from "@/services/dashboardEditorService";
import { PageFrame } from "./PageFrame";

const DEFAULT_DASHBOARD_EDITOR_URL = "http://127.0.0.1:5174/workbenches";

function getDashboardEditorUrl() {
  return import.meta.env.VITE_DASHBOARD_EDITOR_URL || DEFAULT_DASHBOARD_EDITOR_URL;
}

export function DashboardEditorPage() {
  const configuredEditorUrl = useMemo(() => getDashboardEditorUrl(), []);
  const dashboardEditorUrl = useMemo(
    () => normalizeDashboardEditorUrl(configuredEditorUrl),
    [configuredEditorUrl]
  );
  const [attempt, setAttempt] = useState(0);
  const [connectionState, setConnectionState] = useState<"probing" | "frame-loading" | "ready" | "error">(
    "probing"
  );

  useEffect(() => {
    const controller = new AbortController();
    setConnectionState("probing");

    void probeDashboardEditor(configuredEditorUrl, { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) {
        return;
      }
      setConnectionState(result.ok && dashboardEditorUrl ? "frame-loading" : "error");
    });

    return () => controller.abort();
  }, [attempt, configuredEditorUrl, dashboardEditorUrl]);

  useEffect(() => {
    if (connectionState !== "frame-loading") {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setConnectionState("error"), 10_000);
    return () => window.clearTimeout(timeoutId);
  }, [connectionState]);

  const reconnect = () => {
    setConnectionState("probing");
    setAttempt((current) => current + 1);
  };
  const connectionLabel =
    connectionState === "probing"
      ? "正在检查连接"
      : connectionState === "frame-loading"
        ? "正在加载编辑器"
        : connectionState === "ready"
          ? "已连接"
          : "暂不可用";

  return (
    <PageFrame
      title="看板编辑器"
      subtitle="自由画布、组件编排、预览发布"
      className="dashboard-editor-page"
      actions={
        <>
          <Button
            icon={<ArrowsClockwise size={18} />}
            disabled={connectionState === "probing"}
            onClick={reconnect}
          >
            刷新
          </Button>
          <Button
            type="primary"
            icon={<ArrowSquareOut size={18} />}
            href={dashboardEditorUrl ?? undefined}
            disabled={!dashboardEditorUrl}
            target="_blank"
            rel="noreferrer"
          >
            新窗口打开
          </Button>
        </>
      }
    >
      <section className="dashboard-editor-shell" aria-label="看板编辑器工作区">
        <div className="dashboard-editor-shell__status" data-state={connectionState}>
          <span>analytics-dashboard</span>
          <strong>{connectionLabel}</strong>
        </div>
        <div className="dashboard-editor-shell__frame">
          {connectionState === "probing" ? (
            <div className="dashboard-editor-shell__state">
              <XsAsyncPanel status="pending" empty={false} />
            </div>
          ) : null}
          {connectionState === "error" ? (
            <div className="dashboard-editor-shell__state">
              <XsAsyncPanel
                status="error"
                empty={false}
                errorTitle="暂时无法连接看板编辑器"
                error="请确认看板编辑器服务已启动，或联系管理员检查编辑器地址配置。"
                onRetry={reconnect}
              />
            </div>
          ) : null}
          {dashboardEditorUrl && (connectionState === "frame-loading" || connectionState === "ready") ? (
            <iframe
              key={attempt}
              className={connectionState === "frame-loading" ? "dashboard-editor-shell__iframe--loading" : undefined}
              title="看板编辑器子应用"
              src={dashboardEditorUrl}
              allow="fullscreen; clipboard-read; clipboard-write"
              referrerPolicy="no-referrer"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
              onLoad={() =>
                setConnectionState((current) => (current === "frame-loading" ? "ready" : current))
              }
              onError={() =>
                setConnectionState((current) => (current === "frame-loading" ? "error" : current))
              }
            />
          ) : null}
          {connectionState === "frame-loading" ? (
            <div className="dashboard-editor-shell__state dashboard-editor-shell__state--overlay">
              <XsAsyncPanel status="pending" empty={false} />
            </div>
          ) : null}
        </div>
      </section>
    </PageFrame>
  );
}
