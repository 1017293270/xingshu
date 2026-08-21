import { SidebarSimple } from "@phosphor-icons/react";
import type { PropsWithChildren, Ref } from "react";
import { XsMobileNav } from "./XsMobileNav";
import { XsSidebar } from "./XsSidebar";

type XsShellProps = PropsWithChildren<{
  mainRef?: Ref<HTMLElement>;
  isSidebarCollapsed: boolean;
  onToggleSidebarCollapsed: () => void;
  onNewChat: () => void;
}>;

export function XsShell({
  children,
  mainRef,
  isSidebarCollapsed,
  onToggleSidebarCollapsed,
  onNewChat
}: XsShellProps) {
  const toggleLabel = isSidebarCollapsed ? "展开侧边栏" : "收起侧边栏";

  return (
    <div className={`xs-shell${isSidebarCollapsed ? " xs-shell--sidebar-collapsed" : ""}`}>
      <a className="xs-skip-link" href="#xs-main-content">
        跳到主要内容
      </a>
      <XsSidebar collapsed={isSidebarCollapsed} onNewChat={onNewChat} />
      <XsMobileNav onNewChat={onNewChat} />
      <main className="xs-shell__main" id="xs-main-content" ref={mainRef} tabIndex={-1}>
        <div className="xs-shell__sidebar-toggle-slot">
          <button
            type="button"
            className="xs-shell__sidebar-toggle"
            aria-label={toggleLabel}
            aria-expanded={!isSidebarCollapsed}
            title={toggleLabel}
            onClick={onToggleSidebarCollapsed}
          >
            <SidebarSimple size={20} weight="regular" aria-hidden="true" />
          </button>
        </div>
        {children}
      </main>
    </div>
  );
}
