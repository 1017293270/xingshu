/** 剪贴板在非安全上下文和无权限时都会抛，调用方统一按返回值提示，不弹异常。 */
export async function copyText(text: string) {
  const value = text.trim();
  if (!value) {
    return false;
  }

  // http 局域网地址上 navigator.clipboard 直接是 undefined，先探测再调用。
  if (typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function") {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // 非安全上下文、权限被拒、文档失焦都落到旧接口兜底，不直接报失败。
    }
  }

  return copyWithSelection(value);
}

/** document.execCommand 已废弃，但它是 http 环境下唯一还能用的复制通道。 */
function copyWithSelection(value: string) {
  if (typeof document === "undefined" || !document.body || typeof document.execCommand !== "function") {
    return false;
  }

  const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  // 不能用 display:none，隐藏元素选不中；固定 1px 透明块避免页面跳动。
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.padding = "0";
  textarea.style.border = "none";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);

  try {
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(0, value.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
    previousActive?.focus({ preventScroll: true });
  }
}
