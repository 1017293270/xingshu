import { create } from "zustand";
import type { AttachmentQueueItem } from "@/services/attachmentService";
import { createDataHubClientId } from "@/services/dataHubAskDataService";
import type {
  DataHubAskDataStatus,
  DataHubAskRunId,
  DataHubChatMode,
  DataHubStreamEvent
} from "@/types/dataHub";

export type AskDataStatus = DataHubAskDataStatus;

export type AnalysisTurnState = {
  id: string;
  question: string;
  sessionId: string | null;
  chatId: string;
  chatMode: DataHubChatMode;
  status: AskDataStatus;
  events: DataHubStreamEvent[];
  error: string;
};

type UiStoreState = {
  isSidebarCollapsed: boolean;
  selectedAppId: string | null;
  homeDraft: string;
  sentStatus: string;
  pendingAttachments: AttachmentQueueItem[];
  activeAnalysisQuestion: string;
  activeAnalysisSessionId: string | null;
  activeAnalysisMode: DataHubChatMode;
  activeAskDataRunId: DataHubAskRunId | null;
  askDataStatus: AskDataStatus;
  askDataEvents: DataHubStreamEvent[];
  askDataError: string;
  analysisTurns: AnalysisTurnState[];
  onboardingOpen: boolean;
  dashboardOnboardingOpen: boolean;
};

type UiStoreActions = {
  toggleSidebarCollapsed: () => void;
  setHomeDraft: (draft: string) => void;
  selectApp: (appId: string, prompt: string) => void;
  setActiveAnalysisQuestion: (question: string) => void;
  queuePendingAttachments: (attachments: AttachmentQueueItem[]) => void;
  removePendingAttachment: (attachmentId: string) => void;
  startAskDataRun: (
    question: string,
    sessionId?: string | null,
    chatMode?: DataHubChatMode
  ) => DataHubAskRunId;
  appendAskDataEvent: (runId: DataHubAskRunId, event: DataHubStreamEvent) => void;
  completeAskDataRun: (runId: DataHubAskRunId) => void;
  failAskDataRun: (runId: DataHubAskRunId, message: string) => void;
  cancelAskDataRun: (runId: DataHubAskRunId) => void;
  bindAskDataController: (runId: DataHubAskRunId, controller: AbortController) => void;
  restoreAskDataHistory: (input: {
    sessionId: string;
    question: string;
    events: DataHubStreamEvent[];
    turns?: AnalysisTurnState[];
    chatMode?: DataHubChatMode;
    status?: AskDataStatus;
    error?: string;
  }) => void;
  clearHomeConversation: () => void;
  setSentStatus: (status: string) => void;
  setOnboardingOpen: (open: boolean) => void;
  setDashboardOnboardingOpen: (open: boolean) => void;
  resetUiState: () => void;
};

const initialState: UiStoreState = {
  isSidebarCollapsed: false,
  selectedAppId: null,
  homeDraft: "",
  sentStatus: "",
  pendingAttachments: [],
  activeAnalysisQuestion: "",
  activeAnalysisSessionId: null,
  activeAnalysisMode: "ask",
  activeAskDataRunId: null,
  askDataStatus: "idle",
  askDataEvents: [],
  askDataError: "",
  analysisTurns: [],
  onboardingOpen: false,
  dashboardOnboardingOpen: false
};

