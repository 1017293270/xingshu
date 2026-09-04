/**
 * 当前构建的版本号。dev/beta/prod 三条版本分支各自 bump package.json，
 * 打出来的包就自带身份，页面右下角显示它用来分辨自己开的是哪一套环境。
 * VITE_APP_VERSION 留给 CI 或临时构建覆盖，缺省走 package.json。
 */
export function resolveAppVersion(
  override = import.meta.env.VITE_APP_VERSION,
  packaged = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : ""
) {
  return (override ?? "").trim() || packaged.trim();
}

export const appVersion = resolveAppVersion();
