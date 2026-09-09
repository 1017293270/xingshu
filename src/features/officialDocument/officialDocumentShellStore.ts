import { create } from "zustand";

export type OfficialDocumentAppStage = "compose" | "library" | "drafts" | "template" | "draft";

export type OfficialDocumentAppChrome = {
  stage: OfficialDocumentAppStage;
  context: string;
  contextDetail?: string;
  contextTo?: string;
};

/**
 * 页头文案连同它被声明时的路径一起存。写作台常驻后不再随路由重挂，
 * 它那次声明不会重放；记下路径，壳层就能认出「这条文案不是这个页面的」并退回路径默认值。
 */
export type DeclaredOfficialDocumentChrome = OfficialDocumentAppChrome & { path: string };

type OfficialDocumentShellState = {
  /** 页头右侧的动作槽位，由壳层挂上来。 */
  actionsHost: HTMLDivElement | null;
  chrome: DeclaredOfficialDocumentChrome | null;
  setActionsHost: (host: HTMLDivElement | null) => void;
  setChrome: (chrome: DeclaredOfficialDocumentChrome) => void;
};

export const useOfficialDocumentShellStore = create<OfficialDocumentShellState>((set) => ({
  actionsHost: null,
  chrome: null,
  setActionsHost: (actionsHost) => set({ actionsHost }),
  setChrome: (chrome) => set((state) => {
    const current = state.chrome;
    if (current
      && current.path === chrome.path
      && current.stage === chrome.stage
      && current.context === chrome.context
      && current.contextDetail === chrome.contextDetail
      && current.contextTo === chrome.contextTo) {
      return {};
    }
    return { chrome };
  })
}));

/** 壳层卸载时只收回自己挂的那一个宿主，别把后挂载的壳层的宿主一起清掉。 */
export function releaseOfficialDocumentActionsHost(host: HTMLDivElement | null) {
  useOfficialDocumentShellStore.setState((state) => (
    state.actionsHost === host ? { actionsHost: null } : {}
  ));
}
