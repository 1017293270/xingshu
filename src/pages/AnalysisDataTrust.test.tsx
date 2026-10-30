import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { copyText } from "@/services/clipboard";
import { useUiStore } from "@/stores/uiStore";
import type { DataHubStreamEvent } from "@/types/dataHub";
import { AnalysisPage } from "./AnalysisPage";

vi.mock("@/services/clipboard", () => ({ copyText: vi.fn(async () => true) }));

vi.mock("@/components/xs/XsEChart", () => ({
  XsEChart: ({ label }: { label: string }) => <div role="img" aria-label={label} />
}));

beforeEach(() => {
  useUiStore.getState().resetUiState();
  window.localStorage.clear();
  vi.spyOn(window, "fetch").mockRejectedValue(new Error("Unexpected network request in data-trust fixture"));
});
afterEach(() => vi.restoreAllMocks());

function renderPage(mode: "ask" | "agent" = "ask") {
  return render(<AppProviders><MemoryRouter><AnalysisPage mode={mode} /></MemoryRouter></AppProviders>);
}

const trustedSnapshot = {
  level: "TRUSTED",
  usedMeasures: [
    { datasourceId: 1000002, model: "ContractList", member: "ContractList.contractAmount", title: "合同金额", trusted: true }
  ],
  unstructuredData: false,
  trustedCount: 1,
  untrustedCount: 0
};

const contractQuery = {
  datasourceId: 1000002,
  query: {
    measures: ["ContractList.contractAmount"],
    dimensions: ["ContractList.salesPerson"],
    order: [{ id: "ContractList.contractAmount", desc: true }],
    limit: 10
  },
  data: [{ "ContractList.salesPerson": "张三", "ContractList.contractAmount": "1280.5" }],
  annotation: {
    measures: { "ContractList.contractAmount": { title: "合同金额", shortTitle: "合同金额", type: "number" } },
    dimensions: { "ContractList.salesPerson": { title: "销售人员", shortTitle: "销售人员" } }
  },
  usedMeasures: trustedSnapshot.usedMeasures
};

function rootDone(dataTrust: unknown = trustedSnapshot, extra: Record<string, unknown> = {}): DataHubStreamEvent {
  return { type: "done", content: { ...extra, dataTrust }, finished: true };
}

/** 一轮带查询依据的问数：数据源、结果表、文字回答，最后是根完成事件。 */
function streamAskTurn(done: DataHubStreamEvent | null = rootDone()) {
  const store = useUiStore.getState();
  const runId = store.startAskDataRun("合同金额最高的销售人员", null, "ask");
  store.appendAskDataEvent(runId, { type: "data_source_selected", data: { datasourceId: 1000002, datasourceName: "合同数据系统" } });
  store.appendAskDataEvent(runId, { type: "table", data: contractQuery });
  store.appendAskDataEvent(runId, { type: "text", content: "张三的合同金额最高，为 1280.5 万元。" });
  if (done) {
    store.appendAskDataEvent(runId, done);
  }
  return runId;
}

function trustRow() {
  return document.querySelector<HTMLElement>(".analysis-answer-trust");
}

