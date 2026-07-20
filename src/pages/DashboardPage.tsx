import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import { getBrowserDashboardRepository } from "@/services/dashboardRepositoryService";
import type { DashboardRecord, DashboardVersion } from "@/types/dashboardStudio";
import "./styles/dashboard-list.css";

type ListState = "loading" | "success" | "error";
type RowAction = "copy" | "archive" | "share" | "versions" | "rollback";
type VersionState =
  | { status: "loading"; versions: []; error: "" }
  | { status: "success"; versions: DashboardVersion[]; error: "" }
  | { status: "error"; versions: []; error: string };

function formatDate(value?: string) {
  if (!value) return "未发布";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "大屏库暂不可用";
}

function dashboardEditorPath(id: string) {
  return `/dashboard-editor?draft=${encodeURIComponent(id)}`;
}

function dashboardRuntimePath(id: string) {
  return `/dashboard-view?dashboard=${encodeURIComponent(id)}`;
}

function sortVersions(versions: DashboardVersion[]) {
  return [...versions].sort((left, right) => right.version - left.version);
}

function DashboardVersionPanel({
  state,
  busy,
  onRollback
}: {
  state: VersionState;
  busy: boolean;
  onRollback: (version: DashboardVersion) => void;
}) {
  return (
    <div className="dashboard-list__versions" aria-busy={state.status === "loading"}>
      <p className="dashboard-list__versions-title">版本</p>
      {state.status === "loading" ? (
        <p className="dashboard-list__versions-state">正在加载版本</p>
      ) : state.status === "error" ? (
        <p className="dashboard-list__versions-state is-error">{state.error}</p>
      ) : state.versions.length === 0 ? (
        <p className="dashboard-list__versions-state">暂无已发布版本</p>
      ) : (
        <ul className="dashboard-list__version-list">
          {state.versions.map((version) => (
            <li key={version.id}>
              <span>
                v{version.version}
                <small>无发布说明 - {formatDate(version.publishedAt)}</small>
              </span>
              <button type="button" disabled={busy} onClick={() => onRollback(version)}>
                {busy ? "回滚中" : "回滚"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const repository = useMemo(() => getBrowserDashboardRepository(), []);
  const [records, setRecords] = useState<DashboardRecord[]>([]);
  const [listState, setListState] = useState<ListState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [activeRowActions, setActiveRowActions] = useState<Partial<Record<string, RowAction>>>({});
  const [shareLinks, setShareLinks] = useState<Record<string, string>>({});
  const [versionStates, setVersionStates] = useState<Record<string, VersionState>>({});

  const setRowAction = (id: string, action?: RowAction) => {
    setActiveRowActions((current) => {
      if (action) return { ...current, [id]: action };
      return Object.fromEntries(Object.entries(current).filter(([recordId]) => recordId !== id));
    });
  };

  const isRowBusy = (id: string, action?: RowAction) => {
    const activeAction = activeRowActions[id];
    return action ? activeAction === action : Boolean(activeAction);
  };

  const loadDashboards = () => {
    setListState("loading");
    setErrorMessage("");

    try {
      setRecords(repository.list());
      setListState("success");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      setListState("error");
    }
  };

  useEffect(() => {
    loadDashboards();
    // The repository instance is stable for the lifetime of this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createDashboard = () => {
    setIsCreating(true);
    setErrorMessage("");

    try {
      const record = repository.saveDraft(createBlankDashboard({ title: "未命名大屏" }));
      navigate(dashboardEditorPath(record.id));
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      setListState(records.length > 0 ? "success" : "error");
    } finally {
      setIsCreating(false);
    }
  };

  const copyDashboard = (record: DashboardRecord) => {
    setRowAction(record.id, "copy");
    setErrorMessage("");

    try {
      const copyIdentity = createBlankDashboard({ title: `${record.schema.title} 副本` });
      const copiedRecord = repository.copy(record.id, copyIdentity);
      navigate(dashboardEditorPath(copiedRecord.id));
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setRowAction(record.id);
    }
  };

  const archiveDashboard = (record: DashboardRecord) => {
    const confirmed = window.confirm(`归档“${record.schema.title}”？它会从大屏库中移除。`);
    if (!confirmed) return;

    setRowAction(record.id, "archive");
    setErrorMessage("");

    try {
      repository.archive(record.id);
      setRecords((current) => current.filter((item) => item.id !== record.id));
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setRowAction(record.id);
    }
  };

  const createShareLink = (record: DashboardRecord) => {
    if (record.status !== "published") return;

    setRowAction(record.id, "share");
    setErrorMessage("");

    try {
      const shareToken = repository.createShareToken(record.id);
      const shareUrl = new URL(`/dashboard-view?share=${encodeURIComponent(shareToken)}`, window.location.origin).toString();
      setShareLinks((current) => ({ ...current, [record.id]: shareUrl }));
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setRowAction(record.id);
    }
  };

  const loadVersions = (record: DashboardRecord) => {
    setRowAction(record.id, "versions");
    setVersionStates((current) => ({
      ...current,
      [record.id]: { status: "loading", versions: [], error: "" }
    }));

    try {
      const freshRecord = repository.get(record.id);
      if (!freshRecord) throw new Error("大屏不存在或已归档");
      setVersionStates((current) => ({
        ...current,
        [record.id]: { status: "success", versions: sortVersions(freshRecord.versions ?? []), error: "" }
      }));
    } catch (error) {
      setVersionStates((current) => ({
        ...current,
        [record.id]: { status: "error", versions: [], error: getErrorMessage(error) }
      }));
    } finally {
      setRowAction(record.id);
    }
  };

  const rollbackVersion = (record: DashboardRecord, version: DashboardVersion) => {
    if (!window.confirm(`将“${record.schema.title}”回滚到版本 ${version.version}？`)) return;

    setRowAction(record.id, "rollback");
    setErrorMessage("");

    try {
      const rolledBack = repository.rollback(record.id, version.version, record.revision);
      setRecords((current) => current.map((item) => item.id === record.id ? rolledBack : item));
      setVersionStates((current) => ({
        ...current,
        [record.id]: { status: "success", versions: sortVersions(rolledBack.versions ?? []), error: "" }
      }));
    } catch (error) {
      setVersionStates((current) => ({
        ...current,
        [record.id]: { status: "error", versions: [], error: getErrorMessage(error) }
      }));
    } finally {
      setRowAction(record.id);
    }
  };

  return (
    <main className="dashboard-list">
      <header className="dashboard-list__header">
        <div className="dashboard-list__title-group">
          <h1>大屏库</h1>
        </div>
        <button
          className="dashboard-list__primary-action"
          type="button"
          disabled={isCreating}
          data-testid="create-dashboard-button"
          onClick={createDashboard}
        >
          {isCreating ? "创建中" : "新建大屏"}
        </button>
      </header>

      {listState === "loading" ? (
        <section className="dashboard-list__panel" aria-busy="true">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="dashboard-list__skeleton-row">
              <span className="dashboard-list__skeleton dashboard-list__skeleton--title" />
              <span className="dashboard-list__skeleton" />
              <span className="dashboard-list__skeleton dashboard-list__skeleton--short" />
            </div>
          ))}
        </section>
      ) : listState === "error" ? (
        <section className="dashboard-list__state dashboard-list__state--error">
          <p className="dashboard-list__eyebrow">加载失败</p>
          <h2>大屏库暂不可用</h2>
          <p>{errorMessage}</p>
          <button type="button" onClick={loadDashboards}>重试</button>
        </section>
      ) : records.length === 0 ? (
        <section className="dashboard-list__state" aria-label="大屏库空状态">
          <p className="dashboard-list__eyebrow">暂无大屏</p>
          <h2>创建第一个大屏</h2>
          <p>已发布的大屏和草稿会显示在这里。</p>
          <button type="button" disabled={isCreating} onClick={createDashboard}>
            {isCreating ? "创建中" : "新建大屏"}
          </button>
        </section>
      ) : (
        <section className="dashboard-list__panel" aria-label="大屏库">
          {errorMessage ? (
            <p className="dashboard-list__inline-error" role="status">{errorMessage}</p>
          ) : null}
          <table className="dashboard-list__table">
            <thead>
              <tr>
                <th scope="col">名称</th>
                <th scope="col">状态</th>
                <th scope="col">更新时间</th>
                <th scope="col">发布时间</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const editPath = dashboardEditorPath(record.id);
                const runtimePath = dashboardRuntimePath(record.id);
                const isPublished = record.status === "published";
                const versionState = versionStates[record.id];

                return (
                  <Fragment key={record.id}>
                    <tr>
                      <td className="dashboard-list__name-cell">
                        <Link className="dashboard-list__name-link" to={editPath}>
                          {record.schema.title}
                        </Link>
                        {shareLinks[record.id] ? (
                          <a
                            className="dashboard-list__share-link"
                            href={shareLinks[record.id]}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {shareLinks[record.id]}
                          </a>
                        ) : null}
                      </td>
                      <td>
                        <span className={`dashboard-list__status is-${record.status}`}>
                          {isPublished ? "已发布" : "草稿"}
                        </span>
                      </td>
                      <td>{formatDate(record.updatedAt)}</td>
                      <td>{formatDate(record.publishedAt)}</td>
                      <td>
                        <div className="dashboard-list__actions">
                          <Link className="dashboard-list__action" to={editPath}>编辑</Link>
                          <a
                            className={`dashboard-list__action${isPublished ? "" : " is-disabled"}`}
                            href={isPublished ? runtimePath : undefined}
                            target="_blank"
                            rel="noreferrer"
                            aria-disabled={!isPublished}
                            tabIndex={isPublished ? 0 : -1}
                            onClick={(event) => {
                              if (!isPublished) event.preventDefault();
                            }}
                          >
                            运行态
                          </a>
                          <button
                            type="button"
                            disabled={isRowBusy(record.id)}
                            onClick={() => copyDashboard(record)}
                          >
                            {isRowBusy(record.id, "copy") ? "复制中" : "复制"}
                          </button>
                          <button
                            type="button"
                            disabled={isRowBusy(record.id)}
                            onClick={() => loadVersions(record)}
                          >
                            {isRowBusy(record.id, "versions") ? "加载中" : "版本"}
                          </button>
                          <button
                            type="button"
                            disabled={!isPublished || isRowBusy(record.id)}
                            onClick={() => createShareLink(record)}
                          >
                            {isRowBusy(record.id, "share") ? "生成分享中" : "分享"}
                          </button>
                          <button
                            className="dashboard-list__danger"
                            type="button"
                            disabled={isRowBusy(record.id)}
                            onClick={() => archiveDashboard(record)}
                          >
                            {isRowBusy(record.id, "archive") ? "归档中" : "归档"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {versionState ? (
                      <tr className="dashboard-list__version-row">
                        <td colSpan={5}>
                          <DashboardVersionPanel
                            state={versionState}
                            busy={isRowBusy(record.id, "rollback")}
                            onRollback={(version) => rollbackVersion(record, version)}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
