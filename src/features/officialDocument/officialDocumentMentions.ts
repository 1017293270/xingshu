import type { ReactNode } from "react";

/** @ 之后最多认这么多个字符，再长就当用户已经放弃这次唤起。 */
const MAX_MENTION_KEYWORD = 24;

export type OfficialDocumentMentionItem = {
  key: string;
  label: string;
  description?: string;
  icon: ReactNode;
  disabled?: boolean;
  /** 参与关键字过滤的小写文本。 */
  searchText: string;
};

export type OfficialDocumentMentionGroup = {
  key: string;
  title: string;
  items: OfficialDocumentMentionItem[];
};

export type MentionQuery = {
  /** @ 本身在文本里的下标。 */
  start: number;
  /** 光标位置，也就是 @keyword 的结束下标。 */
  end: number;
  keyword: string;
};

/**
 * 光标处正在写的 @ 词。@ 必须在行首或空白之后，中间不能再有空白——
 * 否则「邮箱@域名」和写完一句话之后的空格都会把浮层重新拉起来。
 */
export function findMentionQuery(value: string, caret: number): MentionQuery | null {
  for (let index = caret - 1; index >= 0 && caret - index <= MAX_MENTION_KEYWORD + 1; index -= 1) {
    const character = value[index];
    if (/\s/.test(character)) return null;
    if (character !== "@") continue;
    const previous = index > 0 ? value[index - 1] : "";
    if (previous && !/\s/.test(previous)) return null;
    return { start: index, end: caret, keyword: value.slice(index + 1, caret) };
  }
  return null;
}

/** 选中之后把 @关键字 整段从文本里摘掉，引用改由芯片承载。 */
export function removeMentionQuery(value: string, query: MentionQuery) {
  return `${value.slice(0, query.start)}${value.slice(query.end)}`.replace(/ {2,}/g, " ");
}

export function filterMentionGroups(groups: OfficialDocumentMentionGroup[], keyword: string) {
  const needle = keyword.trim().toLocaleLowerCase();
  if (!needle) return groups.filter((group) => group.items.length > 0);
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => item.searchText.includes(needle)) }))
    .filter((group) => group.items.length > 0);
}

export function flattenMentionItems(groups: OfficialDocumentMentionGroup[]) {
  return groups.flatMap((group) => group.items).filter((item) => !item.disabled);
}
