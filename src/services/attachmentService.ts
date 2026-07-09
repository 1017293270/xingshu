export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const supportedMimeTypes = new Set([
  "application/json",
  "application/msword",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "text/markdown",
  "text/plain"
]);

const supportedExtensions = new Set(["csv", "doc", "docx", "json", "md", "pdf", "txt", "xls", "xlsx"]);

export type AttachmentQueueItem = {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  status: "ready" | "rejected";
  error: string;
};

function hashText(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function getExtension(filename: string) {
  return filename.includes(".") ? filename.split(".").pop()?.toLowerCase() || "" : "";
}

function isSupported(file: File) {
  return file.type.startsWith("image/") || supportedMimeTypes.has(file.type) || supportedExtensions.has(getExtension(file.name));
}

export function createAttachmentQueue(files: File[]): AttachmentQueueItem[] {
  return files.map((file, index) => {
    const id = `local-${hashText(`${file.name}:${file.size}:${file.lastModified}:${index}`)}`;
    let error = "";

    if (file.size > MAX_ATTACHMENT_BYTES) {
      error = "单个附件不能超过 20 MB";
    } else if (!isSupported(file)) {
      error = "暂不支持此文件类型";
    }

    return {
      id,
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      status: error ? "rejected" : "ready",
      error
    };
  });
}
