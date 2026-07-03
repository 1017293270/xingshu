import { create } from "zustand";

type UiStoreState = {
  isMoreOpen: boolean;
  selectedAppId: string | null;
  homeDraft: string;
  sentStatus: string;
  activeAnalysisQuestion: string;
};

type UiStoreActions = {
  toggleMore: () => void;
  setHomeDraft: (draft: string) => void;
  selectApp: (appId: string, prompt: string) => void;
  setActiveAnalysisQuestion: (question: string) => void;
  clearHomeConversation: () => void;
  setSentStatus: (status: string) => void;
  resetUiState: () => void;
};

const initialState: UiStoreState = {
  isMoreOpen: true,
  selectedAppId: null,
  homeDraft: "",
  sentStatus: "",
  activeAnalysisQuestion: "请帮我分析2024年各季度的销售额趋势，并与2023年同期进行对比。"
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
  setActiveAnalysisQuestion: (question) => set({ activeAnalysisQuestion: question }),
  clearHomeConversation: () =>
    set({
      selectedAppId: null,
      homeDraft: "",
      sentStatus: "",
      activeAnalysisQuestion: initialState.activeAnalysisQuestion
    }),
  setSentStatus: (status) => set({ sentStatus: status }),
  resetUiState: () => set(initialState)
}));
