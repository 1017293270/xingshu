import {
  ArrowDown,
  ArrowUp,
  CaretLeft,
  CaretRight,
  Eye,
  FloppyDisk,
  Plus,
  Trash
} from "@phosphor-icons/react";
import { Button, Dropdown, Input, Modal, Select, Tag } from "antd";
import {
  createContext,
  memo,
  useContext,
  useCallback,
  type CSSProperties,
  type ReactElement,
  type Ref,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  getOfficialDocumentDraftContent,
  getOfficialDocumentDraftPreview,
  OfficialDocumentServiceError,
  getOfficialDocumentTemplatePreview,
  updateOfficialDocumentDraftContent
} from "@/services/officialDocumentService";
import {
  normalizeOfficialDocumentDraftBlocks,
  officialDocumentVariantId,
  parseOfficialDocumentAssistantText
} from "@/services/officialDocumentFullDraft";
import type {
  OfficialDocumentDraft,
  OfficialDocumentFactReview,
  OfficialDocumentDraftBlockRole,
  OfficialDocumentDraftContent,
  OfficialDocumentStructureNode
} from "@/types/officialDocument";
import { officialDocumentContentText } from "@/services/officialDocumentFactReview";
import { useSessionQueryScope } from "@/app/sessionQuery";
import {
  structuredDraftRecoveryKey, readStructuredDraftRecovery, writeStructuredDraftRecovery,
  clearStructuredDraftRecovery, sameStructuredDraftContent, type StructuredDraftRecovery
} from "./structuredDraftRecovery";
import { useDraftBlockMotion, type DraftBlock } from "./draftBlockMotion";
import { OfficialDocumentAppActions } from "./OfficialDocumentAppShell";

export type StructuredDraftSaveState = "loading" | "saving" | "saved" | "failed";

type EditableDraftBlockRole = Exclude<OfficialDocumentDraftBlockRole, "TABLE" | "CHART_IMAGE">;

const roleOptions: Array<{ value: EditableDraftBlockRole; label: string }> = [
  { value: "HEADING_1", label: "一级标题" },
  { value: "HEADING_2", label: "二级标题" },
  { value: "HEADING_3", label: "三级标题" },
  { value: "BODY", label: "正文" }
];

const roleLabels: Record<OfficialDocumentDraftBlockRole, string> = {
  HEADING_1: "一级标题",
  HEADING_2: "二级标题",
  HEADING_3: "三级标题",
  BODY: "正文",
  TABLE: "表格",
  CHART_IMAGE: "图表"
};

const rolePlaceholders: Record<OfficialDocumentDraftBlockRole, string> = {
  HEADING_1: "输入一级标题",
  HEADING_2: "输入二级标题",
  HEADING_3: "输入三级标题",
  BODY: "输入正文",
  TABLE: "表格",
  CHART_IMAGE: "图表"
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "草稿保存失败";
}

/**
 * 序号只在写回服务端时重排一次。编辑期间不动 order：删/插一条会让后面所有 block 换新对象，
 * 429 个节点的草稿里那就是整片卡片重渲染（实测阻塞 570ms）。渲染只认数组顺序。
 */
function normalizeOrders(blocks: OfficialDocumentDraftContent["blocks"]) {
  return blocks.map((block, order) => (block.order === order ? block : { ...block, order }));
}

function AddNodeTypeMenu({
  children,
  onSelect
}: {
  children: ReactElement;
  onSelect: (role: EditableDraftBlockRole) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dropdown
      trigger={["click"]}
      open={open}
      mouseEnterDelay={0}
      mouseLeaveDelay={0}
      destroyOnHidden
      getPopupContainer={() => document.body}
      onOpenChange={setOpen}
      menu={{
        items: roleOptions.map((option) => ({ key: option.value, label: option.label })),
        onClick: ({ key }) => {
          setOpen(false);
          onSelect(key as EditableDraftBlockRole);
        }
      }}
    >
      {children}
    </Dropdown>
  );
}

/** 节点序号是整张卡片里唯一跟着位置变的信息，单独走 context 订阅。 */
const DraftBlockOrderContext = createContext<Map<string, number>>(new Map());

/**
 * 序号叶子节点：删/插一条会让后面所有节点改号，序号若是卡片的 props，
 * 就要连带重渲染整片 antd 子树。这里改号只重渲染三个 span。
 */
const DraftBlockLabel = memo(function DraftBlockLabel({
  blockId,
  roleLabel,
  fixedOrder
}: {
  blockId: string;
  roleLabel: string;
  fixedOrder?: number;
}) {
  const orders = useContext(DraftBlockOrderContext);
  const order = (fixedOrder ?? orders.get(blockId) ?? 0) + 1;
  return (
    <>
      <span>节点 {order}</span>
      {fixedOrder === undefined ? (
        <>
          <span className="sr-only" id={`draft-block-name-${blockId}`}>{roleLabel}节点 {order}</span>
          <span className="sr-only" id={`draft-block-type-${blockId}`}>节点 {order} 类型</span>
        </>
      ) : null}
    </>
  );
});

/** 卡片只拿到这一份稳定引用，节点增删改不会因为回调换了新函数而击穿 memo。 */
type DraftBlockActions = {
  changeRole: (id: string, role: EditableDraftBlockRole) => void;
  move: (id: string, direction: -1 | 1) => void;
  insert: (afterId: string, role: EditableDraftBlockRole) => void;
  remove: (id: string) => void;
  setText: (id: string, text: string) => void;
};

const ghostActions: DraftBlockActions = {
  changeRole: () => undefined,
  move: () => undefined,
  insert: () => undefined,
  remove: () => undefined,
  setText: () => undefined
};

