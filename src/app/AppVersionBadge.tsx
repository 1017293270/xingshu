import { useLocation } from "react-router";
import { appVersion } from "./appVersion";

/**
 * 全屏画布页自己占着右下角（编辑器的智享面板、放映态的返回键），
 * 版本号飘在那儿会压住控件，这两条路由不挂。
 */
const fullscreenCanvasRoutes = new Set(["/dashboard-editor", "/dashboard-view"]);

/** 右下角的版本水印：只读、不可点、不进 tab 序，纯粹用来分辨当前是哪套环境。 */
export function AppVersionBadge() {
  const { pathname } = useLocation();

  if (!appVersion || fullscreenCanvasRoutes.has(pathname)) {
    return null;
  }

  return (
    <span className="xs-app-version" title={`当前版本 ${appVersion}`}>
      <span className="sr-only">当前版本 </span>
      {appVersion}
    </span>
  );
}
