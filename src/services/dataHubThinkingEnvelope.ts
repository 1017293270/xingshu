import type { DataHubContentBlock } from "@/types/dataHub";

const opening = "<mm:think>";
const closing = "</mm:think>";

/** 只解析答案开头的模型协议外壳，正文中的示例、Markdown 与代码保持原样。 */
export function splitDataHubThinkingEnvelope(text: string): { answer: string; thinking: string } {
  let answer = text;
  const thinking: string[] = [];
  while (answer.trimStart().startsWith("<")) {
    const candidate = answer.trimStart();
    if (candidate.startsWith(closing)) {
      answer = candidate.slice(closing.length);
    } else if (candidate.startsWith(opening)) {
      const end = candidate.indexOf(closing, opening.length);
      if (end < 0) {
        let pending = candidate.slice(opening.length);
        const tagStart = pending.lastIndexOf("<");
        if (tagStart >= 0 && closing.startsWith(pending.slice(tagStart))) pending = pending.slice(0, tagStart);
        thinking.push(pending);
        answer = "";
      } else {
        thinking.push(candidate.slice(opening.length, end));
        answer = candidate.slice(end + closing.length);
      }
    } else if (opening.startsWith(candidate) || closing.startsWith(candidate)) {
      // 协议 tag 尚未收齐，不把半个 tag 暴露成正式答案。
      answer = "";
    } else {
      break;
    }
  }
  return { answer, thinking: thinking.filter(Boolean).join("\n") };
}

export function cleanDataHubThinkingText(text: string) {
  const parsed = splitDataHubThinkingEnvelope(text);
  const content = parsed.answer === text && !parsed.thinking
    ? text.replace(/<\/mm:think>\s*$/, "")
    : [parsed.thinking, parsed.answer].filter(Boolean).join("\n").trim();
  // 仅去掉整块纯状态；带事实的句子、引用及代码示例仍是原始思考内容。
  return /^(?:子任务|任务)(?:已)?完成[。！!]?$/u.test(content.trim()) ? "" : content;
}

/** 同一次模型调用的分片先拼齐，下一次调用独立解析，保留原有块身份。 */
export function cleanDataHubAnswerBlocks(blocks: DataHubContentBlock[]) {
  const grouped: DataHubContentBlock[] = [];
  for (const block of blocks) {
    const previous = grouped[grouped.length - 1];
    if (previous && previous.replyId === block.replyId && previous.modelCallIndex === block.modelCallIndex) {
      previous.content += block.content;
    } else {
      grouped.push({ ...block });
    }
  }
  const thinking: string[] = [];
  const cleaned = grouped.flatMap((block) => {
    const parsed = splitDataHubThinkingEnvelope(block.content);
    if (parsed.thinking) thinking.push(parsed.thinking);
    return parsed.answer.trim() ? [{ ...block, content: parsed.answer }] : [];
  });
  return { blocks: cleaned, thinking: thinking.join("\n") };
}
