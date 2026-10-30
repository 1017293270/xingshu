import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findDataHubRootDone, readDataHubDataTrust } from "./dataHubDataTrust";
import { parseDataHubSseBlocks } from "./dataHubAskDataService";
import { writeDataHubAuth, writeDataHubSpaceId } from "./dataHubSession";
import { loadDataHubHistoryReplay } from "./historyService";
import type { DataHubStreamEvent } from "@/types/dataHub";

function measure(title: string, trusted: boolean, extra: Record<string, unknown> = {}) {
  return { datasourceId: 1000002, model: "ContractList", member: `ContractList.${title}`, title, trusted, ...extra };
}

function done(dataTrust: unknown, extra: Record<string, unknown> = {}) {
  return { ...extra, dataTrust };
}

function trust(level: string, usedMeasures: unknown[] = [], unstructuredData = false) {
  const trustedCount = usedMeasures.filter((item) => (item as { trusted?: boolean }).trusted).length;
  return {
    level,
    usedMeasures,
    unstructuredData,
    trustedCount,
    untrustedCount: usedMeasures.length - trustedCount,
    semanticCommits: ["c-1"],
    checkedAt: "2026-10-29T18:00:00+08:00"
  };
}

describe("readDataHubDataTrust", () => {
  it("maps the three levels to the copy from the backend contract, word for word", () => {
    expect(readDataHubDataTrust(done(trust("TRUSTED", [measure("合同金额", true)])))).toEqual({
      level: "TRUSTED",
      label: "可信指标",
      explanation: "可信指标是指统计口径、数据来源已经人工确认的指标",
      measures: [{ title: "合同金额", trusted: true }],
      hiddenMeasureCount: 0,
      unstructuredData: false
    });
    expect(readDataHubDataTrust(done(trust("PARTIAL", [measure("合同金额", true), measure("回款金额", false)])))).toMatchObject({
      level: "PARTIAL",
      label: "部分可信",
      explanation: "部分指标已人工确认"
    });
    const notTrusted = readDataHubDataTrust(done(trust("NOT_TRUSTED", [measure("回款金额", false)])));
    expect(notTrusted).toMatchObject({ level: "NOT_TRUSTED", label: "数据由AI提取，注意辨别" });
    expect(notTrusted).not.toHaveProperty("explanation");
  });

  it("shows nothing without a well-formed snapshot instead of guessing from the answer", () => {
    // 纯文字回答、找文档回答：完成事件里根本没有 dataTrust。
    expect(readDataHubDataTrust({ summary: "合同审批需经过部门审核。" })).toBeNull();
    expect(readDataHubDataTrust(undefined)).toBeNull();
    expect(readDataHubDataTrust("not json")).toBeNull();
    // NOT_APPLICABLE 不该出现在完成事件里，未知等级一律不显示。
    expect(readDataHubDataTrust(done(trust("NOT_APPLICABLE")))).toBeNull();
    expect(readDataHubDataTrust(done(trust("VERIFIED", [measure("合同金额", true)])))).toBeNull();
    expect(readDataHubDataTrust(done(trust("trusted", [measure("合同金额", true)])))).toBeNull();
    // 缺字段或形状不对。
    const { usedMeasures: _measures, ...withoutMeasures } = trust("TRUSTED", [measure("合同金额", true)]);
    const { unstructuredData: _unstructured, ...withoutUnstructured } = trust("TRUSTED", [measure("合同金额", true)]);
    const { level: _level, ...withoutLevel } = trust("TRUSTED", [measure("合同金额", true)]);
    expect(readDataHubDataTrust(done(withoutMeasures))).toBeNull();
    expect(readDataHubDataTrust(done(withoutUnstructured))).toBeNull();
    expect(readDataHubDataTrust(done(withoutLevel))).toBeNull();
    expect(readDataHubDataTrust(done({ ...trust("TRUSTED"), usedMeasures: "合同金额" }))).toBeNull();
    expect(readDataHubDataTrust(done({ ...trust("TRUSTED"), unstructuredData: "false" }))).toBeNull();
    expect(readDataHubDataTrust(done(null))).toBeNull();
    expect(readDataHubDataTrust(done([trust("TRUSTED")]))).toBeNull();
    // 失败的回答不带可信状态。
    expect(readDataHubDataTrust(done(trust("TRUSTED", [measure("合同金额", true)]), { failed: true }))).toBeNull();
  });

  it("merges repeated measures by name and status, lists confirmed ones first and caps the list at six", () => {
    const view = readDataHubDataTrust(done(trust("PARTIAL", [
      measure("回款金额", false),
      measure("合同金额", true, { trustHash: "v1" }),
      // 同一指标因定义变化产生另一条 trustHash，对读者仍是同一个名字。
      measure("合同金额", true, { trustHash: "v2" }),
      measure("合同数", true),
      { model: "ContractList", member: "ContractList.signedCount", title: "", trusted: false },
      measure("回款金额", false, { trustHash: "v2" }),
      measure("合同金额", false, { datasourceId: 1000003 }),
      measure("应收余额", false),
      measure("逾期金额", false),
      measure("坏账金额", false),
      // 形状不对的单项跳过，不连累整份快照。
      { model: "ContractList", member: "ContractList.broken", title: "损坏项" },
      "ContractList.text",
      { model: "ContractList", member: "", title: "", trusted: true }
    ])));

    expect(view?.measures).toEqual([
      { title: "合同金额", trusted: true },
      { title: "合同数", trusted: true },
      { title: "回款金额", trusted: false },
      { title: "ContractList.signedCount", trusted: false },
      { title: "合同金额", trusted: false },
      { title: "应收余额", trusted: false }
    ]);
    expect(view?.hiddenMeasureCount).toBe(2);
  });

  it("keeps the note about results that carried no measure information", () => {
    expect(readDataHubDataTrust(done(trust("PARTIAL", [measure("合同金额", true)], true)))).toMatchObject({
      unstructuredData: true,
      hiddenMeasureCount: 0
    });
    expect(readDataHubDataTrust(done(trust("NOT_TRUSTED", [], true)))).toMatchObject({
      measures: [],
      unstructuredData: true
    });
  });

  it("reads a done payload that is still a JSON string", () => {
    expect(readDataHubDataTrust(JSON.stringify(done(trust("TRUSTED", [measure("合同金额", true)]))))?.label).toBe("可信指标");
  });
});

