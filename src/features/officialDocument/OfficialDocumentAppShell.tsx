import { ArrowLeft, ArrowSquareOut } from "@phosphor-icons/react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import { Link, Outlet, useLocation } from "react-router";
import "./official-document.css";
import "./official-document-workspace.css";

export type OfficialDocumentAppStage = "compose" | "library" | "drafts" | "template" | "draft";

export type OfficialDocumentAppChrome = {
  stage: OfficialDocumentAppStage;
  context: string;
  contextDetail?: string;
  contextTo?: string;
};

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
  drafts: "草稿箱",
  template: "模板结构",
  draft: "结构化起草"
};

type OfficialDocumentAppContextValue = {
  actionsHost: HTMLDivElement | null;
  setChrome: (chrome: OfficialDocumentAppChrome) => void;
};

const OfficialDocumentAppContext = createContext<OfficialDocumentAppContextValue | null>(null);

export function useOfficialDocumentAppChrome(chrome: OfficialDocumentAppChrome) {
  const context = useContext(OfficialDocumentAppContext);
  const setChrome = context?.setChrome;

  useEffect(() => {
    if (!setChrome) return;
    setChrome(chrome);
  }, [chrome.context, chrome.contextDetail, chrome.contextTo, chrome.stage, setChrome]);
}

export function OfficialDocumentAppActions({ children }: { children?: ReactNode }) {
  const context = useContext(OfficialDocumentAppContext);
  if (children == null) return null;
  if (!context) {
    return <div className="official-document-app__actions official-document-app__actions--inline">{children}</div>;
  }
  return context.actionsHost ? createPortal(children, context.actionsHost) : null;
}

export function OfficialDocumentAppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [chrome, setChrome] = useState<OfficialDocumentAppChrome>(() => {
    const stage = stageForPath(location.pathname);
    return { stage, context: stageContext[stage] };
  });
  const [actionsHost, setActionsHost] = useState<HTMLDivElement | null>(null);
  const value = useMemo(
    () => ({ actionsHost, setChrome }),
    [actionsHost]
  );

  return (
    <OfficialDocumentAppContext.Provider value={value}>
      <div className="official-document-app" data-stage={chrome.stage}>
        <a className="xs-skip-link" href="#official-document-workspace">跳到报告工作区</a>
        {chrome.stage !== "compose" ? (
          <header className="official-document-app__bar" data-stage={chrome.stage}>
            <Link className="official-document-app__back" to={OFFICIAL_DOCUMENT_COMPOSE_PATH}>
              <ArrowLeft size={15} aria-hidden="true" />
              返回公文写作
            </Link>
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
            <div className="official-document-app__actions" ref={setActionsHost} />
          </header>
        ) : null}
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
