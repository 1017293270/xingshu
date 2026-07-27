import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import type { QueryAsset, QueryExecution } from "@/types/analytics";
import type { DashboardRecord, DashboardSchema } from "@/types/dashboardStudio";
import {
  mountDashboardDesigner,
  type DashboardDesignerDataActions,
  type DashboardDesignerHandle
} from "./vue/mountDashboardDesigner";

vi.mock("@/features/dashboardStudio/core/dashboardCanvasBackground", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/dashboardStudio/core/dashboardCanvasBackground")>();
  return {
    ...actual,
    compressDashboardBackgroundImage: vi.fn(async () => "data:image/jpeg;base64,fakebg")
  };
});

describe("dashboard designer motion states", () => {
  let handle: DashboardDesignerHandle | undefined;
  let host: HTMLDivElement | undefined;

  afterEach(() => {
    handle?.unmount();
    host?.remove();
    handle = undefined;
    host = undefined;
  });

  it("marks a newly inserted widget as settling and exposes atomic save feedback", async () => {
    const schema = createBlankDashboard({ title: "动效测试大屏" });
    const record: DashboardRecord = {
      id: schema.id,
      schema,
      status: "draft",
      revision: 1,
      createdAt: schema.createdAt,
      updatedAt: schema.updatedAt
    };
    host = document.createElement("div");
    document.body.append(host);
    handle = mountDashboardDesigner(host, {
      record,
      saveDraft: vi.fn(async () => record),
      publishDashboard: vi.fn(async () => record),
      exit: vi.fn()
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "指标卡 320 × 180" })).toBeInTheDocument());
    const status = host.querySelector(".designer-toolbar__status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-atomic", "true");

    fireEvent.click(screen.getByRole("button", { name: "指标卡 320 × 180" }));

    await waitFor(() => expect(host?.querySelector(".dashboard-widget-card")).toHaveClass("is-settling"));
  });

  it("uses the original four-part workbench while keeping the canvas light", async () => {
    const schema = createBlankDashboard({ title: "结构测试大屏" });
    const record: DashboardRecord = {
      id: schema.id,
      schema,
      status: "draft",
      revision: 1,
      createdAt: schema.createdAt,
      updatedAt: schema.updatedAt
    };
    host = document.createElement("div");
    document.body.append(host);
    handle = mountDashboardDesigner(host, {
      record,
      saveDraft: vi.fn(async () => record),
      publishDashboard: vi.fn(async () => record),
      exit: vi.fn()
    });

    await waitFor(() => expect(screen.getByRole("complementary", { name: "组件库" })).toBeInTheDocument());

    expect(screen.getByRole("complementary", { name: "属性" })).toBeInTheDocument();
    expect(screen.getByRole("application", { name: "大屏组件画布" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "大屏名称" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "撤销" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重做" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "应用大屏模板" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI 排版" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "缩放" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /×/ })).toHaveLength(11);
    expect(screen.queryByRole("navigation", { name: "大屏编辑工具栏" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "未选择组件" })).toBeInTheDocument();

    const canvas = host.querySelector<HTMLElement>(".designer-canvas");
    expect(canvas).toHaveStyle({ backgroundColor: "#EFF4FB" });

    expect(screen.queryByRole("button", { name: /添加第一个大屏组件/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "指标卡 320 × 180" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "基础" })).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "布局" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "数据" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "样式" })).toBeInTheDocument();
  });

  it("does not expose unfinished data-module actions", async () => {
    const schema = createBlankDashboard({ title: "数据操作隐藏测试" });
    schema.dataBindings["binding-1"] = {
      id: "binding-1",
      label: "收藏问数",
      mode: "live",
      refreshable: true,
      sourceRef: {
        kind: "query-asset",
        assetId: "asset-1",
        queryVersionId: "version-1",
        outputKey: "main",
        parameterValues: {}
      },
      table: {
        columns: [{ columnId: "metric-1", key: "total", title: "合计", type: "number" }],
        rows: [{ total: 1 }],
        totalRows: 1
      }
    };
    schema.widgets.push({
      id: "widget-1",
      type: "metric",
      title: "测试指标",
      bindingId: "binding-1",
      mapping: { metricColumnIds: ["metric-1"], metricKeys: ["total"] },
      position: { x: 64, y: 64, w: 320, h: 180 },
      style: { visible: true, zIndex: 1 }
    });
    const record: DashboardRecord = {
      id: schema.id,
      schema,
      status: "draft",
      revision: 1,
      createdAt: schema.createdAt,
      updatedAt: schema.updatedAt
    };
    host = document.createElement("div");
    document.body.append(host);
    handle = mountDashboardDesigner(host, {
      record,
      saveDraft: vi.fn(async () => record),
      publishDashboard: vi.fn(async () => record),
      exit: vi.fn()
    });

    const widget = await screen.findByRole("button", { name: "测试指标" });
    fireEvent.click(widget);

    await waitFor(() => expect(screen.getByText("固定版本")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "刷新数据" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重新问数" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "设置计划" })).not.toBeInTheDocument();
  });

  it("keeps real data visible when switching bindings and chart families", async () => {
    const schema = createBlankDashboard({ title: "切图切数据回归" });
    schema.dataBindings["binding-category"] = {
      id: "binding-category",
      label: "项目合同数量",
      mode: "live",
      resultKind: "category",
      table: {
        columns: [
          { columnId: "project-id", key: "project", title: "项目" },
          { columnId: "count-id", key: "count", title: "合同数", type: "number" }
        ],
        rows: [{ project: "甲", count: 12 }, { project: "乙", count: 8 }],
        totalRows: 2
      }
    };
    schema.dataBindings["binding-table"] = {
      id: "binding-table",
      label: "合同公司清单",
      mode: "live",
      resultKind: "table",
      table: {
        columns: [
          { columnId: "company-id", key: "company", title: "公司名称" },
          { columnId: "contract-value-id", key: "contractValue", title: "合同值" }
        ],
        rows: [
          { company: "甲公司", contractValue: "50000.00" },
          { company: "乙公司", contractValue: "80000.00" }
        ],
        totalRows: 2
      }
    };
    schema.widgets.push({
      id: "widget-switch-data",
      name: "柱状图",
      type: "bar",
      title: "合同数量",
      bindingId: "binding-category",
      mapping: {
        dimensionColumnId: "project-id",
        dimensionKey: "project",
        metricColumnIds: ["count-id"],
        metricKeys: ["count"]
      },
      position: { x: 64, y: 64, w: 560, h: 320 },
      style: { visible: true, zIndex: 1, chartVariant: "bar-vertical" }
    });
    const record: DashboardRecord = {
      id: schema.id,
      schema,
      status: "draft",
      revision: 1,
      createdAt: schema.createdAt,
      updatedAt: schema.updatedAt
    };
    host = document.createElement("div");
    document.body.append(host);
    handle = mountDashboardDesigner(host, {
      record,
      saveDraft: vi.fn(async () => record),
      publishDashboard: vi.fn(async () => record),
      exit: vi.fn()
    });

    fireEvent.click(await screen.findByRole("button", { name: "柱状图" }));
    const bindingSelect = await screen.findByRole("combobox", { name: "绑定" });
    expect(host.querySelector(".chart-renderer__chart")).toBeInTheDocument();

    fireEvent.change(bindingSelect, {
      target: { value: "binding-table" }
    });
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "维度" })).toHaveValue("company-id");
      expect(Array.from(
        (screen.getByRole("listbox", { name: "指标" }) as HTMLSelectElement).selectedOptions
      ).map((option) => option.value)).toEqual(["contract-value-id"]);
      expect(host?.querySelector(".chart-renderer__chart")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "折线图: 平滑折线" }));
    await waitFor(() => expect(host?.querySelector(".chart-renderer__chart")).toBeInTheDocument());
    expect(screen.queryByText("当前结果缺少可绘制的数值指标")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "饼图: 环形占比" }));
    await waitFor(() => expect(host?.querySelector(".chart-renderer__chart")).toBeInTheDocument());
    expect(screen.queryByText("当前结果缺少可绘制的数值指标")).not.toBeInTheDocument();
  });

  it("moves and stacks widgets with pixel-level free layout", async () => {
    const schema = createBlankDashboard({ title: "自由布局测试" });
    const record: DashboardRecord = {
      id: schema.id,
      schema,
      status: "draft",
      revision: 1,
      createdAt: schema.createdAt,
      updatedAt: schema.updatedAt
    };
    host = document.createElement("div");
    document.body.append(host);
    handle = mountDashboardDesigner(host, {
      record,
      saveDraft: vi.fn(async () => record),
      publishDashboard: vi.fn(async () => record),
      exit: vi.fn()
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "指标卡 320 × 180" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "指标卡 320 × 180" }));

    const firstWidget = await screen.findByRole("button", { name: "指标卡" });
    expect(firstWidget.style.left).toBe("64px");
    expect(firstWidget.style.top).toBe("64px");
    expect(firstWidget.style.width).toBe("320px");
    expect(firstWidget.style.height).toBe("180px");
    expect(firstWidget.style.gridColumn).toBe("");

    fireEvent.pointerDown(firstWidget, { button: 0, pointerId: 9, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 9, clientX: 137, clientY: 123 });

    await waitFor(() => expect(firstWidget.style.left).toBe("101px"));
    expect(firstWidget.style.top).toBe("87px");
    fireEvent.pointerUp(window, { pointerId: 9, clientX: 137, clientY: 123 });

    fireEvent.click(screen.getByRole("button", { name: "指标卡 320 × 180" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "指标卡" })).toHaveLength(2));
    const secondWidget = screen.getAllByRole("button", { name: "指标卡" })[1];
    expect(secondWidget.style.left).toBe("100px");
    expect(secondWidget.style.top).toBe("100px");
  });

  it("adds one editable chart from one selected favorite result", async () => {
    const schema = createBlankDashboard({ title: "收藏单图测试" });
    const record: DashboardRecord = {
      id: schema.id,
      schema,
      status: "draft",
      revision: 1,
      createdAt: schema.createdAt,
      updatedAt: schema.updatedAt
    };
    const asset: QueryAsset = {
      id: "asset-revenue",
      name: "月度收入",
      originalQuestion: "今年每月收入趋势",
      resolvedQuestion: "今年每月收入趋势",
      datasourceId: 8,
      ownerUserId: 2,
      visibility: "PRIVATE",
      stableVersionId: "version-revenue",
      status: "ACTIVE",
      stableVersion: {
        id: "version-revenue",
        versionNo: 1,
        resolvedQuestion: "今年每月收入趋势",
        engine: "CUBE",
        parameters: [],
        outputs: [{
          outputKey: "revenue",
          label: "月度收入",
          columns: [
            { columnId: "month-id", key: "month", label: "月份", type: "date" },
            { columnId: "amount-id", key: "amount", label: "收入", type: "number" }
          ]
        }],
        schemaHash: "revenue-schema",
        status: "VALIDATED",
        createdAt: "2026-07-23T00:00:00.000Z"
      },
      createdAt: "2026-07-23T00:00:00.000Z",
      updatedAt: "2026-07-23T00:00:00.000Z"
    };
    const preview: QueryExecution = {
      id: "execution-revenue",
      assetId: asset.id,
      versionId: asset.stableVersionId,
      status: "SUCCESS",
      triggerType: "PREVIEW",
      durationMs: 18,
      createdAt: "2026-07-23T08:00:00.000Z",
      outputs: [{
        outputKey: "revenue",
        columns: asset.stableVersion!.outputs[0]!.columns,
        rows: [{ month: "一月", amount: 12 }, { month: "二月", amount: 18 }],
        totalRows: 2
      }]
    };
    const unavailable = async () => {
      throw new Error("not used");
    };
    const dataActions: DashboardDesignerDataActions = {
      listAssets: vi.fn(async () => [asset]),
      previewAsset: vi.fn(async () => preview),
      reaskAsset: vi.fn(unavailable),
      promoteVersion: vi.fn(unavailable),
      changeAssetVisibility: vi.fn(unavailable),
      refreshModule: vi.fn(unavailable),
      upgradeModule: vi.fn(unavailable),
      saveSchedule: vi.fn(unavailable),
      planLayout: vi.fn(async () => ({ source: "LOCAL" as const, intents: [], message: "本地排版" }))
    };
    const onChange = vi.fn<(schema: DashboardSchema) => void>();
    host = document.createElement("div");
    document.body.append(host);
    handle = mountDashboardDesigner(host, {
      record,
      initialResourcePanel: "assets",
      initialAssetId: asset.id,
      saveDraft: vi.fn(async () => record),
      publishDashboard: vi.fn(async () => record),
      dataActions,
      exit: vi.fn(),
      onChange
    });

    const addButton = await screen.findByRole("button", { name: "添加图表" });
    await waitFor(() => expect(addButton).toBeEnabled());
    fireEvent.click(addButton);

    await waitFor(() => {
      const error = host?.querySelector(".query-asset-panel__error")?.textContent?.trim();
      if (error) throw new Error(error);
      expect(onChange).toHaveBeenCalled();
    });
    const nextSchema = onChange.mock.calls.at(-1)![0];
    expect(nextSchema.widgets).toHaveLength(1);
    expect(nextSchema.widgets[0]?.type).toBe("line");
    expect(nextSchema.widgets[0]?.title).toBe("今年每月收入趋势");
    expect(Object.values(nextSchema.modules ?? {})).toHaveLength(1);
    expect(Object.values(nextSchema.modules ?? {})[0]?.widgetIds).toEqual([nextSchema.widgets[0]?.id]);
    expect(host.querySelectorAll(".dashboard-widget-card")).toHaveLength(1);
    expect(await screen.findByText("固定版本")).toBeInTheDocument();
  });

  it("previews and applies a tidy AI layout from the toolbar", async () => {
    const schema = createBlankDashboard({ title: "排版测试大屏" });
    schema.widgets.push(
      {
        id: "widget-a",
        type: "bar",
        title: "图表甲",
        mapping: {},
        position: { x: 500, y: 420, w: 560, h: 320 },
        style: { visible: true, zIndex: 1 }
      },
      {
        id: "widget-b",
        type: "bar",
        title: "图表乙",
        mapping: {},
        position: { x: 120, y: 900, w: 480, h: 300 },
        style: { visible: true, zIndex: 2 }
      }
    );
    const record: DashboardRecord = {
      id: schema.id,
      schema,
      status: "draft",
      revision: 1,
      createdAt: schema.createdAt,
      updatedAt: schema.updatedAt
    };
    const dataActions: DashboardDesignerDataActions = {
      listAssets: vi.fn(async () => []),
      previewAsset: vi.fn(async () => { throw new Error("not used"); }),
      reaskAsset: vi.fn(async () => { throw new Error("not used"); }),
      promoteVersion: vi.fn(async () => { throw new Error("not used"); }),
      changeAssetVisibility: vi.fn(async () => { throw new Error("not used"); }),
      refreshModule: vi.fn(async () => { throw new Error("not used"); }),
      upgradeModule: vi.fn(async () => { throw new Error("not used"); }),
      saveSchedule: vi.fn(async () => { throw new Error("not used"); }),
      planLayout: vi.fn(async (request: unknown) => ({
        source: "AI" as const,
        message: "AI 已按阅读动线重排",
        intents: (request as { widgets: Array<{ id: string }> }).widgets.map((widget, rank) => ({
          widgetId: widget.id,
          section: "main",
          rank,
          emphasis: "normal" as const
        }))
      }))
    };
    host = document.createElement("div");
    document.body.append(host);
    handle = mountDashboardDesigner(host, {
      record,
      saveDraft: vi.fn(async () => record),
      publishDashboard: vi.fn(async () => record),
      dataActions,
      exit: vi.fn()
    });

    fireEvent.click(await screen.findByRole("button", { name: "AI 排版" }));

    const dialog = await screen.findByRole("dialog", { name: "预览整齐排版" });
    expect(dialog).toHaveTextContent("AI 语义规划");
    expect(host.querySelectorAll(".layout-preview__block")).toHaveLength(4);

    fireEvent.click(screen.getByRole("button", { name: "应用排版" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "预览整齐排版" })).not.toBeInTheDocument());
    const cardA = screen.getByRole("button", { name: "图表甲" });
    const cardB = screen.getByRole("button", { name: "图表乙" });
    expect(cardA.style.left).toBe("24px");
    expect(cardA.style.top).toBe("24px");
    expect(cardB.style.top).toBe("24px");
    expect(Number.parseInt(cardB.style.left, 10)).toBeGreaterThan(Number.parseInt(cardA.style.left, 10));
    expect(Number.parseInt(cardA.style.left, 10) % 8).toBe(0);
    expect(Number.parseInt(cardB.style.left, 10) % 8).toBe(0);
  });

  it("switches canvas resolution and clamps out-of-bounds widgets", async () => {
    const schema = createBlankDashboard({ title: "分辨率测试大屏" });
    schema.widgets.push({
      id: "widget-edge",
      type: "metric",
      title: "边缘指标",
      mapping: {},
      position: { x: 1800, y: 64, w: 320, h: 180 },
      style: { visible: true, zIndex: 1 }
    });
    const record: DashboardRecord = {
      id: schema.id,
      schema,
      status: "draft",
      revision: 1,
      createdAt: schema.createdAt,
      updatedAt: schema.updatedAt
    };
    host = document.createElement("div");
    document.body.append(host);
    handle = mountDashboardDesigner(host, {
      record,
      saveDraft: vi.fn(async () => record),
      publishDashboard: vi.fn(async () => record),
      exit: vi.fn()
    });

    const resolutionSelect = await screen.findByRole("combobox", { name: "分辨率" });
    fireEvent.change(resolutionSelect, { target: { value: "laptop" } });

    await waitFor(() => {
      expect(host?.querySelector<HTMLElement>(".designer-canvas")?.style.width).toBe("1440px");
    });
    expect(await screen.findByText("已将 1 个越界组件移回画布")).toBeInTheDocument();
    expect(Number.parseInt(screen.getByRole("button", { name: "边缘指标" }).style.left, 10)).toBeLessThanOrEqual(1120);
  });

  it("uploads and removes a canvas background image", async () => {
    const schema = createBlankDashboard({ title: "背景图测试大屏" });
    const record: DashboardRecord = {
      id: schema.id,
      schema,
      status: "draft",
      revision: 1,
      createdAt: schema.createdAt,
      updatedAt: schema.updatedAt
    };
    host = document.createElement("div");
    document.body.append(host);
    handle = mountDashboardDesigner(host, {
      record,
      saveDraft: vi.fn(async () => record),
      publishDashboard: vi.fn(async () => record),
      exit: vi.fn()
    });

    const fileInput = await waitFor(() => {
      const input = host?.querySelector<HTMLInputElement>('input[type="file"]');
      expect(input).toBeTruthy();
      return input!;
    });
    fireEvent.change(fileInput, { target: { files: [new File(["pixels"], "bg.png", { type: "image/png" })] } });

    const canvas = host.querySelector<HTMLElement>(".designer-canvas")!;
    await waitFor(() => expect(canvas.style.backgroundImage).toContain("fakebg"));

    fireEvent.click(screen.getByRole("button", { name: "移除" }));
    await waitFor(() => expect(canvas.style.backgroundImage).toBe(""));
  });
});
