export const xsKnowledgeTones = ["blue", "cyan", "green", "purple", "orange"] as const;

export type XsKnowledgeTone = (typeof xsKnowledgeTones)[number];

/**
 * 颜色是知识库的识别线索，所以必须从 id 派生而不是从列表下标派生：
 * 按下标取色时，换个排序、或在卡片与列表视图之间切换，同一个知识库就换一种颜色，
 * 颜色便退化成纯噪声。
 */
export function xsKnowledgeToneFor(id: string): XsKnowledgeTone {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return xsKnowledgeTones[hash % xsKnowledgeTones.length];
}
