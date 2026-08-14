import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import * as knowledgeService from "@/services/dataHubKnowledgeService";
import * as queryAssetMaterializationService from "@/services/dataHubQueryAssetMaterializationService";
import * as queryAssetService from "@/services/queryAssetService";
import { useUiStore } from "@/stores/uiStore";
import { AnalysisPage } from "./AnalysisPage";
import { TablePage } from "./TablePage";

const phasePlaybackSettleForTest = 250;

function renderPage(page: ReactElement) {
  return render(
    <AppProviders>
      <MemoryRouter>{page}</MemoryRouter>
    </AppProviders>
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="当前测试路由">{`${location.pathname}${location.search}`}</output>;
}

function renderPageWithLocation(page: ReactElement) {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={["/ask-agent"]}>
        {page}
        <LocationProbe />
      </MemoryRouter>
    </AppProviders>
  );
}

describe("workflow page actions", () => {
  beforeEach(() => {
    useUiStore.getState().resetUiState();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders the data-hub ask-data process and result table", () => {
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("目前咨询数最多的社区是哪个社区");
    store.appendAskDataEvent(runId, {
      type: "routing_decompose",
      data: { executionMode: "SIMPLE", subQuestions: ["统计各社区/项目的咨询数，找出咨询数最多的社区"] }
    });
    store.appendAskDataEvent(runId, {
      type: "react_step",
      data: { round: 1, action: "locate_datasource", status: "success", summary: "datasourceId=1, name=101.43.17.8" }
    });
    store.appendAskDataEvent(runId, {
      type: "react_step",
      data: { round: 1, action: "match_skill", status: "success", summary: "已匹配事件域业务 Skill" }
    });
    store.appendAskDataEvent(runId, {
      type: "react_step",
      data: { round: 2, action: "execute_query", status: "success", summary: "已执行 Cube Query，rows=1" }
    });
    store.appendAskDataEvent(runId, {
      type: "table",
      data: {
        columns: [
          { name: "WechatyProjectInfo.projectName", title: "项目名称" },
          { name: "WechatyConsulationRecord.count", title: "咨询数" }
        ],
        rows: [
          {
            "WechatyProjectInfo.projectName": "演示账号",
            "WechatyConsulationRecord.count": 716
          }
        ],
        totalRows: 1,
        source: "cube"
      }
    });
    store.appendAskDataEvent(runId, {
      type: "done",
      data: { summary: "目前咨询数最多的社区为演示账号，累计咨询记录 716 条。", loopRounds: 6 }
    });
    store.completeAskDataRun(runId);

    renderPage(<AnalysisPage mode="ask" />);

    expect(screen.getByRole("heading", { name: "问数完成" })).toBeInTheDocument();
    expect(screen.getByText("目前咨询数最多的社区为演示账号，累计咨询记录 716 条。")).toBeInTheDocument();
    const steps = screen.getByRole("list", { name: "data-hub 问数步骤" });
    expect(within(steps).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("理解问题")).toBeInTheDocument();
    expect(screen.getByText("确定数据范围")).toBeInTheDocument();
    expect(screen.getByText("数据处理")).toBeInTheDocument();
    expect(screen.getByText("执行查询")).toBeInTheDocument();
    expect(screen.getByText("生成结果")).toBeInTheDocument();
    expect(screen.getByText("过程细节")).toBeInTheDocument();
    expect(screen.getByText("已匹配事件域业务 Skill")).toBeInTheDocument();
    expect(screen.getByText("项目名称")).toBeInTheDocument();
    expect(screen.getByText("演示账号")).toBeInTheDocument();
  });

  it("renders knowledge Markdown and deduplicated citations without ask-data actions", async () => {
    const user = userEvent.setup();
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("合同审批流程是什么？", null, "rag");
    store.appendAskDataEvent(runId, {
      type: "thinking",
      data: "### 已检索并复核制度",
      isThinking: true,
      replyId: "reply-1",
      modelCallIndex: 1
    });
    store.appendAskDataEvent(runId, {
      type: "text",
      data: "审批需经过 **部门审核** 和法务审核。<img src=x onerror=alert(1)>",
      replyId: "reply-2",
      modelCallIndex: 2
    });
    store.appendAskDataEvent(runId, {
      type: "table",
      data: { columns: ["不应展示"], rows: [["问知表格"]] }
    });
    const citation = {
      docId: "doc-1",
      docKey: "contract-policy",
      kbId: "kb-1",
      docName: "合同管理办法.pdf",
      sourceAvailable: true,
      fragments: ["合同审批需经过部门审核和法务审核。"]
    };
    store.appendAskDataEvent(runId, {
      type: "citation_document",
      data: citation
    });
    store.appendAskDataEvent(runId, {
      type: "citation_document",
      data: { ...citation, docName: "重复引用.pdf" }
    });
    store.appendAskDataEvent(runId, {
      type: "done",
      data: {
        mode: "rag",
        askKnowledge: true,
        summary: "审批需经过部门审核和法务审核。",
        citationDocuments: [citation]
      },
      finished: true
    });
    store.completeAskDataRun(runId);
    const replace = vi.fn();
    const close = vi.fn();
    const previewWindow = {
      location: { replace },
      close,
      opener: null
    } as unknown as Window;
    const openSpy = vi.spyOn(window, "open").mockReturnValue(previewWindow);
    vi.spyOn(knowledgeService, "loadDataHubCitationDocument").mockResolvedValue({
      url: "https://files.example.com/contract-policy.pdf"
    });

    const { container } = renderPage(<AnalysisPage mode="rag" />);

    expect(screen.getByRole("heading", { name: "问知完成" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "已检索并复核制度" })).toBeInTheDocument();
    expect(screen.getByText("部门审核")).toBeInTheDocument();
    expect(screen.queryByText("问数过程（5 步）")).not.toBeInTheDocument();
    expect(container.querySelector('img[src="x"]')).not.toBeInTheDocument();
    expect(screen.getAllByText("合同管理办法.pdf")).toHaveLength(1);
    expect(screen.queryByText("重复引用.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText("问知表格")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "收藏问数" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "AI 生成图表" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "导出结果" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "加入看板" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "打开原文" }));

    expect(openSpy).toHaveBeenCalledWith("about:blank", "_blank");
    expect(knowledgeService.loadDataHubCitationDocument).toHaveBeenCalledWith(
      expect.objectContaining({ docId: "doc-1", docKey: "contract-policy" })
    );
    expect(replace).toHaveBeenCalledWith("https://files.example.com/contract-policy.pdf");
    expect(close).not.toHaveBeenCalled();
  });

  it("shows the favorite-question action when the feature is enabled", () => {
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("各项目咨询数排名前5名", null);

    store.appendAskDataEvent(runId, {
      type: "ask_artifact",
      sessionId: "session-current",
      chatId: "chat-current",
      data: {
        askRunId: "ask-run-stale-sse-ref",
        resolvedQuestion: "各项目咨询数排名前5名",
        canFavorite: true
      }
    });
    store.appendAskDataEvent(runId, {
      type: "table",
      sessionId: "session-current",
      chatId: "chat-current",
      data: {
        columns: [
          { name: "projectName", title: "项目名称" },
          { name: "count", title: "咨询数", type: "number" }
        ],
        rows: [{ projectName: "演示账号", count: 676 }],
        totalRows: 1,
        source: "cube"
      }
    });
    store.appendAskDataEvent(runId, {
      type: "done",
      sessionId: "session-current",
      chatId: "chat-current",
      data: { summary: "已返回咨询数排名前五名。" }
    });
    store.completeAskDataRun(runId);

    renderPage(<AnalysisPage mode="ask" />);
    expect(screen.getByRole("button", { name: "收藏问数" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "已收藏问数" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "加入看板" })).not.toBeInTheDocument();
  });

  it("uses the execution panel as the only agent process surface", () => {
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("联合分析销售数据与制度", null, "agent");
    const turn = useUiStore.getState().analysisTurns.find((item) => item.id === runId)!;
    const rootSessionId = turn.sessionId!;
    const childSessionId = "child-policy-review";

    store.appendAskDataEvent(runId, {
      type: "agent_start",
      agentName: "编排智能体",
      sessionId: rootSessionId,
      globalSessionId: rootSessionId,
      chatId: turn.chatId
    });
    store.appendAskDataEvent(runId, {
      type: "thinking",
      agentName: "编排智能体",
      sessionId: rootSessionId,
      globalSessionId: rootSessionId,
      chatId: turn.chatId,
      content: "正在拆解跨来源任务。",
      isThinking: true,
      replyId: "root-reply",
      modelCallIndex: 1
    });
    store.appendAskDataEvent(runId, {
      type: "subagent_exposed",
      agentName: "制度研究员",
      sessionId: childSessionId,
      globalSessionId: rootSessionId,
      parentSessionId: rootSessionId,
      chatId: turn.chatId,
      content: {
        agentId: "policy-review",
        sessionId: childSessionId,
        subagentId: "subagent-policy-review",
        label: "制度研究员"
      }
    });
    store.appendAskDataEvent(runId, {
      type: "thinking",
      agentName: "制度研究员",
      sessionId: childSessionId,
      globalSessionId: rootSessionId,
      parentSessionId: rootSessionId,
      chatId: turn.chatId,
      content: "正在核对销售费用制度。",
      isThinking: true,
      replyId: "child-reply",
      modelCallIndex: 1
    });

    renderPage(<AnalysisPage mode="agent" />);

    expect(screen.getByText("智能编排执行")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "收起分析过程" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("思考过程")).not.toBeInTheDocument();
    expect(screen.queryByText("Agent 正在思考")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "智能体执行卡" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "打开 制度研究员执行详情" })
    ).toBeInTheDocument();
    expect(screen.getByText("正在核对销售费用制度。")).toBeInTheDocument();
  });

  it("settles the execution panel when the request ends without a root done event", () => {
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("检索制度并给出综合结论", null, "agent");
    const turn = useUiStore.getState().analysisTurns.find((item) => item.id === runId)!;
    const rootSessionId = turn.sessionId!;
    const childSessionId = "child-policy-answer";

    store.appendAskDataEvent(runId, {
      type: "agent_start",
      agentName: "编排智能体",
      sessionId: rootSessionId,
      globalSessionId: rootSessionId,
      chatId: turn.chatId
    });
    store.appendAskDataEvent(runId, {
      type: "subagent_exposed",
      agentName: "问知智能体",
      sessionId: childSessionId,
      globalSessionId: rootSessionId,
      parentSessionId: rootSessionId,
      chatId: turn.chatId,
      content: {
        sessionId: childSessionId,
        subagentId: "subagent-policy-answer",
        label: "问知智能体"
      }
    });
    store.appendAskDataEvent(runId, {
      type: "done",
      agentName: "问知智能体",
      sessionId: childSessionId,
      globalSessionId: rootSessionId,
      parentSessionId: rootSessionId,
      chatId: turn.chatId,
      content: { summary: "制度检索完成" },
      finished: true
    });
    store.appendAskDataEvent(runId, {
      type: "text",
      agentName: "编排智能体",
      sessionId: rootSessionId,
      globalSessionId: rootSessionId,
      chatId: turn.chatId,
      content: "已检索相关制度，以下为综合结论。"
    });
    store.completeAskDataRun(runId);

    renderPage(<AnalysisPage mode="agent" />);

    expect(
      screen.getByRole("heading", { name: "智能编排完成" })
    ).toBeInTheDocument();
    const panel = screen
      .getByText("智能编排执行")
      .closest(".xs-datahub-execution");
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute("data-status", "done");
    expect(
      within(panel as HTMLElement).getAllByLabelText("已完成").length
    ).toBeGreaterThan(0);
    expect(within(panel as HTMLElement).queryAllByLabelText("运行中")).toHaveLength(0);
  });

  it("keeps a replayed root error consistent across the heading and execution panel", () => {
    useUiStore.getState().restoreAskDataHistory({
      sessionId: "history-error-session",
      question: "回放一次失败的编排",
      chatMode: "agent",
      status: "done",
      events: [
        {
          type: "agent_start",
          agentName: "编排智能体",
          sessionId: "history-error-session",
          globalSessionId: "history-error-session",
          chatId: "history-error-chat"
        },
        {
          type: "error",
          agentName: "编排智能体",
          sessionId: "history-error-session",
          globalSessionId: "history-error-session",
          chatId: "history-error-chat",
          content: { message: "历史编排失败" }
        }
      ]
    });

    renderPage(<AnalysisPage mode="agent" />);

    expect(
      screen.getByRole("heading", { name: "智能编排失败" })
    ).toBeInTheDocument();
    const panel = screen
      .getByText("智能编排执行")
      .closest(".xs-datahub-execution");
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute("data-status", "error");
    expect(within(panel as HTMLElement).queryAllByLabelText("运行中")).toHaveLength(0);
  });

  it("favorites the structured ask result emitted by a child agent", async () => {
    const user = userEvent.setup();
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("查询 2023 年合同并汇总", null, "agent");
    const turn = useUiStore.getState().analysisTurns.find((item) => item.id === runId)!;
    const rootSessionId = turn.sessionId!;
    const childSessionId = "child-contract-data";
    const artifact = {
      askRunId: "ask-run-contract-2023",
      resolvedQuestion: "查询 2023 年合同明细",
      canFavorite: true
    };
    const savedAsset = {
      id: "asset-contract-2023",
      name: artifact.resolvedQuestion,
      originalQuestion: "查询 2023 年合同并汇总",
      resolvedQuestion: artifact.resolvedQuestion,
      ownerUserId: 1,
      visibility: "PRIVATE" as const,
      stableVersionId: "version-contract-2023",
      status: "ACTIVE" as const,
      createdAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-07-29T00:00:00.000Z"
    };
    const ensureSpy = vi.spyOn(queryAssetService, "ensureAskArtifact");
    const favoriteSpy = vi
      .spyOn(queryAssetService, "favoriteAskArtifact")
      .mockResolvedValue(savedAsset);

    store.appendAskDataEvent(runId, {
      type: "agent_start",
      agentName: "编排智能体",
      sessionId: rootSessionId,
      globalSessionId: rootSessionId,
      chatId: turn.chatId
    });
    store.appendAskDataEvent(runId, {
      type: "subagent_exposed",
      agentName: "问数智能体",
      sessionId: childSessionId,
      globalSessionId: rootSessionId,
      parentSessionId: rootSessionId,
      chatId: turn.chatId,
      content: {
        agentId: "ask-data",
        sessionId: childSessionId,
        subagentId: "subagent-contract-data",
        label: "问数智能体"
      }
    });
    store.appendAskDataEvent(runId, {
      type: "table",
      agentName: "问数智能体",
      sessionId: childSessionId,
      globalSessionId: rootSessionId,
      parentSessionId: rootSessionId,
      chatId: turn.chatId,
      content: {
        columns: ["合同名称", "合同金额"],
        rows: [["智慧管理平台软件", 550000]],
        totalRows: 1
      }
    });
    store.appendAskDataEvent(runId, {
      type: "ask_artifact",
      agentName: "问数智能体",
      sessionId: childSessionId,
      globalSessionId: rootSessionId,
      parentSessionId: rootSessionId,
      chatId: turn.chatId,
      content: artifact
    });
    store.appendAskDataEvent(runId, {
      type: "done",
      agentName: "问数智能体",
      sessionId: childSessionId,
      globalSessionId: rootSessionId,
      parentSessionId: rootSessionId,
      chatId: turn.chatId,
      content: { mode: "ask", summary: "已返回合同明细。" }
    });
    store.appendAskDataEvent(runId, {
      type: "text",
      agentName: "编排智能体",
      sessionId: rootSessionId,
      globalSessionId: rootSessionId,
      chatId: turn.chatId,
      content: "已汇总 2023 年合同数据。"
    });
    store.appendAskDataEvent(runId, {
      type: "done",
      agentName: "编排智能体",
      sessionId: rootSessionId,
      globalSessionId: rootSessionId,
      chatId: turn.chatId,
      content: { mode: "agent", adaptiveTeam: true, summary: "编排完成。" },
      finished: true
    });
    store.completeAskDataRun(runId);

    renderPageWithLocation(<AnalysisPage mode="agent" />);

    await user.click(screen.getByRole("button", { name: "收藏问数" }));

    expect(ensureSpy).not.toHaveBeenCalled();
    expect(favoriteSpy).toHaveBeenCalledWith(artifact, artifact.resolvedQuestion);
    expect(await screen.findByRole("button", { name: "已收藏问数" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "加入看板" }));
    expect(screen.getByRole("status", { name: "当前测试路由" })).toHaveTextContent(
      "/dashboard-editor?source=favorites&asset=asset-contract-2023&returnTo=%2Fask-agent"
    );
  });

  it("lets users choose a data result when orchestration returns multiple query assets", async () => {
    const user = userEvent.setup();
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("同时分析合同与回款", null, "agent");
    const turn = useUiStore.getState().analysisTurns.find((item) => item.id === runId)!;
    const rootSessionId = turn.sessionId!;
    const artifacts = [
      {
        sessionId: "child-contracts",
        label: "合同问数智能体",
        artifact: {
          askRunId: "ask-run-contracts",
          resolvedQuestion: "查询合同明细",
          canFavorite: true
        }
      },
      {
        sessionId: "child-payments",
        label: "回款问数智能体",
        artifact: {
          askRunId: "ask-run-payments",
          resolvedQuestion: "查询回款明细",
          canFavorite: true
        }
      }
    ];
    const favoriteSpy = vi
      .spyOn(queryAssetService, "favoriteAskArtifact")
      .mockImplementation(async (artifact, name) => ({
        id: `asset-${artifact.askRunId}`,
        name: name || artifact.resolvedQuestion,
        originalQuestion: "同时分析合同与回款",
        resolvedQuestion: artifact.resolvedQuestion,
        ownerUserId: 1,
        visibility: "PRIVATE",
        stableVersionId: `version-${artifact.askRunId}`,
        status: "ACTIVE",
        createdAt: "2026-07-29T00:00:00.000Z",
        updatedAt: "2026-07-29T00:00:00.000Z"
      }));

    store.appendAskDataEvent(runId, {
      type: "agent_start",
      agentName: "编排智能体",
      sessionId: rootSessionId,
      globalSessionId: rootSessionId,
      chatId: turn.chatId
    });
    for (const item of artifacts) {
      store.appendAskDataEvent(runId, {
        type: "subagent_exposed",
        agentName: item.label,
        sessionId: item.sessionId,
        globalSessionId: rootSessionId,
        parentSessionId: rootSessionId,
        chatId: turn.chatId,
        content: {
          sessionId: item.sessionId,
          subagentId: `subagent-${item.sessionId}`,
          label: item.label
        }
      });
      store.appendAskDataEvent(runId, {
        type: "table",
        agentName: item.label,
        sessionId: item.sessionId,
        globalSessionId: rootSessionId,
        parentSessionId: rootSessionId,
        chatId: turn.chatId,
        content: {
          columns: ["名称", "金额"],
          rows: [[item.artifact.resolvedQuestion, 100]],
          totalRows: 1
        }
      });
      store.appendAskDataEvent(runId, {
        type: "ask_artifact",
        agentName: item.label,
        sessionId: item.sessionId,
        globalSessionId: rootSessionId,
        parentSessionId: rootSessionId,
        chatId: turn.chatId,
        content: item.artifact
      });
      store.appendAskDataEvent(runId, {
        type: "done",
        agentName: item.label,
        sessionId: item.sessionId,
        globalSessionId: rootSessionId,
        parentSessionId: rootSessionId,
        chatId: turn.chatId,
        content: { mode: "ask" }
      });
    }
    store.appendAskDataEvent(runId, {
      type: "text",
      agentName: "编排智能体",
      sessionId: rootSessionId,
      globalSessionId: rootSessionId,
      chatId: turn.chatId,
      content: "合同与回款分析已完成。"
    });
    store.appendAskDataEvent(runId, {
      type: "done",
      agentName: "编排智能体",
      sessionId: rootSessionId,
      globalSessionId: rootSessionId,
      chatId: turn.chatId,
      content: { mode: "agent", adaptiveTeam: true },
      finished: true
    });
    store.completeAskDataRun(runId);

    renderPage(<AnalysisPage mode="agent" />);

    await user.click(screen.getByRole("button", { name: "收藏数据结果（2）" }));
    await user.click(screen.getByRole("menuitem", { name: "收藏：查询回款明细" }));

    expect(favoriteSpy).toHaveBeenCalledWith(
      artifacts[1].artifact,
      artifacts[1].artifact.resolvedQuestion
    );
    expect(screen.getByRole("button", { name: "加入看板" })).toBeEnabled();
  });

  it("backfills a child result through its persisted root session", async () => {
    const user = userEvent.setup();
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("查询合同数量", null, "agent");
    const turn = useUiStore.getState().analysisTurns.find((item) => item.id === runId)!;
    const rootSessionId = turn.sessionId!;
    const childSessionId = "child-contract-backfill";
    const ensuredArtifact = {
      askRunId: "ask-run-contract-backfill",
      resolvedQuestion: "统计合同数量",
      canFavorite: true
    };
    const ensureSpy = vi
      .spyOn(queryAssetService, "ensureAskArtifact")
      .mockResolvedValue(ensuredArtifact);
    const favoriteSpy = vi
      .spyOn(queryAssetService, "favoriteAskArtifact")
      .mockResolvedValue({
        id: "asset-contract-backfill",
        name: ensuredArtifact.resolvedQuestion,
        originalQuestion: "查询合同数量",
        resolvedQuestion: ensuredArtifact.resolvedQuestion,
        ownerUserId: 1,
        visibility: "PRIVATE",
        stableVersionId: "version-contract-backfill",
        status: "ACTIVE",
        createdAt: "2026-07-29T00:00:00.000Z",
        updatedAt: "2026-07-29T00:00:00.000Z"
      });

    store.appendAskDataEvent(runId, {
      type: "subagent_exposed",
      agentName: "问数智能体",
      sessionId: childSessionId,
      globalSessionId: rootSessionId,
      parentSessionId: rootSessionId,
      chatId: turn.chatId,
      content: {
        sessionId: childSessionId,
        subagentId: "subagent-contract-backfill",
        label: "问数智能体"
      }
    });
    store.appendAskDataEvent(runId, {
      type: "table",
      agentName: "问数智能体",
      sessionId: childSessionId,
      globalSessionId: rootSessionId,
      parentSessionId: rootSessionId,
      chatId: turn.chatId,
      content: {
        columns: ["年份", "合同数"],
        rows: [[2023, 24]],
        totalRows: 1
      }
    });
    store.appendAskDataEvent(runId, {
      type: "done",
      agentName: "问数智能体",
      sessionId: childSessionId,
      globalSessionId: rootSessionId,
      parentSessionId: rootSessionId,
      chatId: turn.chatId,
      content: { mode: "ask" }
    });
    store.appendAskDataEvent(runId, {
      type: "text",
      agentName: "编排智能体",
      sessionId: rootSessionId,
      globalSessionId: rootSessionId,
      chatId: turn.chatId,
      content: "2023 年共有 24 份合同。"
    });
    store.appendAskDataEvent(runId, {
      type: "done",
      agentName: "编排智能体",
      sessionId: rootSessionId,
      globalSessionId: rootSessionId,
      chatId: turn.chatId,
      content: { mode: "agent", adaptiveTeam: true },
      finished: true
    });
    store.completeAskDataRun(runId);

    renderPage(<AnalysisPage mode="agent" />);
    await user.click(screen.getByRole("button", { name: "收藏问数" }));

    expect(ensureSpy).toHaveBeenCalledWith(rootSessionId, turn.chatId, childSessionId);
    expect(favoriteSpy).toHaveBeenCalledWith(
      ensuredArtifact,
      ensuredArtifact.resolvedQuestion
    );
  });

  it("backfills an obvious ask subagent when orchestration only returns a root Markdown table", async () => {
    const user = userEvent.setup();
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("统计咨询对象排名", null, "agent");
    const turn = useUiStore.getState().analysisTurns.find((item) => item.id === runId)!;
    const rootSessionId = turn.sessionId!;
    const childSessionId = "child-consultation-ranking";
    const ensuredArtifact = {
      askRunId: "ask-run-consultation-ranking",
      resolvedQuestion: "统计咨询对象排名",
      canFavorite: true
    };
    const ensureSpy = vi
      .spyOn(queryAssetService, "ensureAskArtifact")
      .mockResolvedValue(ensuredArtifact);
    const favoriteSpy = vi
      .spyOn(queryAssetService, "favoriteAskArtifact")
      .mockResolvedValue({
        id: "asset-consultation-ranking",
        name: ensuredArtifact.resolvedQuestion,
        originalQuestion: "统计咨询对象排名",
        resolvedQuestion: ensuredArtifact.resolvedQuestion,
        ownerUserId: 1,
        visibility: "PRIVATE",
        stableVersionId: "version-consultation-ranking",
        status: "ACTIVE",
        createdAt: "2026-07-31T00:00:00.000Z",
        updatedAt: "2026-07-31T00:00:00.000Z"
      });

    store.appendAskDataEvent(runId, {
      type: "subagent_exposed",
      agentName: "问数智能体",
      sessionId: childSessionId,
      globalSessionId: rootSessionId,
      parentSessionId: rootSessionId,
      chatId: turn.chatId,
      content: {
        sessionId: childSessionId,
        subagentId: "subagent-consultation-ranking",
        label: "问数智能体"
      }
    });
    store.appendAskDataEvent(runId, {
      type: "done",
      agentName: "问数智能体",
      sessionId: childSessionId,
      globalSessionId: rootSessionId,
      parentSessionId: rootSessionId,
      chatId: turn.chatId,
      content: {}
    });
    store.appendAskDataEvent(runId, {
      type: "text",
      agentName: "编排智能体",
      sessionId: rootSessionId,
      globalSessionId: rootSessionId,
      chatId: turn.chatId,
      content: [
        "按咨询记录数据排名前十的咨询对象如下：",
        "",
        "| 排名 | 咨询对象 | 咨询量 |",
        "| --- | --- | ---: |",
        "| 1 | 小治 | 456 |"
      ].join("\n")
    });
    store.appendAskDataEvent(runId, {
      type: "done",
      agentName: "编排智能体",
      sessionId: rootSessionId,
      globalSessionId: rootSessionId,
      chatId: turn.chatId,
      content: { mode: "agent", adaptiveTeam: true },
      finished: true
    });
    store.completeAskDataRun(runId);

    renderPage(<AnalysisPage mode="agent" />);

    const favoriteButton = screen.getByRole("button", { name: "收藏问数" });
    expect(favoriteButton).toBeEnabled();
    await user.click(favoriteButton);

    expect(ensureSpy).toHaveBeenCalledWith(rootSessionId, turn.chatId, childSessionId);
    expect(favoriteSpy).toHaveBeenCalledWith(
      ensuredArtifact,
      ensuredArtifact.resolvedQuestion
    );
  });

  it("reruns a single historical ask before favoriting when persisted queries are incomplete", async () => {
    const user = userEvent.setup();
    const rootSessionId = "history-consultation-session";
    const childSessionId = "history-consultation-child";
    const chatId = "history-consultation-chat";
    const ensuredArtifact = {
      askRunId: "ask-run-history-consultation",
      resolvedQuestion: "统计历史咨询对象排名",
      canFavorite: true
    };
    const ensureSpy = vi
      .spyOn(queryAssetService, "ensureAskArtifact")
      .mockRejectedValue(
        new Error("历史问数缺少完整可执行查询，请重新问数后收藏")
      );
    const materializeSpy = vi
      .spyOn(queryAssetMaterializationService, "materializeAskArtifact")
      .mockResolvedValue(ensuredArtifact);
    const favoriteSpy = vi
      .spyOn(queryAssetService, "favoriteAskArtifact")
      .mockResolvedValue({
        id: "asset-history-consultation",
        name: ensuredArtifact.resolvedQuestion,
        originalQuestion: "统计历史咨询对象排名",
        resolvedQuestion: ensuredArtifact.resolvedQuestion,
        ownerUserId: 1,
        visibility: "PRIVATE",
        stableVersionId: "version-history-consultation",
        status: "ACTIVE",
        createdAt: "2026-07-31T00:00:00.000Z",
        updatedAt: "2026-07-31T00:00:00.000Z"
      });

    useUiStore.getState().restoreAskDataHistory({
      sessionId: rootSessionId,
      question: "统计历史咨询对象排名",
      chatMode: "agent",
      status: "done",
      events: [
        {
          type: "subagent_exposed",
          agentName: "问数智能体",
          sessionId: childSessionId,
          globalSessionId: rootSessionId,
          parentSessionId: rootSessionId,
          chatId,
          content: {
            agentId: "ask-data",
            sessionId: childSessionId,
            subagentId: "history-consultation-subagent",
            label: "问数智能体"
          }
        },
        {
          type: "done",
          agentName: "问数智能体",
          sessionId: childSessionId,
          globalSessionId: rootSessionId,
          parentSessionId: rootSessionId,
          chatId,
          content: {}
        },
        {
          type: "text",
          agentName: "编排智能体",
          sessionId: rootSessionId,
          globalSessionId: rootSessionId,
          chatId,
          content: [
            "历史咨询对象排名如下：",
            "",
            "| 排名 | 咨询对象 | 咨询量 |",
            "| --- | --- | ---: |",
            "| 1 | 小治 | 456 |"
          ].join("\n")
        },
        {
          type: "done",
          agentName: "编排智能体",
          sessionId: rootSessionId,
          globalSessionId: rootSessionId,
          chatId,
          content: { mode: "agent", adaptiveTeam: true },
          finished: true
        }
      ]
    });

    renderPage(<AnalysisPage mode="agent" />);

    await user.click(screen.getByRole("button", { name: "收藏问数" }));

    expect(ensureSpy).toHaveBeenNthCalledWith(
      1,
      rootSessionId,
      chatId,
      childSessionId
    );
    expect(ensureSpy).toHaveBeenNthCalledWith(2, rootSessionId, chatId);
    expect(materializeSpy).toHaveBeenCalledWith({
      question: "统计历史咨询对象排名"
    });
    expect(favoriteSpy).toHaveBeenCalledWith(
      ensuredArtifact,
      ensuredArtifact.resolvedQuestion
    );
    expect(
      await screen.findByRole("button", { name: "已收藏问数" })
    ).toBeDisabled();
  });

  it("streams every phase detail before advancing to the next ask-data phase", async () => {
    vi.useFakeTimers();
    const runId = useUiStore.getState().startAskDataRun("分析最近 30 天客户增长趋势");
    const store = useUiStore.getState();

    store.appendAskDataEvent(runId, {
      type: "routing_decompose",
      data: { executionMode: "SIMPLE", subQuestions: ["统计最近 30 天客户增长趋势"] }
    });
    store.appendAskDataEvent(runId, {
      type: "react_step",
      data: {
        round: 1,
        action: "locate_datasource",
        status: "success",
        summary: "datasourceId=1000002, name=生产销售数据, datasourceSkillLength=473"
      }
    });
    store.appendAskDataEvent(runId, {
      type: "react_step",
      data: {
        round: 1,
        action: "match_skill",
        status: "success",
        summary: "已按数据源 Skill 规划出业务组，直接加载业务组 Skill。"
      }
    });
    store.appendAskDataEvent(runId, {
      type: "react_step",
      data: {
        round: 1,
        action: "load_cube_meta",
        status: "success",
        summary: "groupName=group_1, hitLayer=group（已定位业务组）"
      }
    });
    store.appendAskDataEvent(runId, {
      type: "react_step",
      data: {
        round: 2,
        action: "plan_with_datasource_skill",
        status: "success",
        summary: "已读取数据源 Skill"
      }
    });

    const { container } = renderPage(<AnalysisPage mode="ask" />);
    const firstStream = screen.getByRole("status", { name: "理解问题实时输出" });
    const firstVisual = firstStream.querySelector(".xs-streaming-text__visual");

    expect(firstVisual?.textContent).toBe("");

    act(() => {
      vi.advanceTimersByTime(84);
    });

    expect(firstVisual?.textContent?.length).toBeGreaterThan(0);
    expect(firstVisual?.textContent).not.toBe("识别问数意图，拆解为 data-hub 可执行的问题。");

    const steps = screen.getByRole("list", { name: "data-hub 问数步骤" });
    const understandStep = within(steps).getByText("理解问题").closest("li");
    const scopeStep = within(steps).getByText("确定数据范围").closest("li");

    expect(understandStep).toHaveClass("datahub-step--active");
    expect(scopeStep).toHaveClass("datahub-step--pending");
    expect(scopeStep).not.toHaveTextContent("datasourceId=1000002");
    expect(within(steps).getByText("数据处理").closest("li")).not.toHaveTextContent("已读取数据源 Skill");
    expect(within(steps).queryByRole("status", { name: "AI 正在确定数据范围" })).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(phasePlaybackSettleForTest);
    });

    expect(scopeStep).toHaveClass("datahub-step--active");
    expect(within(steps).getByRole("status", { name: "AI 正在确定数据范围" })).toBeInTheDocument();
    const scopeStream = within(steps).getByRole("status", { name: "确定数据范围实时输出" });
    expect(scopeStream.querySelector(".xs-streaming-text__visual")?.textContent).not.toBe(
      "定位空间、数据源和业务语义，确认本次查询边界。"
    );
    expect(screen.getByRole("status", { name: /AI 正在生成问数结果/ })).toHaveTextContent(
      "当前步骤：确定数据范围"
    );
    expect(container.querySelector(".datahub-result-loading__skeleton")).toBeInTheDocument();

    for (let messageIndex = 0; messageIndex < 4; messageIndex += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(phasePlaybackSettleForTest);
    });

    expect(within(steps).getByText("数据处理").closest("li")).toHaveClass("datahub-step--active");
    expect(scopeStep).toHaveTextContent("datasourceId=1000002, name=生产销售数据, datasourceSkillLength=473");
    expect(scopeStep).toHaveTextContent("已按数据源 Skill 规划出业务组，直接加载业务组 Skill。");
    expect(scopeStep).toHaveTextContent("groupName=group_1, hitLayer=group（已定位业务组）");
  });

  it("keeps completed table events buffered until the reasoning playback finishes", async () => {
    vi.useFakeTimers();
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("查询咨询数最多的社区");

    const { container } = renderPage(<AnalysisPage mode="ask" />);

    act(() => {
      store.appendAskDataEvent(runId, {
        type: "routing_decompose",
        data: { executionMode: "SIMPLE", subQuestions: ["统计各社区咨询数"] }
      });
      store.appendAskDataEvent(runId, {
        type: "react_step",
        data: { action: "locate_datasource", status: "success", summary: "已定位生产数据源" }
      });
      store.appendAskDataEvent(runId, {
        type: "react_step",
        data: { action: "load_cube_meta", status: "success", summary: "已加载社区咨询语义模型" }
      });
      store.appendAskDataEvent(runId, {
        type: "react_step",
        data: { action: "plan_with_datasource_skill", status: "success", summary: "已生成查询计划" }
      });
      store.appendAskDataEvent(runId, {
        type: "react_step",
        data: { action: "execute_query", status: "success", summary: "返回 1 行数据" }
      });
      store.appendAskDataEvent(runId, {
        type: "table",
        data: {
          columns: [
            { name: "community", title: "社区" },
            { name: "count", title: "咨询数", type: "number" }
          ],
          rows: [{ community: "演示账号", count: 720 }],
          totalRows: 1,
          source: "cube"
        }
      });
      store.appendAskDataEvent(runId, {
        type: "react_step",
        data: { action: "finalize", status: "success", summary: "finalize" }
      });
      store.appendAskDataEvent(runId, {
        type: "done",
        data: { summary: "演示账号咨询数最多，共 720 条。" }
      });
      store.completeAskDataRun(runId);
    });

    expect(screen.getByRole("heading", { name: "问数完成" })).toBeInTheDocument();
    expect(container.querySelector(".analysis-result-stage")).toHaveAttribute("data-state", "ready");
    expect(screen.getByText("演示账号")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成大屏" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI 生成图表" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出结果" })).toBeInTheDocument();

    for (let playbackTick = 0; playbackTick < 20; playbackTick += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });
    }

    expect(screen.getByRole("heading", { name: "问数完成" })).toBeInTheDocument();
    expect(container.querySelector(".analysis-result-stage")).toHaveAttribute("data-state", "ready");
    expect(screen.getByText("演示账号")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成大屏" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI 生成图表" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出结果" })).toBeInTheDocument();
  });

  it("does not fabricate reasoning or export actions without backend events", () => {
    const runId = useUiStore.getState().startAskDataRun("分析销售数据");
    useUiStore.getState().completeAskDataRun(runId);
    renderPage(<AnalysisPage mode="ask" />);

    expect(screen.queryByRole("button", { name: "收起分析过程" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("思考过程")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "导出结果" })).not.toBeInTheDocument();
  });

  it("downloads ask-data result tables as csv", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn<(object: Blob | MediaSource) => string>(() => "blob:xingshu-csv");
    const revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const originalCreateObjectURL = window.URL.createObjectURL;
    const originalRevokeObjectURL = window.URL.revokeObjectURL;

    Object.defineProperty(window.URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(window.URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });

    const runId = useUiStore.getState().startAskDataRun("导出咨询统计");
    useUiStore.getState().appendAskDataEvent(runId, {
      type: "table",
      data: {
        columns: [
          { name: "WechatyProjectInfo.projectName", title: "微信机器人项目信息表 项目名称表" },
          { name: "WechatyConsulationRecord.count", title: "微信机器人咨询记录表 记录数", type: "number" }
        ],
        rows: [
          {
            "WechatyProjectInfo.projectName": "六角井社区",
            "WechatyConsulationRecord.count": 262
          }
        ],
        totalRows: 1,
        source: "cube"
      }
    });
    useUiStore.getState().completeAskDataRun(runId);

    renderPage(<AnalysisPage mode="ask" />);

    await user.click(screen.getByRole("button", { name: "导出结果" }));

    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    await expect(blob.text()).resolves.toContain("项目名称,记录数");
    await expect(blob.text()).resolves.toContain("六角井社区,262");
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:xingshu-csv");
    expect(screen.getAllByRole("status").map((node) => node.textContent).join(" ")).toContain("已导出 1 行问数结果");

    Object.defineProperty(window.URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL });
    Object.defineProperty(window.URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectURL });
  });

  it("submits a follow-up with Enter without exposing upload controls", async () => {
    const user = userEvent.setup();
    renderPage(<AnalysisPage mode="ask" />);

    await user.type(screen.getByRole("textbox", { name: "命令输入" }), "继续分析利润率{Enter}");

    expect(screen.getByText("继续分析利润率")).toBeInTheDocument();
    expect(screen.getAllByRole("status").map((node) => node.textContent).join(" ")).toContain("已继续追问：继续分析利润率");

    expect(screen.queryByRole("button", { name: "附件" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("添加附件")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "语音" }));
    expect(screen.getAllByRole("status").map((node) => node.textContent).join(" ")).toContain(
      "当前浏览器不支持语音输入"
    );
  });

  it("lets the user choose a DataHub model from the workspace composer", async () => {
    const user = userEvent.setup();
    renderPage(<AnalysisPage mode="ask" />);

    expect(screen.getByRole("button", { name: "选择模型，当前问数模型" })).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "命令输入" }), "查询最新销售制度");
    await user.click(screen.getByRole("button", { name: "选择模型，当前问数模型" }));
    await user.click(screen.getByRole("menuitem", { name: /问知模型/ }));

    expect(screen.getByRole("button", { name: "选择模型，当前问知模型" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "命令输入" })).toHaveValue("查询最新销售制度");
  });

  it("keeps the restored history turn visible when submitting a follow-up", async () => {
    const user = userEvent.setup();
    useUiStore.getState().restoreAskDataHistory({
      sessionId: "history-session-1",
      question: "历史中的问题",
      events: [{ type: "done", data: { summary: "历史中的答案" } }]
    });
    renderPage(<AnalysisPage mode="ask" />);

    await user.type(screen.getByRole("textbox", { name: "命令输入" }), "继续追问");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(screen.getByText("历史中的问题")).toBeInTheDocument();
    expect(screen.getByText("历史中的答案")).toBeInTheDocument();
    expect(screen.getByText("继续追问")).toBeInTheDocument();
  });

  it("stops an active ask-data run and exposes the cancelled state", async () => {
    const user = userEvent.setup();
    const runId = useUiStore.getState().startAskDataRun("停止这次问数", null);
    const abort = vi.fn();
    useUiStore.getState().bindAskDataController(runId, { abort } as unknown as AbortController);
    renderPage(<AnalysisPage mode="ask" />);

    await user.click(screen.getByRole("button", { name: "停止生成" }));

    expect(abort).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "已停止生成" })).toBeInTheDocument();
    expect(screen.getAllByRole("status").map((node) => node.textContent).join(" ")).toContain(
      "已停止本次问数生成"
    );
  });

  it("follows streaming output, pauses only for an upward user gesture, and resumes from the bottom button", () => {
    const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const store = useUiStore.getState();
    let scrollHeight = 500;
    const runId = store.startAskDataRun("连续问数滚动");

    const { container } = renderPage(<AnalysisPage mode="ask" />);
    const workspace = container.querySelector(".analysis-workspace") as HTMLDivElement;

    Object.defineProperty(workspace, "clientHeight", { configurable: true, get: () => 100 });
    Object.defineProperty(workspace, "scrollHeight", { configurable: true, get: () => scrollHeight });

    workspace.scrollTop = 400;
    fireEvent.scroll(workspace);
    scrollHeight = 900;

    act(() => {
      store.appendAskDataEvent(runId, { type: "content", data: "第一段结果" });
    });

    expect(workspace.scrollTop).toBe(800);
    expect(screen.queryByRole("button", { name: "回到底部" })).not.toBeInTheDocument();

    workspace.scrollTop = 760;
    fireEvent.scroll(workspace);
    scrollHeight = 1000;

    act(() => {
      store.appendAskDataEvent(runId, { type: "content", data: "非用户滚动后的结果" });
    });

    expect(workspace.scrollTop).toBe(900);
    expect(screen.queryByRole("button", { name: "回到底部" })).not.toBeInTheDocument();

    fireEvent.wheel(workspace, { deltaY: -80 });
    workspace.scrollTop = 160;
    fireEvent.scroll(workspace);
    scrollHeight = 1200;

    act(() => {
      store.appendAskDataEvent(runId, { type: "content", data: "第二段结果" });
    });

    expect(workspace.scrollTop).toBe(160);
    expect(screen.getByRole("button", { name: "回到底部" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "回到底部" }));

    expect(workspace.scrollTop).toBe(1100);
    expect(screen.queryByRole("button", { name: "回到底部" })).not.toBeInTheDocument();

    scrollHeight = 1400;
    act(() => {
      store.appendAskDataEvent(runId, { type: "content", data: "恢复跟随后继续输出" });
    });

    expect(workspace.scrollTop).toBe(1300);
    expect(requestFrame).toHaveBeenCalled();
  });

  it("copies a recent table request back into the generation prompt", async () => {
    const user = userEvent.setup();
    renderPage(<TablePage />);

    const firstTable = await screen.findByRole("article", { name: /客户销售排行榜表/ });
    await user.click(within(firstTable).getByRole("button", { name: "复制制表要求" }));

    expect(screen.getByRole("textbox", { name: "制表需求" })).toHaveValue("客户销售排行榜表：2024年Q1华东区TOP20");
    expect(screen.getByRole("status")).toHaveTextContent("已复制制表要求：客户销售排行榜表");
  });

});
