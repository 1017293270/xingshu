import { Input, Modal } from "antd";
import { useEffect, useId, useRef, useState } from "react";
import {
  parseTableStructureColumns,
  type TableTemplateInput
} from "@/services/tableTemplateService";

export type TableTemplateModalProps = {
  open: boolean;
  /** 弹窗标题：新建模板 / 编辑模板 / 存为模板。 */
  title: string;
  /** 初始值；结构快照只读展示，本弹窗不编辑结构（结构来自制表会话）。 */
  initial?: Partial<TableTemplateInput>;
  /**
   * 名称与提示词是按会话上下文生成的建议值时传：pending 时输入框提示正在生成，ready 后提示可直接修改。
   * 建议值可能晚于弹窗到达，用户已经改过的字段不会被它覆盖。
   */
  suggestion?: "pending" | "ready";
  saving?: boolean;
  onSave: (input: TableTemplateInput) => void;
  onClose: () => void;
};

const suggestionNote = {
  pending: "正在根据本次会话生成名称与提示词…",
  ready: "已根据本次会话的提问与确认项生成，可直接修改"
} as const;

/**
 * 表格模板编辑弹窗（V1）：名称 + 制表提示词，结构快照只读预览。
 * 结构的产生与修改走 ask_table 对话链路（从会话「存为模板」带入），
 * 模板内对话式改结构列为二期。
 */
export function TableTemplateModal({
  open,
  title,
  initial,
  suggestion,
  saving,
  onSave,
  onClose
}: TableTemplateModalProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  /* 记下用户亲手改过哪一栏：初值后到时只填没动过的，不抢用户已经敲下的字 */
  const editedRef = useRef({ name: false, prompt: false });
  const noteId = useId();

  useEffect(() => {
    if (open) {
      editedRef.current = { name: false, prompt: false };
    }
  }, [open]);

  useEffect(() => {
    if (open && !editedRef.current.name) {
      setName(initial?.name ?? "");
    }
  }, [open, initial?.name]);

  useEffect(() => {
    if (open && !editedRef.current.prompt) {
      setPrompt(initial?.prompt ?? "");
    }
  }, [open, initial?.prompt]);

  const structureColumns = parseTableStructureColumns(initial?.structureJson);
  const canSave = Boolean(name.trim() && prompt.trim());
  const pending = suggestion === "pending";
  const describedBy = suggestion ? noteId : undefined;

  return (
    <Modal
      open={open}
      title={title}
      okText="保存模板"
      cancelText="取消"
      okButtonProps={{ disabled: !canSave, loading: saving }}
      onOk={() =>
        onSave({
          name: name.trim(),
          prompt: prompt.trim(),
          structureJson: initial?.structureJson ?? null
        })
      }
      onCancel={onClose}
      destroyOnHidden
    >
      <div className="table-template-modal">
        <label className="table-template-modal__field">
          <span>模板名称</span>
          <Input
            value={name}
            maxLength={100}
            placeholder={pending ? "正在生成模板名称…" : "如：季度合同台账"}
            aria-describedby={describedBy}
            onChange={(event) => {
              editedRef.current.name = true;
              setName(event.target.value);
            }}
          />
        </label>
        <label className="table-template-modal__field">
          <span>制表提示词</span>
          <Input.TextArea
            value={prompt}
            autoSize={{ minRows: 3, maxRows: 8 }}
            placeholder={pending ? "正在整理制表要求…" : "描述这张表要统计什么、按什么口径…"}
            aria-describedby={describedBy}
            onChange={(event) => {
              editedRef.current.prompt = true;
              setPrompt(event.target.value);
            }}
          />
        </label>
        {suggestion ? (
          <p className="table-template-modal__note" id={noteId} aria-live="polite">
            {suggestionNote[suggestion]}
          </p>
        ) : null}
        {structureColumns.length > 0 ? (
          <div className="table-template-modal__structure" aria-label="表结构快照">
            <span>表结构快照（{structureColumns.length} 列）</span>
            <div>
              {structureColumns.map((column) => (
                <em key={column.title}>{column.title}</em>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
