import { useCallback, useEffect, useState } from "react";

/**
 * 浮层澄清的会话级状态：哪几张被用户收起了，以及刚点下去的是哪一张。
 *
 * `submitted` 只覆盖"点了、后端回执还没到"的那段空档，用来在浮层上转个圈。
 * 回执（clarification_response）一到，卡自己就有了 selectedAnswer、不再是待答目标，
 * 浮层随之收掉，留痕交给对话流里那一行——答完的卡不该继续压着输入框。
 * 续跑直接报错、压根等不到回执的情况，靠 busy 落回空闲兜底。
 */
export function useClarifyDock(busy: boolean) {
  const [dismissedKeys, setDismissedKeys] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState<{ key: string; answer: string }>();
  /* 这一条不随空闲清掉：浮层收起、对话流里那行历史进场闪一下，靠的就是它。 */
  const [justAnsweredKey, setJustAnsweredKey] = useState("");

  useEffect(() => {
    if (!busy && submitted) {
      setSubmitted(undefined);
    }
  }, [busy, submitted]);

  const dismiss = useCallback((key: string) => {
    setDismissedKeys((current) => (current.includes(key) ? current : [...current, key]));
  }, []);

  const expand = useCallback((key: string) => {
    setDismissedKeys((current) => current.filter((item) => item !== key));
  }, []);

  const submit = useCallback((key: string, answer: string) => {
    setSubmitted({ key, answer });
    setJustAnsweredKey(key);
  }, []);

  return {
    dismissedKeys,
    justAnsweredKey,
    submittedKey: submitted?.key,
    submittingAnswer: submitted?.answer,
    dismiss,
    expand,
    submit
  };
}
