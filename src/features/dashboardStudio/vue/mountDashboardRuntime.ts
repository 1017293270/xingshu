import { createApp } from "vue";
import type { DashboardRecord } from "@/types/dashboardStudio";
import DashboardRuntimeApp from "./DashboardRuntimeApp.vue";

export function mountDashboardRuntime(
  element: HTMLElement,
  record: DashboardRecord,
  options: { fullscreen?: boolean } = {}
) {
  const app = createApp(DashboardRuntimeApp, { record, fullscreen: options.fullscreen ?? false });
  app.mount(element);
  return {
    unmount() {
      app.unmount();
      element.replaceChildren();
    }
  };
}
