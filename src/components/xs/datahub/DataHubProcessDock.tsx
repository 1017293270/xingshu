import { Brain, CaretDown } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { XsSafeMarkdown } from "@/components/xs/XsSafeMarkdown";
import type { DataHubRoutingDecomposeData } from "@/types/dataHub";
import { useNow } from "./useNow";
import "../../../pages/styles/datahub-execution.css";

export type DataHubProcessDockProps = {
  /** 模型思考流（Markdown）；running 时随事件增量更新。 */
  thinkingContent: string;
  /** 路由拆解出的子任务。 */
  decompose?: DataHubRoutingDecomposeData;
  status: "running" | "done" | "error" | "cancelled";
  /** running 时用于实时计时。 */
  startedAt?: number;
  /** 结束后展示「用时X秒」。 */
  durationMs?: number;
};

function formatSeconds(ms: number) {
  return `${Math.max(1, Math.round(ms / 1000))} 秒`;
}

/**
 * 「已思考（用时X秒）」折叠块：running 自动展开流式展示思考与任务拆解，
 * 结束后自动收成一行；用户手动点过折叠头后不再自动收放。
 */
export function DataHubProcessDock({
  thinkingContent,
  decompose,
  status,
  startedAt,
  durationMs
}: DataHubProcessDockProps) {
  const bodyId = useId();
  const [expanded, setExpanded] = useState(status === "running");
  const userPinnedRef = useRef(false);
  const prevStatusRef = useRef(status);
  const bodyMountedRef = useRef(expanded);
  const thinkingRef = useRef<HTMLDivElement | null>(null);
  const running = status === "running";
  const now = useNow(1000, running && Boolean(startedAt));

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
  }, [running, expanded, thinkingContent]);

  if (expanded) {
    bodyMountedRef.current = true;
  }

  const subQuestions = decompose?.subQuestions?.map((item) => item.trim()).filter(Boolean) ?? [];
  const hasContent = Boolean(thinkingContent.trim()) || subQuestions.length > 0;
  if (!running && !hasContent) {
    return null;
  }

  const elapsedMs = running && startedAt ? Math.max(0, now - startedAt) : undefined;
  const summary = running
    ? `正在思考${elapsedMs != null ? `（${formatSeconds(elapsedMs)}）` : "…"}`
    : status === "cancelled"
      ? "思考已停止"
      : status === "error"
        ? "思考中断"
        : `已思考${durationMs != null ? `（用时 ${formatSeconds(durationMs)}）` : ""}`;

  return (
    <section className="datahub-process-dock" aria-label="思考过程" data-status={status}>
      <button
        type="button"
        className="datahub-process-dock__summary"
        aria-controls={bodyId}
        aria-expanded={expanded}
        onClick={() => {
          userPinnedRef.current = true;
          setExpanded((value) => !value);
        }}
      >
        <span>
          <Brain size={16} weight="duotone" aria-hidden="true" />
          {summary}
        </span>
        <CaretDown size={15} aria-hidden="true" />
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
              {thinkingContent.trim() ? (
                <div
                  className="datahub-process-dock__thinking"
                  ref={thinkingRef}
                  aria-label="模型思考"
                >
                  <XsSafeMarkdown content={thinkingContent} />
                </div>
              ) : running ? (
                <p className="datahub-process-dock__placeholder">正在整理思路…</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
