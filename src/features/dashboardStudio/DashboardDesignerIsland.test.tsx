import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import type { DashboardRecord } from "@/types/dashboardStudio";
import { DashboardDesignerIsland } from "./DashboardDesignerIsland";
import type { DashboardDesignerHandle } from "./vue/mountDashboardDesigner";

function fakeHandle(schema: DashboardRecord["schema"], unmount: () => void = () => undefined): DashboardDesignerHandle {
  return {
    unmount,
    getSchema: () => schema,
    applySchema: async () => undefined,
    setSmartPanelOpen: () => undefined
  };
}

function record(): DashboardRecord {
  const schema = createBlankDashboard({ title: "测试大屏", idFactory: (prefix) => `${prefix}-1` });
  return {
    id: schema.id,
    schema,
    status: "draft",
    revision: 1,
    createdAt: schema.createdAt,
    updatedAt: schema.updatedAt
  };
}

describe("DashboardDesignerIsland", () => {
  it("mounts the Vue designer once and unmounts it with the React host", async () => {
    const unmount = vi.fn();
    const dashboardRecord = record();
    const mountDashboardDesigner = vi.fn((element: HTMLElement, options: { onReady?: () => void }) => {
      element.textContent = "Vue 大屏工作区";
      options.onReady?.();
      return fakeHandle(dashboardRecord.schema, unmount);
    });
    const loader = vi.fn(async () => ({ mountDashboardDesigner }));
    const saveDraft = vi.fn(async () => dashboardRecord);
    const publishDashboard = vi.fn(async () => dashboardRecord);

    const view = render(
      <DashboardDesignerIsland
        record={dashboardRecord}
        saveDraft={saveDraft}
        publishDashboard={publishDashboard}
        onExit={() => undefined}
        loader={loader}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("正在准备大屏设计器");
    expect(await screen.findByText("Vue 大屏工作区")).toBeInTheDocument();
    expect(mountDashboardDesigner).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(unmount).toHaveBeenCalledTimes(1);
  });

  it("shows a recoverable branded error when the Vue chunk fails", async () => {
    const dashboardRecord = record();
    const loader = vi.fn().mockRejectedValueOnce(new Error("chunk unavailable")).mockResolvedValueOnce({
      mountDashboardDesigner: (element: HTMLElement, options: { onReady?: () => void }) => {
        element.textContent = "已恢复";
        options.onReady?.();
        return fakeHandle(dashboardRecord.schema);
      }
    });

    render(
      <DashboardDesignerIsland
        record={dashboardRecord}
        saveDraft={async () => dashboardRecord}
        publishDashboard={async () => dashboardRecord}
        onExit={() => undefined}
        loader={loader}
      />
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("chunk unavailable");
    screen.getByRole("button", { name: "重新加载" }).click();

    await waitFor(() => expect(screen.getByText("已恢复")).toBeInTheDocument());
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("hands the designer handle to the host and clears it on unmount", async () => {
    const dashboardRecord = record();
    const handle = fakeHandle(dashboardRecord.schema);
    const onHandle = vi.fn();
    const onSmartPanelToggle = vi.fn();
    let toggle: ((open: boolean) => void) | undefined;
    const loader = vi.fn(async () => ({
      mountDashboardDesigner: (
        element: HTMLElement,
        options: { onReady?: () => void; onSmartPanelToggle?: (open: boolean) => void }
      ) => {
        element.textContent = "Vue 大屏工作区";
        toggle = options.onSmartPanelToggle;
        options.onReady?.();
        return handle;
      }
    }));

    const view = render(
      <DashboardDesignerIsland
        record={dashboardRecord}
        saveDraft={async () => dashboardRecord}
        publishDashboard={async () => dashboardRecord}
        onExit={() => undefined}
        onHandle={onHandle}
        onSmartPanelToggle={onSmartPanelToggle}
        loader={loader}
      />
    );

    await screen.findByText("Vue 大屏工作区");
    expect(onHandle).toHaveBeenLastCalledWith(handle);
    toggle?.(true);
    expect(onSmartPanelToggle).toHaveBeenCalledWith(true);

    view.unmount();
    expect(onHandle).toHaveBeenLastCalledWith(null);
  });
});
