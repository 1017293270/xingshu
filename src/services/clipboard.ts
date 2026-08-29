/** 剪贴板在非安全上下文和无权限时都会抛，调用方统一按返回值提示，不弹异常。 */
export async function copyText(text: string) {
  const value = text.trim();
  if (!value) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
