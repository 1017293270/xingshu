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
import { Button, Input, Modal, Select, Tag } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "草稿保存失败";
}

function normalizeOrders(blocks: OfficialDocumentDraftContent["blocks"]) {
  return blocks.map((block, order) => ({ ...block, order }));
}

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
  const contentRef = useRef<OfficialDocumentDraftContent | undefined>(undefined);
  const revisionRef = useRef(0);
  const generationRef = useRef(0);
  const saveTimerRef = useRef<number | undefined>(undefined);
  const savingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const mountedRef = useRef(true);
  const previewUrlRef = useRef<string | undefined>(undefined);
  const performSaveRef = useRef<() => Promise<void>>(async () => undefined);

  const slotNodes = useMemo(
    () => new Map(templateNodes.filter((node) => node.slotId).map((node) => [node.slotId!, node])),
    [templateNodes]
  );

  const scheduleSave = () => {
    if (saveTimerRef.current !== undefined) window.clearTimeout(saveTimerRef.current);
    setSaveState("saving");
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

  const updateFixedValue = (slotId: string, value: string) => commit((current) => ({
    ...current,
    fixedValues: current.fixedValues.map((item) => item.slotId === slotId ? { ...item, value } : item)
  }));

  const updateBlock = (id: string, changes: Partial<OfficialDocumentDraftContent["blocks"][number]>) => commit((current) => ({
    ...current,
    blocks: normalizeOrders(current.blocks.map((block) => block.id === id ? { ...block, ...changes } : block))
  }));

  const addBlock = (afterIndex?: number, role: OfficialDocumentDraftBlockRole = "BODY") => commit((current) => {
    const blocks = [...current.blocks];
    const insertionIndex = afterIndex === undefined ? blocks.length : afterIndex + 1;
    const sample = templateNodes.find((node) => node.role === role);
    blocks.splice(insertionIndex, 0, {
      id: crypto.randomUUID(),
      order: insertionIndex,
      role,
      variantId: sample?.variantId ?? "",
      text: ""
    });
    return { ...current, blocks: normalizeOrders(blocks) };
  });

  const removeBlock = (index: number) => commit((current) => ({
    ...current,
    blocks: normalizeOrders(current.blocks.filter((_, itemIndex) => itemIndex !== index))
  }));

  const moveBlock = (index: number, direction: -1 | 1) => commit((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.blocks.length) return current;
    const blocks = [...current.blocks];
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    return { ...current, blocks: normalizeOrders(blocks) };
  });

  const changeRole = (id: string, role: OfficialDocumentDraftBlockRole) => {
    const sample = templateNodes.find((node) => node.role === role);
    updateBlock(id, { role, variantId: sample?.variantId ?? "" });
  };

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
        <div className="structured-draft-editor__quick-add" aria-label="新增正文节点">
          {roleOptions.map((option) => (
            <Button key={option.value} size="small" icon={<Plus size={14} />} onClick={() => addBlock(undefined, option.value)}>
              {option.label}
            </Button>
          ))}
        </div>
        <div className="structured-draft-editor__blocks">
          {content.blocks.map((block, index) => (
            <article key={block.id} data-role={block.role.toLocaleLowerCase()}>
              <div className="structured-draft-editor__block-tools">
                <Select
                  aria-label={`节点 ${index + 1} 角色`}
                  value={block.role}
                  options={roleOptions}
                  onChange={(role) => changeRole(block.id, role)}
                />
                <span>节点 {index + 1}</span>
                <Button type="text" size="small" aria-label="上移节点" disabled={index === 0} icon={<ArrowUp size={15} />} onClick={() => moveBlock(index, -1)} />
                <Button type="text" size="small" aria-label="下移节点" disabled={index === content.blocks.length - 1} icon={<ArrowDown size={15} />} onClick={() => moveBlock(index, 1)} />
                <Button type="text" size="small" aria-label="在下方新增节点" icon={<Plus size={15} />} onClick={() => addBlock(index, block.role)} />
                <Button danger type="text" size="small" aria-label="删除节点" icon={<Trash size={15} />} onClick={() => removeBlock(index)} />
              </div>
              {block.role === "BODY" ? (
                <Input.TextArea
                  id={`draft-block-${block.id}`}
                  value={block.text}
                  autoSize={{ minRows: 4, maxRows: 16 }}
                  aria-label={`正文节点 ${index + 1}`}
                  onChange={(event) => updateBlock(block.id, { text: event.target.value })}
                />
              ) : (
                <Input
                  id={`draft-block-${block.id}`}
                  value={block.text}
                  aria-label={`${roleLabels[block.role]}节点 ${index + 1}`}
                  onChange={(event) => updateBlock(block.id, { text: event.target.value })}
                />
              )}
            </article>
          ))}
        </div>
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
