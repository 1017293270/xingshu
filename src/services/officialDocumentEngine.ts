/**
 * Word 引擎不可用的判定单独成一个模块：服务层映射错误文案、页面提前禁用按钮都要用它，
 * 放在这里不会随 officialDocumentService 一起被测试替身整体换掉。
 */
export const WORD_ENGINE_UNAVAILABLE_MESSAGE = "Word 引擎未配置或不可用，当前操作已停止";

/* 服务层抛 ENGINE_UNAVAILABLE，引擎适配层直接抛 WORD_ENGINE_UNAVAILABLE；对用户是同一件事。 */
const WORD_ENGINE_UNAVAILABLE_CODES = new Set(["ENGINE_UNAVAILABLE", "WORD_ENGINE_UNAVAILABLE"]);

export function isWordEngineUnavailableCode(code: string | undefined | null) {
  return Boolean(code && WORD_ENGINE_UNAVAILABLE_CODES.has(code));
}
