import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { TablePage } from "./TablePage";

const templateMocks = vi.hoisted(() => ({
  listTableTemplates: vi.fn(),
  createTableTemplate: vi.fn(),
  updateTableTemplate: vi.fn(),
  deleteTableTemplate: vi.fn()
}));

vi.mock("@/services/tableTemplateService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableTemplateService")>()),
  ...templateMocks
}));

vi.mock("@/services/tableService", () => ({
  listRecentTables: vi.fn().mockResolvedValue([])
}));

function renderTablePage() {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={["/table"]}>
        <TablePage />
      </MemoryRouter>
    </AppProviders>
  );
}

describe("TablePage 表格模板选项卡", () => {
  beforeEach(() => {
    templateMocks.listTableTemplates.mockReset().mockResolvedValue([
      {
        id: 1,
        name: "季度合同台账",
        prompt: "按季度统计合同金额与数量",
        structureJson: '{"columns":[{"title":"合同编号"},{"title":"合同金额"}]}',
        updatedAt: "2026-08-30T10:00:00"
      }
    ]);
    templateMocks.createTableTemplate.mockReset().mockResolvedValue({ id: 2 });
    templateMocks.deleteTableTemplate.mockReset().mockResolvedValue(undefined);
  });

  it("切到模板页展示模板与结构列数，默认页仍是最近制表", async () => {
    const user = userEvent.setup();
    renderTablePage();

    expect(screen.getByLabelText("最近制表记录")).toBeInTheDocument();
    expect(templateMocks.listTableTemplates).not.toHaveBeenCalled();

    await user.click(screen.getByText("表格模板"));
    expect(await screen.findByText("季度合同台账")).toBeInTheDocument();
    expect(screen.getByText("2 列结构")).toBeInTheDocument();
    expect(screen.queryByLabelText("最近制表记录")).not.toBeInTheDocument();
  });

  it("选项卡不挂原生 title，鼠标扫过不会飘出重复的提示条", async () => {
    renderTablePage();

    const tabs = screen.getByLabelText("制表内容切换");
    for (const text of ["最近制表", "我的表格", "表格模板"]) {
      expect(within(tabs).getByText(text)).toHaveAttribute("title", "");
    }
  });

  it("新建模板经弹窗保存并刷新列表", async () => {
    const user = userEvent.setup();
    renderTablePage();

    await user.click(screen.getByText("表格模板"));
    await user.click(await screen.findByRole("button", { name: "新建模板" }));

    await user.type(screen.getByPlaceholderText("如：季度合同台账"), "  部门人员清单 ");
    await user.type(
      screen.getByPlaceholderText("描述这张表要统计什么、按什么口径…"),
      " 列出各部门在编人员 "
    );
    await user.click(screen.getByRole("button", { name: "保存模板" }));

    await waitFor(() =>
      expect(templateMocks.createTableTemplate).toHaveBeenCalledWith({
        name: "部门人员清单",
        prompt: "列出各部门在编人员",
        structureJson: null
      })
    );
    expect(await screen.findByRole("status")).toHaveTextContent("模板已保存");
  });

  it("删除模板需确认后生效", async () => {
    const user = userEvent.setup();
    renderTablePage();

    await user.click(screen.getByText("表格模板"));
    await user.click(await screen.findByRole("button", { name: "删除模板：季度合同台账" }));
    await user.click(await screen.findByRole("button", { name: "删除" }));

    await waitFor(() => expect(templateMocks.deleteTableTemplate).toHaveBeenCalledWith(1));
    expect(await screen.findByRole("status")).toHaveTextContent("已删除模板：季度合同台账");
  });
});
