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

  it("把面板口径挪到选项卡右侧，面板里不再重复一遍同名标题", async () => {
    const user = userEvent.setup();
    const { container } = renderTablePage();

    /* aria-label 落在 Segmented 本身上，口径与动作是它的兄弟节点，一起挂在抬头行里 */
    const bar = container.querySelector<HTMLElement>(".table-home-tabs");
    expect(bar).not.toBeNull();
    expect(within(bar!).getByLabelText("制表内容切换")).toBeInTheDocument();
    expect(within(bar!).getByText(/条记录 · 点击打开当时的结果表/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "最近制表" })).not.toBeInTheDocument();

    await user.click(screen.getByText("表格模板"));
    expect(within(bar!).getByText("保存常用的制表提示词与表结构，一键复用")).toBeInTheDocument();
    /* 新建模板跟着口径一起进抬头行，面板里不再有独立标题行 */
    expect(within(bar!).getByRole("button", { name: "新建模板" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "表格模板" })).not.toBeInTheDocument();
  });
});

/* 一屏化与两列布局是验收线，但 jsdom 量不了布局，所以这里锁住撑起它的几条规则。
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

  it("记录列表一排两条，窄面板回退单列", () => {
    expect(workflowsCss).toMatch(
      /@media \(min-width: 761px\) \{\n\s+\.sheet-list \{\n\s+grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/
    );
    /* 两列后横线断句会变成半张网格，改成每条记录自己成卡 */
    expect(workflowsCss).toMatch(
      /@media \(min-width: 761px\)[\s\S]*?\.sheet-row \+ \.sheet-row::before \{\n\s+content: none;/
    );
    /* 单列版（移动端）仍然靠横线断句 */
    expect(workflowsCss).toMatch(/\.sheet-row \+ \.sheet-row::before \{\n\s+content: "";/);
    /* 半幅卡里时间与列数是定长锚点，被截的应该是提示词 */
    expect(workflowsCss).toMatch(/\.sheet-row__cols,\n\s+\.sheet-row__meta > em \{\n\s+flex: none;/);
  });

  /* 输入盒的纵向刻度是从首页抄来的同值副本（故意不跨文件引用变量）。
     这条测试是那份约定的看门人：首页改了刻度而这里没跟，/ 与 /table 之间输入盒就会跳位。 */
  it("制表输入盒的纵向刻度与首页逐值一致", () => {
    const homeCss = readCss("src/features/home/home.css");

    const scale = (css: string, name: string) => {
      const hit = css.match(new RegExp(`--${name}: ([^;]+);`));
      return hit?.[1]?.trim();
    };

    expect(scale(workflowsCss, "table-hero-top")).toBe(scale(homeCss, "home-hero-top"));
    expect(scale(workflowsCss, "table-hero-gap")).toBe(scale(homeCss, "home-hero-gap"));
    expect(scale(workflowsCss, "table-hero-top")).toMatch(/^clamp\(\d+px, calc\([\d.]+vh - \d+px\), \d+px\)$/);

    /* 外壳上下留白也得同值，否则整段一起偏 */
    const shellPadTop = (css: string, page: string) =>
      css.match(new RegExp(`\\.xs-shell__main:has\\(\\.${page}\\) \\{[\\s\\S]*?padding-top: ([^;]+);`))?.[1]?.trim();
    expect(shellPadTop(workflowsCss, "table-page")).toBe(shellPadTop(homeCss, "home-page"));

    /* 制表页抬头只有一行标题，靠固定高度补齐首页"问候语 + 副标题"的两行位 */
    expect(workflowsCss).toMatch(/--table-hero-head: [\d.]+px;/);
    expect(workflowsCss).toMatch(/\.table-page \.table-hero__head \{\n\s+min-height: var\(--table-hero-head\);/);
    expect(workflowsCss).toMatch(/\.table-page \.table-hero \{[\s\S]*?padding: var\(--table-hero-top\) 0 14px;/);
  });
});
