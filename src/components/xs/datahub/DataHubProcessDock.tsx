import { CaretRight } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { XsSafeMarkdown } from "@/components/xs/XsSafeMarkdown";
import type { DataHubRoutingDecomposeData } from "@/types/dataHub";
import type { DataHubProcessNote, DataHubThinkingSection } from "@/services/dataHubThinkingSections";
import { useNow } from "./useNow";
import "../../../pages/styles/datahub-execution.css";

/** 运行中所处的阶段：只决定折叠头上的白话状态，不影响展开内容。 */
export type DataHubProcessDockPhase = "thinking" | "query" | "result";

export type DataHubProcessDockProps = {
  /** 没有分段数据时的兜底：整段当作主任务的分析说明。 */
  thinkingContent: string;
  sections?: DataHubThinkingSection[];
  sourceNote?: string;
  /** 路由拆解出的子任务。 */
  decompose?: DataHubRoutingDecomposeData;
  status: "running" | "done" | "error" | "cancelled";
  /** 运行中所处的阶段，默认按分析问题说。 */
  phase?: DataHubProcessDockPhase;
  /** running 时用于实时计时。 */
  startedAt?: number;
  /** 结束后展示本阶段实际耗时。 */
  durationMs?: number;
  /** 未收到任何说明时，仅在运行中保留这一行等待状态。 */
  showPlaceholder?: boolean;
};

const runningPhaseLabels: Record<DataHubProcessDockPhase, string> = {
  thinking: "正在分析问题",
  query: "正在查询数据",
  result: "正在整理回答"
};

const noteKindLabels: Record<DataHubProcessNote["kind"], string> = {
  analysis: "分析说明",
  progress: "过程说明"
};

function formatSeconds(ms: number) {
  return `${Math.max(0, Math.round(ms / 1000))}秒`;
}

/**
 * 「思考过程」折叠块：分析说明与过程说明偏技术，任何状态下默认收起，
 * 折叠头只说白话状态和耗时；展开后按智能体分段、按时间顺序逐条列出。
 * 只有用户点击会展开或收起，阶段变化不再自动收放。
 */
export function DataHubProcessDock({
  thinkingContent,
  sections,
  sourceNote,
  decompose,
  status,
  phase = "thinking",
  startedAt,
  durationMs,
  showPlaceholder = false
}: DataHubProcessDockProps) {
  const bodyId = useId();
  const [expanded, setExpanded] = useState(false);
  const bodyMountedRef = useRef(false);
  const thinkingRef = useRef<HTMLDivElement | null>(null);
  const shownSections = sections ?? (thinkingContent.trim()
    ? [{ key: "main", label: "主任务", notes: [{ kind: "analysis" as const, content: thinkingContent.trim() }], main: true }]
    : []);
  const noteCount = shownSections.reduce((count, section) => count + section.notes.length, 0);
  const latestNote = shownSections.at(-1)?.notes.at(-1)?.content ?? "";
  const running = status === "running";
  const now = useNow(1000, running && startedAt != null);

  useEffect(() => {
    // 用户展开着看运行中的说明时，新条目到达就跟到底部
    if (running && expanded && thinkingRef.current) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
  }, [running, expanded, noteCount, latestNote]);

  if (expanded) {
    bodyMountedRef.current = true;
  }

  const subQuestions = decompose?.subQuestions?.map((item) => item.trim()).filter(Boolean) ?? [];
  const hasContent = noteCount > 0 || subQuestions.length > 0;
  // 结束后没有公开内容，就不保留一个空的“已完成”阶段。
  if (!hasContent && !(showPlaceholder && running)) {
    return null;
  }

  const elapsedMs = running && startedAt != null ? Math.max(0, now - startedAt) : durationMs;
  const stateLabel = running
    ? runningPhaseLabels[phase]
    : status === "done" ? "已完成" : status === "cancelled" ? "已停止" : "已中断";
  const timing = elapsedMs != null ? formatSeconds(elapsedMs) : "";
  const summary = `思考过程 （${[stateLabel, timing].filter(Boolean).join("，")}）`;

  return (
    <section className="datahub-process-dock" aria-label="思考过程" data-status={status}>
      <button
        type="button"
        className="datahub-process-dock__summary"
        aria-label={summary}
        aria-controls={bodyId}
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <CaretRight size={12} aria-hidden="true" />
        <span className="datahub-phase-title">思考过程</span>
        <small>{[stateLabel, timing].filter(Boolean).join(" · ")}</small>
      </button>
      <div
        id={bodyId}
        className={`xs-datahub-collapse${expanded ? " xs-datahub-collapse--open" : ""}`}
        aria-hidden={!expanded}
      >
        <div className="xs-datahub-collapse__inner">
          {bodyMountedRef.current ? (
            <div className="datahub-process-dock__body">
              {subQuestions.length > 0 ? (
                <section className="datahub-process-dock__decompose" aria-label="任务拆解">
                  <strong>任务拆解</strong>
                  <ol>
                    {subQuestions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ol>
                </section>
              ) : null}
              {noteCount > 0 ? (
                <div
                  className="datahub-process-dock__thinking"
                  ref={thinkingRef}
                  aria-label="模型思考"
                >
                  {shownSections.map((section) => (
                    <section className="datahub-process-dock__thinking-section" key={section.key}>
                      {shownSections.length > 1 || !section.main ? <h4>{section.label}</h4> : null}
                      <ol className="datahub-process-notes">
                        {section.notes.map((note, index) => (
                          <li className="datahub-process-note" data-kind={note.kind} key={`${note.kind}-${index}`}>
                            <span className="datahub-process-note__kind">{noteKindLabels[note.kind]}</span>
                            <XsSafeMarkdown className="datahub-process-note__content" content={note.content} />
                          </li>
                        ))}
                      </ol>
                    </section>
                  ))}
                </div>
              ) : running ? (
                <p className="datahub-process-dock__placeholder">正在整理思路…</p>
              ) : null}
              {sourceNote ? <p className="datahub-process-dock__source-note">{sourceNote}</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
