import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

const defaultPlaceholder = "请输入您的问题，支持问题、找文件、写文档、做分析、用应用...";

/* 与首页推荐应用的 prompt 保持一致，作为输入框轮播示例 */
const typingPhrases = [
  "帮我分析本月经营数据，并生成趋势图表",
  "帮我查询最新销售政策中的重点变化",
  "根据销售数据生成一份周报",
  "帮我写一份经营分析汇报提纲"
];

const startDelayMs = 900;
const typeDelayMs = 85;
const deleteDelayMs = 32;
const holdDelayMs = 2_400;
const nextPhraseDelayMs = 500;

/**
 * 首页命令框打字机占位符：输入为空时轮播打出示例问题。
 * reduced-motion、测试环境或已有输入时返回静态默认占位符。
 */
export function useTypingPlaceholder(active: boolean) {
  const reducedMotion = usePrefersReducedMotion();
  const enabled = active && !reducedMotion && import.meta.env.MODE !== "test";
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let timer = 0;
    let phraseIndex = 0;
    let charIndex = 0;
    let deleting = false;

    const tick = () => {
      const phrase = typingPhrases[phraseIndex];

      if (!deleting) {
        charIndex += 1;
        setTyped(phrase.slice(0, charIndex));
        if (charIndex >= phrase.length) {
          deleting = true;
          timer = window.setTimeout(tick, holdDelayMs);
          return;
        }
        timer = window.setTimeout(tick, typeDelayMs);
        return;
      }

      charIndex -= 1;
      setTyped(phrase.slice(0, charIndex));
      if (charIndex <= 0) {
        deleting = false;
        phraseIndex = (phraseIndex + 1) % typingPhrases.length;
        timer = window.setTimeout(tick, nextPhraseDelayMs);
        return;
      }
      timer = window.setTimeout(tick, deleteDelayMs);
    };

    timer = window.setTimeout(tick, startDelayMs);
    return () => window.clearTimeout(timer);
  }, [enabled]);

  if (!enabled) {
    return defaultPlaceholder;
  }
  return `试试：${typed}`;
}
