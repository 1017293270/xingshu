import { create } from "zustand";

export type WritingJobPhase = "idle" | "analyzing" | "researching" | "writing";

export type WritingJobResult = {
  turnId: string;
  title: string;
  finishedAt: number;
  /** 用户已经回到写作台看过这份成稿。 */
  seen: boolean;
  /** 完成提醒已经弹过，每份成稿只提醒一次。 */
  notified: boolean;
};

type WritingJobState = {
  phase: WritingJobPhase;
  progressText?: string;
  startedAt?: number;
  lastResult: WritingJobResult | null;
};

type WritingJobActions = {
  setPhase: (phase: WritingJobPhase, progressText?: string) => void;
  /** 同一轮重复上报只刷新标题：标题要等正文解析完才拿得到，不能因此当成第二份成稿。 */
  reportResult: (turnId: string, title: string) => void;
  markSeen: () => void;
  markNotified: () => void;
  reset: () => void;
};

const initialState: WritingJobState = {
  phase: "idle",
  progressText: undefined,
  startedAt: undefined,
  lastResult: null
};

export const useWritingJobStore = create<WritingJobState & WritingJobActions>((set) => ({
  ...initialState,
  setPhase: (phase, progressText) => set((state) => {
    /* 原样返回 state 才真的不惊动订阅者；返回 {} 仍会合并出新对象并广播一轮。 */
    if (state.phase === phase && state.progressText === progressText) return state;
    if (phase === "idle") return { phase, progressText: undefined, startedAt: undefined };
    return {
      phase,
      progressText,
      startedAt: state.phase === "idle" ? Date.now() : state.startedAt
    };
  }),
  reportResult: (turnId, title) => set((state) => {
    const current = state.lastResult;
    if (current?.turnId === turnId) {
      return current.title === title ? state : { lastResult: { ...current, title } };
    }
    return { lastResult: { turnId, title, finishedAt: Date.now(), seen: false, notified: false } };
  }),
  markSeen: () => set((state) => (
    state.lastResult && !state.lastResult.seen
      ? { lastResult: { ...state.lastResult, seen: true } }
      : state
  )),
  markNotified: () => set((state) => (
    state.lastResult && !state.lastResult.notified
      ? { lastResult: { ...state.lastResult, notified: true } }
      : state
  )),
  reset: () => set({ ...initialState })
}));

/** 侧栏只关心两种可见状态：正在生成、有没看过的成稿。 */
export function selectWritingJobIndicator(state: WritingJobState): "running" | "unseen" | null {
  if (state.phase !== "idle") return "running";
  return state.lastResult && !state.lastResult.seen ? "unseen" : null;
}
