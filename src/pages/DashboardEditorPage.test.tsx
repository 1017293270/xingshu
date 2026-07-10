import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { DashboardEditorPage } from "./DashboardEditorPage";

const { probeDashboardEditorMock } = vi.hoisted(() => ({
  probeDashboardEditorMock: vi.fn()
}));

vi.mock("@/services/dashboardEditorService", () => ({
  normalizeDashboardEditorUrl: (url: string) => url,
  probeDashboardEditor: probeDashboardEditorMock
}));

function renderEditorPage() {
  return render(
    <AppProviders>
      <MemoryRouter>
        <DashboardEditorPage />
      </MemoryRouter>
    </AppProviders>
  );
}

describe("DashboardEditorPage", () => {
  beforeEach(() => {
    probeDashboardEditorMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the iframe unmounted while the reachability probe is pending", async () => {
    probeDashboardEditorMock.mockReturnValue(new Promise(() => {}));
    renderEditorPage();

    expect(await screen.findByText("正在检查连接")).toBeInTheDocument();
    expect(screen.queryByTitle("看板编辑器子应用")).not.toBeInTheDocument();
    expect(screen.queryByText("已连接")).not.toBeInTheDocument();
  });

  it("shows an actionable branded error without mounting a refused iframe", async () => {
    const user = userEvent.setup();
    probeDashboardEditorMock.mockResolvedValue({ ok: false, message: "看板编辑器暂时不可用" });
    renderEditorPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("请确认看板编辑器服务已启动");
    expect(screen.queryByTitle("看板编辑器子应用")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(probeDashboardEditorMock).toHaveBeenCalledTimes(2));
  });

  it("announces a connection only after the probed iframe loads", async () => {
    probeDashboardEditorMock.mockResolvedValue({ ok: true, message: "看板编辑器已连接" });
    renderEditorPage();

    const iframe = await screen.findByTitle("看板编辑器子应用");
    expect(screen.getByText("正在加载编辑器")).toBeInTheDocument();
    expect(screen.queryByText("已连接")).not.toBeInTheDocument();

    fireEvent.load(iframe);

    expect(await screen.findByText("已连接")).toBeInTheDocument();
  });

  it("removes the old iframe and ignores its late load event while reconnecting", async () => {
    const user = userEvent.setup();
    let resolveReconnect!: (value: { ok: boolean; message: string }) => void;
    probeDashboardEditorMock
      .mockResolvedValueOnce({ ok: true, message: "看板编辑器已连接" })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveReconnect = resolve;
        })
      );
    renderEditorPage();

    const oldIframe = await screen.findByTitle("看板编辑器子应用");
    fireEvent.load(oldIframe);
    expect(await screen.findByText("已连接")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "刷新" }));
    fireEvent.load(oldIframe);

    expect(screen.queryByText("已连接")).not.toBeInTheDocument();
    expect(screen.queryByTitle("看板编辑器子应用")).not.toBeInTheDocument();
    await act(async () => {
      resolveReconnect({ ok: true, message: "看板编辑器已连接" });
      await Promise.resolve();
    });
  });

  it("unmounts an iframe that never finishes loading", async () => {
    vi.useFakeTimers();
    probeDashboardEditorMock.mockResolvedValue({ ok: true, message: "看板编辑器已连接" });
    renderEditorPage();

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTitle("看板编辑器子应用")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(10_000));

    expect(screen.queryByTitle("看板编辑器子应用")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("暂时无法连接看板编辑器");
  });
});