describe("data trust under the answer", () => {
  it("leads the footnote above the answer basis, and stays out of the copied answer", async () => {
    const user = userEvent.setup();
    const runId = streamAskTurn();
    useUiStore.getState().completeAskDataRun(runId);
    renderPage();

    const answer = screen.getByLabelText("正式回答");
    const trust = trustRow();
    const basis = screen.getByRole("region", { name: "查询依据" });
    const copy = screen.getByRole("button", { name: "复制回答" });
    expect(trust).toHaveTextContent("可信指标");
    expect(trust).toHaveAttribute("data-level", "TRUSTED");
    const order = [answer, trust!, basis, copy];
    order.slice(1).forEach((node, index) => {
      expect(order[index].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
    // 可信状态和查询依据同在一组脚注里，共用上方那一条细线。
    const footnote = trust!.closest(".analysis-answer-trust-footnote");
    expect(footnote).toContainElement(basis);
    expect(within(answer).queryByText("可信指标")).not.toBeInTheDocument();

    await user.click(copy);
    expect(copyText).toHaveBeenLastCalledWith("张三的合同金额最高，为 1280.5 万元。");
  });

  it("waits until the answer has finished streaming", () => {
    const runId = streamAskTurn();
    renderPage();
    expect(screen.getByLabelText("正式回答")).toBeInTheDocument();
    expect(trustRow()).toBeNull();

    act(() => useUiStore.getState().completeAskDataRun(runId));
    expect(trustRow()).toHaveTextContent("可信指标");
  });

  it.each([
    ["failed", (runId: string) => useUiStore.getState().failAskDataRun(runId, "查询超时")],
    ["cancelled", (runId: string) => useUiStore.getState().cancelAskDataRun(runId)]
  ])("shows nothing on a %s answer", (_status, finish) => {
    const runId = streamAskTurn();
    finish(runId);
    renderPage();
    expect(trustRow()).toBeNull();
    expect(screen.queryByText("可信指标")).not.toBeInTheDocument();
  });

  it("shows nothing when the root completion reports a failure", () => {
    const runId = streamAskTurn(rootDone(trustedSnapshot, { failed: true, summary: "查询失败" }));
    useUiStore.getState().completeAskDataRun(runId);
    renderPage();
    expect(trustRow()).toBeNull();
  });

  it("ignores a snapshot that only a sub-agent completion carries", () => {
    const runId = streamAskTurn({
      type: "done",
      sessionId: "child-session",
      parentSessionId: "root-session",
      subagentId: "ask-data",
      content: { dataTrust: trustedSnapshot },
      finished: true
    });
    useUiStore.getState().completeAskDataRun(runId);
    renderPage();
    expect(trustRow()).toBeNull();
    // 没有可信状态时，查询依据照旧自己带分隔线，不套进脚注组。
    expect(screen.getByRole("region", { name: "查询依据" }).closest(".analysis-answer-trust-footnote")).toBeNull();
  });

  it("shows nothing for an answer without a snapshot or with an unknown level", () => {
    const runId = streamAskTurn(rootDone({ ...trustedSnapshot, level: "NOT_APPLICABLE" }));
    useUiStore.getState().completeAskDataRun(runId);
    renderPage();
    expect(trustRow()).toBeNull();
  });

  it("warns without a question mark when the data was extracted by AI", () => {
    const runId = streamAskTurn(rootDone({
      ...trustedSnapshot,
      level: "NOT_TRUSTED",
      usedMeasures: [{ ...trustedSnapshot.usedMeasures[0], trusted: false }],
      trustedCount: 0,
      untrustedCount: 1
    }));
    useUiStore.getState().completeAskDataRun(runId);
    renderPage();
    expect(trustRow()).toHaveTextContent("数据由AI提取，注意辨别");
    expect(within(trustRow()!).queryByRole("button")).not.toBeInTheDocument();
  });

  it.each(["ask", "agent"] as const)("restores the same state when a %s conversation is reopened", async (mode) => {
    const user = userEvent.setup();
    const identity = { sessionId: "history-trust", globalSessionId: "history-trust", chatId: "history-trust-chat" };
    useUiStore.getState().restoreAskDataHistory({
      sessionId: identity.sessionId,
      question: "合同金额和回款金额是多少",
      chatMode: mode,
      events: [
        { ...identity, type: "text", content: "合同金额 1280.5 万元，回款金额 960 万元。" },
        {
          ...identity,
          type: "done",
          content: {
            dataTrust: {
              ...trustedSnapshot,
              level: "PARTIAL",
              usedMeasures: [
                ...trustedSnapshot.usedMeasures,
                { model: "ContractList", member: "ContractList.paidAmount", title: "回款金额", trusted: false }
              ],
              trustedCount: 1,
              untrustedCount: 1
            }
          },
          finished: true
        }
      ]
    });
    renderPage(mode);

    // 没有查询依据时，可信状态自己带分隔线。
    expect(trustRow()).toHaveTextContent("部分可信");
    expect(trustRow()!.closest(".analysis-answer-trust-footnote")).not.toBeNull();
    expect(screen.queryByRole("region", { name: "查询依据" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "查看可信说明" }));
    const detail = within(document.querySelector<HTMLElement>(".xs-data-trust-popover__content")!);
    expect(detail.getByText("部分指标已人工确认")).toBeInTheDocument();
    expect(detail.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["合同金额已确认", "回款金额未确认"]);
  });
});
