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

  it("collapses reasoning and exports analysis results", async () => {
    const user = userEvent.setup();
    const runId = useUiStore.getState().startAskDataRun("分析销售数据");
    useUiStore.getState().completeAskDataRun(runId);
    renderPage(<AnalysisPage />);

    await user.click(screen.getByRole("button", { name: "收起分析过程" }));

    expect(screen.queryByLabelText("思考过程")).not.toBeInTheDocument();
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

  it("submits a follow-up question and exposes attachment and voice feedback", async () => {
    const user = userEvent.setup();
    renderPage(<AnalysisPage />);

    await user.type(screen.getByRole("textbox", { name: "命令输入" }), "继续分析利润率");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(screen.getByText("继续分析利润率")).toBeInTheDocument();
    expect(screen.getAllByRole("status").map((node) => node.textContent).join(" ")).toContain("已继续追问：继续分析利润率");

    expect(screen.getByRole("button", { name: "附件" })).toBeInTheDocument();
    await user.upload(
      screen.getByLabelText("添加附件"),
      new File(["利润率"], "利润率.csv", { type: "text/csv" })
    );
    expect(screen.getAllByRole("status").map((node) => node.textContent).join(" ")).toContain(
      "1 个附件已加入本地队列，尚未上传"
    );
    expect(screen.getByRole("list", { name: "附件队列" })).toHaveTextContent("利润率.csv");

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

  it("auto-scrolls the ask-data workspace until the user scrolls upward", () => {
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

    expect(workspace.scrollTop).toBe(900);

    workspace.scrollTop = 160;
    fireEvent.scroll(workspace);
    scrollHeight = 1200;

    act(() => {
      store.appendAskDataEvent(runId, { type: "content", data: "第二段结果" });
    });

    expect(workspace.scrollTop).toBe(160);
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

  it("selects writing type, guide, history, and scene prompts", async () => {
    const user = userEvent.setup();
    renderPage(<WritingPage />);

    await user.click(screen.getByRole("button", { name: "方案策划" }));

    expect(screen.getByRole("textbox", { name: "写作需求" })).toHaveValue("请帮我撰写一份方案策划，包含背景、目标、步骤和交付物。");
    expect(screen.getByRole("status")).toHaveTextContent("已切换写作类型：方案策划");

    await user.click(screen.getByRole("button", { name: "使用指南" }));
    expect(screen.getByRole("status")).toHaveTextContent("已打开写作指南");

    await user.click(screen.getByRole("button", { name: "写作历史" }));
    expect(screen.getByRole("status")).toHaveTextContent("已定位到我的文稿");

    await user.click(screen.getByRole("button", { name: "附件" }));
    expect(screen.getByRole("status")).toHaveTextContent("已打开写作附件选择");

    await user.click(screen.getByRole("button", { name: /方案策划：生成项目方案/ }));
    expect(screen.getByRole("textbox", { name: "写作需求" })).toHaveValue("请帮我生成项目方案、解决方案、实施计划等。");
  });

  it("opens writing document details from the document table", async () => {
    const user = userEvent.setup();
    renderPage(<WritingPage />);

    await user.click(await screen.findByRole("button", { name: "查看 数据资产管理平台产品介绍" }));

    expect(screen.getByRole("status")).toHaveTextContent("已打开文稿：数据资产管理平台产品介绍");
  });
});
