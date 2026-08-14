/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATAHUB_APP_URL?: string;
  readonly VITE_DATAHUB_KB_MANAGE_PATH?: string;
  readonly VITE_DATAHUB_KB_DETAIL_PATH?: string;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
