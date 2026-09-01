import { Input, Modal } from "antd";
import { useEffect, useState } from "react";
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
  saving?: boolean;
  onSave: (input: TableTemplateInput) => void;
  onClose: () => void;
};

/**
 * 表格模板编辑弹窗（V1）：名称 + 制表提示词，结构快照只读预览。
 * 结构的产生与修改走 ask_table 对话链路（从会话「存为模板」带入），
 * 模板内对话式改结构列为二期。
 */
export function TableTemplateModal({
  open,
  title,
  initial,
  saving,
  onSave,
  onClose
}: TableTemplateModalProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setPrompt(initial?.prompt ?? "");
    }
  }, [open, initial?.name, initial?.prompt]);

  const structureColumns = parseTableStructureColumns(initial?.structureJson);
  const canSave = Boolean(name.trim() && prompt.trim());

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
            placeholder="如：季度合同台账"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="table-template-modal__field">
          <span>制表提示词</span>
          <Input.TextArea
            value={prompt}
            autoSize={{ minRows: 3, maxRows: 8 }}
            placeholder="描述这张表要统计什么、按什么口径…"
            onChange={(event) => setPrompt(event.target.value)}
          />
        </label>
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
