import { Check, Question } from "@phosphor-icons/react";
import { Button } from "antd";
import { clarificationAnswerOf } from "@/services/dataHubClarification";
import type { DataHubClarification } from "@/types/dataHub";

export type XsClarifyCardProps = {
  clarification: DataHubClarification;
  /** 用户把浮层收起来了，这里给一个回到选择的入口。 */
  onExpand?: () => void;
  /** 刚刚在这一轮里答完的那张，进场时闪一下；历史回放的旧卡不闪。 */
  fresh?: boolean;
};

/**
 * 受控澄清在对话流里的留痕。待答的选择在输入框上方的浮层里做
 * （见 XsClarifyPanel）；这里只负责两件事：答完之后留下一行历史，
 * 以及用户主动收起浮层时留一个回去的入口。
 *
 * 两态的 aria-label 和浮层的"需要你确认"分开：读屏里同名的三个区域
 * 认不出谁是正在等你的那个，而真正要回答的地方只有浮层一处。
 */
export function XsClarifyCard({ clarification, onExpand, fresh }: XsClarifyCardProps) {
  const selectedAnswer = clarification.selectedAnswer?.trim() ?? "";

  const selectedLabel = clarification.interactionId
    ? clarification.options.find((option) => clarificationAnswerOf(option) === selectedAnswer)?.label
    : undefined;

  if (selectedAnswer) {
    return (
      <section
        className="xs-clarify"
        aria-label="已确认的选择"
        data-answered="true"
        data-fresh={fresh || undefined}
      >
        <Check size={15} weight="bold" aria-hidden="true" />
        <small>已选择</small>
        <p>{selectedLabel ?? selectedAnswer}</p>
      </section>
    );
  }

  return (
    <section className="xs-clarify" aria-label="收起的确认问题" data-collapsed="true">
      <Question size={15} weight="bold" aria-hidden="true" />
      <small>待确认</small>
      <p>{clarification.question}</p>
      {onExpand ? (
        <Button size="small" type="link" onClick={onExpand}>去选择</Button>
      ) : null}
    </section>
  );
}
