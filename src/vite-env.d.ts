/// <reference types="vite/client" />

/** vite.config.ts 的 define 注入，值取自 package.json 的 version */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string;
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
  readonly VITE_RAG_IMAGE_PROXY_TARGET?: string;
  readonly VITE_RAG_IMAGE_ORIGIN?: string;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
