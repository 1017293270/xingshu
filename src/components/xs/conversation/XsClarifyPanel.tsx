import { ArrowRight, CircleNotch, X } from "@phosphor-icons/react";
import { Button, Input } from "antd";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  clarificationAnswerOf,
  MAX_CLARIFICATION_ANSWER_CHARS
} from "@/services/dataHubClarification";
import type { DataHubClarification } from "@/types/dataHub";

export type XsClarifyPanelProps = {
  clarification: DataHubClarification;
  /** 已经点下去、正在等后端确认的那个答案。 */
  submittingAnswer?: string;
  /** 续跑失败时的原因；给出来就把选项放开让用户重选。 */
  error?: string;
  onAnswer: (answer: string) => void;
  onDismiss: () => void;
};

/**
 * 受控澄清的浮层：Agent 挂在 ask_user 上时，问题浮在输入框正上方。
 * 不放在对话流里，是因为这一轮已经停住了——它不是"读到这里的一条消息"，
 * 而是"现在轮到你"，得待在用户的手和视线已经在的地方。
 *
 * 生命周期只到"答案被后端收下"为止：回执一到就由上层收掉浮层，
 * 已选的留痕落回对话流，输入框不能被一张答完的卡一直压着。
 */
export function XsClarifyPanel({
  clarification,
  submittingAnswer,
  error,
  onAnswer,
  onDismiss
}: XsClarifyPanelProps) {
  const optionsRef = useRef<HTMLDivElement | null>(null);
  const [freeText, setFreeText] = useState("");
  const customAnswer = freeText.trim();
  /* 只在"点了、还没等到后端回执"这段时间锁住；回执一到浮层就整个收掉。 */
  const busy = Boolean(submittingAnswer);

  /* 浮层是"轮到你了"的提示，出现时就把焦点交给第一个选项，↑↓ 与回车立刻可用。 */
  useEffect(() => {
    optionsRef.current?.querySelector("button")?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      onDismiss();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    const buttons = Array.from(optionsRef.current?.querySelectorAll("button") ?? []);
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0) {
      return;
    }

    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    buttons[(current + step + buttons.length) % buttons.length]?.focus();
  };

  return (
    <section
      className="xs-clarify-dock"
      aria-label="需要你确认"
      data-busy={busy || undefined}
      onKeyDown={handleKeyDown}
    >
      <header className="xs-clarify-dock__head">
        <h3>{clarification.question}</h3>
        {/* 收起永远可点：提交中也得让人把输入框空出来，答案照样在回来的路上 */}
        <Button
          type="text"
          size="small"
          aria-label="稍后再确认"
          title="稍后再确认"
          icon={<X size={16} aria-hidden="true" />}
          onClick={onDismiss}
        />
      </header>

      <div
        className="xs-clarify-dock__options"
        ref={optionsRef}
        role="group"
        aria-label="候选答案"
      >
        {clarification.options.map((option, index) => {
          const answer = clarificationAnswerOf(option);
          const chosen = busy && submittingAnswer === answer;
          const detail = option.reply?.trim();

          return (
            <button
              key={`${option.label}-${index}`}
              type="button"
              disabled={busy}
              data-chosen={chosen || undefined}
              onClick={() => onAnswer(answer)}
            >
              <span className="xs-clarify-dock__index" aria-hidden="true">
                {chosen ? (
                  <CircleNotch className="xs-chat__spinner" size={14} weight="bold" />
                ) : (
                  index + 1
                )}
              </span>
              <span className="xs-clarify-dock__copy">
                <strong>{option.label}</strong>
                {detail && detail !== option.label ? <small>{detail}</small> : null}
              </span>
              <ArrowRight className="xs-clarify-dock__go" size={16} weight="bold" aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {clarification.allowFreeText && !busy ? (
        <form
          className="xs-clarify-dock__custom"
          onSubmit={(event) => {
            event.preventDefault();
            if (customAnswer) {
              onAnswer(customAnswer);
            }
          }}
        >
          <Input
            aria-label="补充你的理解"
            placeholder="都不合适？直接说说你的情况"
            maxLength={MAX_CLARIFICATION_ANSWER_CHARS}
            value={freeText}
            onChange={(event) => setFreeText(event.target.value)}
          />
          <Button type="primary" htmlType="submit" disabled={!customAnswer}>确认提交</Button>
        </form>
      ) : null}

      {/* 点下去到后端回执之间的空档，先说一句在干嘛，别让人以为没点上 */}
      {busy ? (
        <p className="xs-clarify-dock__progress" role="status">
          <CircleNotch className="xs-chat__spinner" size={14} aria-hidden="true" />
          正在提交你的选择…
        </p>
      ) : null}

      {error && !busy ? (
        <p className="xs-clarify-dock__error" role="alert">{error}</p>
      ) : null}
    </section>
  );
}
