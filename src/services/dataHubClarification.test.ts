import { describe, expect, it } from "vitest";
import {
  appendDataHubClarification,
  applyDataHubClarificationResponse,
  clarificationAnswerOf,
  hasPendingClarification,
  normalizeDataHubClarification,
  normalizeDataHubClarificationResponse
} from "@/services/dataHubClarification";
import type { DataHubClarification } from "@/types/dataHub";

/* 下面的 payload 直接取自 DataHub 自己的 agentExecution.test.ts，两边的校验必须同进同退。 */
const nativeCard = {
  interactionId: "tool-call-1",
  question: "区域按哪个口径？",
  options: [{ label: "客户区域" }],
  allowFreeText: false
};

const legacyCard = {
  question: "区域按哪个口径？",
  options: [{ label: "客户区域", reply: "按客户所属区域统计" }],
  allowFreeText: true
};

describe("normalizeDataHubClarification", () => {
  it("accepts a native card and a legacy reply-bearing card", () => {
    expect(normalizeDataHubClarification(nativeCard)).toEqual(nativeCard);
    expect(normalizeDataHubClarification(legacyCard)).toEqual(legacyCard);
  });

  it("unwraps the event envelope and the nested JSON string DataHub sometimes sends", () => {
    expect(normalizeDataHubClarification({ type: "clarification", data: nativeCard })).toEqual(nativeCard);
    expect(normalizeDataHubClarification(JSON.stringify(nativeCard))).toEqual(nativeCard);
  });

  it("rejects a native card whose option still carries a legacy reply", () => {
    expect(normalizeDataHubClarification({ ...nativeCard, options: [{ label: "客户区域", reply: "按客户所属区域统计" }] }))
      .toBeNull();
  });

  it("rejects an unknown key anywhere in the payload", () => {
    expect(normalizeDataHubClarification({ ...legacyCard, internal: true })).toBeNull();
    expect(normalizeDataHubClarification({
      ...legacyCard,
      options: [{ label: "客户区域", reply: "按客户所属区域统计", internal: true }]
    })).toBeNull();
  });

  it("rejects payloads that break the protocol limits", () => {
    expect(normalizeDataHubClarification({ ...legacyCard, options: [] })).toBeNull();
    expect(normalizeDataHubClarification({
      ...nativeCard,
      options: [1, 2, 3, 4, 5].map((index) => ({ label: `选项 ${index}` }))
    })).toBeNull();
    expect(normalizeDataHubClarification({ ...nativeCard, question: "问".repeat(241) })).toBeNull();
    expect(normalizeDataHubClarification({ ...nativeCard, options: [{ label: "长".repeat(81) }] })).toBeNull();
    expect(normalizeDataHubClarification({ ...nativeCard, question: "   " })).toBeNull();
    // allowFreeText 是必填布尔，不是"缺省即 false"
    expect(normalizeDataHubClarification({ interactionId: "tool-call-1", question: "在吗", options: [{ label: "在" }] }))
      .toBeNull();
  });
});

describe("normalizeDataHubClarificationResponse", () => {
  it("keeps the answer and tolerates a null interactionId from history replay", () => {
    expect(normalizeDataHubClarificationResponse({ interactionId: "tool-call-1", answer: " 客户区域 " }))
      .toEqual({ interactionId: "tool-call-1", answer: "客户区域" });
    expect(normalizeDataHubClarificationResponse({ interactionId: null, answer: "按客户所属区域统计" }))
      .toEqual({ answer: "按客户所属区域统计" });
  });

  it("rejects an empty or over-long answer", () => {
    expect(normalizeDataHubClarificationResponse({ answer: "   " })).toBeNull();
    expect(normalizeDataHubClarificationResponse({ answer: "答".repeat(501) })).toBeNull();
  });
});

describe("clarificationAnswerOf", () => {
  it("submits the legacy reply text, and the label itself for a native card", () => {
    expect(clarificationAnswerOf({ label: "客户区域", reply: "按客户所属区域统计" })).toBe("按客户所属区域统计");
    expect(clarificationAnswerOf({ label: "客户区域" })).toBe("客户区域");
  });
});

describe("clarification bookkeeping", () => {
  it("keeps two native cards apart and records the answer of the one that was chosen", () => {
    const clarifications: DataHubClarification[] = [];
    appendDataHubClarification(clarifications, normalizeDataHubClarification(nativeCard)!);
    applyDataHubClarificationResponse(clarifications, { interactionId: "tool-call-1", answer: "客户区域" });
    appendDataHubClarification(clarifications, normalizeDataHubClarification({
      interactionId: "tool-call-2",
      question: "是否只看 Q1？",
      options: [{ label: "只看 Q1" }, { label: "查看全年" }],
      allowFreeText: false
    })!);

    expect(clarifications).toHaveLength(2);
    expect(clarifications[0].selectedAnswer).toBe("客户区域");
    expect(clarifications[1].selectedAnswer).toBeUndefined();
    expect(hasPendingClarification({ clarifications })).toBe(true);
  });

  it("does not duplicate a card the resume stream re-sends, and keeps the answer already on it", () => {
    const clarifications: DataHubClarification[] = [];
    appendDataHubClarification(clarifications, normalizeDataHubClarification(nativeCard)!);
    applyDataHubClarificationResponse(clarifications, { interactionId: "tool-call-1", answer: "客户区域" });
    appendDataHubClarification(clarifications, normalizeDataHubClarification(nativeCard)!);

    expect(clarifications).toHaveLength(1);
    expect(clarifications[0].selectedAnswer).toBe("客户区域");
    expect(hasPendingClarification({ clarifications })).toBe(false);
  });

  it("lets a historical response without an interactionId claim the last unanswered card", () => {
    const clarifications: DataHubClarification[] = [];
    appendDataHubClarification(clarifications, normalizeDataHubClarification(legacyCard)!);
    applyDataHubClarificationResponse(clarifications, { answer: "按客户所属区域统计" });

    expect(clarifications[0].selectedAnswer).toBe("按客户所属区域统计");
    expect(hasPendingClarification({ clarifications })).toBe(false);
  });
});
