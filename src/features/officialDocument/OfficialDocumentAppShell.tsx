import { ArrowLeft, ArrowSquareOut } from "@phosphor-icons/react";
import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import {
  releaseOfficialDocumentActionsHost,
  useOfficialDocumentShellStore,
  type OfficialDocumentAppChrome,
  type OfficialDocumentAppStage
} from "./officialDocumentShellStore";
import "./official-document.css";
import "./official-document-workspace.css";

export type { OfficialDocumentAppChrome, OfficialDocumentAppStage };

export const OFFICIAL_DOCUMENT_TEMPLATES_PATH = "/writing/templates";
export const OFFICIAL_DOCUMENT_DRAFTS_PATH = "/writing/drafts";
export const OFFICIAL_DOCUMENT_COMPOSE_PATH = "/writing";

/** 首屏就是写作台，路径决定初始形态，避免刷新详情页时先闪一帧写作态页头。 */
function stageForPath(pathname: string): OfficialDocumentAppStage {
  if (pathname.startsWith(`${OFFICIAL_DOCUMENT_TEMPLATES_PATH}/`)) return "template";
  if (pathname.startsWith(OFFICIAL_DOCUMENT_TEMPLATES_PATH)) return "library";
  if (pathname.startsWith(`${OFFICIAL_DOCUMENT_DRAFTS_PATH}/`)) return "draft";
  if (pathname.startsWith(OFFICIAL_DOCUMENT_DRAFTS_PATH)) return "drafts";
  return "compose";
}

const stageContext: Record<OfficialDocumentAppStage, string> = {
  compose: "公文写作",
  library: "模板库",
  drafts: "草稿管理",
  template: "模板结构",
  draft: "结构化起草"
};

/** 壳层在场与否决定动作是进页头还是就地渲染，所以这层标记仍走 context。 */
const OfficialDocumentAppContext = createContext(false);

export function useOfficialDocumentAppChrome(chrome: OfficialDocumentAppChrome) {
  const setChrome = useOfficialDocumentShellStore((state) => state.setChrome);
  const { pathname } = useLocation();
  /* 路径只记不订阅：写作台常驻，路由一变就重报文案会盖掉当前页面自己的声明。 */
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    setChrome({
      stage: chrome.stage,
      context: chrome.context,
      contextDetail: chrome.contextDetail,
      contextTo: chrome.contextTo,
      path: pathnameRef.current
    });
  }, [chrome.context, chrome.contextDetail, chrome.contextTo, chrome.stage, setChrome]);
}

export function OfficialDocumentAppActions({ children }: { children?: ReactNode }) {
  const insideShell = useContext(OfficialDocumentAppContext);
  const actionsHost = useOfficialDocumentShellStore((state) => state.actionsHost);
  if (children == null) return null;
  if (!insideShell) {
    return <div className="official-document-app__actions official-document-app__actions--inline">{children}</div>;
  }
  return actionsHost ? createPortal(children, actionsHost) : null;
}

export function OfficialDocumentAppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const declaredChrome = useOfficialDocumentShellStore((state) => state.chrome);
  const setActionsHost = useOfficialDocumentShellStore((state) => state.setActionsHost);
  const stage = stageForPath(location.pathname);
  /*
   * 只采用为当前这个路径声明的文案。写作台常驻不再随路由重挂，它那次声明不会重放；
   * 认路径就能保证从模板库退回写作台时页头跟着回到写作态，而不是留着上一页的标题。
   */
  const chrome: OfficialDocumentAppChrome = declaredChrome?.path === location.pathname
    ? declaredChrome
    : { stage, context: stageContext[stage] };

  /* ref 回调返回清理函数（React 19）：卸载时只收回自己这一个宿主。 */
  const attachActionsHost = useCallback((host: HTMLDivElement) => {
    setActionsHost(host);
    return () => releaseOfficialDocumentActionsHost(host);
  }, [setActionsHost]);

  const detailStage = chrome.stage === "template" || chrome.stage === "draft";
  const parentPath = chrome.stage === "draft" ? OFFICIAL_DOCUMENT_DRAFTS_PATH : OFFICIAL_DOCUMENT_TEMPLATES_PATH;

  return (
    <OfficialDocumentAppContext.Provider value={true}>
      <div className="official-document-app" data-stage={chrome.stage}>
        <a className="xs-skip-link" href="#official-document-workspace">跳到报告工作区</a>
        <header className="official-document-app__bar" data-stage={chrome.stage}>
          {detailStage ? (
            <Link className="official-document-app__back" to={parentPath}>
              <ArrowLeft size={15} aria-hidden="true" />
              {chrome.stage === "draft" ? "返回草稿管理" : "返回格式模板"}
            </Link>
          ) : (
            <nav className="official-document-app__nav" aria-label="公文导航">
              <NavLink to={OFFICIAL_DOCUMENT_COMPOSE_PATH} end>公文写作</NavLink>
              <NavLink to={OFFICIAL_DOCUMENT_TEMPLATES_PATH}>格式模板</NavLink>
              <NavLink to={OFFICIAL_DOCUMENT_DRAFTS_PATH}>草稿管理</NavLink>
            </nav>
          )}
          {detailStage ? (
            <div className="official-document-app__context">
              <p className="official-document-app__context-title">
                {chrome.contextTo ? (
                  <Link className="official-document-app__context-link" to={chrome.contextTo} title={chrome.context}>
                    <span>{chrome.context}</span>
                    <ArrowSquareOut size={15} aria-hidden="true" />
                  </Link>
                ) : chrome.context}
              </p>
              {chrome.contextDetail ? <small>{chrome.contextDetail}</small> : null}
            </div>
          ) : null}
          <div className="official-document-app__actions" ref={attachActionsHost} />
        </header>
        <section
          className="official-document-app__workspace"
          id="official-document-workspace"
          aria-label="报告智写工作台"
          data-stage={chrome.stage}
        >
          {children}
        </section>
      </div>
    </OfficialDocumentAppContext.Provider>
  );
}

export function OfficialDocumentAppLayout() {
  return (
    <OfficialDocumentAppShell>
      <Outlet />
    </OfficialDocumentAppShell>
  );
}
