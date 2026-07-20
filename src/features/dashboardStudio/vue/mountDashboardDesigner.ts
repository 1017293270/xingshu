import { createApp, type App as VueApp } from "vue";
import type { DashboardRecord, DashboardSchema } from "@/types/dashboardStudio";
import DashboardDesignerApp from "./DashboardDesignerApp.vue";

export type DashboardDesignerMountOptions = {
  record: DashboardRecord;
  saveDraft: (schema: DashboardSchema, expectedRevision: number) => Promise<DashboardRecord>;
  publishDashboard: (schema: DashboardSchema, expectedRevision: number) => Promise<DashboardRecord>;
  exit: () => void;
  onReady?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onChange?: (schema: DashboardSchema) => void;
  onError?: (error: Error) => void;
};

export type DashboardDesignerHandle = {
  unmount: () => void;
};

const mountedApps = new WeakMap<HTMLElement, VueApp>();

export function mountDashboardDesigner(
  element: HTMLElement,
  options: DashboardDesignerMountOptions
): DashboardDesignerHandle {
  mountedApps.get(element)?.unmount();

  const app = createApp(DashboardDesignerApp, {
    initialSchema: options.record.schema,
    initialRevision: options.record.revision,
    initialStatus: options.record.status,
    saveDraft: options.saveDraft,
    publishDashboard: options.publishDashboard,
    exit: options.exit,
    onDirtyChange: options.onDirtyChange,
    onChange: options.onChange,
    onReady: options.onReady
  });

  app.config.errorHandler = (error) => {
    options.onError?.(error instanceof Error ? error : new Error(String(error)));
  };
  app.mount(element);
  mountedApps.set(element, app);

  return {
    unmount() {
      if (mountedApps.get(element) === app) {
        mountedApps.delete(element);
      }
      app.unmount();
      element.replaceChildren();
    }
  };
}
