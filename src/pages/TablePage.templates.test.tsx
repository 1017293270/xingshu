import { readFileSync } from "node:fs";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { TablePage } from "./TablePage";

const readCss = (path: string) => readFileSync(path, "utf8").replaceAll("\r\n", "\n");

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

const tableMocks = vi.hoisted(() => ({
  listRecentTables: vi.fn()
}));

vi.mock("@/services/tableService", () => ({
  listRecentTables: tableMocks.listRecentTables
}));

/** 我的表格里的一行：id 与标题按序号编，更新时间从 9 月 20 日往前排，列表顺序即序号顺序。 */
function tableSession(index: number) {
  const day = String(20 - index).padStart(2, "0");
  return {
    id: `ask-table-${index}`,
    title: `制表会话 ${index}`,
    tag: "清单" as const,
    description: `2026-08-${day} 10:00`,
    iconId: "contact-list" as const,
    prompt: `制表会话 ${index} 的完整要求`,
    updatedAt: `2026-08-${day}T10:00:00`
  };
}

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
    tableMocks.listRecentTables.mockReset().mockResolvedValue([]);
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

  it("切到模板页展示模板与结构列数，默认页是我的表格", async () => {
    const user = userEvent.setup();
    renderTablePage();

    expect(screen.getByRole("region", { name: "我的表格列表" })).toBeInTheDocument();
    expect(templateMocks.listTableTemplates).not.toHaveBeenCalled();

    await user.click(screen.getByText("表格模板"));
    expect(await screen.findByText("季度合同台账")).toBeInTheDocument();
    expect(screen.getByText("2 列结构")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "我的表格列表" })).not.toBeInTheDocument();
  });

  it("只留我的表格与表格模板两个选项卡，选项卡不挂原生 title", async () => {
    renderTablePage();

    const tabs = screen.getByLabelText("制表内容切换");
    expect(within(tabs).getAllByRole("radio")).toHaveLength(2);
    expect(within(tabs).queryByText("最近制表")).not.toBeInTheDocument();
    for (const text of ["我的表格", "表格模板"]) {
      expect(within(tabs).getByText(text)).toHaveAttribute("title", "");
    }
  });

  it("我的表格列出全部制表会话：先露 10 条，文字链接展开其余，行上可复制制表要求", async () => {
    const user = userEvent.setup();
    tableMocks.listRecentTables.mockResolvedValue(Array.from({ length: 13 }, (_, index) => tableSession(index)));
    renderTablePage();

    const list = await screen.findByRole("region", { name: "我的表格列表" });
    await waitFor(() => expect(within(list).getAllByRole("article")).toHaveLength(10));
    expect(screen.getByText("13 个制表会话 · 点击回到会话，未出表的也在其中")).toBeInTheDocument();
    expect(within(list).getByRole("link", { name: "打开制表会话：制表会话 0" })).toHaveAttribute(
      "href",
      "/table/ask-table-0"
    );
    expect(within(list).queryByText("制表会话 10")).not.toBeInTheDocument();
    // 没有分页器，只有一条文字链接
    expect(within(list).queryByRole("navigation")).not.toBeInTheDocument();

    const more = within(list).getByRole("button", { name: "展开全部 13 条" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    await user.click(more);
    expect(within(list).getAllByRole("article")).toHaveLength(13);
    expect(within(list).getByText("制表会话 12")).toBeInTheDocument();

    await user.click(within(list).getByRole("button", { name: "收起" }));
    expect(within(list).getAllByRole("article")).toHaveLength(10);

    const row = within(list).getByRole("article", { name: /制表会话 3/ });
    await user.click(within(row).getByRole("button", { name: "复制制表要求" }));
    expect(screen.getByRole("textbox", { name: "制表需求" })).toHaveValue("制表会话 3 的完整要求");
  });

  it("会话不超过 10 条时不出展开链接", async () => {
    tableMocks.listRecentTables.mockResolvedValue(Array.from({ length: 10 }, (_, index) => tableSession(index)));
    renderTablePage();

    const list = await screen.findByRole("region", { name: "我的表格列表" });
    await waitFor(() => expect(within(list).getAllByRole("article")).toHaveLength(10));
    expect(within(list).queryByRole("button", { name: /展开全部/ })).not.toBeInTheDocument();
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

  it("把面板口径挪到选项卡右侧，面板里不再重复一遍同名标题", async () => {
    const user = userEvent.setup();
    const { container } = renderTablePage();

    /* aria-label 落在 Segmented 本身上，口径与动作是它的兄弟节点，一起挂在抬头行里 */
    const bar = container.querySelector<HTMLElement>(".table-home-tabs");
    expect(bar).not.toBeNull();
    expect(within(bar!).getByLabelText("制表内容切换")).toBeInTheDocument();
    /* 口径照实说：列表是制表会话，不保证每条都出了表 */
    expect(await within(bar!).findByText("0 个制表会话 · 点击回到会话，未出表的也在其中")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "我的表格" })).not.toBeInTheDocument();

    await user.click(screen.getByText("表格模板"));
    expect(within(bar!).getByText("保存常用的制表提示词与表结构，一键复用")).toBeInTheDocument();
    /* 新建模板跟着口径一起进抬头行，面板里不再有独立标题行 */
    expect(within(bar!).getByRole("button", { name: "新建模板" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "表格模板" })).not.toBeInTheDocument();
  });
});