/**
 * 单个结构化节点卡片。ghost 形态用于删除动画的残影：不参与可访问性树、不接管交互，
 * 但复用同一套结构与样式，保证"被扔进回收站"的那张与原卡片像素一致。
 */
const DraftBlockCard = memo(function DraftBlockCard({
  block,
  isFirst,
  isLast,
  actions,
  ghost = false,
  ghostKey,
  ghostStyle,
  ghostOrder,
  highlighted = false,
  autoFocus = false
}: {
  block: DraftBlock;
  isFirst: boolean;
  isLast: boolean;
  actions: DraftBlockActions;
  ghost?: boolean;
  ghostKey?: string;
  ghostStyle?: CSSProperties;
  ghostOrder?: number;
  highlighted?: boolean;
  autoFocus?: boolean;
}) {
  const label = (text: string) => (ghost ? undefined : text);
  const labelledBy = (id: string) => (ghost ? undefined : id);
  const structured = block.role === "TABLE" || block.role === "CHART_IMAGE";
  return (
    <article
      className={ghost ? "structured-draft-editor__ghost" : undefined}
      data-role={block.role.toLocaleLowerCase()}
      data-block-id={ghost ? undefined : block.id}
      data-ghost-key={ghostKey}
      data-just-added={highlighted ? "true" : undefined}
      style={ghostStyle}
      aria-hidden={ghost || undefined}
      inert={ghost || undefined}
    >
      <div className="structured-draft-editor__block-tools">
        {structured ? (
          <Tag bordered={false} color="blue">{roleLabels[block.role]}</Tag>
        ) : (
          <Select
            aria-labelledby={labelledBy(`draft-block-type-${block.id}`)}
            size="small"
            value={block.role as EditableDraftBlockRole}
            options={roleOptions}
            popupMatchSelectWidth={false}
            getPopupContainer={() => document.body}
            classNames={{ popup: { root: "structured-draft-editor__role-dropdown" } }}
            onChange={(role: EditableDraftBlockRole) => actions.changeRole(block.id, role)}
          />
        )}
        <DraftBlockLabel blockId={block.id} roleLabel={roleLabels[block.role]} fixedOrder={ghostOrder} />
        <Button type="text" size="small" aria-label={label("上移节点")} disabled={isFirst} icon={<ArrowUp size={15} />} onClick={() => actions.move(block.id, -1)} />
        <Button type="text" size="small" aria-label={label("下移节点")} disabled={isLast} icon={<ArrowDown size={15} />} onClick={() => actions.move(block.id, 1)} />
        <AddNodeTypeMenu onSelect={(role) => actions.insert(block.id, role)}>
          <Button type="text" size="small" aria-label={label("在下方新增节点")} icon={<Plus size={15} />} />
        </AddNodeTypeMenu>
        <Button
          danger
          type="text"
          size="small"
          data-block-bin="true"
          aria-label={label("删除节点")}
          icon={<Trash size={15} />}
          onClick={() => actions.remove(block.id)}
        />
      </div>
      {block.role === "TABLE" && block.table ? (
        <div className="structured-draft-editor__table" role="region" aria-label={block.text || "数据表格"}>
          <table>
            <thead><tr>{block.table.columns.map((column, index) => <th key={`${column}:${index}`}>{column}</th>)}</tr></thead>
            <tbody>{block.table.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>{block.table!.columns.map((_, columnIndex) => <td key={columnIndex}>{row[columnIndex] ?? ""}</td>)}</tr>
            ))}</tbody>
          </table>
          {block.table.totalRows > block.table.rows.length ? <small>正文展示前 {block.table.rows.length} 行，共 {block.table.totalRows} 行；完整结果保留在问数资产。</small> : null}
        </div>
      ) : block.role === "CHART_IMAGE" && block.chart ? (
        <figure className="structured-draft-editor__chart">
          <img
            src={`data:${block.chart.mimeType};base64,${block.chart.base64}`}
            width={block.chart.widthPx}
            height={block.chart.heightPx}
            alt={block.chart.altText || block.text || "问数图表"}
          />
          {block.text ? <figcaption>{block.text}</figcaption> : null}
        </figure>
      ) : block.role === "BODY" ? (
        <Input.TextArea
          id={ghost ? undefined : `draft-block-${block.id}`}
          value={block.text}
          readOnly={ghost}
          autoFocus={autoFocus}
          autoSize={{ minRows: 4, maxRows: 16 }}
          placeholder={rolePlaceholders[block.role]}
          aria-labelledby={labelledBy(`draft-block-name-${block.id}`)}
          onChange={(event) => actions.setText(block.id, event.target.value)}
        />
      ) : (
        <Input
          id={ghost ? undefined : `draft-block-${block.id}`}
          value={block.text}
          readOnly={ghost}
          autoFocus={autoFocus}
          placeholder={rolePlaceholders[block.role]}
          aria-labelledby={labelledBy(`draft-block-name-${block.id}`)}
          onChange={(event) => actions.setText(block.id, event.target.value)}
        />
      )}
    </article>
  );
});

export type StructuredDraftEditorHandle = {
  /** 把回答解析成标题/正文节点后追加；一次提交，只触发一次自动保存。 */
  appendText: (text: string) => number;
  getContent: () => OfficialDocumentDraftContent | undefined;
  save: () => Promise<void>;
  reload: () => Promise<void>;
  saveFactReview: (review: OfficialDocumentFactReview) => Promise<OfficialDocumentDraftContent>;
  saveResearchResults: (results: NonNullable<OfficialDocumentDraftContent["researchResults"]>) => Promise<void>;
  applyBlocks: (blocks: OfficialDocumentDraftContent["blocks"]) => Promise<void>;
  normalizeForExport: () => Promise<number>;
};

