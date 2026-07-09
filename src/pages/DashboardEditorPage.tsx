import { Button } from "antd";
import { ArrowSquareOut, ArrowsClockwise } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { PageFrame } from "./PageFrame";

const DEFAULT_DASHBOARD_EDITOR_URL = "http://127.0.0.1:5174/workbenches";

function getDashboardEditorUrl() {
  return import.meta.env.VITE_DASHBOARD_EDITOR_URL || DEFAULT_DASHBOARD_EDITOR_URL;
}

export function DashboardEditorPage() {
  const dashboardEditorUrl = useMemo(() => getDashboardEditorUrl(), []);
  const [frameKey, setFrameKey] = useState(0);

  return (
    <PageFrame
      title="看板编辑器"
      subtitle="自由画布、组件编排、预览发布"
      className="dashboard-editor-page"
      actions={
        <>
          <Button icon={<ArrowsClockwise size={18} />} onClick={() => setFrameKey((key) => key + 1)}>
            刷新
          </Button>
          <Button
            type="primary"
            icon={<ArrowSquareOut size={18} />}
            href={dashboardEditorUrl}
            target="_blank"
            rel="noreferrer"
          >
            新窗口打开
          </Button>
        </>
      }
    >
      <section className="dashboard-editor-shell" aria-label="看板编辑器工作区">
        <div className="dashboard-editor-shell__status">
          <span>analytics-dashboard</span>
          <strong>已嵌入</strong>
        </div>
        <div className="dashboard-editor-shell__frame">
          <iframe
            key={frameKey}
            title="看板编辑器子应用"
            src={dashboardEditorUrl}
            allow="fullscreen; clipboard-read; clipboard-write"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
          />
        </div>
      </section>
    </PageFrame>
  );
}
