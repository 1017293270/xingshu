import { Input, Modal } from "antd";
import type { DashboardLibrary } from "./useDashboardLibrary";

/** 新建看板弹窗：「我的看板」与「看板广场」共用同一个创建流。 */
export function DashboardCreateDialog({ library }: { library: DashboardLibrary }) {
  const { createDialogOpen, createSource, createTitle, createMutation } = library;

  return (
    <Modal
      title={createSource === "favorites" ? "从收藏问数创建看板" : "新建看板"}
      open={createDialogOpen}
      okText={createMutation.isPending ? "创建中" : "创建并进入编辑器"}
      cancelText="取消"
      confirmLoading={createMutation.isPending}
      okButtonProps={{ disabled: !createTitle.trim() }}
      destroyOnHidden
      onCancel={library.closeCreateDialog}
      onOk={library.submitCreate}
    >
      <label className="dashboard-list__create-label" htmlFor="dashboard-create-title">看板名称</label>
      <Input
        id="dashboard-create-title"
        autoFocus
        maxLength={80}
        placeholder="例如：华东区经营驾驶舱"
        value={createTitle}
        onChange={(event) => library.setCreateTitle(event.target.value)}
        onPressEnter={library.submitCreate}
      />
    </Modal>
  );
}

/**
 * 归档确认：服务层只有 archiveDashboard（POST .../archive），没有真删除也没有恢复接口，
 * 所以这里只说"归档"，不再把它伪装成删除，也不许诺一个前端做不到的还原入口。
 */
export function DashboardArchiveDialog({
  library,
  onArchived
}: {
  library: DashboardLibrary;
  onArchived?: (id: string) => void;
}) {
  const { archiveCandidate, archiveMutation } = library;

  return (
    <Modal
      title="归档看板"
      open={Boolean(archiveCandidate)}
      okText="确认归档"
      cancelText="取消"
      okButtonProps={{ danger: true }}
      confirmLoading={archiveMutation.isPending}
      destroyOnHidden
      onCancel={() => library.setArchiveCandidate(null)}
      onOk={() => {
        if (!archiveCandidate) return;
        archiveMutation.mutate(archiveCandidate.id, {
          onSuccess: () => {
            onArchived?.(archiveCandidate.id);
            library.setArchiveCandidate(null);
          }
        });
      }}
    >
      <p>归档“{archiveCandidate?.schema.title}”？归档后它会从看板广场移除，当前版本没有自助恢复入口。</p>
    </Modal>
  );
}