function createTurnId() {
  return `turn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function dataHubModeLabel(chatMode: DataHubChatMode) {
  if (chatMode === "rag") return "问知";
  if (chatMode === "document_lookup") return "找文档";
  if (chatMode === "agent") return "智能编排";
  return "问数";
}

function updateTurn(
  turns: AnalysisTurnState[],
  runId: DataHubAskRunId,
  updater: (turn: AnalysisTurnState) => AnalysisTurnState
) {
  const turnIndex = turns.findIndex((turn) => turn.id === runId);
  if (turnIndex < 0) {
    return turns;
  }

  const nextTurns = [...turns];
  nextTurns[turnIndex] = updater(nextTurns[turnIndex]);
  return nextTurns;
}

const askDataControllers = new Map<DataHubAskRunId, AbortController>();

function releaseAskDataController(runId: DataHubAskRunId, abort = false) {
  const controller = askDataControllers.get(runId);
  askDataControllers.delete(runId);
  if (abort) {
    controller?.abort();
  }
}

function abortAllAskDataControllers() {
  const controllers = Array.from(askDataControllers.values());
  askDataControllers.clear();
  controllers.forEach((controller) => controller.abort());
}

export const useUiStore = create<UiStoreState & UiStoreActions>((set, get) => ({
  ...initialState,
  toggleSidebarCollapsed: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
  setHomeDraft: (draft) => set({ homeDraft: draft }),
  selectApp: (appId, prompt) =>
    set({
      selectedAppId: appId,
      homeDraft: prompt,
      sentStatus: ""
    }),
  setActiveAnalysisQuestion: (question) => set({ activeAnalysisQuestion: question }),
  queuePendingAttachments: (attachments) =>
    set((state) => {
      const existingIds = new Set(state.pendingAttachments.map((attachment) => attachment.id));
      return {
        pendingAttachments: [
          ...state.pendingAttachments,
          ...attachments.filter((attachment) => !existingIds.has(attachment.id))
        ]
      };
    }),
  removePendingAttachment: (attachmentId) =>
    set((state) => ({
      pendingAttachments: state.pendingAttachments.filter((attachment) => attachment.id !== attachmentId)
    })),
  startAskDataRun: (question, sessionId, chatMode = "ask") => {
    const previousRunId = get().activeAskDataRunId;
    if (previousRunId) {
      get().cancelAskDataRun(previousRunId);
    }

    const runId = createTurnId();
    set((state) => {
      const startsNewConversation =
        sessionId === null || state.activeAnalysisMode !== chatMode || !state.activeAnalysisSessionId;
      const nextSessionId =
        (sessionId && sessionId.trim()) ||
        (!startsNewConversation ? state.activeAnalysisSessionId : null) ||
        createDataHubClientId("session");
      const nextTurn: AnalysisTurnState = {
        id: runId,
        question,
        sessionId: nextSessionId,
        chatId: createDataHubClientId("chat"),
        chatMode,
        status: "streaming",
        events: [],
        error: ""
      };

      return {
        activeAnalysisQuestion: question,
        activeAnalysisSessionId: nextSessionId,
        activeAnalysisMode: chatMode,
        activeAskDataRunId: runId,
        askDataStatus: "streaming",
        askDataEvents: [],
        askDataError: "",
        analysisTurns: startsNewConversation ? [nextTurn] : [...state.analysisTurns, nextTurn],
        sentStatus: `已提交${dataHubModeLabel(chatMode)}：${question}`
      };
    });
    return runId;
  },
  appendAskDataEvent: (runId, event) =>
    set((state) => {
      const targetTurn = state.analysisTurns.find((turn) => turn.id === runId);
      if (!targetTurn || targetTurn.status !== "streaming") {
        return {};
      }

      const nextTurns = updateTurn(state.analysisTurns, runId, (turn) => ({
        ...turn,
        events: [...turn.events, event]
      }));

      if (state.activeAskDataRunId !== runId) {
        return { analysisTurns: nextTurns };
      }

      return {
        askDataEvents: [...state.askDataEvents, event],
        analysisTurns: nextTurns
      };
    }),
  completeAskDataRun: (runId) => {
    set((state) => {
      const targetTurn = state.analysisTurns.find((turn) => turn.id === runId);
      if (!targetTurn || targetTurn.status !== "streaming") {
        return {};
      }

      const analysisTurns = updateTurn(state.analysisTurns, runId, (turn) => ({ ...turn, status: "done" }));
      return state.activeAskDataRunId === runId
        ? { activeAskDataRunId: null, askDataStatus: "done", analysisTurns }
        : { analysisTurns };
    });
    releaseAskDataController(runId);
  },
  failAskDataRun: (runId, message) => {
    set((state) => {
      const targetTurn = state.analysisTurns.find((turn) => turn.id === runId);
      if (!targetTurn || targetTurn.status !== "streaming") {
        return {};
      }

      const analysisTurns = updateTurn(state.analysisTurns, runId, (turn) => ({
        ...turn,
        status: "error",
        error: message
      }));
      return state.activeAskDataRunId === runId
        ? { activeAskDataRunId: null, askDataStatus: "error", askDataError: message, analysisTurns }
        : { analysisTurns };
    });
    releaseAskDataController(runId);
  },
  cancelAskDataRun: (runId) => {
    set((state) => {
      const targetTurn = state.analysisTurns.find((turn) => turn.id === runId);
      if (!targetTurn || targetTurn.status !== "streaming") {
        return {};
      }

      const analysisTurns = updateTurn(state.analysisTurns, runId, (turn) => ({
        ...turn,
        status: "cancelled",
        error: ""
      }));
      return state.activeAskDataRunId === runId
        ? {
            activeAskDataRunId: null,
            askDataStatus: "cancelled",
            askDataError: "",
            analysisTurns,
            sentStatus: "已停止生成"
          }
        : { analysisTurns };
    });
    releaseAskDataController(runId, true);
  },
  bindAskDataController: (runId, controller) => {
    const targetTurn = get().analysisTurns.find((turn) => turn.id === runId);
    if (get().activeAskDataRunId !== runId || targetTurn?.status !== "streaming") {
      controller.abort();
      return;
    }

    const previousController = askDataControllers.get(runId);
    if (previousController && previousController !== controller) {
      previousController.abort();
    }
    askDataControllers.set(runId, controller);
  },
  restoreAskDataHistory: ({
    sessionId,
    question,
    events,
    turns,
    chatMode = "ask",
    status = "done",
    error = ""
  }) => {
    const restoredTurns =
      turns && turns.length > 0
        ? turns
        : [
            {
              id: createTurnId(),
              question,
              sessionId,
              chatId: events.find((event) => event.chatId)?.chatId || createDataHubClientId("chat"),
              chatMode,
              status,
              events,
              error
            }
          ];
    const activeTurn = restoredTurns[restoredTurns.length - 1];

    set({
      activeAnalysisSessionId: sessionId,
      activeAnalysisMode: activeTurn?.chatMode || chatMode,
      activeAskDataRunId: null,
      activeAnalysisQuestion: activeTurn?.question || question,
      askDataStatus: activeTurn?.status || status,
      askDataEvents: activeTurn?.events || events,
      askDataError: activeTurn?.error || error,
      analysisTurns: restoredTurns,
      pendingAttachments: [],
      sentStatus: `已恢复历史对话：${question}`
    });
    abortAllAskDataControllers();
  },
  clearHomeConversation: () => {
    set({
      selectedAppId: null,
      homeDraft: "",
      sentStatus: "",
      pendingAttachments: [],
      activeAnalysisQuestion: initialState.activeAnalysisQuestion,
      activeAnalysisSessionId: initialState.activeAnalysisSessionId,
      activeAnalysisMode: initialState.activeAnalysisMode,
      activeAskDataRunId: initialState.activeAskDataRunId,
      askDataStatus: "idle",
      askDataEvents: [],
      askDataError: "",
      analysisTurns: []
    });
    abortAllAskDataControllers();
  },
  setSentStatus: (status) => set({ sentStatus: status }),
  setOnboardingOpen: (open) => set({ onboardingOpen: open }),
  setDashboardOnboardingOpen: (open) => set({ dashboardOnboardingOpen: open }),
  resetUiState: () => {
    set(initialState);
    abortAllAskDataControllers();
  }
}));
