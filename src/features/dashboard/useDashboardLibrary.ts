import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { sessionQueryKey, useSessionQueryScope } from "@/app/sessionQuery";
import { copyText } from "@/services/clipboard";
import {
  archiveDashboard,
  copyDashboard,
  createDashboard,
  getDashboardListInitialData,
  listDashboards,
  rollbackDashboard
} from "@/services/dashboardAnalyticsService";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import type { DashboardRecord, DashboardVersion } from "@/types/dashboardStudio";
import { clearCurrentDashboardId, readCurrentDashboardId } from "./currentDashboard";

export type DashboardCreateSource = "blank" | "favorites";

export function dashboardEditorPath(id: string, source?: "favorites") {
  const params = new URLSearchParams({ draft: id });
  if (source) params.set("source", source);
  return `/dashboard-editor?${params.toString()}`;
}

export function dashboardRuntimePath(id: string) {
  return `/dashboard-view?dashboard=${encodeURIComponent(id)}`;
}

/**
 * 「我的看板」与「看板广场」共用的看板列表读写：两页的新建 / 复制 / 归档 /
 * 版本回滚 / 分享必须是同一套语义，拆成两份实现迟早会走偏。
 */
export function useDashboardLibrary() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionScope = useSessionQueryScope();
  const dashboardsKey = sessionQueryKey(sessionScope, "analytics-dashboards");

  const [operationError, setOperationError] = useState("");
  const [shareLinks, setShareLinks] = useState<Record<string, string>>({});
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createSource, setCreateSource] = useState<DashboardCreateSource>("blank");
  const [archiveCandidate, setArchiveCandidate] = useState<DashboardRecord | null>(null);

  const dashboardsQuery = useQuery({
    queryKey: dashboardsKey,
    queryFn: listDashboards,
    initialData: getDashboardListInitialData,
    retry: false
  });
  const refreshList = () => queryClient.invalidateQueries({ queryKey: dashboardsKey });

  const createMutation = useMutation({
    mutationFn: ({ title }: { source: DashboardCreateSource; title: string }) =>
      createDashboard(createBlankDashboard({ title })),
    onSuccess: (record, variables) => {
      setCreateDialogOpen(false);
      navigate(dashboardEditorPath(record.id, variables.source === "favorites" ? "favorites" : undefined));
    },
    onError: (error) => setOperationError(error instanceof Error ? error.message : "创建看板失败")
  });

  const copyMutation = useMutation({
    mutationFn: copyDashboard,
    onSuccess: (record) => {
      queryClient.setQueryData<DashboardRecord[]>(dashboardsKey, (current = []) => [record, ...current]);
      navigate(dashboardEditorPath(record.id));
    },
    onError: (error) => setOperationError(error instanceof Error ? error.message : "复制看板失败")
  });

  const archiveMutation = useMutation({
    mutationFn: archiveDashboard,
    onSuccess: (_result, id) => {
      queryClient.setQueryData<DashboardRecord[]>(dashboardsKey, (current = []) =>
        current.filter((record) => record.id !== id));
      // 归档掉的正好是当前看板时，清掉本地指针，让页面回退到最近更新的一块
      if (readCurrentDashboardId() === id) clearCurrentDashboardId();
    },
    onError: (error) => setOperationError(error instanceof Error ? error.message : "归档看板失败")
  });

  const rollbackMutation = useMutation({
    mutationFn: ({ record, version }: { record: DashboardRecord; version: DashboardVersion }) =>
      rollbackDashboard(record, version),
    onSuccess: (_record, { record }) => {
      void queryClient.invalidateQueries({ queryKey: sessionQueryKey(sessionScope, "analytics-dashboard-runtime", record.id) });
      void refreshList();
    },
    onError: (error) => setOperationError(error instanceof Error ? error.message : "回滚版本失败")
  });

  const copyShareLink = async (record: DashboardRecord) => {
    const link = `${window.location.origin}${dashboardRuntimePath(record.id)}`;
    await copyText(link); // 复制失败也不打断：页面仍会展示链接
    setShareLinks((current) => ({ ...current, [record.id]: link }));
  };

  const requestCreate = (source: DashboardCreateSource) => {
    setOperationError("");
    setCreateSource(source);
    setCreateTitle("");
    setCreateDialogOpen(true);
  };

  const submitCreate = () => {
    const title = createTitle.trim();
    if (!title || createMutation.isPending) return;
    createMutation.mutate({ source: createSource, title });
  };

  return {
    dashboardsQuery,
    records: dashboardsQuery.data ?? [],
    refreshList,
    operationError,
    setOperationError,
    shareLinks,
    copyShareLink,
    createDialogOpen,
    createSource,
    createTitle,
    setCreateTitle,
    closeCreateDialog: () => setCreateDialogOpen(false),
    requestCreate,
    submitCreate,
    createMutation,
    copyMutation,
    archiveMutation,
    rollbackMutation,
    archiveCandidate,
    setArchiveCandidate
  };
}

export type DashboardLibrary = ReturnType<typeof useDashboardLibrary>;
