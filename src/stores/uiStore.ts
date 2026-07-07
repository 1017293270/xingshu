import { create } from "zustand";
import type { DataHubStreamEvent } from "@/types/dataHub";

type AskDataStatus = "idle" | "streaming" | "done" | "error";

type UiStoreState = {
  isMoreOpen: boolean;
  selectedAppId: string | null;
  homeDraft: string;
  sentStatus: string;
  activeAnalysisQuestion: string;
  askDataStatus: AskDataStatus;
  askDataEvents: DataHubStreamEvent[];
  askDataError: string;
};

type UiStoreActions = {
  toggleMore: () => void;
  setHomeDraft: (draft: string) => void;
  selectApp: (appId: string, prompt: string) => void;
  setActiveAnalysisQuestion: (question: string) => void;
  startAskDataRun: (question: string) => void;
  appendAskDataEvent: (event: DataHubStreamEvent) => void;
  completeAskDataRun: () => void;
  failAskDataRun: (message: string) => void;
  clearHomeConversation: () => void;
  setSentStatus: (status: string) => void;
  resetUiState: () => void;
};

const initialState: UiStoreState = {
  isMoreOpen: true,
  selectedAppId: null,
  homeDraft: "",
  sentStatus: "",
  activeAnalysisQuestion: "请帮我分析2024年各季度的销售额趋势，并与2023年同期进行对比。",
  askDataStatus: "idle",
  askDataEvents: [],
  askDataError: ""
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
  startAskDataRun: (question) =>
    set({
      activeAnalysisQuestion: question,
      askDataStatus: "streaming",
      askDataEvents: [],
      askDataError: "",
      sentStatus: `已提交问数：${question}`
    }),
  appendAskDataEvent: (event) =>
    set((state) => ({
      askDataEvents: [...state.askDataEvents, event]
    })),
  completeAskDataRun: () =>
    set((state) => (state.askDataStatus === "error" ? {} : { askDataStatus: "done" })),
  failAskDataRun: (message) =>
    set({
      askDataStatus: "error",
      askDataError: message
    }),
  clearHomeConversation: () =>
    set({
      selectedAppId: null,
      homeDraft: "",
      sentStatus: "",
      activeAnalysisQuestion: initialState.activeAnalysisQuestion,
      askDataStatus: "idle",
      askDataEvents: [],
      askDataError: ""
    }),
  setSentStatus: (status) => set({ sentStatus: status }),
  resetUiState: () => set(initialState)
}));
