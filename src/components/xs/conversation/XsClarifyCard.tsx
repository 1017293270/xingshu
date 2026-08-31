import { ArrowRight, Check } from "@phosphor-icons/react";
import { Button, Input } from "antd";
import { useRef, useState, type KeyboardEvent } from "react";
import {
  clarificationAnswerOf,
  MAX_CLARIFICATION_ANSWER_CHARS
} from "@/services/dataHubClarification";
import type { DataHubClarification } from "@/types/dataHub";

export type XsClarifyCardProps = {
  clarification: DataHubClarification;
  /** 本会话正在跑、或正在还原历史时不让点。 */
  disabled?: boolean;
  onAnswer: (answer: string) => void;
};

/**
 * 受控澄清卡：Agent 调 ask_user 把自己挂起，这一轮卡在用户身上。
 * 点一下即提交，没有"先选后确认"这一步，所以选项是按钮而不是 radio——
 * radio 的语义会让读屏用户以为还要再按一次确认。
 */
export function XsClarifyCard({ clarification, disabled, onAnswer }: XsClarifyCardProps) {
  const optionsRef = useRef<HTMLDivElement | null>(null);
  const [freeText, setFreeText] = useState("");
  const selectedAnswer = clarification.selectedAnswer?.trim() ?? "";
  const customAnswer = freeText.trim();

  if (selectedAnswer) {
    return (
      <section className="xs-clarify" aria-label="需要你确认" data-answered="true">
        <Check size={15} weight="bold" aria-hidden="true" />
        <small>已选择</small>
        <p>{selectedAnswer}</p>
      </section>
    );
  }

  /* 上下键在组内走位。不绑数字键：那要跟下面的输入框抢按键。 */
  const handleArrowKeys = (event: KeyboardEvent<HTMLDivElement>) => {
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
    <section className="xs-clarify" aria-label="需要你确认">
      <div className="xs-clarify__head">
        <strong>需要你确认</strong>
        <small>{clarification.options.length} 个选项</small>
      </div>
      <p className="xs-clarify__question">{clarification.question}</p>

      <div
        className="xs-clarify__options"
        ref={optionsRef}
        role="group"
        aria-label="候选答案"
        onKeyDown={handleArrowKeys}
      >
        {clarification.options.map((option, index) => (
          <button
            key={`${option.label}-${index}`}
            type="button"
            disabled={disabled}
            onClick={() => onAnswer(clarificationAnswerOf(option))}
          >
            <span className="xs-clarify__index" aria-hidden="true">{index + 1}</span>
            <span className="xs-clarify__label">{option.label}</span>
            <ArrowRight className="xs-clarify__go" size={14} weight="bold" aria-hidden="true" />
          </button>
        ))}
      </div>

      {clarification.allowFreeText ? (
        <form
          className="xs-clarify__custom"
          onSubmit={(event) => {
            event.preventDefault();
            if (customAnswer) {
              onAnswer(customAnswer);
            }
          }}
        >
          <Input
            aria-label="补充你的理解"
            size="small"
            placeholder="补充你的理解"
            maxLength={MAX_CLARIFICATION_ANSWER_CHARS}
            value={freeText}
            disabled={disabled}
            onChange={(event) => setFreeText(event.target.value)}
          />
          <Button type="primary" size="small" htmlType="submit" disabled={disabled || !customAnswer}>
            确认提交
          </Button>
        </form>
      ) : null}
    </section>
  );
}
