import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { AppProviders } from "@/app/providers";
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
  it("renders the analysis reasoning as a completed timeline", () => {
    renderPage(<AnalysisPage />);

    const timeline = screen.getByRole("list", { name: "分析步骤时间线" });

    expect(within(timeline).getAllByRole("listitem")).toHaveLength(5);
    expect(within(timeline).getByText("理解问题")).toBeInTheDocument();
    expect(within(timeline).getByText("用户需要分析2024年各季度销售额趋势，并与2023年同期进行对比。")).toBeInTheDocument();
    expect(within(timeline).getByText("生成可视化结果")).toBeInTheDocument();
  });

  it("collapses reasoning and exports analysis results", async () => {
    const user = userEvent.setup();
    renderPage(<AnalysisPage />);

    await user.click(screen.getByRole("button", { name: "收起分析过程" }));

    expect(screen.queryByLabelText("思考过程")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("已收起分析过程");

    await user.click(screen.getByRole("button", { name: "导出结果" }));

    expect(screen.getByRole("status")).toHaveTextContent("已生成分析结果导出任务");
  });

  it("submits a follow-up analysis question and handles input tools", async () => {
    const user = userEvent.setup();
    renderPage(<AnalysisPage />);

    await user.type(screen.getByRole("textbox", { name: "命令输入" }), "继续分析利润率");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(screen.getByText("继续分析利润率")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("已继续追问：继续分析利润率");

    await user.click(screen.getByRole("button", { name: "附件" }));
    expect(screen.getByRole("status")).toHaveTextContent("已打开附件选择");

    await user.click(screen.getByRole("button", { name: "语音" }));
    expect(screen.getByRole("status")).toHaveTextContent("已准备语音输入");
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
