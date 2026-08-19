import { ArrowLeft, FileText, NotePencil, Stack } from "@phosphor-icons/react";
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

export type OfficialDocumentAppStage = "library" | "drafts" | "template" | "draft";

export type OfficialDocumentAppChrome = {
  stage: OfficialDocumentAppStage;
  context: string;
  contextDetail?: string;
};

export const OFFICIAL_DOCUMENT_TEMPLATES_PATH = "/writing/templates";
export const OFFICIAL_DOCUMENT_DRAFTS_PATH = "/writing/drafts";

const defaultChrome: OfficialDocumentAppChrome = {
  stage: "library",
  context: "模板库"
};

const stageEyebrow: Record<OfficialDocumentAppStage, string> = {
  library: "Agent 应用",
  drafts: "Agent 应用",
  template: "模板校准",
  draft: "结构化起草"
};

/** 详情态在页头保留一级返回入口，和左侧导航互为补充。 */
const stageParent: Partial<Record<OfficialDocumentAppStage, { label: string; to: string }>> = {
  template: { label: "模板库", to: OFFICIAL_DOCUMENT_TEMPLATES_PATH },
  draft: { label: "草稿箱", to: OFFICIAL_DOCUMENT_DRAFTS_PATH }
};

const navItems = [
  {
    key: "templates",
    label: "模板库",
    detail: "上传、校准与发布",
    to: OFFICIAL_DOCUMENT_TEMPLATES_PATH,
    icon: Stack,
    matches: (pathname: string) => pathname === "/writing" || pathname.startsWith(OFFICIAL_DOCUMENT_TEMPLATES_PATH)
  },
  {
    key: "drafts",
    label: "草稿箱",
    detail: "起草、绑定与导出",
    to: OFFICIAL_DOCUMENT_DRAFTS_PATH,
    icon: FileText,
    matches: (pathname: string) => pathname.startsWith(OFFICIAL_DOCUMENT_DRAFTS_PATH)
  }
] as const;

type OfficialDocumentAppContextValue = {
  actionsHost: HTMLDivElement | null;
  setChrome: (chrome: OfficialDocumentAppChrome) => void;
};

const OfficialDocumentAppContext = createContext<OfficialDocumentAppContextValue | null>(null);

export function resolveOfficialDocumentExitPath(from: unknown) {
  const containsUnsafeCharacter = typeof from === "string" && Array.from(from).some((character) => {
    const code = character.charCodeAt(0);
    return character === "\\" || code <= 31 || code === 127;
  });
  if (
    typeof from !== "string"
    || !from.startsWith("/")
    || from.startsWith("//")
    || containsUnsafeCharacter
    || from.startsWith("/login")
    || from.startsWith("/writing")
    || from.startsWith("/welcome")
  ) {
    return "/";
  }

  try {
    const origin = typeof window === "undefined" ? "http://127.0.0.1" : window.location.origin;
    const target = new URL(from, `${origin}/`);
    if (target.origin !== origin || target.pathname === "/login" || target.pathname.startsWith("/writing")) {
      return "/";
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}

export function useOfficialDocumentAppChrome(chrome: OfficialDocumentAppChrome) {
  const context = useContext(OfficialDocumentAppContext);
  const setChrome = context?.setChrome;

  useEffect(() => {
    if (!setChrome) return;
    setChrome(chrome);
  }, [chrome.context, chrome.contextDetail, chrome.stage, setChrome]);
}

export function OfficialDocumentAppActions({ children }: { children?: ReactNode }) {
  const host = useContext(OfficialDocumentAppContext)?.actionsHost;
  if (children == null) return null;
  if (!host) {
    return <div className="official-document-app__actions official-document-app__actions--inline">{children}</div>;
  }
  return createPortal(children, host);
}

export function OfficialDocumentAppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [chrome, setChrome] = useState<OfficialDocumentAppChrome>(defaultChrome);
  const [actionsHost, setActionsHost] = useState<HTMLDivElement | null>(null);
  const exitPath = resolveOfficialDocumentExitPath(
    (location.state as { from?: unknown } | null)?.from
  );
  const parent = stageParent[chrome.stage];
  const value = useMemo(
    () => ({ actionsHost, setChrome }),
    [actionsHost]
  );

  return (
    <OfficialDocumentAppContext.Provider value={value}>
      <div className="official-document-app">
        <a className="xs-skip-link" href="#official-document-workspace">跳到公文工作区</a>
        <aside className="official-document-rail">
          <div className="official-document-rail__brand">
            <span className="official-document-rail__mark" aria-hidden="true">
              <NotePencil size={19} weight="duotone" />
            </span>
            <h1>公文写作</h1>
          </div>
          <nav className="official-document-rail__nav" aria-label="公文写作导航">
            {navItems.map((item) => {
              const active = item.matches(location.pathname);
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  to={item.to}
                  data-active={active || undefined}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={18} weight={active ? "fill" : "regular"} aria-hidden="true" />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </span>
                </Link>
              );
            })}
          </nav>
          <div className="official-document-rail__foot">
            <Link className="official-document-app__exit" to={exitPath}>
              <ArrowLeft size={15} aria-hidden="true" />
              返回星数
            </Link>
          </div>
        </aside>
        <div className="official-document-app__main">
          <header className="official-document-app__bar">
            <div className="official-document-app__context">
              <p className="official-document-app__eyebrow">
                {parent ? (
                  <>
                    <Link className="official-document-app__library" to={parent.to}>{parent.label}</Link>
                    <i aria-hidden="true">/</i>
                  </>
                ) : null}
                <span>{stageEyebrow[chrome.stage]}</span>
              </p>
              <p className="official-document-app__context-title">{chrome.context}</p>
              {chrome.contextDetail ? <small>{chrome.contextDetail}</small> : null}
            </div>
            <div className="official-document-app__actions" ref={setActionsHost} />
          </header>
          <section
            className="official-document-app__workspace"
            id="official-document-workspace"
            aria-label="公文写作工作台"
            data-stage={chrome.stage}
          >
            {children}
          </section>
        </div>
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
