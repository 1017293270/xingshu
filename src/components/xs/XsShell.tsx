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
  return (
    <div className={`xs-shell${isSidebarCollapsed ? " xs-shell--sidebar-collapsed" : ""}`}>
      <a className="xs-skip-link" href="#xs-main-content">
        跳到主要内容
      </a>
      <XsSidebar
        collapsed={isSidebarCollapsed}
        onToggleCollapsed={onToggleSidebarCollapsed}
        onNewChat={onNewChat}
      />
      <XsMobileNav onNewChat={onNewChat} />
      <main className="xs-shell__main" id="xs-main-content" ref={mainRef} tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
