import {
  ArrowLeft,
  TreeStructure,
  X
} from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  flattenSubagentTree,
  sessionDisplayName
} from "./display";
import { DataHubAgentExecutionCard } from "./DataHubAgentExecutionCard";
import { DataHubSubagentTree } from "./DataHubSubagentTree";
import type { DataHubSubagentDrawerProps } from "./types";

const focusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export function DataHubSubagentDrawer({
  open,
  nodes,
  selectedSessionId,
  onSelectedSessionChange,
  onClose,
  returnFocusRef,
  onCitationOpen,
  renderBlock
}: DataHubSubagentDrawerProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // 关闭时保留挂载约 210ms，让滑出/淡出动画播完再卸载
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return undefined;
    }
    const timer = window.setTimeout(() => setMounted(false), 210);
    return () => window.clearTimeout(timer);
  }, [open]);
  const flattened = useMemo(() => flattenSubagentTree(nodes), [nodes]);
  const selected = flattened.find((node) => {
    const key = node.session.sessionId ?? node.session.subagentId;
    return key === selectedSessionId;
  });
  const selectedName = selected ? sessionDisplayName(selected.session) : "";

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const previousOverflow = document.body.style.overflow;
    const background = document.querySelector(".xs-shell");
    const hadInert = background?.hasAttribute("inert") ?? false;
    const previousAriaHidden = background?.getAttribute("aria-hidden") ?? null;
    document.body.style.overflow = "hidden";
    background?.setAttribute("inert", "");
    background?.setAttribute("aria-hidden", "true");
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) {
        return;
      }
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(focusableSelector)];
      if (!focusable.length) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (!hadInert) {
        background?.removeAttribute("inert");
      }
      if (previousAriaHidden === null) {
        background?.removeAttribute("aria-hidden");
      } else {
        background?.setAttribute("aria-hidden", previousAriaHidden);
      }
      window.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => returnFocusRef?.current?.focus());
    };
  }, [open, returnFocusRef]);

  if ((!open && !mounted) || typeof document === "undefined") {
    return null;
  }
  const closing = !open;

  return createPortal(
    <div
      className="xs-datahub-subagent-drawer"
      data-closing={closing || undefined}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <aside
        ref={panelRef}
        className="xs-datahub-subagent-drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header
          className="xs-datahub-subagent-drawer__header"
          data-has-selection={Boolean(selected)}
        >
          {selected ? (
            <>
              <button
                type="button"
                className="xs-datahub-subagent-drawer__header-back"
                onClick={() => onSelectedSessionChange(undefined)}
              >
                <ArrowLeft size={15} aria-hidden="true" />
                返回列表
              </button>
              <h2 id={titleId} className="sr-only">
                子智能体执行详情
              </h2>
            </>
          ) : (
            <>
              <span className="xs-datahub-subagent-drawer__icon" aria-hidden="true">
                <TreeStructure size={20} weight="duotone" />
              </span>
              <div>
                <p>SUBAGENT TIMELINE</p>
                <h2 id={titleId}>子智能体</h2>
              </div>
            </>
          )}
          <span className="xs-datahub-subagent-drawer__count" key={flattened.length}>
            {flattened.length}
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            className="xs-datahub-subagent-drawer__close"
            aria-label="关闭子智能体详情"
            onClick={onClose}
          >
            <X size={19} aria-hidden="true" />
          </button>
        </header>

        <div
          className="xs-datahub-subagent-drawer__workspace"
          data-has-selection={Boolean(selected)}
        >
          <nav className="xs-datahub-subagent-drawer__tree" aria-label="子智能体列表">
            <header>
              <strong>执行关系</strong>
              <small>按父子会话排列</small>
            </header>
            <DataHubSubagentTree
              nodes={nodes}
              selectedSessionId={selectedSessionId}
              onSelect={onSelectedSessionChange}
            />
          </nav>

          <section className="xs-datahub-subagent-drawer__detail">
            <div
              className="xs-datahub-subagent-drawer__detail-body"
              key={
                selected
                  ? (selected.session.sessionId ??
                    selected.session.subagentId ??
                    "selected")
                  : "placeholder"
              }
            >
              {selected ? (
                <>
                  <header className="xs-datahub-subagent-drawer__detail-header">
                    <h3>{selectedName}</h3>
                  </header>

                  <div className="xs-datahub-subagent-drawer__cards">
                    {selected.session.cards.length ? (
                      selected.session.cards.map((card, index) => (
                        <DataHubAgentExecutionCard
                          key={card.id}
                          card={card}
                          compact
                          staggerIndex={index}
                          onCitationOpen={onCitationOpen}
                          renderBlock={renderBlock}
                        />
                      ))
                    ) : (
                      <div className="xs-datahub-subagent-drawer__empty-detail">
                        <span aria-hidden="true" />
                        <strong>
                          {selected.session.status === "running"
                            ? "等待执行事件"
                            : "暂无可展示内容"}
                        </strong>
                        <p>该子智能体的状态和父子会话关系已保留。</p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="xs-datahub-subagent-drawer__placeholder">
                  <TreeStructure size={34} weight="duotone" aria-hidden="true" />
                  <strong>选择一个子智能体</strong>
                  <p>查看其模型调用、思考、工具执行和业务结果。</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </aside>
    </div>,
    document.body
  );
}
