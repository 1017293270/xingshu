import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/app/App";
import { AppErrorBoundary } from "@/app/AppErrorBoundary";
import { AppProviders } from "@/app/providers";
import { installVitePreloadRecovery } from "@/app/preloadRecovery";
import "@/styles/tokens.css";
import "@/components/xs/xs.css";

installVitePreloadRecovery({
  buildId: import.meta.url,
  reload: () => window.location.reload(),
  storage: window.sessionStorage,
  target: window
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <AppProviders>
        <App />
      </AppProviders>
    </AppErrorBoundary>
  </React.StrictMode>
);