export function StructuredDraftEditor({
  draft,
  templateNodes,
  onStatus,
  onSaveStateChange,
  onContentChange,
  ref
}: {
  draft: OfficialDocumentDraft;
  templateNodes: OfficialDocumentStructureNode[];
  onStatus: (tone: "loading" | "success" | "error", message: string) => void;
  onSaveStateChange?: (state: StructuredDraftSaveState) => void;
  onContentChange?: (content: OfficialDocumentDraftContent) => void;
  ref?: Ref<StructuredDraftEditorHandle>;
}) {
  const sessionScope = useSessionQueryScope();
  const recoveryKey = structuredDraftRecoveryKey(draft.id);
  const contextKey = `${sessionScope.join(":")}:${draft.id}:${recoveryKey}`;
  const [loadedContext, setLoadedContext] = useState("");
  const [recoveryNotice, setRecoveryNotice] = useState("");
  const [serverConflict, setServerConflict] = useState<OfficialDocumentDraftContent>();
  const [conflictArchive, setConflictArchive] = useState<StructuredDraftRecovery>();
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [previewKind, setPreviewKind] = useState<"draft" | "template">("draft");
  const [previewRevision, setPreviewRevision] = useState<number>();
  const [previewError, setPreviewError] = useState("");
  const contextEpochRef = useRef(0);
  const previewRequestRef = useRef(0);
  const dirtyRef = useRef(false);
  const recoveryIdRef = useRef<string | undefined>(undefined);
  const serverConflictRef = useRef<OfficialDocumentDraftContent | undefined>(undefined);
  const [content, setContent] = useState<OfficialDocumentDraftContent>();
  const [saveState, setSaveState] = useState<StructuredDraftSaveState>("loading");
  const [saveError, setSaveError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [fieldsCollapsed, setFieldsCollapsed] = useState(false);
  const [justAddedId, setJustAddedId] = useState<string>();
  const [addNotice, setAddNotice] = useState("");
  const pendingFocusIdRef = useRef<string | undefined>(undefined);
  const contentRef = useRef<OfficialDocumentDraftContent | undefined>(undefined);
  const revisionRef = useRef(0);
  const generationRef = useRef(0);
  const saveTimerRef = useRef<number | undefined>(undefined);
  const savingRef = useRef(false);
  const activeSaveRef = useRef<Promise<void> | undefined>(undefined);
  const pendingSaveRef = useRef(false);
  const applyingRef = useRef(false);
  const mountedRef = useRef(true);
  const previewUrlRef = useRef<string | undefined>(undefined);
  const performSaveRef = useRef<() => Promise<void>>(async () => undefined);
  const motion = useDraftBlockMotion();

  const slotNodes = useMemo(
    () => new Map(templateNodes.filter((node) => node.slotId).map((node) => [node.slotId!, node])),
    [templateNodes]
  );

  const persistRecovery = useCallback((snapshot: OfficialDocumentDraftContent) => {
    try {
      recoveryIdRef.current = writeStructuredDraftRecovery(recoveryKey, draft.templateVersionId, snapshot, serverConflictRef.current)?.id;
    } catch {
      setRecoveryNotice("浏览器未能保存本地副本，请使用保存草稿将修改保存到服务器。");
    }
  }, [recoveryKey, draft.templateVersionId]);

  const scheduleSave = () => {
    if (saveTimerRef.current !== undefined) window.clearTimeout(saveTimerRef.current);
    if (serverConflictRef.current) return;
    setSaveError("");
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = undefined;
      void performSaveRef.current().catch(() => undefined);
    }, 600);
  };

  const commit = (mutate: (current: OfficialDocumentDraftContent) => OfficialDocumentDraftContent) => {
    if (applyingRef.current || recoveryKey !== structuredDraftRecoveryKey(draft.id)) return;
    const current = contentRef.current;
    if (!current) return;
    const changed = mutate(current);
    const next = changed.factReview?.confirmedAt && officialDocumentContentText(changed) !== officialDocumentContentText(current)
      ? { ...changed, factReview: { ...changed.factReview, confirmedAt: undefined } } : changed;
    contentRef.current = next;
    generationRef.current += 1;
    dirtyRef.current = true;
    persistRecovery(next);
    setContent(next);
    setSaveState(serverConflictRef.current ? "failed" : "saving");
    // 预览对应旧内容，编辑后立刻撤下，不能拿旧PDF冒充当前稿。
    if (previewKind === "draft") {
      previewRequestRef.current += 1;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = undefined;
      setPreviewUrl(undefined);
      setPreviewRevision(undefined);
      setIsPreviewing(false);
      setPreviewError(previewOpen ? "草稿已更新，请重新生成当前稿预览" : "");
    }
    scheduleSave();
  };

  performSaveRef.current = () => {
    if (serverConflictRef.current) return Promise.reject(new Error("服务器已有新版本，本地修改已保留，可先对照再保存"));
    if (recoveryKey !== structuredDraftRecoveryKey(draft.id)) return Promise.reject(new Error("账号或空间已切换，请重新打开草稿"));
    if (savingRef.current) {
      pendingSaveRef.current = true;
      return activeSaveRef.current ?? Promise.reject(new Error("正文正在应用，请稍后保存"));
    }
    const snapshot = contentRef.current;
    if (!snapshot || !mountedRef.current) return Promise.reject(new Error("草稿内容尚未加载或编辑器已关闭"));
    const epoch = contextEpochRef.current;
    const backupId = recoveryIdRef.current;
    const operation = async () => {
      savingRef.current = true;
      pendingSaveRef.current = false;
      const capturedGeneration = generationRef.current;
      setSaveState("saving");
      setSaveError("");
      const acceptSaved = (saved: OfficialDocumentDraftContent) => {
        clearStructuredDraftRecovery(recoveryKey, backupId);
        if (!mountedRef.current || epoch !== contextEpochRef.current) return;
        revisionRef.current = saved.revision;
        const latest = contentRef.current;
        if (latest) {
          const next = { ...latest, revision: saved.revision };
          contentRef.current = next;
          setContent(next);
          onContentChange?.(next);
          if (generationRef.current !== capturedGeneration) persistRecovery(next);
        }
        if (generationRef.current === capturedGeneration) {
          dirtyRef.current = false;
          setSaveState("saved");
          setRecoveryNotice((notice) => /正在同步|服务器暂不可用/.test(notice) ? "本机恢复的修改已保存到服务器。" : notice);
        } else {
          pendingSaveRef.current = true;
        }
      };
      try {
        const saved = await updateOfficialDocumentDraftContent(draft.id, {
          expectedRevision: revisionRef.current,
          fixedValues: snapshot.fixedValues,
          blocks: normalizeOrders(snapshot.blocks),
          researchResults: snapshot.researchResults,
          factReview: snapshot.factReview
        });
        acceptSaved(saved);
      } catch (error) {
        if (!mountedRef.current || epoch !== contextEpochRef.current) throw error;
        pendingSaveRef.current = false;
        if (error instanceof OfficialDocumentServiceError && error.status === 409) {
          try {
            const server = await getOfficialDocumentDraftContent(draft.id);
            if (mountedRef.current && epoch === contextEpochRef.current) {
              // 上一页的离开保存可能已完成；相同提交只需接收新revision，不制造人工冲突。
              if (sameStructuredDraftContent(server, snapshot)) {
                acceptSaved(server);
                return;
              }
              serverConflictRef.current = server;
              setServerConflict(server);
              if (contentRef.current) persistRecovery(contentRef.current);
              setRecoveryNotice("服务器已有新版本。你的修改已留在本机，可以对照两份内容后继续。");
            }
          } catch { /* 原有本地修改仍保留，不用失败的刷新覆盖它。 */ }
        }
        if (!mountedRef.current || epoch !== contextEpochRef.current) throw error;
        setSaveState("failed");
        setSaveError(errorMessage(error));
        onStatus("error", errorMessage(error));
        throw error;
      } finally {
        if (epoch === contextEpochRef.current) {
          savingRef.current = false;
          if (pendingSaveRef.current && mountedRef.current) scheduleSave();
        }
      }
    };
    const pending = operation();
    activeSaveRef.current = pending;
    return pending;
  };

  useEffect(() => {
    const epoch = ++contextEpochRef.current;
    let disposed = false;
    mountedRef.current = true;
    contentRef.current = undefined;
    dirtyRef.current = false;
    savingRef.current = false;
    pendingSaveRef.current = false;
    serverConflictRef.current = undefined;
    recoveryIdRef.current = undefined;
    setServerConflict(undefined);
    setRecoveryNotice("");
    setContent(undefined);
    setSaveState("loading");
    setSaveError("");
    setPreviewUrl(undefined);
    setPreviewOpen(false);
    setConflictArchive(readStructuredDraftRecovery(recoveryKey ? `${recoveryKey}:conflict` : null, draft.templateVersionId));
    const backup = readStructuredDraftRecovery(recoveryKey, draft.templateVersionId);
    const accept = (next: OfficialDocumentDraftContent, state: StructuredDraftSaveState) => {
      contentRef.current = next;
      revisionRef.current = next.revision;
      generationRef.current = 0;
      setContent(next);
      setLoadedContext(contextKey);
      onContentChange?.(next);
      setSaveState(state);
    };
    void getOfficialDocumentDraftContent(draft.id).then((loaded) => {
      if (disposed || epoch !== contextEpochRef.current) return;
      const server = { ...loaded, blocks: normalizeOrders(loaded.blocks) };
      if (!backup || sameStructuredDraftContent(backup.content, server)) {
        clearStructuredDraftRecovery(recoveryKey, backup?.id);
        accept(server, "saved");
        return;
      }
      recoveryIdRef.current = backup.id;
      dirtyRef.current = true;
      const conflict = server.revision !== backup.content.revision;
      serverConflictRef.current = conflict ? server : undefined;
      setServerConflict(serverConflictRef.current);
      accept(backup.content, conflict ? "failed" : "saving");
      persistRecovery(backup.content);
      setRecoveryNotice(conflict ? "服务器已有新版本。你的修改已留在本机，可以对照两份内容后继续。" : "已恢复上次未保存的修改，正在同步到服务器。");
      if (!conflict) scheduleSave();
    }).catch((error) => {
      if (disposed || epoch !== contextEpochRef.current) return;
      // 只有网络故障可使用本地副本；权限失效或文档已删除时不展示缓存正文。
      if (backup && !(error instanceof OfficialDocumentServiceError && [401, 403, 404].includes(error.status ?? 0))) {
        recoveryIdRef.current = backup.id;
        dirtyRef.current = true;
        accept(backup.content, "failed");
        setRecoveryNotice("服务器暂不可用，已恢复本机尚未保存的修改。");
      }
      setSaveState("failed");
      setSaveError(errorMessage(error));
    });
    const pageHide = () => {
      if (!dirtyRef.current || serverConflictRef.current || recoveryKey !== structuredDraftRecoveryKey(draft.id)) return;
      if (saveTimerRef.current !== undefined) window.clearTimeout(saveTimerRef.current);
      void performSaveRef.current().catch(() => undefined);
    };
    window.addEventListener("pagehide", pageHide);
    return () => {
      disposed = true;
      // 导航不拦截；尽力保存尚未发出的快照，刷新被浏览器中断也有同步本地副本。
      const snapshot = contentRef.current;
      const backupId = recoveryIdRef.current;
      if (dirtyRef.current && snapshot && !savingRef.current && !serverConflictRef.current && recoveryKey === structuredDraftRecoveryKey(draft.id)) {
        void updateOfficialDocumentDraftContent(draft.id, { expectedRevision: revisionRef.current,
          fixedValues: snapshot.fixedValues, blocks: normalizeOrders(snapshot.blocks), researchResults: snapshot.researchResults,
          factReview: snapshot.factReview
        }).then(() => clearStructuredDraftRecovery(recoveryKey, backupId)).catch(() => undefined);
      }
      mountedRef.current = false;
      if (saveTimerRef.current !== undefined) window.clearTimeout(saveTimerRef.current);
      window.removeEventListener("pagehide", pageHide);
      previewRequestRef.current += 1;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = undefined;
    };
  }, [draft.id, draft.templateVersionId, contextKey, onContentChange, recoveryKey, persistRecovery]);

  useEffect(() => {
    onSaveStateChange?.(saveState);
  }, [onSaveStateChange, saveState]);

  useLayoutEffect(() => {
    const id = pendingFocusIdRef.current;
    if (!id) return;
    pendingFocusIdRef.current = undefined;
    const field = document.getElementById(`draft-block-${id}`);
    if (!(field instanceof HTMLElement)) return;
    field.focus({ preventScroll: true });
    field.closest("article")?.scrollIntoView?.({ block: "nearest", behavior: "auto" });
  }, [content]);

  useEffect(() => {
    if (!justAddedId) return;
    const timer = window.setTimeout(() => {
      setJustAddedId((current) => (current === justAddedId ? undefined : current));
      setAddNotice("");
    }, 900);
    return () => window.clearTimeout(timer);
  }, [justAddedId]);

  const updateFixedValue = (slotId: string, value: string) => commit((current) => ({
    ...current,
    fixedValues: current.fixedValues.map((item) => item.slotId === slotId ? { ...item, value } : item)
  }));

  const updateBlock = (id: string, changes: Partial<OfficialDocumentDraftContent["blocks"][number]>) => commit((current) => ({
    ...current,
    blocks: current.blocks.map((block) => block.id === id ? { ...block, ...changes } : block)
  }));

  const addBlock = (afterIndex: number | undefined, role: EditableDraftBlockRole = "BODY") => {
    const id = crypto.randomUUID();
    pendingFocusIdRef.current = id;
    setJustAddedId(id);
    setAddNotice(`已加入${roleLabels[role]}`);
    motion.prepare({ kind: "add", blockId: id });
    commit((current) => {
      const blocks = [...current.blocks];
      const insertionIndex = afterIndex === undefined ? blocks.length : afterIndex + 1;
      blocks.splice(insertionIndex, 0, {
        id,
        order: insertionIndex,
        role,
        variantId: officialDocumentVariantId(templateNodes, role),
        text: ""
      });
      return { ...current, blocks };
    });
  };

  /* 智写插入：先还原标题层级，再一次 commit，避免 N 个节点触发 N 次保存。 */
  const appendText = (text: string) => {
    if (/\[\[XS_SECTION:[^\]\r\n]+\]\]/.test(text)) return 0;
    const parsed = parseOfficialDocumentAssistantText(text);
    if (!parsed.length) return 0;
    const created = parsed.map(() => crypto.randomUUID());
    pendingFocusIdRef.current = created[0];
    setJustAddedId(created[0]);
    setAddNotice(`已插入 ${parsed.length} 个结构化节点`);
    motion.prepare({ kind: "add", blockId: created[0] });
    commit((current) => ({
      ...current,
      blocks: [
        ...current.blocks,
        ...parsed.map((block, index) => ({
          id: created[index],
          order: current.blocks.length + index,
          role: block.role as OfficialDocumentDraftBlockRole,
          variantId: officialDocumentVariantId(templateNodes, block.role, block.text),
          text: block.text
        }))
      ]
    }));
    return parsed.length;
  };

  const removeBlock = (id: string) => {
    const blocks = contentRef.current?.blocks ?? [];
    const index = blocks.findIndex((item) => item.id === id);
    const block = blocks[index];
    if (!block) return;
    motion.captureGhost(block, index, blocks.length);
    motion.prepare({ kind: "remove", blockId: block.id });
    /* 按 id 删除：残影动画期间若连点多张，索引已经不可靠 */
    commit((current) => ({
      ...current,
      blocks: current.blocks.filter((item) => item.id !== block.id)
    }));
  };

  const moveBlock = (id: string, direction: -1 | 1) => {
    const index = contentRef.current?.blocks.findIndex((item) => item.id === id) ?? -1;
    if (index < 0) return;
    motion.prepare({ kind: "move", blockId: id });
    commit((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.blocks.length) return current;
      const blocks = [...current.blocks];
      [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
      return { ...current, blocks };
    });
  };

  const changeRole = (id: string, role: EditableDraftBlockRole) => {
    updateBlock(id, { role, variantId: officialDocumentVariantId(templateNodes, role) });
  };

  /* 卡片只认这一份稳定的动作表：内部每次都读最新闭包，外部引用永不变 */
  const latestActions = useRef({ changeRole, moveBlock, addBlock, removeBlock, updateBlock });
  latestActions.current = { changeRole, moveBlock, addBlock, removeBlock, updateBlock };
  const blockActions = useMemo<DraftBlockActions>(() => ({
    changeRole: (id, role) => latestActions.current.changeRole(id, role),
    move: (id, direction) => latestActions.current.moveBlock(id, direction),
    insert: (afterId, role) => {
      const index = contentRef.current?.blocks.findIndex((item) => item.id === afterId) ?? -1;
      latestActions.current.addBlock(index < 0 ? undefined : index, role);
    },
    remove: (id) => latestActions.current.removeBlock(id),
    setText: (id, text) => latestActions.current.updateBlock(id, { text })
  }), []);

  const flushPendingSave = async () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (!mountedRef.current || !contentRef.current) throw new Error("草稿内容尚未加载或编辑器已关闭");
      if (serverConflictRef.current) throw new Error("服务器已有新版本，本地修改已保留，可先对照再保存");
      if (recoveryKey !== structuredDraftRecoveryKey(draft.id)) throw new Error("账号或空间已切换，请重新打开草稿");
      if (!dirtyRef.current && !savingRef.current && !pendingSaveRef.current) return;
      if (saveTimerRef.current !== undefined) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = undefined;
      }
      if (savingRef.current && activeSaveRef.current) await activeSaveRef.current;
      else if (!savingRef.current) await performSaveRef.current();
      if (!savingRef.current && !pendingSaveRef.current) return;
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    }
    throw new Error("草稿保存超时，请稍后重试");
  };

  const saveResearchResults = async (
    results: NonNullable<OfficialDocumentDraftContent["researchResults"]>
  ) => {
    commit((current) => ({ ...current, researchResults: results }));
    await flushPendingSave();
  };

  const applyBlocks = async (blocks: OfficialDocumentDraftContent["blocks"]) => {
    await flushPendingSave();
    const snapshot = contentRef.current;
    if (!snapshot) throw new Error("草稿内容尚未加载");
    applyingRef.current = true;
    savingRef.current = true;
    setSaveState("saving");
    try {
      const saved = await updateOfficialDocumentDraftContent(draft.id, {
        expectedRevision: revisionRef.current,
        fixedValues: snapshot.fixedValues,
        blocks: normalizeOrders(blocks),
        researchResults: snapshot.researchResults,
        factReview: snapshot.factReview && officialDocumentContentText({ ...snapshot, blocks }) !== officialDocumentContentText(snapshot)
          ? { ...snapshot.factReview, confirmedAt: undefined } : snapshot.factReview
      });
      const normalized = { ...saved, blocks: normalizeOrders(saved.blocks) };
      revisionRef.current = normalized.revision;
      generationRef.current += 1;
      contentRef.current = normalized;
      setContent(normalized);
      onContentChange?.(normalized);
      setSaveError("");
      setSaveState("saved");
    } catch (error) {
      setSaveState("failed");
      setSaveError(errorMessage(error));
      throw error;
    } finally {
      savingRef.current = false;
      applyingRef.current = false;
    }
  };

  const normalizeForExport = async () => {
    const current = contentRef.current;
    if (!current) throw new Error("草稿内容尚未加载");
    const normalized = normalizeOfficialDocumentDraftBlocks(current.blocks, templateNodes);
    if (!normalized.changedCount) {
      await flushPendingSave();
      return 0;
    }
    await applyBlocks(normalized.blocks);
    return normalized.changedCount;
  };

  const reload = async () => {
    if (serverConflictRef.current) throw new Error("本地与服务器内容有冲突，已保留两份内容，请先对照");
    if (dirtyRef.current || savingRef.current) await flushPendingSave();
    const epoch = contextEpochRef.current;
    const generation = generationRef.current;
    const loaded = await getOfficialDocumentDraftContent(draft.id);
    if (!mountedRef.current || epoch !== contextEpochRef.current) return;
    if (generation !== generationRef.current) throw new Error("加载期间又有新修改，本地内容已保留，请保存后重试");
    const normalized = { ...loaded, blocks: normalizeOrders(loaded.blocks) };
    revisionRef.current = normalized.revision;
    contentRef.current = normalized;
    setContent(normalized);
    onContentChange?.(normalized);
    setSaveState("saved");
    setSaveError("");
    previewRequestRef.current += 1;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = undefined;
    setPreviewUrl(undefined);
  };

  const saveFactReview = async (review: OfficialDocumentFactReview) => {
    await flushPendingSave();
    const snapshot = contentRef.current;
    if (!snapshot) throw new Error("草稿内容尚未加载");
    const factReview = review.confirmedAt && review.textSnapshot !== officialDocumentContentText(snapshot)
      ? { ...review, confirmedAt: undefined } : review;
    commit((current) => ({ ...current, factReview }));
    await flushPendingSave();
    return contentRef.current!;
  };

  useImperativeHandle(ref, () => ({
    appendText,
    getContent: () => contentRef.current,
    save: flushPendingSave,
    reload,
    saveFactReview,
    saveResearchResults,
    applyBlocks,
    normalizeForExport
  }));

  const archiveConflict = () => {
    const local = contentRef.current;
    const server = serverConflictRef.current;
    if (!local || !server) return false;
    try {
      // 仅保留最近一组冲突副本；正式历史版本由后端保存。
      const archived = writeStructuredDraftRecovery(recoveryKey ? `${recoveryKey}:conflict` : null,
        draft.templateVersionId, local, server);
      setConflictArchive(archived);
      return Boolean(archived);
    } catch {
      setConflictArchive({ id: crypto.randomUUID(), templateVersionId: draft.templateVersionId,
        content: local, serverContent: server, updatedAt: new Date().toISOString() });
      return false;
    }
  };

  const resolveConflict = async (useLocal: boolean) => {
    const local = contentRef.current;
    const server = serverConflictRef.current;
    if (!local || !server) return;
    const archived = archiveConflict();
    serverConflictRef.current = undefined;
    setServerConflict(undefined);
    const next = useLocal ? { ...local, revision: server.revision } : server;
    revisionRef.current = server.revision;
    contentRef.current = next;
    setContent(next);
    onContentChange?.(next);
    setSaveError("");
    if (useLocal) {
      dirtyRef.current = true;
      persistRecovery(next);
      try { await performSaveRef.current(); } catch { /* 保存错误与副本均已保留。 */ }
    } else {
      dirtyRef.current = false;
      clearStructuredDraftRecovery(recoveryKey, recoveryIdRef.current);
      setSaveState("saved");
    }
    setRecoveryNotice(archived ? "上次冲突的两份内容保留在本机，可随时对照。" : "冲突副本仅保留在当前页面，离开前请复制需要保留的内容。");
  };

  const refreshPreview = async (kind: "draft" | "template" = previewKind) => {
    const request = ++previewRequestRef.current;
    const epoch = contextEpochRef.current;
    setPreviewKind(kind);
    setPreviewOpen(true);
    setIsPreviewing(true);
    setPreviewError("");
    setPreviewRevision(undefined);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = undefined;
    setPreviewUrl(undefined);
    try {
      if (kind === "draft") await flushPendingSave();
      if (request !== previewRequestRef.current || epoch !== contextEpochRef.current) return;
      const generation = generationRef.current;
      const revision = revisionRef.current;
      const renderedContent = contentRef.current;
      const blob = kind === "draft" ? await getOfficialDocumentDraftPreview(draft.id)
        : await getOfficialDocumentTemplatePreview(draft.templateId, draft.templateVersionId);
      const signature = await blob.slice(0, 5).text();
      if (signature !== "%PDF-") throw new Error("报告服务返回的预览不是有效 PDF");
      if (kind === "draft") {
        const server = await getOfficialDocumentDraftContent(draft.id);
        if (server.revision !== revision || !renderedContent || !sameStructuredDraftContent(server, renderedContent)) {
          throw new Error("服务器版本已变化，请重新打开草稿后预览");
        }
      }
      if (!mountedRef.current || request !== previewRequestRef.current || epoch !== contextEpochRef.current) return;
      if (kind === "draft" && generation !== generationRef.current) throw new Error("草稿已更新，请重新生成当前稿预览");
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setPreviewRevision(kind === "draft" ? revision : undefined);
      onStatus("success", kind === "draft" ? `当前稿预览已更新（内容修订 ${revision}）` : "结构模板 PDF 已打开，仅用于核对版式和结构。");
    } catch (error) {
      if (request !== previewRequestRef.current || epoch !== contextEpochRef.current) return;
      setPreviewError(errorMessage(error));
      onStatus("error", errorMessage(error));
    } finally {
      if (request === previewRequestRef.current && epoch === contextEpochRef.current) setIsPreviewing(false);
    }
  };

  /* 序号表按 id 序列缓存：改正文不会让它换引用，只有增删移才通知订阅序号的叶子节点。 */
  const blockIdSignature = content?.blocks.map((block) => block.id).join("|") ?? "";
  const orderById = useMemo(() => {
    const map = new Map<string, number>();
    blockIdSignature.split("|").forEach((id, index) => {
      if (id) map.set(id, index);
    });
    return map;
  }, [blockIdSignature]);

  const saveLabel = saveState === "loading"
    ? "加载中"
    : saveState === "saving"
      ? "保存中"
      : saveState === "saved"
        ? "已保存"
        : "保存失败";

  if (!content || loadedContext !== contextKey) {
    return (
      <div className="structured-draft-editor-frame">
        <div className="structured-draft-editor__loading" role={saveError ? "alert" : "status"}>
          {saveError || "正在加载结构化草稿…"}
        </div>
      </div>
    );
  }

  return (
    <div className="structured-draft-editor-frame">
      <OfficialDocumentAppActions>
        <Button icon={<Eye size={15} />} loading={isPreviewing && previewKind === "draft"} onClick={() => void refreshPreview("draft")}>预览当前稿</Button>
        <Button icon={<Eye size={15} />} loading={isPreviewing && previewKind === "template"} onClick={() => void refreshPreview("template")}>模板 PDF 浏览</Button>
      </OfficialDocumentAppActions>
      <section
        className="structured-draft-editor"
        aria-label="结构化报告编辑器"
        data-fields-collapsed={fieldsCollapsed}
      >
        <aside className="structured-draft-editor__fields" aria-label="报告固定字段">
        <div className="structured-draft-editor__panel-head">
          <div>
            <strong>固定字段</strong>
            {fieldsCollapsed ? null : <small>模板中所有可编辑固定文字</small>}
          </div>
          <Button
            type="text"
            size="small"
            aria-label={fieldsCollapsed ? "展开固定字段" : "收起固定字段"}
            icon={fieldsCollapsed ? <CaretRight size={16} /> : <CaretLeft size={16} />}
            onClick={() => setFieldsCollapsed((current) => !current)}
          />
        </div>
        {fieldsCollapsed ? null : (
          <>
            <div className="structured-draft-editor__fixed-fields">
              {content.fixedValues.map((item) => {
                const node = slotNodes.get(item.slotId);
                return (
                  <label key={item.slotId}>
                    <span>{node?.roleLabel ?? "固定字段"}</span>
                    <Input.TextArea
                      value={item.value}
                      autoSize={{ minRows: 1, maxRows: 4 }}
                      aria-label={node?.roleLabel ?? `固定字段 ${item.slotId}`}
                      onChange={(event) => updateFixedValue(item.slotId, event.target.value)}
                    />
                  </label>
                );
              })}
              {!content.fixedValues.length ? <div className="official-document-inline-empty">模板没有固定文字槽位。</div> : null}
            </div>
            <div className="structured-draft-editor__save-note"><FloppyDisk size={16} />输入后自动保存，未同步的修改会在本机保留。</div>
          </>
        )}
      </aside>

      <main className="structured-draft-editor__canvas">
        <header className="structured-draft-editor__canvas-head">
          <div><strong>结构化正文</strong><small>{content.blocks.length} 个节点 · 输入后 600ms 自动保存</small></div>
          <Tag bordered={false} color={saveState === "failed" ? "error" : saveState === "saved" ? "success" : "processing"}>
            {saveLabel}
          </Tag>
        </header>
        {saveError ? <p className="structured-draft-editor__error">{saveError}</p> : null}
        {recoveryNotice || serverConflict || conflictArchive ? (
          <div className="structured-draft-editor__quick-add" role="status">
            <span>{recoveryNotice}</span>
            {serverConflict || conflictArchive ? <Button size="small" onClick={() => setComparisonOpen(true)}>对照冲突内容</Button> : null}
            {serverConflict ? <>
              <Button size="small" onClick={() => void resolveConflict(false)}>使用服务器版本</Button>
              <Button size="small" onClick={() => void resolveConflict(true)}>保存本地修改</Button>
            </> : null}
          </div>
        ) : null}
        <div className="structured-draft-editor__quick-add">
          <AddNodeTypeMenu onSelect={(role) => addBlock(undefined, role)}>
            <Button size="small" icon={<Plus size={14} />}>新增节点</Button>
          </AddNodeTypeMenu>
          {addNotice ? (
            <span className="structured-draft-editor__add-notice" role="status">{addNotice}</span>
          ) : null}
        </div>
        <DraftBlockOrderContext.Provider value={orderById}>
          <div className="structured-draft-editor__blocks" ref={motion.blocksRef}>
            {content.blocks.map((block, index) => (
              <DraftBlockCard
                key={block.id}
                block={block}
                isFirst={index === 0}
                isLast={index === content.blocks.length - 1}
                actions={blockActions}
                highlighted={block.id === justAddedId}
                autoFocus={block.id === justAddedId}
              />
            ))}
            {motion.ghosts.map((ghost) => (
              <DraftBlockCard
                key={ghost.key}
                ghost
                ghostKey={ghost.key}
                ghostStyle={ghost.style}
                ghostOrder={ghost.index}
                block={ghost.block}
                isFirst={ghost.index === 0}
                isLast={ghost.index === ghost.total - 1}
                actions={ghostActions}
              />
            ))}
          </div>
        </DraftBlockOrderContext.Provider>
      </main>

      <Modal
        className="official-document-preview-modal"
        title={previewKind === "draft" ? "当前稿正文预览" : "模板 PDF 浏览"}
        width="min(980px, calc(100vw - 48px))"
        open={previewOpen}
        footer={(
          <div className="official-document-preview-modal__footer">
            <span>{previewKind === "template" ? "当前绑定结构模板 · 不包含草稿正文"
              : previewRevision == null ? "保存成功后生成当前正文预览" : `当前已保存正文 · 内容修订 ${previewRevision}`}</span>
            <Button icon={<Eye size={15} />} loading={isPreviewing} onClick={() => void refreshPreview()}>重新加载</Button>
          </div>
        )}
        onCancel={() => {
          previewRequestRef.current += 1;
          setPreviewOpen(false);
          setIsPreviewing(false);
        }}
      >
        {previewUrl ? (
          <object data={previewUrl} type="application/pdf" aria-label={previewKind === "draft" ? `当前稿 PDF · 内容修订 ${previewRevision}` : `${draft.templateName} 模板 PDF`}>
            <a href={previewUrl} target="_blank" rel="noreferrer">新窗口查看 PDF</a>
          </object>
        ) : (
          <div className="structured-draft-editor__preview-empty">
            <Eye size={28} />
            <strong>{isPreviewing ? "正在生成预览" : previewError ? "预览暂不可用" : "尚未生成预览"}</strong>
            {previewError ? <p role="alert">{previewError}</p> : <p>{previewKind === "draft"
              ? "保存当前内容后生成PDF，旧预览不会代替当前稿。" : "打开当前草稿绑定的结构模板 PDF，核对版式和静态元素。"}</p>}
          </div>
        )}
      </Modal>
      <Modal title="本地与服务器内容对照" open={comparisonOpen} footer={null} onCancel={() => setComparisonOpen(false)}>
        {[{ label: "本地修改", value: serverConflict ? content : conflictArchive?.content },
          { label: "服务器版本", value: serverConflict ?? conflictArchive?.serverContent }].map(({ label, value }) => value ? (
          <section key={label} aria-label={label}>
            <h3>{label} · 内容修订 {value.revision}</h3>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{officialDocumentContentText(value)}</pre>
          </section>
        ) : null)}
      </Modal>
      </section>
    </div>
  );
}
