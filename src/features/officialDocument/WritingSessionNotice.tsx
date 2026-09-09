import { FileText } from "@phosphor-icons/react";
import { useNow } from "@/components/xs/datahub/useNow";
import { useWritingJobStore, type WritingJobPhase } from "./writingJobStore";
import "./writing-session-notice.css";

/** 没有阶段文字时按阶段说人话，别把 phase 名字甩给用户。 */
const PHASE_TEXT: Record<Exclude<WritingJobPhase, "idle">, string> = {
  analyzing: "分析结构",
  researching: "检索资料",
  writing: "撰写正文"
};

/** 摘录只是让人认出这是哪一篇，超过一行就收住。 */
const MAX_REQUIREMENT_CHARS = 30;
const MINUTE_MS = 60_000;
/** 读数按分钟走，半分钟刷一次就够，不必每秒惊动首页。 */
const TICK_MS = 30_000;

function excerpt(requirement: string) {
  const text = requirement.trim().replace(/\s+/g, " ");
  return text.length > MAX_REQUIREMENT_CHARS ? `${text.slice(0, MAX_REQUIREMENT_CHARS)}…` : text;
}

function elapsedText(now: number, startedAt?: number) {
  const minutes = startedAt ? Math.floor((now - startedAt) / MINUTE_MS) : 0;
  return minutes < 1 ? "刚开始" : `已用 ${minutes} 分钟`;
}

/**
 * 首页那条提示：有活在跑或有成稿时，告诉用户「那边还有一篇」，点一下进会话页。
 * 首页永远是入口，进度和成稿都在会话页，这条提示是两者之间唯一的桥。
 */
export function WritingSessionNotice({ onOpen }: { onOpen: () => void }) {
  const phase = useWritingJobStore((state) => state.phase);
  const progressText = useWritingJobStore((state) => state.progressText);
  const startedAt = useWritingJobStore((state) => state.startedAt);
  const requirement = useWritingJobStore((state) => state.requirement);
  const lastResult = useWritingJobStore((state) => state.lastResult);
  const running = phase !== "idle";
  const now = useNow(TICK_MS, running);

  const view = running
    ? {
      state: "running" as const,
      title: requirement ? `正在生成：${excerpt(requirement)}` : "正在生成公文",
      detail: `${progressText?.trim() || PHASE_TEXT[phase]} · ${elapsedText(now, startedAt)}`,
      hint: "点击查看生成过程"
    }
    : lastResult
      ? lastResult.seen
        ? {
          state: "seen" as const,
          title: `上次成稿《${lastResult.title}》`,
          detail: "点击继续这次写作",
          hint: ""
        }
        : {
          state: "unseen" as const,
          title: `《${lastResult.title}》已生成`,
          detail: "尚未查看",
          hint: "点击查看成稿"
        }
      : null;

  /* 没有会话就什么都不占：首页该干净的时候必须干净。 */
  if (!view) return null;

  return (
    <button
      type="button"
      className="writing-session-notice"
      data-state={view.state}
      aria-label={[view.title, view.detail, view.hint].filter(Boolean).join("，")}
      onClick={onOpen}
    >
      {view.state === "running"
        ? <span className="writing-session-notice__dot" aria-hidden="true" />
        : <FileText size={18} weight="regular" aria-hidden="true" />}
      <span className="writing-session-notice__text">
        <span className="writing-session-notice__title">{view.title}</span>
        <small>{view.detail}</small>
      </span>
      <span className="writing-session-notice__action" aria-hidden="true">查看</span>
    </button>
  );
}
