import { useState, type PropsWithChildren, type ReactNode } from "react";
import { XsShell } from "@/components/xs";
import "./pages.css";

type PageFrameProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}>;

export function PageFrame({ title, subtitle, actions, className = "", children }: PageFrameProps) {
  const [isMoreOpen, setIsMoreOpen] = useState(true);

  return (
    <XsShell isMoreOpen={isMoreOpen} onToggleMore={() => setIsMoreOpen((open) => !open)} onNewChat={() => undefined}>
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
