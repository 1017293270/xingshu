import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import type { DashboardRecord } from "@/types/dashboardStudio";
import { DashboardDesignerIsland } from "./DashboardDesignerIsland";

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
    const mountDashboardDesigner = vi.fn((element: HTMLElement, options: { onReady?: () => void }) => {
      element.textContent = "Vue 大屏工作区";
      options.onReady?.();
      return { unmount };
    });
    const loader = vi.fn(async () => ({ mountDashboardDesigner }));
    const dashboardRecord = record();
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
    const loader = vi.fn().mockRejectedValueOnce(new Error("chunk unavailable")).mockResolvedValueOnce({
      mountDashboardDesigner: (element: HTMLElement, options: { onReady?: () => void }) => {
        element.textContent = "已恢复";
        options.onReady?.();
        return { unmount: () => undefined };
      }
    });
    const dashboardRecord = record();

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
});
