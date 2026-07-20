import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import type { DashboardRecord } from "@/types/dashboardStudio";
import { DashboardRuntimeIsland } from "./DashboardRuntimeIsland";

describe("DashboardRuntimeIsland", () => {
  it("mounts and releases the Vue runtime in fullscreen mode", async () => {
    const schema = createBlankDashboard({ title: "运行态", idFactory: (prefix) => `${prefix}-1` });
    const record: DashboardRecord = {
      id: schema.id,
      schema,
      status: "draft",
      revision: 1,
      createdAt: schema.createdAt,
      updatedAt: schema.updatedAt
    };
    const unmount = vi.fn();
    const loader = async () => ({
      mountDashboardRuntime: (element: HTMLElement, _record: DashboardRecord, options?: { fullscreen?: boolean }) => {
        element.dataset.fullscreen = String(options?.fullscreen);
        element.textContent = "Vue 运行态已挂载";
        return { unmount };
      }
    });

    const view = render(<DashboardRuntimeIsland record={record} fullscreen loader={loader} />);
    await waitFor(() => expect(screen.getByText("Vue 运行态已挂载")).toBeInTheDocument());
    expect(document.querySelector(".dashboard-runtime-island__mount")).toHaveAttribute("data-fullscreen", "true");
    view.unmount();
    expect(unmount).toHaveBeenCalledOnce();
  });
});
