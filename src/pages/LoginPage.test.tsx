import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { AppRoutes } from "@/app/AppRoutes";
import { loginToDataHub } from "@/services/dataHubAuthService";
import { ensureDataHubSpace } from "@/services/dataHubSpaceService";
import { readDataHubSession } from "@/services/dataHubSession";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";

vi.mock("@/services/dataHubAuthService", () => ({
  loginToDataHub: vi.fn()
}));

vi.mock("@/services/dataHubSpaceService", () => ({
  ensureDataHubSpace: vi.fn()
}));

function renderLoginRoute() {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={["/login"]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useDataHubAuthStore.getState().clearAuthState();
  });

  it("renders the image2-backed enterprise login composition", async () => {
    const { container } = renderLoginRoute();

    expect(await screen.findByRole("heading", { name: "可信数据智能入口" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "登录星数" })).toBeInTheDocument();
    expect(screen.getByText("企业级安全防护已启用")).toBeInTheDocument();
    expect(screen.getByText("由 data-hub 权限体系提供认证")).toBeInTheDocument();
    expect(screen.getByLabelText("登录页可信能力")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-icon-source="login-image2"]')).toHaveLength(7);
  });

  it("validates required fields before calling data-hub", async () => {
    const user = userEvent.setup();
    renderLoginRoute();

    await user.click(await screen.findByRole("button", { name: "登录" }));

    expect(await screen.findByText("请输入用户名")).toBeInTheDocument();
    expect(screen.getByText("请输入密码")).toBeInTheDocument();
    expect(loginToDataHub).not.toHaveBeenCalled();
  });

  it("shows forgot password guidance", async () => {
    const user = userEvent.setup();
    renderLoginRoute();

    await user.click(await screen.findByRole("button", { name: "忘记密码" }));

    expect(screen.getByRole("status")).toHaveTextContent("请联系企业管理员重置密码");
  });

  it("logs in through data-hub, stores the first space, and enters the app", async () => {
    const user = userEvent.setup();
    vi.mocked(loginToDataHub).mockResolvedValue({
      token: "token-123",
      userId: 1,
      username: "zhangsan",
      isAdmin: false
    });
    vi.mocked(ensureDataHubSpace).mockResolvedValue({
      id: 7,
      spaceName: "张三的空间",
      ownerId: 1,
      myRole: "super_admin",
      memberCount: 1,
      createdAt: "2026-07-07 16:00:00"
    });
    renderLoginRoute();

    await user.type(await screen.findByLabelText("用户名"), "zhangsan");
    await user.type(screen.getByLabelText("密码"), "secret");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("heading", { name: /您好，张三/ })).toBeInTheDocument();
    expect(ensureDataHubSpace).toHaveBeenCalledWith(
      "zhangsan",
      expect.objectContaining({ signal: expect.any(AbortSignal), timeoutMs: 8000 })
    );
    expect(readDataHubSession()).toMatchObject({ token: "token-123", spaceId: 7 });
  });

  it("creates or selects a platform space before entering the app", async () => {
    const user = userEvent.setup();
    vi.mocked(loginToDataHub).mockResolvedValue({
      token: "token-123",
      userId: 1,
      username: "zhangsan",
      isAdmin: false
    });
    vi.mocked(ensureDataHubSpace).mockResolvedValue({
      id: 12,
      spaceName: "zhangsan的空间",
      ownerId: 1,
      myRole: "super_admin",
      memberCount: 1,
      createdAt: "2026-07-07 16:00:00"
    });
    renderLoginRoute();

    await user.type(await screen.findByLabelText("用户名"), "zhangsan");
    await user.type(screen.getByLabelText("密码"), "secret");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("heading", { name: /您好，张三/ })).toBeInTheDocument();
    expect(readDataHubSession()).toMatchObject({ token: "token-123", spaceId: 12 });
  });

  it("shows data-hub login errors inline", async () => {
    const user = userEvent.setup();
    vi.mocked(loginToDataHub).mockRejectedValue(new Error("用户名或密码错误"));
    renderLoginRoute();

    await user.type(await screen.findByLabelText("用户名"), "zhangsan");
    await user.type(screen.getByLabelText("密码"), "bad-password");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByText("用户名或密码错误")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "登录" })).not.toBeDisabled());
  });
});
