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
  type CSSProperties,
  type ReactElement,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  getOfficialDocumentDraftContent,
  getOfficialDocumentDraftPreview,
  updateOfficialDocumentDraftContent
} from "@/services/officialDocumentService";
import type {
  OfficialDocumentDraft,
  OfficialDocumentDraftBlockRole,
  OfficialDocumentDraftContent,
  OfficialDocumentStructureNode
} from "@/types/officialDocument";
import { useDraftBlockMotion, type DraftBlock } from "./draftBlockMotion";
import { OfficialDocumentAppActions } from "./OfficialDocumentAppShell";

export type StructuredDraftSaveState = "loading" | "saving" | "saved" | "failed";

const roleOptions: Array<{ value: OfficialDocumentDraftBlockRole; label: string }> = [
  { value: "HEADING_1", label: "一级标题" },
  { value: "HEADING_2", label: "二级标题" },
  { value: "HEADING_3", label: "三级标题" },
  { value: "BODY", label: "正文" }
];

const roleLabels = Object.fromEntries(roleOptions.map((option) => [option.value, option.label])) as Record<
  OfficialDocumentDraftBlockRole,
  string
>;

const rolePlaceholders: Record<OfficialDocumentDraftBlockRole, string> = {
  HEADING_1: "输入一级标题",
  HEADING_2: "输入二级标题",
  HEADING_3: "输入三级标题",
  BODY: "输入正文"
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
  onSelect: (role: OfficialDocumentDraftBlockRole) => void;
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
          onSelect(key as OfficialDocumentDraftBlockRole);
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
  changeRole: (id: string, role: OfficialDocumentDraftBlockRole) => void;
  move: (id: string, direction: -1 | 1) => void;
  insert: (afterId: string, role: OfficialDocumentDraftBlockRole) => void;
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
        <Select
          aria-labelledby={labelledBy(`draft-block-type-${block.id}`)}
          size="small"
          value={block.role}
          options={roleOptions}
          popupMatchSelectWidth={false}
          getPopupContainer={() => document.body}
          classNames={{ popup: { root: "structured-draft-editor__role-dropdown" } }}
          onChange={(role) => actions.changeRole(block.id, role)}
        />
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
      {block.role === "BODY" ? (
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

export function StructuredDraftEditor({
  draft,
  templateNodes,
  onStatus,
  onSaveStateChange
}: {
  draft: OfficialDocumentDraft;
  templateNodes: OfficialDocumentStructureNode[];
  onStatus: (tone: "loading" | "success" | "error", message: string) => void;
  onSaveStateChange?: (state: StructuredDraftSaveState) => void;
}) {
  const [content, setContent] = useState<OfficialDocumentDraftContent>();
  const [saveState, setSaveState] = useState<StructuredDraftSaveState>("loading");
  const [saveError, setSaveError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [fieldsCollapsed, setFieldsCollapsed] = useState(false);
  const [justAddedId, setJustAddedId] = useState<string>();
  const [addNotice, setAddNotice] = useState("");
  const pendingFocusIdRef = useRef<string>();
  const contentRef = useRef<OfficialDocumentDraftContent | undefined>(undefined);
  const revisionRef = useRef(0);
  const generationRef = useRef(0);
  const saveTimerRef = useRef<number | undefined>(undefined);
  const savingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const mountedRef = useRef(true);
  const previewUrlRef = useRef<string | undefined>(undefined);
  const performSaveRef = useRef<() => Promise<void>>(async () => undefined);
  const motion = useDraftBlockMotion();

  const slotNodes = useMemo(
    () => new Map(templateNodes.filter((node) => node.slotId).map((node) => [node.slotId!, node])),
    [templateNodes]
  );

  const scheduleSave = () => {
    if (saveTimerRef.current !== undefined) window.clearTimeout(saveTimerRef.current);
    setSaveError("");
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = undefined;
      void performSaveRef.current();
    }, 600);
  };

  const commit = (mutate: (current: OfficialDocumentDraftContent) => OfficialDocumentDraftContent) => {
    const current = contentRef.current;
    if (!current) return;
    const next = mutate(current);
    contentRef.current = next;
    generationRef.current += 1;
    setContent(next);
    scheduleSave();
  };

  performSaveRef.current = async () => {
    if (savingRef.current) {
      pendingSaveRef.current = true;
      return;
    }
    const snapshot = contentRef.current;
    if (!snapshot) return;
    savingRef.current = true;
    pendingSaveRef.current = false;
    const capturedGeneration = generationRef.current;
    setSaveState("saving");
    try {
      const saved = await updateOfficialDocumentDraftContent(draft.id, {
        expectedRevision: revisionRef.current,
        fixedValues: snapshot.fixedValues,
        blocks: normalizeOrders(snapshot.blocks)
      });
      revisionRef.current = saved.revision;
      if (!mountedRef.current) return;
      const latest = contentRef.current;
      if (latest) {
        const next = { ...latest, revision: saved.revision };
        contentRef.current = next;
        setContent(next);
      }
      if (generationRef.current === capturedGeneration) {
        setSaveState("saved");
      } else {
        pendingSaveRef.current = true;
      }
    } catch (error) {
      if (!mountedRef.current) return;
      setSaveState("failed");
      setSaveError(errorMessage(error));
      onStatus("error", errorMessage(error));
    } finally {
      savingRef.current = false;
      if (pendingSaveRef.current && mountedRef.current) scheduleSave();
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    setSaveState("loading");
    setSaveError("");
    void getOfficialDocumentDraftContent(draft.id)
      .then((loaded) => {
        if (!mountedRef.current) return;
        const normalized = { ...loaded, blocks: normalizeOrders(loaded.blocks) };
        revisionRef.current = normalized.revision;
        generationRef.current = 0;
        contentRef.current = normalized;
        setContent(normalized);
        setSaveState("saved");
      })
      .catch((error) => {
        if (!mountedRef.current) return;
        setSaveState("failed");
        setSaveError(errorMessage(error));
      });
    return () => {
      mountedRef.current = false;
      if (saveTimerRef.current !== undefined) window.clearTimeout(saveTimerRef.current);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, [draft.id]);

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

  const addBlock = (afterIndex: number | undefined, role: OfficialDocumentDraftBlockRole = "BODY") => {
    const id = crypto.randomUUID();
    pendingFocusIdRef.current = id;
    setJustAddedId(id);
    setAddNotice(`已加入${roleLabels[role]}`);
    motion.prepare({ kind: "add", blockId: id });
    commit((current) => {
      const blocks = [...current.blocks];
      const insertionIndex = afterIndex === undefined ? blocks.length : afterIndex + 1;
      const sample = templateNodes.find((node) => node.role === role);
      blocks.splice(insertionIndex, 0, {
        id,
        order: insertionIndex,
        role,
        variantId: sample?.variantId ?? "",
        text: ""
      });
      return { ...current, blocks };
    });
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

  const changeRole = (id: string, role: OfficialDocumentDraftBlockRole) => {
    const sample = templateNodes.find((node) => node.role === role);
    updateBlock(id, { role, variantId: sample?.variantId ?? "" });
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
      if (saveTimerRef.current !== undefined) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = undefined;
      }
      if (!savingRef.current) await performSaveRef.current();
      if (!savingRef.current && !pendingSaveRef.current) return;
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    }
    throw new Error("草稿保存超时，请稍后重试");
  };

  const refreshPreview = async () => {
    if (!content || isPreviewing) return;
    setIsPreviewing(true);
    onStatus("loading", "正在按模板样式生成草稿 PDF 预览");
    try {
      if (saveState !== "saved") await flushPendingSave();
      const blob = await getOfficialDocumentDraftPreview(draft.id);
      const signature = await blob.slice(0, 5).text();
      if (signature !== "%PDF-") throw new Error("公文服务返回的草稿预览不是有效 PDF");
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      onStatus("success", "草稿 PDF 预览已更新。编辑内容仍以结构化草稿为准。");
    } catch (error) {
      onStatus("error", errorMessage(error));
    } finally {
      setIsPreviewing(false);
    }
  };

  const openPreview = () => {
    setPreviewOpen(true);
    if (!previewUrl) void refreshPreview();
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

  if (!content) {
    return (
      <div className="structured-draft-editor-frame">
        <div className="structured-draft-editor__loading" role="status">正在加载结构化草稿…</div>
      </div>
    );
  }

  return (
    <div className="structured-draft-editor-frame">
      <OfficialDocumentAppActions>
        <Button icon={<Eye size={15} />} loading={isPreviewing} onClick={openPreview}>PDF 预览</Button>
      </OfficialDocumentAppActions>
      <section
        className="structured-draft-editor"
        aria-label="结构化公文编辑器"
        data-fields-collapsed={fieldsCollapsed}
      >
        <aside className="structured-draft-editor__fields" aria-label="公文固定字段">
        <div className="structured-draft-editor__panel-head">
          <div>
            <strong>固定字段</strong>
            {fieldsCollapsed ? null : <small>标题、主送、落款与日期</small>}
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
            <div className="structured-draft-editor__save-note"><FloppyDisk size={16} />结构化内容自动写入服务端，刷新页面不会丢失。</div>
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
        title="草稿 PDF 预览"
        width="min(980px, calc(100vw - 48px))"
        open={previewOpen}
        footer={(
          <div className="official-document-preview-modal__footer">
            <span>LibreOffice 实际渲染 · 预览前自动保存结构化内容</span>
            <Button icon={<Eye size={15} />} loading={isPreviewing} onClick={() => void refreshPreview()}>刷新预览</Button>
          </div>
        )}
        onCancel={() => setPreviewOpen(false)}
      >
        {previewUrl ? (
          <object data={previewUrl} type="application/pdf" aria-label={`${draft.title} PDF 预览`}>
            <a href={previewUrl} target="_blank" rel="noreferrer">新窗口查看 PDF</a>
          </object>
        ) : (
          <div className="structured-draft-editor__preview-empty">
            <Eye size={28} />
            <strong>{isPreviewing ? "正在生成预览" : "尚未生成预览"}</strong>
            <p>保存内容后生成 PDF，查看最终分页和模板格式。</p>
          </div>
        )}
      </Modal>
      </section>
    </div>
  );
}
