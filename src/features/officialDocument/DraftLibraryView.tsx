import { ArrowsClockwise, Clock, DotsThree, MagnifyingGlass, Plus, WarningCircle } from "@phosphor-icons/react";
import { Button, Dropdown, Input, Modal } from "antd";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { XsAsyncPanel } from "@/components/xs/XsAsyncPanel";
import { XsStatusBar, type XsStatusTone } from "@/components/xs/XsStatusBar";
import type { OfficialDocumentDraft, OfficialDocumentDraftStatus } from "@/types/officialDocument";
import {
  draftStatusLabel,
  formatDate,
  templateIsUsable,
  useUpdateOfficialDocumentWorkspaceCache
} from "./officialDocumentMeta";
import {
  OFFICIAL_DOCUMENT_TEMPLATES_PATH,
  OfficialDocumentAppActions,
  useOfficialDocumentAppChrome
} from "./OfficialDocumentAppShell";
import { useOfficialDocumentWorkspace } from "./useOfficialDocumentWorkspace";
import "./official-document-workspace.css";
import "./official-document-templates.css";
import "./official-document-drafts.css";
import { templateIconForName } from "./templateIcons";
import { deleteOfficialDocumentDraft, renameOfficialDocumentDraft } from "@/services/officialDocumentService";

type DraftFilter = "ALL" | OfficialDocumentDraftStatus;

const draftFilters: Array<{ key: DraftFilter; label: string }> = [
  { key: "ALL", label: "全部" },
  { key: "EDITING", label: "编辑中" },
  { key: "VALIDATING", label: "校验中" },
  { key: "READY", label: "可导出" },
  { key: "BLOCKED", label: "有错误" }
];

