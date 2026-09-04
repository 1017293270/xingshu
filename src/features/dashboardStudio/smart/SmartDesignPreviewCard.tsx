import { Check, WarningCircle } from "@phosphor-icons/react";
import { Button } from "antd";
import { getDashboardBoardTheme } from "@/features/dashboardStudio/core/dashboardBoardThemes";
import { resolveDashboardBoardThemeId } from "@/features/dashboardStudio/core/dashboardDesignApply";
import { dashboardDesignArchetypeCatalog } from "@/features/dashboardStudio/core/dashboardDesignArchetypes";
import { dashboardDesignWidgetRole } from "@/features/dashboardStudio/core/dashboardDesignContext";
import type { DashboardDesignChange, DashboardDesignRejection } from "@/types/dashboardDesign";
import type { DashboardSchema } from "@/types/dashboardStudio";

export type SmartDesignPreviewCardProps = {
  schema: DashboardSchema;
  changes: DashboardDesignChange[];
  rejected: DashboardDesignRejection[];
  status: "ready" | "applied" | "discarded";
  fallback?: boolean;
  /** 兜底原因：模型为什么没参与这次设计。 */
  fallbackReason?: string;
  onApply: () => void;
  onDiscard: () => void;
};

/**
 * 候选方案卡：色块示意 + 变更清单 + 应用/放弃。
 * 色块而不是真图表——候选还没上画布，几十张缩略图各挂一套 ECharts 会把面板拖死；
 * 用户真正要看的效果在「应用」之后的画布上，撤销一步就能回来。
 */
export function SmartDesignPreviewCard({
  schema,
  changes,
  rejected,
  status,
  fallback,
  fallbackReason,
  onApply,
  onDiscard
}: SmartDesignPreviewCardProps) {
  const theme = getDashboardBoardTheme(resolveDashboardBoardThemeId(schema));
  const archetype = dashboardDesignArchetypeCatalog.find((item) => item.id === schema.design?.archetype);
  const visible = schema.widgets.filter((widget) => widget.style.visible !== false);

  return (
    <article className="smart-design-card" data-status={status} aria-label="智享候选方案">
      {fallback ? (
        <p className="smart-design-card__fallback" role="status">
          <WarningCircle size={14} weight="bold" aria-hidden="true" />
          <span>
            {`模型未参与本次设计${fallbackReason ? `：${fallbackReason}` : ""}。这是本地规则版，检查后端是否已部署 /api/v1/dashboard-design 或场景是否绑定模型。`}
          </span>
        </p>
      ) : null}
      <header className="smart-design-card__head">
        <strong>{schema.title || "未命名大屏"}</strong>
        <span className="smart-design-card__meta">
          {theme.title}
          {archetype ? ` · ${archetype.title}` : ""}
          {` · ${visible.length} 个组件`}
          {fallback ? " · 本地兜底" : ""}
        </span>
      </header>
      <div
        className="smart-design-card__preview"
        role="img"
        aria-label={`${schema.title || "大屏"}布局示意，共 ${visible.length} 个组件`}
        style={{ aspectRatio: `${schema.canvas.width} / ${schema.canvas.height}`, background: theme.canvasBackground }}
      >
        {visible.map((widget) => (
          <span
            key={widget.id}
            className={`smart-design-card__block smart-design-card__block--${dashboardDesignWidgetRole(widget)}`}
            data-mode={theme.mode}
            style={{
              left: `${(widget.position.x / schema.canvas.width) * 100}%`,
              top: `${(widget.position.y / schema.canvas.height) * 100}%`,
              width: `${(widget.position.w / schema.canvas.width) * 100}%`,
              height: `${(widget.position.h / schema.canvas.height) * 100}%`
            }}
            title={widget.title}
          >
            {widget.title}
          </span>
        ))}
      </div>
      {changes.length > 0 || rejected.length > 0 ? (
        <div className="smart-design-card__changes">
          {changes.length > 0 ? (
            <ul aria-label="本轮变更">
              {changes.map((change, index) => (
                <li key={`${change.kind}-${change.widgetId ?? index}`}>{change.label}</li>
              ))}
            </ul>
          ) : null}
          {rejected.length > 0 ? (
            <ul className="smart-design-card__rejected" aria-label="未采纳项">
              {rejected.map((item, index) => (
                <li key={`${item.target}-${index}`}>
                  <WarningCircle size={13} weight="bold" aria-hidden="true" />
                  {item.target}：{item.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <footer className="smart-design-card__actions">
        {status === "applied" ? (
          <span className="smart-design-card__applied">
            <Check size={14} weight="bold" aria-hidden="true" />
            已应用到画布
          </span>
        ) : status === "discarded" ? (
          <span className="smart-design-card__applied">已放弃</span>
        ) : (
          <>
            <Button type="primary" size="small" autoInsertSpace={false} onClick={onApply}>应用</Button>
            <Button size="small" autoInsertSpace={false} onClick={onDiscard}>放弃</Button>
          </>
        )}
      </footer>
    </article>
  );
}