/* 一屏化与单列布局是验收线，但 jsdom 量不了布局，所以这里锁住撑起它的几条规则。
   缺任何一条，/table 首页都会重新变回"列表一长整页就滚"。 */
describe("TablePage 入口页一屏布局", () => {
  const workflowsCss = readCss("src/pages/styles/workflows.css");

  it("按路由关掉页级滚动，页面高度交给外壳的剩余空间", () => {
    /* 高度锁只写在 workflows.css 里，选择器只咬 /table 首页 */
    expect(workflowsCss).toMatch(
      /@media \(min-width: 768px\) and \(min-height: 680px\) \{[\s\S]*?\.xs-shell__main:has\(\.table-page\) \{[\s\S]*?overflow-y: hidden;/
    );
    /* 外壳 → 路由容器 → 页面，三层都要传高度，少一层页面就拿不到剩余高度 */
    expect(workflowsCss).toMatch(
      /\.xs-shell__main:has\(\.table-page\) > \.xs-route-view \{[\s\S]*?flex: 1 1 auto;/
    );
    expect(workflowsCss).toMatch(/\.xs-page\.table-page \{[\s\S]*?flex: 1 1 auto;[\s\S]*?flex-direction: column;/);
    /* 面板链路：section → 异步壳 → content */
    expect(workflowsCss).toMatch(
      /\.table-page \.table-recent,\n\s+\.table-page \.table-recent > \.xs-async-panel,\n\s+\.table-page \.table-recent \.xs-async-panel__content \{/
    );
    /* 滚的是列表卡自己，不是页面 */
    expect(workflowsCss).toMatch(/\.table-page \.sheet-list \{[\s\S]*?overflow-y: auto;/);
    /* 空态撑满通高面板，图文居中 */
    expect(workflowsCss).toMatch(/\.table-page \.table-recent \.xs-empty-state \{[\s\S]*?flex: 1 1 auto;/);
  });

  it("矮视口与窄屏回退整页滚动，不进一屏锁", () => {
    const lockBlock = workflowsCss.slice(
      workflowsCss.indexOf("@media (min-width: 768px) and (min-height: 680px)")
    );
    expect(lockBlock).toContain(".xs-shell__main:has(.table-page)");
    /* 锁只有这一处入口：没有第二个不带 min-height 兜底的版本 */
    expect(workflowsCss.match(/\.xs-shell__main:has\(\.table-page\)/g)).toHaveLength(3);
  });

  it("记录列表保持单列，时间与列数不被长标题挤掉", () => {
    expect(workflowsCss).toMatch(/\.sheet-list \{[^}]*grid-template-columns: minmax\(0, 1fr\);/);
    expect(workflowsCss).not.toMatch(/\.sheet-list \{[^}]*grid-template-columns: repeat\(2/);
    expect(workflowsCss).toMatch(/\.sheet-row__cols,\n\s*\.sheet-row__meta > em \{\n\s+flex: none;/);
  });

  /* 一屏装下靠的是随视口高度收放的纵向刻度：写死成定值，矮屏上列表就会被挤没。 */
  it("制表输入盒的纵向刻度随视口高度收放，抬头槽位定高", () => {
    const scale = (name: string) => workflowsCss.match(new RegExp(`--${name}: ([^;]+);`))?.[1]?.trim();

    expect(scale("table-hero-top")).toMatch(/^clamp\(\d+px, calc\([\d.]+vh - \d+px\), \d+px\)$/);
    expect(scale("table-hero-gap")).toMatch(/^clamp\(\d+px, calc\([\d.]+vh - \d+px\), \d+px\)$/);

    /* 外壳留白同样跟着视口高度走，矮屏把高度让给列表 */
    expect(workflowsCss).toMatch(
      /\.xs-shell__main:has\(\.table-page\) \{[\s\S]*?padding-top: clamp\(\d+px, [\d.]+vh, \d+px\);/
    );

    /* 抬头槽位定高：标题字形或换行变化时输入盒顶边不跟着跳 */
    expect(workflowsCss).toMatch(/--table-hero-head: [\d.]+px;/);
    expect(workflowsCss).toMatch(/\.table-page \.table-hero__head \{\n\s+min-height: var\(--table-hero-head\);/);
    expect(workflowsCss).toMatch(/\.table-page \.table-hero \{[\s\S]*?padding: var\(--table-hero-top\) 0 14px;/);
  });
});
