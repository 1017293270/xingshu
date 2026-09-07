import { CaretRight } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { XsSafeMarkdown } from "@/components/xs/XsSafeMarkdown";
import type { DataHubRoutingDecomposeData } from "@/types/dataHub";
import type { DataHubThinkingSection } from "@/services/dataHubThinkingSections";
import { useNow } from "./useNow";
import "../../../pages/styles/datahub-execution.css";

export type DataHubProcessDockProps = {
  /** 模型思考流（Markdown）；running 时随事件增量更新。 */
  thinkingContent: string;
  sections?: DataHubThinkingSection[];
  sourceNote?: string;
  /** 路由拆解出的子任务。 */
  decompose?: DataHubRoutingDecomposeData;
  status: "running" | "done" | "error" | "cancelled";
  /** running 时用于实时计时。 */
  startedAt?: number;
  /** 结束后展示本阶段实际耗时。 */
  durationMs?: number;
  /** 未收到思考流时，仅在运行中显示等待提示。 */
  showPlaceholder?: boolean;
};

function formatSeconds(ms: number) {
  return `${Math.max(0, Math.round(ms / 1000))}秒`;
}

/**
 * 「思考过程（已完成，X秒）」折叠块：running 自动展开流式展示思考与任务拆解，
 * 结束后自动收成一行；用户手动点过折叠头后不再自动收放。
 */
export function DataHubProcessDock({
  thinkingContent,
  sections,
  sourceNote,
  decompose,
  status,
  startedAt,
  durationMs,
  showPlaceholder = false
}: DataHubProcessDockProps) {
  const bodyId = useId();
  const [expanded, setExpanded] = useState(status === "running");
  const userPinnedRef = useRef(false);
  const prevStatusRef = useRef(status);
  const bodyMountedRef = useRef(expanded);
  const thinkingRef = useRef<HTMLDivElement | null>(null);
  const shownSections = sections ?? (thinkingContent.trim()
    ? [{ key: "main", label: "主任务", content: thinkingContent, main: true }] : []);
  const fullThinking = shownSections.map((section) => section.content).join("\n\n");
  const running = status === "running";
  const now = useNow(1000, running && startedAt != null);

  useEffect(() => {
    if (prevStatusRef.current === status) {
      return;
    }
    prevStatusRef.current = status;
    if (userPinnedRef.current) {
      return;
    }
    // 新一轮跑起来自动展开；结束自动收成一行摘要
    setExpanded(status === "running");
  }, [status]);

  useEffect(() => {
    if (running && expanded && thinkingRef.current) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
  }, [running, expanded, fullThinking]);

  if (expanded) {
    bodyMountedRef.current = true;
  }

  const subQuestions = decompose?.subQuestions?.map((item) => item.trim()).filter(Boolean) ?? [];
  const hasContent = Boolean(fullThinking.trim()) || subQuestions.length > 0;
  // 结束后没有公开内容，就不保留一个空的“已完成”阶段。
  if (!hasContent && !(showPlaceholder && running)) {
    return null;
  }

  const elapsedMs = running && startedAt != null ? Math.max(0, now - startedAt) : durationMs;
  const stateLabel = running ? "" : status === "done" ? "已完成" : status === "cancelled" ? "已停止" : "已中断";
  const timing = elapsedMs != null ? formatSeconds(elapsedMs) : "";
  const summary = `思考过程 （${[stateLabel, timing].filter(Boolean).join("，") || "进行中"}）`;

  return (
    <section className="datahub-process-dock" aria-label="思考过程" data-status={status}>
      <button
        type="button"
        className="datahub-process-dock__summary"
        aria-label={summary}
        aria-controls={bodyId}
        aria-expanded={expanded}
        onClick={() => {
          userPinnedRef.current = true;
          setExpanded((value) => !value);
        }}
      >
        <CaretRight size={12} aria-hidden="true" />
        <span className="datahub-phase-title">思考过程</span>
        <small>{[stateLabel, timing].filter(Boolean).join(" · ") || "进行中"}</small>
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
              {fullThinking.trim() ? (
                <div
                  className="datahub-process-dock__thinking"
                  ref={thinkingRef}
                  aria-label="模型思考"
                >
                  {shownSections.map((section) => (
                    <section className="datahub-process-dock__thinking-section" key={section.key}>
                      {shownSections.length > 1 || !section.main ? <h4>{section.label}</h4> : null}
                      <XsSafeMarkdown content={section.content} />
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
