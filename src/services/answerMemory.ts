/**
 * 按「会话 ID::chatId」把一轮回答附带的生成结果（数据洞察、图表方案）记在浏览器里，
 * 重新打开历史对话时直接用，不再调用模型。只在当前浏览器有效；存储满了或被禁用时静默放弃。
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function answerMemoryStorage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function updatedAtOf(value: Record<string, unknown>) {
  return typeof value.updatedAt === "number" ? value.updatedAt : 0;
}

export function createAnswerMemory<T extends object>(
  storageKey: string,
  limit: number,
  normalize: (value: Record<string, unknown>) => T | undefined
) {
  const readAll = (): Record<string, Record<string, unknown>> => {
    try {
      const raw = answerMemoryStorage()?.getItem(storageKey);
      const parsed: unknown = raw ? JSON.parse(raw) : undefined;
      if (!isRecord(parsed)) return {};
      return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1])));
    } catch {
      return {};
    }
  };

  return {
    read(key: string): T | undefined {
      const value = readAll()[key];
      try {
        return value ? normalize(value) : undefined;
      } catch {
        return undefined;
      }
    },
    remember(key: string, value: T) {
      try {
        const recent = Object.entries({ ...readAll(), [key]: { ...value, updatedAt: Date.now() } })
          .sort(([, left], [, right]) => updatedAtOf(right) - updatedAtOf(left))
          .slice(0, limit);
        answerMemoryStorage()?.setItem(storageKey, JSON.stringify(Object.fromEntries(recent)));
      } catch {
        // 下次打开历史时不显示这项结果，回答本身不受影响。
      }
    }
  };
}
