import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { useUiStore } from "@/stores/uiStore";
import { AnalysisPage } from "./AnalysisPage";
import { TablePage } from "./TablePage";
import { WritingPage } from "./WritingPage";

const phasePlaybackSettleForTest = 250;

function renderPage(page: ReactElement) {
  return render(
    <AppProviders>
      <MemoryRouter>{page}</MemoryRouter>
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

    renderPage(<AnalysisPage />);

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

    const { container } = renderPage(<AnalysisPage />);
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

    const { container } = renderPage(<AnalysisPage />);

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

    expect(screen.getByRole("heading", { name: "正在问数" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "AI 正在生成问数结果" })).toBeInTheDocument();
    expect(container.querySelector(".analysis-result-stage")).toHaveAttribute("data-state", "loading");
    expect(screen.queryByText("演示账号")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成大屏" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "AI 生成图表" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "导出结果" })).not.toBeInTheDocument();

    for (let playbackTick = 0; playbackTick < 20; playbackTick += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });
    }

    expect(screen.getByRole("heading", { name: "问数完成" })).toBeInTheDocument();
    expect(container.querySelector(".analysis-result-stage")).toHaveAttribute("data-state", "ready");
    expect(screen.getByText("演示账号")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成大屏" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI 生成图表" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出结果" })).toBeInTheDocument();
  });

  it("collapses reasoning and exports analysis results", async () => {
    const user = userEvent.setup();
    const runId = useUiStore.getState().startAskDataRun("分析销售数据");
    useUiStore.getState().completeAskDataRun(runId);
    renderPage(<AnalysisPage />);

    await user.click(screen.getByRole("button", { name: "收起分析过程" }));

    expect(screen.getByLabelText("思考过程")).toHaveAttribute("hidden");
    expect(screen.getAllByRole("status").map((node) => node.textContent).join(" ")).toContain("已收起分析过程");

    await user.click(screen.getByRole("button", { name: "导出结果" }));

    expect(screen.getAllByRole("status").map((node) => node.textContent).join(" ")).toContain("暂无可导出的问数表格");
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

    renderPage(<AnalysisPage />);

    await user.click(screen.getByRole("button", { name: "导出结果" }));

    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    await expect(blob.text()).resolves.toContain("项目名称表,记录数");
    await expect(blob.text()).resolves.toContain("六角井社区,262");
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:xingshu-csv");
    expect(screen.getAllByRole("status").map((node) => node.textContent).join(" ")).toContain("已导出 1 行问数结果");

    Object.defineProperty(window.URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL });
    Object.defineProperty(window.URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectURL });
  });

  it("submits a follow-up with Enter without exposing upload controls", async () => {
    const user = userEvent.setup();
    renderPage(<AnalysisPage />);

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

  it("keeps the restored history turn visible when submitting a follow-up", async () => {
    const user = userEvent.setup();
    useUiStore.getState().restoreAskDataHistory({
      sessionId: "history-session-1",
      question: "历史中的问题",
      events: [{ type: "done", data: { summary: "历史中的答案" } }]
    });
    renderPage(<AnalysisPage />);

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
    renderPage(<AnalysisPage />);

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

    const { container } = renderPage(<AnalysisPage />);
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

  it("selects writing type and scene prompts while marking unavailable writing actions", async () => {
    const user = userEvent.setup();
    renderPage(<WritingPage />);

    await user.click(screen.getByRole("button", { name: "方案策划" }));

    expect(screen.getByRole("textbox", { name: "写作需求" })).toHaveValue("请帮我撰写一份方案策划，包含背景、目标、步骤和交付物。");
    expect(screen.getByRole("status")).toHaveTextContent("已切换写作类型：方案策划");

    expect(screen.getByRole("button", { name: /使用指南.*即将开放/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /写作历史.*即将开放/ })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "附件" }));
    expect(screen.getByRole("status")).toHaveTextContent("已打开写作附件选择");

    await user.click(screen.getByRole("button", { name: /方案策划：生成项目方案/ }));
    expect(screen.getByRole("textbox", { name: "写作需求" })).toHaveValue("请帮我生成项目方案、解决方案、实施计划等。");
  });

  it("marks unavailable writing document details instead of claiming they opened", async () => {
    renderPage(<WritingPage />);

    expect(
      await screen.findByRole("button", { name: /查看 数据资产管理平台产品介绍.*即将开放/ })
    ).toBeDisabled();
    expect(screen.queryByText(/已打开文稿/)).not.toBeInTheDocument();
  });
});
