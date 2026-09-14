import { describe, expect, it } from "vitest";
import type { DataHubStreamEvent } from "@/types/dataHub";
import { projectDataHubExecutionEvents } from "./dataHubExecutionProjector";
import { buildDataHubQueryProcess } from "./dataHubQueryProcessPresenter";
import { adaptDataHubStreamEvent } from "./dataHubEventAdapter";

const table = { datasourceId: 2, title: "合同金额", data: [{ amount: 10 }], query: { measures: ["Contract.amount"] } };
const citation = { kbId: "kb", docId: "12", docName: "合同制度", fragments: ["证据一", "证据二", "证据三", "证据四"] };
function present(events: DataHubStreamEvent[]) {
  return buildDataHubQueryProcess(projectDataHubExecutionEvents(events, { mainSessionId: "root", chatId: "chat" }), events);
}
const event = (type: string, content: unknown, sessionId = "root", extra: Partial<DataHubStreamEvent> = {}): DataHubStreamEvent => ({
  type, content, sessionId, chatId: "chat", ...(sessionId !== "root" ? { parentSessionId: "root" } : {}), ...extra
});

describe("buildDataHubQueryProcess", () => {
  it("rejects failed and unconfirmed done document lists without removing earlier confirmed cards", () => {
    for (const terminal of [{ failed: true }, { documentSelectionMode: "none" }, { documentSelectionMode: "uncertain" }]) {
      const done = event("done", { documentLookup: true, documentResults: [citation], ...terminal });
      expect(present([done]).results).toEqual([]);
      expect(present([event("document_url", citation), done]).results).toMatchObject([
        { kind: "document", status: "done", document: { docId: "12" } }
      ]);
    }
  });

  it("keeps cross-session document sources and fills metadata without overriding an explicit denial", () => {
    const results = present([
      event("document_url", { kbId: "kb", docId: "12", sourceAvailable: false }, "a"),
      event("done", { failed: true }, "a"),
      event("document_url", { ...citation, sourceAvailable: true, pageNumber: 4 }, "b"),
      event("done", {}, "b")
    ]).results;
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ status: "done", document: { sourceAvailable: false, docName: "合同制度", pageNumber: "4" },
      documentSources: [{ sessionId: "a", document: { sourceAvailable: false } }, { sessionId: "b", document: { pageNumber: "4" } }] });
    expect(present([
      event("document_url", { kbId: "kb", docId: "legacy" }),
      event("document_url", { kbId: "kb", docId: "legacy", docKey: "source.docx", sourceAvailable: true })
    ]).results[0]).toMatchObject({ document: { sourceAvailable: true, docKey: "source.docx" } });
  });

  it("projects adapted persisted data wrappers with the same result identities and fields as live events", () => {
    const live = [
      event("data_source_selected", { datasourceId: 2, datasourceName: "合同库" }, "a", { sequence: 1 }),
      event("table", table, "a", { sequence: 2 }), event("citation_document", citation, "b", { sequence: 3 }),
      event("done", { citationDocuments: [citation] }, "root", { sequence: 4 })
    ];
    const history = live.map((item) => adaptDataHubStreamEvent({
      type: item.type, sessionId: "root", chatId: "chat", sequence: item.sequence, data: JSON.stringify(item)
    })!);
    expect(present(history)).toEqual(present(live));
  });

  it("collects root and child tables in event order, keeping repeated queries but removing identified retransmits", () => {
    const events = [event("table", table, "child", { eventId: "a" }),
      event("table", table, "child", { eventId: "a" }), event("table", table), event("table", table)];
    const results = present(events).results;
    expect(results).toHaveLength(3);
    expect(results.map((result) => result.sessionId)).toEqual(["child", "root", "root"]);
    expect(new Set(results.map((result) => result.key)).size).toBe(3);
    expect(present([...events, event("text", "完成")]).results.map((result) => result.key)).toEqual(results.map((result) => result.key));
    expect(results[0]).toMatchObject({ kind: "table", table: { title: "合同金额", datasourceId: 2, totalRowsKnown: false, business: { fields: ["amount"] } } });
  });

  it("matches sources by identity and never assigns a different branch by array position", () => {
    const results = present([
      event("data_source_selected", { datasourceId: 1, datasourceName: "项目库" }, "a"),
      event("data_source_selected", { datasourceId: 2, datasourceName: "合同库" }, "b"),
      event("table", table, "a"), event("table", { data: [{ x: 1 }] }),
      event("table", { data: [{ x: 2 }] }, "a")
    ]).results;
    expect(results[0]).toMatchObject({ dataSource: "合同库" });
    expect(results[1]).not.toHaveProperty("dataSource", "项目库");
    expect(results[1]).toHaveProperty("dataSource", undefined);
    expect(results[2]).toMatchObject({ dataSource: "项目库" });
  });

  it("merges confirmed citations with root done, retains all fragments and scopes reused evidence ids", () => {
    const results = present([
      event("citation_document", { ...citation, evidenceFragments: [{ evidenceId: "e1", text: "证据一" }] }, "a"),
      event("citation_document", { ...citation, fragments: ["另一证据"], evidenceFragments: [{ evidenceId: "e1", text: "另一证据" }] }, "b"),
      event("done", { citationDocuments: [{ ...citation, evidenceFragments: [{ evidenceId: "e1", text: "证据一" }] }] })
    ]).results;
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ kind: "citation", document: { fragments: [...citation.fragments, "另一证据"] },
      evidenceSources: [{ sessionId: "a", evidenceId: "e1", text: "证据一" }, { sessionId: "b", evidenceId: "e1", text: "另一证据" }] });
  });

  it("keeps citations and file results distinct, accepts historical confirmed done and excludes candidate/model content", () => {
    const results = present([
      event("thinking", { citationDocuments: [citation] }), event("text", "|伪表格|"),
      event("tool_result", { documentCandidates: [citation] }),
      event("done", { documentResults: [citation] }),
      event("document_url", { ...citation, sourceAvailable: false }),
      event("done", { documentLookup: true, documentResults: [citation], citationDocuments: [citation] })
    ]).results;
    expect(results.map((result) => result.kind)).toEqual(["document", "citation"]);
    expect(results[0]).toMatchObject({ document: { sourceAvailable: false } });
  });

  it("retains successful data on a failed session and takes only the latest real tool activity", () => {
    const activity = { activityId: "tool:1", kind: "tool", action: "load_data", label: "执行数据查询", status: "success", startedAt: "now", summary: "查询成功" };
    const output = present([event("table", table), event("activity", activity),
      event("activity", { ...activity, activityId: "model:1", kind: "model", label: "模型" }),
      event("done", { failed: true }, "root", { finished: true })]);
    expect(output.results[0]).toMatchObject({ kind: "table", status: "error" });
    expect(output.activity).toMatchObject(activity);
    expect(present([event("activity", { ...activity, summary: '{"secret":"raw"}' })]).activity?.summary).toBeUndefined();
  });

  it("uses sequence identity for replay and does not treat missing results as empty tables", () => {
    const events = [event("table", {}, "root", { sequence: 1 }), event("table", { data: [] }, "root", { sequence: 2 })];
    expect(present([...events, events[1]]).results).toHaveLength(1);
    expect(present(events).results[0]).toMatchObject({ kind: "table", table: { rows: [], totalRows: 0, totalRowsKnown: false } });
  });
});
