import { Suspense, useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { XsRouteFallback, XsShell } from "@/components/xs";
import { useUiStore } from "@/stores/uiStore";

export function AppLayout() {
  const mainRef = useRef<HTMLElement>(null);
  const lastFocusedHeadingRef = useRef<HTMLElement | null>(null);
  const location = useLocation();
  const isSidebarCollapsed = useUiStore((state) => state.isSidebarCollapsed);
  const toggleSidebarCollapsed = useUiStore((state) => state.toggleSidebarCollapsed);
  const clearHomeConversation = useUiStore((state) => state.clearHomeConversation);

  useEffect(() => {
    const main = mainRef.current;
    main?.scrollTo?.({ top: 0 });

    const focusHeading = () => {
      const heading = main?.querySelector<HTMLElement>("h1");
      if (!heading || heading === lastFocusedHeadingRef.current) {
        return false;
      }

      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      lastFocusedHeadingRef.current = heading;
      return true;
    };

    if (focusHeading() || !main) {
      return;
    }

    const observer = new MutationObserver(() => {
      if (focusHeading()) {
        observer.disconnect();
      }
    });
    observer.observe(main, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [location.pathname]);

  return (
    <XsShell
      mainRef={mainRef}
      isSidebarCollapsed={isSidebarCollapsed}
      onToggleSidebarCollapsed={toggleSidebarCollapsed}
      onNewChat={clearHomeConversation}
    >
      <Suspense fallback={<XsRouteFallback />}>
        <div className="xs-route-view" key={location.pathname}>
          <Outlet />
        </div>
      </Suspense>
    </XsShell>
  );
}
