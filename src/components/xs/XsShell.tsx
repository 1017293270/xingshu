import type { PropsWithChildren, Ref } from "react";
import { XsMobileNav } from "./XsMobileNav";
import { XsSidebar } from "./XsSidebar";

type XsShellProps = PropsWithChildren<{
  mainRef?: Ref<HTMLElement>;
  isMoreOpen: boolean;
  onToggleMore: () => void;
  onNewChat: () => void;
}>;

export function XsShell({ children, mainRef, isMoreOpen, onToggleMore, onNewChat }: XsShellProps) {
  return (
    <div className="xs-shell">
      <a className="xs-skip-link" href="#xs-main-content">
        跳到主要内容
      </a>
      <XsSidebar isMoreOpen={isMoreOpen} onToggleMore={onToggleMore} onNewChat={onNewChat} />
      <XsMobileNav onNewChat={onNewChat} />
      <main className="xs-shell__main" id="xs-main-content" ref={mainRef} tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
