import type { PropsWithChildren, ReactNode } from "react";
import { XsShell } from "@/components/xs";
import { useUiStore } from "@/stores/uiStore";
import "./pages.css";

type PageFrameProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}>;

export function PageFrame({ title, subtitle, actions, className = "", children }: PageFrameProps) {
  const isMoreOpen = useUiStore((state) => state.isMoreOpen);
  const toggleMore = useUiStore((state) => state.toggleMore);
  const clearHomeConversation = useUiStore((state) => state.clearHomeConversation);

  return (
    <XsShell isMoreOpen={isMoreOpen} onToggleMore={toggleMore} onNewChat={clearHomeConversation}>
      <div className={`xs-page ${className}`}>
        <header className="xs-page__head">
          <div className="xs-page__title">
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {actions ? <div className="xs-page__actions">{actions}</div> : null}
        </header>
        {children}
      </div>
    </XsShell>
  );
}
