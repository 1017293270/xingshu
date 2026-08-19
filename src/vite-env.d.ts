/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATAHUB_APP_URL?: string;
  readonly VITE_DATAHUB_API_BASE_URL?: string;
  readonly VITE_DATAHUB_PROXY_TARGET?: string;
  readonly VITE_DATAHUB_BFF_PORT?: string;
  readonly VITE_DATAHUB_KB_MANAGE_PATH?: string;
  readonly VITE_DATAHUB_KB_DETAIL_PATH?: string;
  readonly VITE_DATAHUB_UI_SAME_ORIGIN?: string;
  readonly VITE_OFFICIAL_DOCUMENT_API_BASE_URL?: string;
  readonly VITE_OFFICIAL_DOCUMENT_API_MODE?: string;
  readonly VITE_OFFICIAL_DOCUMENT_PROXY_TARGET?: string;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
