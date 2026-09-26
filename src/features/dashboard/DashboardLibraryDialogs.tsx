import { Input, Modal } from "antd";
import type { DashboardLibrary } from "./useDashboardLibrary";

/** 新建看板弹窗：「我的看板」与「看板广场」共用同一个创建流。 */
export function DashboardCreateDialog({ library, className }: { library: DashboardLibrary; className?: string }) {
  const { createDialogOpen, createSource, createTitle, createMutation } = library;

  return (
    <Modal
      className={className}
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
 * 删除确认。删除是软删除：服务层调的是 archiveDashboard（POST .../archive），后端没有真删除也没有恢复接口，
 * 归档后列表、运行态和分享链接都读不到，对用户就是删掉了，所以文案直说「无法恢复」，不许诺做不到的还原。
 * 后端只允许作者归档，入口按 isOwnedByUser 只对作者显示。
 */
export function DashboardDeleteDialog({
  library,
  className,
  onDeleted
}: {
  library: DashboardLibrary;
  className?: string;
  onDeleted?: (id: string) => void;
}) {
  const { deleteCandidate, deleteMutation } = library;

  return (
    <Modal
      className={className}
      title="删除看板"
      open={Boolean(deleteCandidate)}
      okText="确认删除"
      cancelText="取消"
      okButtonProps={{ danger: true }}
      confirmLoading={deleteMutation.isPending}
      destroyOnHidden
      onCancel={() => library.setDeleteCandidate(null)}
      onOk={() => {
        if (!deleteCandidate) return;
        deleteMutation.mutate(deleteCandidate.id, {
          onSuccess: () => {
            onDeleted?.(deleteCandidate.id);
            library.setDeleteCandidate(null);
          }
        });
      }}
    >
      <p>删除“{deleteCandidate?.schema.title}”？删除后无法恢复，已分享的链接也会失效。</p>
    </Modal>
  );
}