describe("findDataHubRootDone", () => {
  const root = { sessionId: "session-1", globalSessionId: "session-1", chatId: "chat-1" };
  const child = { sessionId: "child-1", globalSessionId: "session-1", chatId: "chat-1" };
  const rootTrust = trust("TRUSTED", [measure("合同金额", true)]);

  it("only reads the root completion event", () => {
    const events: DataHubStreamEvent[] = [
      { ...root, type: "table", content: { rows: [] }, finished: false },
      { ...root, type: "done", content: done(rootTrust), finished: true },
      // 子智能体的完成事件即便晚到、即便带了快照，也不能顶替根事件。
      { ...child, parentSessionId: "session-1", type: "done", content: done(trust("NOT_TRUSTED")), finished: true },
      { ...child, subagentId: "ask-data", type: "done", content: done(trust("NOT_TRUSTED")), finished: true },
      { ...root, type: "done", content: done(trust("PARTIAL")), finished: false }
    ];
    expect(readDataHubDataTrust(findDataHubRootDone(events))?.level).toBe("TRUSTED");
  });

  it("finds nothing while the root has not finished", () => {
    expect(findDataHubRootDone([
      { ...root, type: "text", content: "正在查询", finished: false },
      { ...child, parentSessionId: "session-1", type: "done", content: done(rootTrust), finished: true }
    ])).toBeUndefined();
    expect(findDataHubRootDone([{ ...root, type: "done", content: done(rootTrust) }])).toBeUndefined();
  });

  it("takes the latest root completion after a clarification resumes the same turn", () => {
    const events: DataHubStreamEvent[] = [
      { ...root, type: "done", content: { suspended: true }, finished: true },
      { ...root, type: "clarification_response", content: { answer: "按部门" }, finished: false },
      { ...root, type: "done", content: done(rootTrust), finished: true }
    ];
    expect(readDataHubDataTrust(findDataHubRootDone(events))?.label).toBe("可信指标");
  });

  it("reads the live SSE root done exactly as the backend sends it", () => {
    const sse = [
      { ...child, parentSessionId: "session-1", type: "done", content: {}, finished: false },
      { ...root, parentSessionId: null, type: "done", content: done(rootTrust), finished: true }
    ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
    const { events, isDone } = parseDataHubSseBlocks(sse);
    expect(isDone).toBe(true);
    expect(readDataHubDataTrust(findDataHubRootDone(events))?.measures).toEqual([{ title: "合同金额", trusted: true }]);
  });
});

describe("data trust in history replay", () => {
  beforeEach(() => {
    localStorage.clear();
    writeDataHubAuth({ token: "token-123", userId: 1, username: "demo", isAdmin: false });
    writeDataHubSpaceId(7);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("restores the same trust state from persisted events as from the live stream", async () => {
    const identity = { agentName: "问数智能体", sessionId: "session-trust", globalSessionId: "session-trust", chatId: "chat-trust" };
    const snapshot = trust("PARTIAL", [measure("合同金额", true), measure("回款金额", false)], true);
    const liveEvents = [
      { ...identity, type: "table", content: { columns: [], rows: [], usedMeasures: snapshot.usedMeasures }, finished: false },
      { ...identity, type: "text", content: "合同金额 1,280 万元。", finished: false },
      {
        ...identity,
        sessionId: "child-trust",
        parentSessionId: "session-trust",
        subagentId: "ask-data",
        type: "done",
        content: {},
        finished: false
      },
      { ...identity, parentSessionId: null, type: "done", content: done(snapshot), finished: true }
    ];
    // 后端把每个 SSE 事件整体序列化进 data 落库，回放与实时走同一个适配器。
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request) => new Response(JSON.stringify({
      code: 200,
      message: "success",
      data: String(url).includes("/messages/list")
        ? [{ id: 1, sessionId: "session-trust", chatId: "chat-trust", role: "user", content: "合同金额多少", seqNum: 1 }]
        : liveEvents.map((event, index) => ({
            id: index + 1,
            sessionId: "session-trust",
            chatId: "chat-trust",
            type: event.type,
            data: JSON.stringify(event),
            seqNum: index + 2
          }))
    }))));

    const replay = await loadDataHubHistoryReplay("session-trust");
    const live = parseDataHubSseBlocks(liveEvents.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")).events;
    const replayed = readDataHubDataTrust(findDataHubRootDone(replay.turns[0].events));

    expect(replayed).toEqual(readDataHubDataTrust(findDataHubRootDone(live)));
    expect(replayed).toMatchObject({
      level: "PARTIAL",
      measures: [{ title: "合同金额", trusted: true }, { title: "回款金额", trusted: false }],
      unstructuredData: true
    });
  });
});
