import { useQuery } from "@tanstack/react-query";
import { sessionQueryKey, useSessionQueryScope } from "@/app/sessionQuery";
import { getDashboardRuntime, getDashboardRuntimeInitialData } from "@/services/dashboardAnalyticsService";
import { GearSix, MagicWand, Plus } from "@phosphor-icons/react";
import { Button, ConfigProvider, Dropdown, Modal, Select, type MenuProps, type ThemeConfig } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { XsEmptyState } from "@/components/xs/XsEmptyState";
import { XsStatusBar } from "@/components/xs/XsStatusBar";
import { xsEnterStep } from "@/components/xs/motion";
import {
  DashboardArchiveDialog,
  DashboardCreateDialog
} from "@/features/dashboard/DashboardLibraryDialogs";
import { hasCompletedDashboardOnboarding } from "@/features/dashboard/DashboardOnboarding";
import {
  readCurrentDashboardId,
  resolveCurrentDashboard,
  writeCurrentDashboardId
} from "@/features/dashboard/currentDashboard";
import {
  dashboardEditorPath,
  useDashboardLibrary
} from "@/features/dashboard/useDashboardLibrary";
import { DashboardRuntimeIsland } from "@/features/dashboardStudio/DashboardRuntimeIsland";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import { useUiStore } from "@/stores/uiStore";
import { PageFrame } from "./PageFrame";
import "./styles/page-shell.css";
import "./styles/dashboard-list.css";
import "./styles/dashboard-workspace.css";

const dashboardWorkspaceTheme: ThemeConfig = {
  token: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    fontSize: 13,
    fontWeightStrong: 500,
    colorText: "#1a1c1f",
    colorTextSecondary: "#62676e",
    colorBorder: "#e0e2e5",
    colorBgContainer: "#ffffff",
    colorBgElevated: "#ffffff",
    controlHeight: 32,
    borderRadius: 8
  },
  components: {
    Button: {
      fontWeight: 500,
      primaryShadow: "none"
    },
    Select: { optionSelectedBg: "#f0f1f2", optionSelectedColor: "#1a1c1f", optionSelectedFontWeight: 500 },
    Modal: { titleFontSize: 18, titleColor: "#1a1c1f" }
  }
};

function formatDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(date);
}

