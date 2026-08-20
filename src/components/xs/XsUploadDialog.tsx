import { ArrowsClockwise, Check, FileArrowUp, UploadSimple, WarningCircle } from "@phosphor-icons/react";
import { Button, Modal } from "antd";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode
} from "react";
import type { XsIconComponent } from "./XsIconTile";

export type XsUploadDialogProps = {
  open: boolean;
  /** 弹窗标题，同时作为弹窗的可访问名。 */
  title: string;
  /** 标题下的一句话说明，讲清楚上传之后会发生什么。 */
  description?: ReactNode;
  /** 允许的扩展名（含点，如 [".docx"]）：既做本地校验，也显示在限制行里。 */
  accept: string[];
  /** 追加给系统文件选择器的 MIME，不参与校验。 */
  acceptMimeTypes?: string[];
  /** 单文件大小上限，默认 25 MB。 */
  maxBytes?: number;
  /** 投放区图标，默认云上传。 */
  icon?: XsIconComponent;
  submitLabel?: string;
  /** 限制行之外的补充说明，放在底部按钮左侧。 */
  hint?: ReactNode;
  /** 外部驱动的上传进度（0-100）；不传就走不确定进度条。 */
  progress?: number;
  /** 抛错即视为上传失败，错误文案就地显示，弹窗保持打开以便重试。 */
  onUpload: (file: File) => Promise<void> | void;
  onClose: () => void;
  inputTestId?: string;
};

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${Math.max(1, bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const megabytes = bytes / 1024 / 1024;
  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
}

function matchesAccept(file: File, accept: string[]) {
  if (accept.length === 0) return true;
  const name = file.name.toLocaleLowerCase();
  return accept.some((extension) => name.endsWith(extension.toLocaleLowerCase()));
}

/**
 * 全站通用的文件上传弹窗：拖入 / 点击选择 / 粘贴三种投放方式，
 * 校验、进度、失败重试都在弹窗内闭环，调用方只需要提供一个上传函数。
 */
export function XsUploadDialog({
  open,
  title,
  description,
  accept,
  acceptMimeTypes = [],
  maxBytes = DEFAULT_MAX_BYTES,
  icon: Icon = UploadSimple,
  submitLabel = "开始上传",
  hint,
  progress,
  onUpload,
  onClose,
  inputTestId
}: XsUploadDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const browseRef = useRef<HTMLButtonElement>(null);
  const refocusBrowse = useRef(false);
  const dragDepth = useRef(0);
  const limitsId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const acceptLabel = accept.join(" / ");
  const zoneState = isUploading ? "uploading" : file ? "selected" : isDragging ? "dragging" : "idle";

  const validate = useCallback((candidate: File) => {
    if (!matchesAccept(candidate, accept)) return `只支持 ${acceptLabel} 文件`;
    if (candidate.size <= 0) return "不能上传空文件";
    if (candidate.size > maxBytes) return `文件不能超过 ${formatBytes(maxBytes)}`;
    return "";
  }, [accept, acceptLabel, maxBytes]);

  const acceptFiles = useCallback((files: ArrayLike<File> | null | undefined) => {
    const candidates = Array.from(files ?? []);
    if (candidates.length === 0 || isUploading) return;
    if (candidates.length > 1) {
      setError("一次只能上传一个文件");
      return;
    }
    const message = validate(candidates[0]);
    if (message) {
      setFile(null);
      setError(message);
      return;
    }
    setFile(candidates[0]);
    setError("");
  }, [isUploading, validate]);

  // 清空选择后把焦点还给投放区，键盘用户不会掉到 body 上。
  useEffect(() => {
    if (file || !refocusBrowse.current) return;
    refocusBrowse.current = false;
    browseRef.current?.focus();
  }, [file]);

  useEffect(() => {
    if (open) return;
    dragDepth.current = 0;
    setFile(null);
    setError("");
    setIsDragging(false);
    setIsUploading(false);
  }, [open]);

  // 弹窗打开时接管窗口拖放，避免文件落在弹窗外把当前页面替换成这个文件。
  useEffect(() => {
    if (!open) return undefined;
    const swallow = (event: Event) => event.preventDefault();
    const handlePaste = (event: ClipboardEvent) => {
      const pasted = event.clipboardData?.files;
      if (pasted && pasted.length > 0) {
        event.preventDefault();
        acceptFiles(pasted);
      }
    };
    window.addEventListener("dragover", swallow);
    window.addEventListener("drop", swallow);
    document.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("dragover", swallow);
      window.removeEventListener("drop", swallow);
      document.removeEventListener("paste", handlePaste);
    };
  }, [acceptFiles, open]);

  const handleClose = () => {
    if (isUploading) return;
    onClose();
  };

  const handleSelect = (event: ChangeEvent<HTMLInputElement>) => {
    acceptFiles(event.target.files);
    event.target.value = "";
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current += 1;
    if (!isUploading) setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    acceptFiles(event.dataTransfer?.files);
  };

  const handleSubmit = async () => {
    if (!file || isUploading) return;
    setIsUploading(true);
    setError("");
    try {
      await onUpload(file);
      onClose();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "上传失败，请稍后重试");
    } finally {
      setIsUploading(false);
    }
  };

  const hasProgress = typeof progress === "number";
  const progressValue = hasProgress ? Math.min(100, Math.max(0, progress)) : undefined;

  return (
    <Modal
      className="xs-upload-dialog"
      open={open}
      centered
      destroyOnHidden
      width={520}
      footer={null}
      maskClosable={!isUploading}
      keyboard={!isUploading}
      onCancel={handleClose}
      closable={!isUploading}
      transitionName={import.meta.env.MODE === "test" ? "" : undefined}
      maskTransitionName={import.meta.env.MODE === "test" ? "" : undefined}
      title={
        <div className="xs-upload-dialog__head">
          <span className="xs-upload-dialog__head-glyph" aria-hidden="true">
            <Icon size={22} />
          </span>
          <span className="xs-upload-dialog__head-copy">
            <span className="xs-upload-dialog__title">{title}</span>
            {description ? <span className="xs-upload-dialog__description">{description}</span> : null}
          </span>
        </div>
      }
    >
      <div
        className="xs-upload-dialog__zone"
        data-state={zoneState}
        onDragEnter={handleDragEnter}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {file ? (
          <div className="xs-upload-dialog__file">
            <span className="xs-upload-dialog__file-glyph" aria-hidden="true">
              <FileArrowUp size={26} />
              <span className="xs-upload-dialog__file-badge">
                <Check size={11} weight="bold" />
              </span>
            </span>
            <span className="xs-upload-dialog__file-name" title={file.name}>{file.name}</span>
            <span className="xs-upload-dialog__file-meta">
              {formatBytes(file.size)} · {isUploading ? "正在上传" : "已就绪"}
            </span>
            {isUploading ? (
              <span
                className="xs-upload-dialog__progress"
                data-mode={hasProgress ? "determinate" : "indeterminate"}
                role="progressbar"
                aria-label="上传进度"
                aria-valuemin={hasProgress ? 0 : undefined}
                aria-valuemax={hasProgress ? 100 : undefined}
                aria-valuenow={progressValue}
              >
                <span style={hasProgress ? { width: `${progressValue}%` } : undefined} />
              </span>
            ) : (
              <Button
                className="xs-upload-dialog__file-clear"
                type="text"
                size="small"
                icon={<ArrowsClockwise size={14} />}
                onClick={() => {
                  refocusBrowse.current = true;
                  setFile(null);
                  setError("");
                  inputRef.current?.click();
                }}
              >
                重新选择
              </Button>
            )}
          </div>
        ) : (
          <button
            ref={browseRef}
            type="button"
            className="xs-upload-dialog__browse"
            aria-describedby={limitsId}
            onClick={() => inputRef.current?.click()}
          >
            <span className="xs-upload-dialog__plate" aria-hidden="true">
              <Icon size={26} />
            </span>
            <span className="xs-upload-dialog__headline">把文件拖到这里</span>
            <span className="xs-upload-dialog__sub">
              或<em>点击选择</em>，也可以直接粘贴
            </span>
          </button>
        )}
      </div>

      <p className="xs-upload-dialog__limits" id={limitsId}>
        支持 {acceptLabel} · 单个文件最大 {formatBytes(maxBytes)}
      </p>

      {error ? (
        <p className="xs-upload-dialog__error" role="alert">
          <WarningCircle size={16} weight="fill" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <div className="xs-upload-dialog__footer">
        {hint ? <span className="xs-upload-dialog__hint">{hint}</span> : null}
        <div className="xs-upload-dialog__actions">
          <Button disabled={isUploading} onClick={handleClose}>取消</Button>
          <Button type="primary" disabled={!file} loading={isUploading} onClick={() => void handleSubmit()}>
            {submitLabel}
          </Button>
        </div>
      </div>

      <input
        ref={inputRef}
        hidden
        type="file"
        accept={[...accept, ...acceptMimeTypes].join(",")}
        data-testid={inputTestId}
        onChange={handleSelect}
      />
    </Modal>
  );
}
