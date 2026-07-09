import { create } from "zustand";
import type { DataHubAskDataStatus, DataHubStreamEvent } from "@/types/dataHub";

export type AskDataStatus = DataHubAskDataStatus;

export type AnalysisTurnState = {
  id: string;
  question: string;
  sessionId: string | null;
  status: AskDataStatus;
  events: DataHubStreamEvent[];
  error: string;
};

type UiStoreState = {
  isMoreOpen: boolean;
  selectedAppId: string | null;
  homeDraft: string;
  sentStatus: string;
  activeAnalysisQuestion: string;
  activeAnalysisSessionId: string | null;
  askDataStatus: AskDataStatus;
  askDataEvents: DataHubStreamEvent[];
  askDataError: string;
  analysisTurns: AnalysisTurnState[];
};

type UiStoreActions = {
  toggleMore: () => void;
  setHomeDraft: (draft: string) => void;
  selectApp: (appId: string, prompt: string) => void;
  setActiveAnalysisQuestion: (question: string) => void;
  startAskDataRun: (question: string, sessionId?: string | null) => void;
  appendAskDataEvent: (event: DataHubStreamEvent) => void;
  completeAskDataRun: () => void;
  failAskDataRun: (message: string) => void;
  restoreAskDataHistory: (input: {
    sessionId: string;
    question: string;
    events: DataHubStreamEvent[];
    turns?: AnalysisTurnState[];
    status?: AskDataStatus;
    error?: string;
  }) => void;
  clearHomeConversation: () => void;
  setSentStatus: (status: string) => void;
  resetUiState: () => void;
};

const initialState: UiStoreState = {
  isMoreOpen: true,
  selectedAppId: null,
  homeDraft: "",
  sentStatus: "",
  activeAnalysisQuestion: "",
  activeAnalysisSessionId: null,
  askDataStatus: "idle",
  askDataEvents: [],
  askDataError: "",
  analysisTurns: []
};

function createTurnId() {
  return `turn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function updateLastTurn(
  turns: AnalysisTurnState[],
  updater: (turn: AnalysisTurnState) => AnalysisTurnState
) {
  if (turns.length === 0) {
    return turns;
  }

  const nextTurns = [...turns];
  nextTurns[nextTurns.length - 1] = updater(nextTurns[nextTurns.length - 1]);
  return nextTurns;
}

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
  startAskDataRun: (question, sessionId) =>
    set((state) => {
      const nextSessionId = sessionId === undefined ? state.activeAnalysisSessionId : sessionId;
      const nextTurn: AnalysisTurnState = {
        id: createTurnId(),
        question,
        sessionId: nextSessionId,
        status: "streaming",
        events: [],
        error: ""
      };

      return {
        activeAnalysisQuestion: question,
        activeAnalysisSessionId: nextSessionId,
        askDataStatus: "streaming",
        askDataEvents: [],
        askDataError: "",
        analysisTurns: sessionId === null ? [nextTurn] : [...state.analysisTurns, nextTurn],
        sentStatus: `已提交问数：${question}`
      };
    }),
  appendAskDataEvent: (event) =>
    set((state) => {
      const nextSessionId = event.sessionId ?? state.activeAnalysisSessionId;
      const events = [...state.askDataEvents, event];

      return {
        activeAnalysisSessionId: nextSessionId,
        askDataEvents: events,
        analysisTurns: updateLastTurn(state.analysisTurns, (turn) => ({
          ...turn,
          sessionId: event.sessionId ?? turn.sessionId ?? nextSessionId,
          events: [...turn.events, event]
        }))
      };
    }),
  completeAskDataRun: () =>
    set((state) =>
      state.askDataStatus === "error"
        ? {}
        : {
            askDataStatus: "done",
            analysisTurns: updateLastTurn(state.analysisTurns, (turn) => ({
              ...turn,
              status: "done"
            }))
          }
    ),
  failAskDataRun: (message) =>
    set((state) => ({
      askDataStatus: "error",
      askDataError: message,
      analysisTurns: updateLastTurn(state.analysisTurns, (turn) => ({
        ...turn,
        status: "error",
        error: message
      }))
    })),
  restoreAskDataHistory: ({ sessionId, question, events, turns, status = "done", error = "" }) => {
    const restoredTurns =
      turns && turns.length > 0
        ? turns
        : [
            {
              id: createTurnId(),
              question,
              sessionId,
              status,
              events,
              error
            }
          ];
    const activeTurn = restoredTurns[restoredTurns.length - 1];

    return set({
      activeAnalysisSessionId: sessionId,
      activeAnalysisQuestion: activeTurn?.question || question,
      askDataStatus: activeTurn?.status || status,
      askDataEvents: activeTurn?.events || events,
      askDataError: activeTurn?.error || error,
      analysisTurns: restoredTurns,
      sentStatus: `已恢复历史对话：${question}`
    });
  },
  clearHomeConversation: () =>
    set({
      selectedAppId: null,
      homeDraft: "",
      sentStatus: "",
      activeAnalysisQuestion: initialState.activeAnalysisQuestion,
      activeAnalysisSessionId: initialState.activeAnalysisSessionId,
      askDataStatus: "idle",
      askDataEvents: [],
      askDataError: "",
      analysisTurns: []
    }),
  setSentStatus: (status) => set({ sentStatus: status }),
  resetUiState: () => set(initialState)
}));