export function DashboardPage() {
  const navigate = useNavigate();
  const library = useDashboardLibrary();
  const sessionScope = useSessionQueryScope();
  const userId = useDataHubAuthStore((state) => state.user?.userId);
  const dashboardOnboardingOpen = useUiStore((state) => state.dashboardOnboardingOpen);
  const setDashboardOnboardingOpen = useUiStore((state) => state.setDashboardOnboardingOpen);
  const [currentId, setCurrentId] = useState<string | null>(() => readCurrentDashboardId());
  const [versionsOpen, setVersionsOpen] = useState(false);

  const { dashboardsQuery, records } = library;
  const current = resolveCurrentDashboard(records, currentId, userId);
  const runtimeQuery = useQuery({
    queryKey: sessionQueryKey(sessionScope, "analytics-dashboard-runtime", current?.id ?? null),
    enabled: current?.status === "published",
    initialData: () => getDashboardRuntimeInitialData(current?.id ?? null),
    retry: false,
    queryFn: async () => {
      const record = await getDashboardRuntime(current!.id);
      if (!record) throw new Error("未找到运行态大屏");
      return record;
    }
  });
  const versions = [...(current?.versions ?? [])].sort((left, right) => right.version - left.version);
  const shareLink = current ? library.shareLinks[current.id] : undefined;

  function selectCurrent(id: string) {
    setCurrentId(id);
    writeCurrentDashboardId(id);
  }

  useEffect(() => {
    if (
      import.meta.env.MODE === "test" ||
      dashboardsQuery.isPending ||
      dashboardsQuery.isError ||
      records.length > 0 ||
      dashboardOnboardingOpen ||
      hasCompletedDashboardOnboarding(userId)
    ) {
      return undefined;
    }

    const timer = window.setTimeout(() => setDashboardOnboardingOpen(true), 300);
    return () => window.clearTimeout(timer);
  }, [
    dashboardOnboardingOpen,
    dashboardsQuery.isError,
    dashboardsQuery.isPending,
    records.length,
    setDashboardOnboardingOpen,
    userId
  ]);

  useEffect(
    () => () => setDashboardOnboardingOpen(false),
    [setDashboardOnboardingOpen]
  );

  const settingsItems: MenuProps["items"] = [
    { key: "edit", label: "编辑" },
    { key: "copy", label: "复制", disabled: library.copyMutation.isPending },
    { key: "versions", label: "版本回滚" },
    { key: "share", label: "分享", disabled: current?.status !== "published" },
    { type: "divider" },
    { key: "archive", label: "归档", danger: true }
  ];

  function handleSettingsClick({ key }: { key: string }) {
    if (!current) return;
    if (key === "edit") navigate(dashboardEditorPath(current.id));
    if (key === "copy") library.copyMutation.mutate(current);
    if (key === "versions") setVersionsOpen(true);
    if (key === "share") void library.copyShareLink(current);
    if (key === "archive") library.setArchiveCandidate(current);
  }

  const hasWorkbench = records.length > 0 && !dashboardsQuery.isLoading && !dashboardsQuery.isError;
  /* 已发布的看板展示的是 publishedSchema，来源要跟着运行态那份读，别拿草稿的 */
  const runtimeSource = (current?.publishedSchema ?? current?.schema)?.source;

  return (
    <ConfigProvider theme={dashboardWorkspaceTheme}>
    <PageFrame
      className="dashboard-list dashboard-current"
      title="我的看板"
      actions={(
        <div className="dashboard-current__toolbar">
          {hasWorkbench && current ? (
            <Select
              className="dashboard-current__switch"
              aria-label="切换当前看板"
              value={current.id}
              popupMatchSelectWidth={false}
              classNames={{ popup: { root: "dashboard-workspace-popup" } }}
              options={records.map((record) => ({ value: record.id, label: record.schema.title }))}
              onChange={selectCurrent}
            />
          ) : null}
          <Button
            type="primary"
            icon={<Plus size={15} aria-hidden="true" />}
            disabled={library.createMutation.isPending}
            data-testid="create-dashboard-button"
            onClick={() => library.requestCreate("blank")}
          >
            新建看板
          </Button>
          <Button
            icon={<MagicWand size={16} aria-hidden="true" />}
            onClick={() => navigate(
              current ? `${dashboardEditorPath(current.id)}&smart=1` : "/dashboard-editor?smart=1"
            )}
          >
            智享大屏
          </Button>
          <Button onClick={() => navigate("/dashboard/square")}>看板广场</Button>
          {hasWorkbench && current ? (
            <Dropdown
              overlayClassName="dashboard-workspace-popup"
              menu={{ items: settingsItems, onClick: handleSettingsClick }}
              placement="bottomRight"
              trigger={["click"]}
            >
              <Button aria-label="当前看板设置" icon={<GearSix size={18} aria-hidden="true" />} />
            </Dropdown>
          ) : null}
        </div>
      )}
    >
      {library.operationError ? (
        <XsStatusBar
          slotClassName="dashboard-list__alert-slot"
          tone="error"
          message={library.operationError}
          transitionKey={library.operationError}
        />
      ) : null}

      {dashboardsQuery.isLoading ? (
        <div
          className="dashboard-current__stage dashboard-current__stage--loading xs-page-enter"
          style={xsEnterStep(1)}
          aria-busy="true"
          aria-label="正在加载当前看板"
        >
          <span className="dashboard-list__skeleton dashboard-list__skeleton--title" />
          <span className="dashboard-list__skeleton" />
        </div>
      ) : dashboardsQuery.isError ? (
        <XsEmptyState
          tone="error"
          title="看板列表暂不可用"
          description={dashboardsQuery.error instanceof Error ? dashboardsQuery.error.message : "请稍后重试"}
          actionLabel="重试"
          onAction={() => void dashboardsQuery.refetch()}
        />
      ) : !current ? (
        <XsEmptyState
          ariaLabel="我的看板空状态"
          eyebrow="暂无看板"
          title="创建第一个看板"
          description="新建一块空白看板，或去看板广场挑一块设为当前看板。"
          secondaryActionLabel="看板广场"
          onSecondaryAction={() => navigate("/dashboard/square")}
          actionLabel="新建看板"
          onAction={() => library.requestCreate("blank")}
        />
      ) : (
        <>
          {/* 页面唯一一条 meta：状态、来源、更新时间、分享链都收在这里，运行态内部不再重复 */}
          <p className="dashboard-current__meta xs-page-enter" style={xsEnterStep(1)}>
            <span className={`dashboard-current__status is-${current.status}`}>
              {current.status === "published" ? "已发布" : "草稿"}
            </span>
            <span className="dashboard-current__fact">
              {runtimeSource?.kind === "ask-data" ? "智能问数" : "手动配置"}
            </span>
            <span className="dashboard-current__fact">更新于 {formatDateTime(current.updatedAt)}</span>
            {shareLink ? (
              <a className="dashboard-current__share" href={shareLink} title={shareLink}>{shareLink}</a>
            ) : null}
          </p>
          <section
            className={`dashboard-current__stage xs-page-enter${current.status === "published" && runtimeQuery.isLoading ? " dashboard-current__stage--loading" : ""}`}
            style={xsEnterStep(2)}
            aria-label={`当前看板：${current.schema.title}`}
          >
            {current.status !== "published" ? (
              <DashboardRuntimeIsland record={current} fullscreen={false} />
            ) : runtimeQuery.isLoading ? (
              <div className="dashboard-runtime-island__state" role="status" aria-label="正在加载看板数据">正在加载看板数据…</div>
            ) : runtimeQuery.isError || !runtimeQuery.data ? (
              <XsEmptyState
                tone="error"
                title="看板数据暂不可用"
                description={runtimeQuery.error instanceof Error ? runtimeQuery.error.message : "未找到运行态大屏"}
                actionLabel="重试"
                onAction={() => void runtimeQuery.refetch()}
              />
            ) : <DashboardRuntimeIsland record={runtimeQuery.data} fullscreen={false} />}
          </section>
        </>
      )}

      <DashboardCreateDialog library={library} className="dashboard-workspace-dialog" />
      <DashboardArchiveDialog library={library} className="dashboard-workspace-dialog" onArchived={() => setCurrentId(null)} />

      <Modal
        className="dashboard-workspace-dialog"
        title="版本回滚"
        open={versionsOpen}
        footer={null}
        destroyOnHidden
        onCancel={() => setVersionsOpen(false)}
      >
        {versions.length === 0 ? (
          <p className="dashboard-current__versions-state">暂无已发布版本</p>
        ) : (
          <ul className="dashboard-card__version-list">
            {versions.map((version) => (
              <li key={version.id}>
                <span>v{version.version}<small>{formatDateTime(version.publishedAt)}</small></span>
                <button
                  type="button"
                  disabled={library.rollbackMutation.isPending}
                  onClick={() => {
                    if (!current) return;
                    library.rollbackMutation.mutate(
                      { record: current, version },
                      { onSuccess: () => setVersionsOpen(false) }
                    );
                  }}
                >回滚</button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </PageFrame>
    </ConfigProvider>
  );
}