export function DraftLibraryView() {
  const navigate = useNavigate();
  const location = useLocation();
  useOfficialDocumentAppChrome({ stage: "drafts", context: "我的文稿" });
  const { query, status } = useOfficialDocumentWorkspace();
  const [operationStatus, setOperationStatus] = useState(
    () => (location.state as { notice?: string } | null)?.notice ?? ""
  );
  const [operationTone, setOperationTone] = useState<XsStatusTone>(
    () => (location.state as { noticeTone?: XsStatusTone } | null)?.noticeTone ?? "info"
  );
  const [draftFilter, setDraftFilter] = useState<DraftFilter>("ALL");
  const [keyword, setKeyword] = useState("");
  const updateWorkspace = useUpdateOfficialDocumentWorkspaceCache();
  const [dialog, setDialog] = useState<{ kind: "rename" | "delete"; draft: OfficialDocumentDraft }>();
  const [title, setTitle] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [busy, setBusy] = useState(false);
  const openAction = (kind: "rename" | "delete", draft: OfficialDocumentDraft) => {
    setDialog({ kind, draft });
    setTitle(draft.title);
    setDialogError("");
  };
  const submitAction = async () => {
    if (!dialog || busy) return;
    setBusy(true);
    setDialogError("");
    try {
      if (dialog.kind === "rename") {
        const renamed = await renameOfficialDocumentDraft(dialog.draft.id, title);
        updateWorkspace((current) => ({ ...current, drafts: current.drafts.map((item) => item.id === renamed.id
          ? { ...item, ...renamed, templateName: item.templateName } : item) }));
      } else {
        await deleteOfficialDocumentDraft(dialog.draft.id);
        updateWorkspace((current) => ({ ...current, drafts: current.drafts.filter((item) => item.id !== dialog.draft.id) }));
      }
      setOperationTone("success");
      setOperationStatus(dialog.kind === "rename" ? "文稿已重命名" : "文稿已删除");
      setDialog(undefined);
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : "操作失败，请重试");
    } finally { setBusy(false); }
  };

  const drafts = query.data?.drafts ?? [];
  const usableTemplateCount = (query.data?.templates ?? [])
    .filter((template) => templateIsUsable(template)).length;
  const searchKeyword = keyword.trim().toLocaleLowerCase();
  const visibleDrafts = drafts.filter((draft) => (
    (draftFilter === "ALL" || draft.status === draftFilter)
    && (!searchKeyword || `${draft.title} ${draft.templateName}`.toLocaleLowerCase().includes(searchKeyword))
  )).sort((left, right) => (Date.parse(right.updatedAt) || 0) - (Date.parse(left.updatedAt) || 0));

  const handleCreateDraft = () => {
    if (usableTemplateCount === 0) {
      setOperationTone("warning");
      setOperationStatus("还没有可用格式模板，请先上传格式模板。");
      return;
    }
    navigate(OFFICIAL_DOCUMENT_TEMPLATES_PATH, {
      state: {
        notice: "选择格式模板后，即可编辑并保存文稿。",
        noticeTone: "info"
      }
    });
  };

  return (
    <section className="official-document-view official-document-drafts" aria-label="我的文稿">
      <OfficialDocumentAppActions>
        <Button type="text" className="official-document-drafts__refresh" aria-label="刷新文稿列表"
          title="刷新文稿列表" loading={query.isFetching} icon={<ArrowsClockwise size={18} aria-hidden="true" />}
          onClick={() => void query.refetch()} />
        <Button type="primary" icon={<Plus size={16} />} onClick={handleCreateDraft}>新建文稿</Button>
      </OfficialDocumentAppActions>

      {operationStatus ? (
        <XsStatusBar
          tone={operationTone}
          message={operationStatus}
          transitionKey={`${operationTone}:${operationStatus}`}
        />
      ) : null}

      <XsAsyncPanel
        status={status}
        empty={drafts.length === 0}
        emptyTitle="还没有文稿"
        emptyDescription="写作台生成的公文保存后会出现在这里，也可以选格式模板新建一份。"
        emptyActionLabel="选格式模板"
        onEmptyAction={() => navigate(OFFICIAL_DOCUMENT_TEMPLATES_PATH)}
        errorTitle="我的文稿暂不可用"
        error={query.error instanceof Error ? query.error.message : "无法加载文稿。"}
        onRetry={() => void query.refetch()}
        loadingVariant="rows"
        contentKey={query.dataUpdatedAt}
      >
        {/* 页面标题在细头部上，这里直接从筛选开始 */}
        <div className="official-document-templates">
          <div className="official-document-templates__toolbar">
            <div className="official-document-templates__filters" role="group" aria-label="文稿状态筛选">
              {draftFilters.map((filter) => (
                <button key={filter.key} type="button" aria-pressed={draftFilter === filter.key} onClick={() => setDraftFilter(filter.key)}>
                  {filter.label}<span>{filter.key === "ALL" ? drafts.length : drafts.filter((draft) => draft.status === filter.key).length}</span>
                </button>
              ))}
            </div>
            <Input className="official-document-templates__search" aria-label="搜索文稿标题" placeholder="搜索文稿标题或模板"
              prefix={<MagnifyingGlass size={17} aria-hidden="true" />} allowClear
              value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          </div>
          <span className="sr-only" role="status">当前显示 {visibleDrafts.length} 份文稿</span>
          {visibleDrafts.length ? (
            <ul className="official-document-templates__grid" role="list" aria-label="文稿列表">
              {visibleDrafts.map((draft) => (
                <li key={draft.id} className="official-document-template-card" data-status={draft.status}>
                  <button type="button" className="official-document-template-card__open"
                    aria-label={`打开文稿 ${draft.title}`} title="编辑文稿" onClick={() => navigate(`/writing/drafts/${draft.id}`)}>
                    <span className="official-document-template-card__identity">
                      <span className="official-document-template-card__glyph">
                        <img src={templateIconForName(draft.templateName)} width={28} height={28} alt="" aria-hidden="true" draggable={false} />
                      </span>
                      <span className="official-document-template-card__text">
                        <strong title={draft.title}>{draft.title}</strong>
                        <span className="official-document-template-card__meta">
                          <span>{draft.bindings.length} 个问数绑定</span>
                          <span aria-hidden="true">·</span>
                          <span title="文件版本">v{draft.currentFileVersionNo}</span>
                          <span aria-hidden="true">·</span>
                          <span className="official-document-template-card__status">
                            {draft.status === "BLOCKED" ? <WarningCircle size={14} aria-hidden="true" />
                              : draft.status === "VALIDATING" ? <Clock size={14} aria-hidden="true" /> : null}
                            {draftStatusLabel[draft.status]}
                          </span>
                        </span>
                      </span>
                    </span>
                    <span className="official-document-template-card__description">
                      <span title={draft.templateName}>{draft.templateName}</span>
                      <span className="official-document-template-card__updated">
                        更新于 <time dateTime={draft.updatedAt}>{formatDate(draft.updatedAt)}</time>
                      </span>
                    </span>
                  </button>
                  <Dropdown trigger={["click"]} menu={{ items: [
                    { key: "rename", label: "重命名", onClick: () => openAction("rename", draft) },
                    { key: "delete", label: "删除", danger: true, onClick: () => openAction("delete", draft) }
                  ] }}>
                    <button type="button" className="official-document-template-card__use" aria-label={`管理文稿 ${draft.title}`}
                      title="管理文稿"><DotsThree size={20} aria-hidden="true" /></button>
                  </Dropdown>
                </li>
              ))}
            </ul>
          ) : (
            <div className="official-document-templates__empty">
              <MagnifyingGlass size={28} aria-hidden="true" />
              <h2>没有符合条件的文稿</h2>
              <p>试试其他关键词，或清除筛选查看全部文稿。</p>
              <Button onClick={() => { setKeyword(""); setDraftFilter("ALL"); }}>清除筛选</Button>
            </div>
          )}
        </div>
      </XsAsyncPanel>
      <Modal open={Boolean(dialog)} title={dialog?.kind === "delete" ? "删除文稿" : "重命名文稿"}
        okText={dialog?.kind === "delete" ? "删除文稿" : "保存名称"} cancelText="取消"
        okButtonProps={{ danger: dialog?.kind === "delete", "aria-label": dialog?.kind === "delete" ? "删除文稿" : "保存名称" }} confirmLoading={busy}
        closable={!busy} maskClosable={!busy} cancelButtonProps={{ disabled: busy }}
        onCancel={() => { if (!busy) setDialog(undefined); }} onOk={() => void submitAction()}>
        {dialog?.kind === "delete" ? <p>确定删除“{dialog.draft.title}”？删除后将无法继续编辑，该文稿此前导出的文件链接也将无法访问。共享格式模板不受影响。</p>
          : <Input aria-label="文稿名称" value={title} maxLength={255} onChange={(event) => setTitle(event.target.value)} onPressEnter={() => void submitAction()} />}
        {dialogError ? <XsStatusBar tone="error" message={dialogError} /> : null}
      </Modal>
    </section>
  );
}
