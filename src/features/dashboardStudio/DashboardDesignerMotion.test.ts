import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import type { DashboardRecord } from "@/types/dashboardStudio";
import { mountDashboardDesigner, type DashboardDesignerHandle } from "./vue/mountDashboardDesigner";

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
    expect(screen.getByRole("combobox", { name: "缩放" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /×/ })).toHaveLength(11);
    expect(screen.queryByRole("navigation", { name: "大屏编辑工具栏" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "未选择组件" })).toBeInTheDocument();

    const canvas = host.querySelector<HTMLElement>(".designer-canvas");
    expect(canvas).toHaveStyle({ backgroundColor: "#F5F9FF" });

    expect(screen.queryByRole("button", { name: /添加第一个大屏组件/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "指标卡 320 × 180" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "基础" })).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "布局" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "数据" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "样式" })).toBeInTheDocument();
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
});
