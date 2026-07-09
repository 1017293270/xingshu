import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import { XsMobileNav } from "./XsMobileNav";

function renderMobileNavigation(onNewChat = vi.fn()) {
  return {
    onNewChat,
    ...render(
      <AppProviders>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <XsMobileNav onNewChat={onNewChat} />
        </MemoryRouter>
      </AppProviders>
    )
  };
}

describe("XsMobileNav", () => {
  beforeEach(() => {
    localStorage.clear();
    useDataHubAuthStore.getState().clearAuthState();
    useDataHubAuthStore.getState().setAuth({
      token: "test-token",
      userId: 1,
      username: "张三",
      isAdmin: false
    });
  });

  it("keeps every existing product destination reachable", async () => {
    const user = userEvent.setup();
    renderMobileNavigation();

    const trigger = screen.getByRole("button", { name: "打开主导航" });
    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const dialog = screen.getByRole("dialog", { name: "星数主导航" });
    expect(within(dialog).getByRole("link", { name: "历史对话" })).toHaveAttribute("href", "/history");
    expect(within(dialog).getByRole("link", { name: "智能制表" })).toHaveAttribute("href", "/table");
    expect(within(dialog).getByRole("link", { name: "智能写作" })).toHaveAttribute("href", "/writing");
    expect(within(dialog).getByRole("link", { name: "我的看板" })).toHaveAttribute("href", "/dashboard");
    expect(within(dialog).getByRole("link", { name: "我的云盘" })).toHaveAttribute("href", "/cloud");
    expect(within(dialog).getByRole("link", { name: "数据资产看板" })).toHaveAttribute(
      "href",
      "/data-dashboard"
    );
    expect(within(dialog).getByRole("link", { name: "数据资产管理" })).toHaveAttribute(
      "href",
      "/data-management"
    );
    expect(within(dialog).getByRole("button", { name: "移动端账户菜单" })).toBeVisible();
  });

  it("starts a clean conversation from the drawer", async () => {
    const user = userEvent.setup();
    const { onNewChat } = renderMobileNavigation();

    await user.click(screen.getByRole("button", { name: "打开主导航" }));
    await user.click(within(screen.getByRole("dialog", { name: "星数主导航" })).getByRole("button", {
      name: "新建对话"
    }));

    expect(onNewChat).toHaveBeenCalledOnce();
  });
});
