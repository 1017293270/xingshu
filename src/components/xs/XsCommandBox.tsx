import { Button } from "antd";
import { Microphone, Paperclip, PaperPlaneTilt, StopCircle, X } from "@phosphor-icons/react";
import { useRef } from "react";
import type { VoiceInputState } from "@/hooks/useVoiceInput";
import type { AttachmentQueueItem } from "@/services/attachmentService";

type XsCommandBoxProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onAttach?: (files: File[]) => void;
  onVoice?: () => void;
  onCancelVoice?: () => void;
  onStop?: () => void;
  attachments?: AttachmentQueueItem[];
  onRemoveAttachment?: (attachmentId: string) => void;
  busy?: boolean;
  voiceState?: VoiceInputState;
};

const voiceStateLabels = {
  idle: "语音",
  permission: "正在请求麦克风权限",
  recording: "停止语音录入",
  processing: "正在处理语音",
  error: "重试语音输入"
} as const;

export function XsCommandBox({
  value,
  onChange,
  onSubmit,
  onAttach,
  onVoice,
  onCancelVoice,
  onStop,
  attachments = [],
  onRemoveAttachment,
  busy = false,
  voiceState = "idle"
}: XsCommandBoxProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canSubmit = Boolean(value.trim());
  const voiceLabel = voiceStateLabels[voiceState];

  return (
    <section className="xs-command-box" aria-label="星数命令输入区">
      <textarea
        className="xs-command-box__input"
        aria-label="命令输入"
        value={value}
        placeholder="请输入您的问题，支持问题、找文件、写文档、做分析、用应用..."
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            if (!busy && canSubmit) {
              onSubmit();
            }
          }
        }}
      />
      {attachments.length > 0 ? (
        <ul className="xs-command-box__attachments" aria-label="附件队列">
          {attachments.map((attachment) => (
            <li
              className="xs-command-box__attachment"
              data-status={attachment.status}
              key={attachment.id}
            >
              <Paperclip size={16} aria-hidden="true" />
              <span title={attachment.name}>{attachment.name}</span>
              <small>{attachment.status === "ready" ? "仅保存在本地" : attachment.error}</small>
              <button
                type="button"
                aria-label={`移除附件 ${attachment.name}`}
                onClick={() => onRemoveAttachment?.(attachment.id)}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="xs-command-box__toolbar">
        <span className="xs-command-box__hint">Ctrl/⌘ + Enter 发送</span>
        <div className="xs-command-box__actions">
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            multiple
            aria-label="添加附件"
            accept=".csv,.doc,.docx,.json,.md,.pdf,.txt,.xls,.xlsx,image/*"
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              if (files.length > 0) {
                onAttach?.(files);
              }
              event.target.value = "";
            }}
          />
          <Button
            className="xs-command-box__tool"
            aria-label="附件"
            icon={<Paperclip size={22} />}
            onClick={() => fileInputRef.current?.click()}
          />
          <Button
            className="xs-command-box__tool"
            aria-label={voiceLabel}
            aria-pressed={voiceState === "recording"}
            disabled={voiceState === "permission" || voiceState === "processing"}
            icon={<Microphone size={22} />}
            title={voiceLabel}
            onClick={onVoice}
          />
          {onCancelVoice &&
          (voiceState === "permission" || voiceState === "recording" || voiceState === "processing") ? (
            <Button
              className="xs-command-box__voice-cancel"
              aria-label="取消语音输入"
              icon={<X size={18} />}
              onClick={onCancelVoice}
            />
          ) : null}
          {busy ? (
            <Button
              danger
              className="xs-command-box__stop"
              aria-label="停止生成"
              icon={<StopCircle size={22} weight="fill" />}
              onClick={onStop}
            />
          ) : (
            <Button
              type="primary"
              className="xs-command-box__send"
              aria-label="发送"
              disabled={!canSubmit}
              icon={<PaperPlaneTilt size={22} weight="fill" />}
              onClick={onSubmit}
            />
          )}
        </div>
      </div>
    </section>
  );
}
