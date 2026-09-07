import { getDataHubEventPayload } from "@/services/dataHubEventAdapter";
import type { DataHubContentBlock, DataHubStreamEvent } from "@/types/dataHub";

/**
 * 少于这个长度的文本不参与去重：DataHub 的短句（「已完成」「共 3 条」）在一轮里
 * 天然会重复出现，按重复处理会误删正文。
 */
const MIN_DEDUPE_LENGTH = 8;

const FULLWIDTH_PUNCTUATION: Record<string, string> = {
  "，": ",",
  "。": ".",
  "！": "!",
  "？": "?",
  "；": ";",
  "：": ":",
  "（": "(",
  "）": ")",
  "、": ",",
  "「": '"',
  "」": '"',
  "“": '"',
  "”": '"',
  "‘": "'",
  "’": "'"
};

/**
 * 把一段回答归一化成可读的比较文本：
 * DataHub 重发整段正文时常常与增量略有出入——空白折行不同、去掉了 `[[1]]` 引用锚点、
 * 强调符号被重写、中英文标点混用，所以按原文严格比较会漏判，必须先抹平这些无语义差异。
 */
export function normalizeDataHubAnswerText(text: string): string {
  return text
    .replace(/\[\[[^\]]*\]\]/g, "")
    .replace(/[*_`>#]/g, "")
    .replace(/[，。！？；：（）、「」“”‘’]/g, (char) => FULLWIDTH_PUNCTUATION[char] ?? char)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 比较用指纹：在归一化基础上连空白一起去掉。
 * 增量块之间是无缝拼接的，重发的整段却会在段落之间补回换行，留着空白就会判成两段不同文本。
 */
function answerFingerprint(text: string): string {
  return normalizeDataHubAnswerText(text).replace(/\s+/g, "");
}

function isComparable(fingerprint: string) {
  return fingerprint.length >= MIN_DEDUPE_LENGTH;
}

/**
 * container 是否已经把 candidate 说过一遍。两边都要够长才判定，短句不算重复。
 */
export function dataHubAnswerCovers(container: string, candidate: string): boolean {
  const candidateFingerprint = answerFingerprint(candidate);
  if (!isComparable(candidateFingerprint)) {
    return false;
  }
  return answerFingerprint(container).includes(candidateFingerprint);
}

/**
 * 同一次模型调用内的「先流增量、再整段重发」：后端把这次调用的完整文本作为一条
 * 事件补发，replyId/modelCallIndex 与增量一致，直接拼接会让正文出现两遍。
 *
 * 返回该块应当持有的内容；返回 undefined 表示这段是新内容，按原样追加。
 */
export function mergeRepeatedAnswerChunk(
  previousContent: string,
  chunk: string
): string | undefined {
  const previous = answerFingerprint(previousContent);
  const incoming = answerFingerprint(chunk);

  if (!isComparable(previous) || !isComparable(incoming)) {
    return undefined;
  }

  if (incoming === previous) {
    return previousContent;
  }

  // 只认「整段以已收到的全文开头」这一种重发形态，避免把正文里合法复现的句子当重复。
  if (incoming.startsWith(previous)) {
    return chunk;
  }

  return undefined;
}

function readEventText(event: DataHubStreamEvent): string {
  const payload = getDataHubEventPayload(event);
  if (typeof payload === "string") {
    return payload;
  }
  if (payload !== null && typeof payload === "object" && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    for (const key of ["text", "content", "message", "summary"]) {
      if (typeof record[key] === "string") {
        return record[key];
      }
    }
  }
  return "";
}

/**
 * 编排根是否在子智能体给出结论之后又自己作答。
 *
 * 根在派活之前会先说一句「我来帮您查询…」，那是开场白，真正的答案还在子智能体那边；
 * 只有排在子结论之后的那次根作答，才是把子结论综合过一遍的正式回答——这时再把子结论
 * 并列出来，就是同一个结论说两遍。
 */
export function dataHubRootAnsweredAfterChildren(
  events: readonly DataHubStreamEvent[]
): boolean {
  let lastRootIndex = -1;
  let lastChildIndex = -1;

  events.forEach((event, index) => {
    if (event.isThinking || (event.type !== "text" && event.type !== "content")) {
      return;
    }
    if (!isComparable(answerFingerprint(readEventText(event)))) {
      return;
    }
    if (event.parentSessionId) {
      lastChildIndex = index;
    } else {
      lastRootIndex = index;
    }
  });

  return lastRootIndex >= 0 && lastRootIndex > lastChildIndex;
}

type TrackedBlock = {
  block: DataHubContentBlock;
  fingerprint: string;
};

/**
 * 一轮回答里同一段内容只保留一份。
 *
 * DataHub 会在三种情况下把同样的话再说一遍：结果事件补发整段正文（replyId 与增量对不上时）、
 * 编排根智能体每次模型调用结束都整段公开一次、子智能体去掉思考标签后重发结论。
 * 这些块的 replyId/modelCallIndex 各不相同，展示层无法靠身份识别，只能按文本判定。
 */
export function dedupeDataHubAnswerBlocks(
  blocks: DataHubContentBlock[]
): DataHubContentBlock[] {
  if (blocks.length < 2) {
    return blocks;
  }

  const kept: TrackedBlock[] = [];
  let changed = false;

  for (const block of blocks) {
    const fingerprint = answerFingerprint(block.content);

    if (!isComparable(fingerprint)) {
      kept.push({ block, fingerprint });
      continue;
    }

    const covered = kept.some(
      (item) => isComparable(item.fingerprint) && item.fingerprint.includes(fingerprint)
    );
    if (covered) {
      changed = true;
      continue;
    }

    // 整段重发覆盖了此前的全部内容：用它替换掉所有旧块，顺序与语义都不丢。
    const aggregate = answerFingerprint(kept.map((item) => item.block.content).join(""));
    if (isComparable(aggregate) && fingerprint.includes(aggregate)) {
      kept.length = 0;
      kept.push({ block, fingerprint });
      changed = true;
      continue;
    }

    const supersededIndexes = kept
      .map((item, index) =>
        isComparable(item.fingerprint) && fingerprint.includes(item.fingerprint) ? index : -1
      )
      .filter((index) => index >= 0);

    if (supersededIndexes.length > 0) {
      // 保留被覆盖块的原位置：重发的整段接的是当时那段话的上下文。
      kept[supersededIndexes[0]] = { block, fingerprint };
      for (const index of supersededIndexes.slice(1).reverse()) {
        kept.splice(index, 1);
      }
      changed = true;
      continue;
    }

    kept.push({ block, fingerprint });
  }

  return changed ? kept.map((item) => item.block) : blocks;
}
