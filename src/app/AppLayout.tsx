import { Suspense, useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { XsShell } from "@/components/xs";
import { useUiStore } from "@/stores/uiStore";

export function AppLayout() {
  const mainRef = useRef<HTMLElement>(null);
  const lastFocusedHeadingRef = useRef<HTMLElement | null>(null);
  const location = useLocation();
  const isMoreOpen = useUiStore((state) => state.isMoreOpen);
  const toggleMore = useUiStore((state) => state.toggleMore);
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
      isMoreOpen={isMoreOpen}
      onToggleMore={toggleMore}
      onNewChat={clearHomeConversation}
    >
      <Suspense fallback={<div className="route-loading" role="status">页面加载中</div>}>
        <Outlet />
      </Suspense>
    </XsShell>
  );
}
