import type { PropsWithChildren } from "react";
import { XsSidebar } from "./XsSidebar";

type XsShellProps = PropsWithChildren<{
  isMoreOpen: boolean;
  onToggleMore: () => void;
  onNewChat: () => void;
}>;

export function XsShell({ children, isMoreOpen, onToggleMore, onNewChat }: XsShellProps) {
  return (
    <div className="xs-shell">
      <XsSidebar isMoreOpen={isMoreOpen} onToggleMore={onToggleMore} onNewChat={onNewChat} />
      <main className="xs-shell__main">{children}</main>
    </div>
  );
}
