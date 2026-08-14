import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import dashboardIcon from "@/assets/icon-kit/xingshu-image2-v1/icon-business-dashboard.png";
import type { DashboardRecord, DashboardVersion } from "@/types/dashboardStudio";

function formatDate(value?: string) {
  if (!value) return "未发布";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(date);
}

type DashboardCardProps = {
  record: DashboardRecord;
  editorPath: string;
  runtimePath: string;
  shareLink?: string;
  versionsExpanded: boolean;
  copying: boolean;
  archiving: boolean;
  rollingBack: boolean;
  onToggleVersions: () => void;
  onCopy: () => void;
  onShare: () => void;
  onArchive: () => void;
  onRollback: (version: DashboardVersion) => void;
};

export function DashboardCard({
  record,
  editorPath,
  runtimePath,
  shareLink,
  versionsExpanded,
  copying,
  archiving,
  rollingBack,
  onToggleVersions,
  onCopy,
  onShare,
  onArchive,
  onRollback
}: DashboardCardProps) {
  const published = record.status === "published";
  const [menuOpen, setMenuOpen] = useState(false);
  // 关闭时保留挂载约 110ms，让反向 fade+scale 播完再卸载（与进入动画对称）
  const [menuMounted, setMenuMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (menuOpen) {
      setMenuMounted(true);
      return undefined;
    }
    const timer = window.setTimeout(() => setMenuMounted(false), 110);
    return () => window.clearTimeout(timer);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const runMenuAction = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  const versions = [...(record.versions ?? [])].sort((a, b) => b.version - a.version);

  return (
    <article
      className={`dashboard-card${archiving ? " is-archiving" : ""}${copying ? " is-copying" : ""}`}
      aria-busy={archiving || copying}
    >
      <div className="dashboard-card__preview">
        <svg className="dashboard-card__orbit" viewBox="0 0 320 180" aria-hidden="true" focusable="false">
          <path d="M -20 150 Q 160 20 340 130" />
          <path d="M -20 170 Q 160 60 340 160" />
          <circle cx="248" cy="76" r="3" />
          <circle cx="92" cy="92" r="2.4" />
        </svg>
        <span className={`dashboard-card__status is-${record.status}`}>
          {published ? "已发布" : "草稿"}
        </span>
        <img className="dashboard-card__icon" src={dashboardIcon} alt="" />
        <div className="dashboard-card__actions">
          <Link className="dashboard-card__action" to={editorPath}>编辑</Link>
          <Link
            className={`dashboard-card__action${published ? "" : " is-disabled"}`}
            aria-disabled={!published}
            tabIndex={published ? undefined : -1}
            to={published ? runtimePath : "#"}
          >运行态</Link>
          <div className="dashboard-card__more" ref={menuRef}>
            <button
              type="button"
              className="dashboard-card__action dashboard-card__more-trigger"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`${record.schema.title} 更多操作`}
              onClick={() => setMenuOpen((open) => !open)}
            >⋯</button>
            {menuOpen || menuMounted ? (
              <ul className="dashboard-card__menu" role="menu" data-closing={!menuOpen || undefined}>
                <li role="none"><button type="button" role="menuitem" disabled={copying} onClick={runMenuAction(onCopy)}>复制</button></li>
                <li role="none"><button type="button" role="menuitem" onClick={runMenuAction(onToggleVersions)}>版本</button></li>
                <li role="none"><button type="button" role="menuitem" disabled={!published} onClick={runMenuAction(onShare)}>分享</button></li>
                <li role="none" className="dashboard-card__menu-separator" aria-hidden="true" />
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="dashboard-card__menu-danger"
                    disabled={archiving}
                    onClick={runMenuAction(onArchive)}
                  >归档</button>
                </li>
              </ul>
            ) : null}
          </div>
        </div>
      </div>
      <div className="dashboard-card__body">
        <Link className="dashboard-card__name" to={editorPath}>{record.schema.title}</Link>
        <p className="dashboard-card__meta">
          更新于 {formatDate(record.updatedAt)} · {published ? `发布于 ${formatDate(record.publishedAt)}` : "未发布"}
        </p>
        {shareLink ? (
          <a className="dashboard-card__share" href={shareLink} title={shareLink}>{shareLink}</a>
        ) : null}
      </div>
      {versionsExpanded ? (
        <div className="dashboard-card__versions">
          <p className="dashboard-card__versions-title">不可变发布版本</p>
          {versions.length === 0 ? (
            <p className="dashboard-card__versions-state">暂无已发布版本</p>
          ) : (
            <ul className="dashboard-card__version-list">
              {versions.map((version) => (
                <li key={version.id}>
                  <span>v{version.version}<small>{formatDate(version.publishedAt)}</small></span>
                  <button type="button" disabled={rollingBack} onClick={() => onRollback(version)}>回滚</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </article>
  );
}
