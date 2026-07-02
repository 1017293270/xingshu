import { create } from "zustand";

type UiStoreState = {
  isMoreOpen: boolean;
  selectedAppId: string | null;
  homeDraft: string;
  sentStatus: string;
};

type UiStoreActions = {
  toggleMore: () => void;
  setHomeDraft: (draft: string) => void;
  selectApp: (appId: string, prompt: string) => void;
  clearHomeConversation: () => void;
  setSentStatus: (status: string) => void;
  resetUiState: () => void;
};

const initialState: UiStoreState = {
  isMoreOpen: true,
  selectedAppId: null,
  homeDraft: "",
  sentStatus: ""
};

export const useUiStore = create<UiStoreState & UiStoreActions>((set) => ({
  ...initialState,
  toggleMore: () => set((state) => ({ isMoreOpen: !state.isMoreOpen })),
  setHomeDraft: (draft) => set({ homeDraft: draft }),
  selectApp: (appId, prompt) =>
    set({
      selectedAppId: appId,
      homeDraft: prompt,
      sentStatus: ""
    }),
  clearHomeConversation: () =>
    set({
      selectedAppId: null,
      homeDraft: "",
      sentStatus: ""
    }),
  setSentStatus: (status) => set({ sentStatus: status }),
  resetUiState: () => set(initialState)
}));
