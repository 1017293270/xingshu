import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { useWritingJobStore } from "@/features/officialDocument/writingJobStore";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import { XsSidebar } from "./XsSidebar";

function renderSidebar(collapsed = false) {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={["/"]}>
        <XsSidebar collapsed={collapsed} onNewChat={vi.fn()} />
      </MemoryRouter>
    </AppProviders>
  );
}

/** 指示点挂在导航项的图标上，收起态只剩图标时也要还在。 */
function writingIndicator() {
  return document.querySelector<HTMLElement>('[data-testid-nav="writing"] .xs-sidebar__job')
    ?? document
      .querySelector('.ant-menu-item[data-menu-id$="-/writing"]')
      ?.querySelector<HTMLElement>(".xs-sidebar__job")
    ?? null;
}

describe("XsSidebar 报告智写进度指示", () => {
  beforeEach(() => {
    localStorage.clear();
    useDataHubAuthStore.getState().clearAuthState();
    useDataHubAuthStore.getState().setAuth({
      token: "test-token",
      userId: 1,
      username: "张三",
      isAdmin: false
    });
    useWritingJobStore.getState().reset();
  });

  it("keeps the writing entry unmarked while nothing is running", () => {
    renderSidebar();

    expect(screen.getByRole("link", { name: "报告智写" })).toBeInTheDocument();
    expect(writingIndicator()).toBeNull();
    expect(screen.queryByLabelText("正在生成公文")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("有新的公文成稿")).not.toBeInTheDocument();
  });

  it("marks the writing entry as running while a document is being generated", () => {
    renderSidebar();

    act(() => useWritingJobStore.getState().setPhase("writing"));

    const indicator = screen.getByLabelText("正在生成公文");
    expect(indicator).toHaveAttribute("data-state", "running");
    expect(writingIndicator()).toBe(indicator);
    expect(screen.queryByLabelText("有新的公文成稿")).not.toBeInTheDocument();
  });

  it("switches to an unread dot once a document finished unseen, and clears it after it is seen", () => {
    renderSidebar();

    act(() => {
      useWritingJobStore.getState().setPhase("writing");
      useWritingJobStore.getState().setPhase("idle");
      useWritingJobStore.getState().reportResult("turn-1", "关于开展安全检查的通知");
    });

    const indicator = screen.getByLabelText("有新的公文成稿");
    expect(indicator).toHaveAttribute("data-state", "unseen");
    expect(screen.queryByLabelText("正在生成公文")).not.toBeInTheDocument();

    act(() => useWritingJobStore.getState().markSeen());
    expect(screen.queryByLabelText("有新的公文成稿")).not.toBeInTheDocument();
  });

  it("still shows the indicator when the sidebar is collapsed to icons", () => {
    renderSidebar(true);

    act(() => useWritingJobStore.getState().setPhase("analyzing"));

    expect(screen.getByLabelText("正在生成公文")).toBeInTheDocument();
  });

  it("marks only the writing entry", () => {
    renderSidebar();

    act(() => useWritingJobStore.getState().setPhase("writing"));

    expect(document.querySelectorAll(".xs-sidebar__job")).toHaveLength(1);
  });
});
