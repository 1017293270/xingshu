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

const userFixture = {
  token: "token-abc",
  userId: 2,
  username: "alice",
  isAdmin: false
};

const spaceFixture = {
  id: 9,
  spaceName: "Alice 的空间",
  ownerId: 2,
  myRole: "owner",
  memberCount: 1,
  createdAt: "2026-07-10"
};

function renderLoginRoute(from = "/") {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[{ pathname: "/login", state: { from } }]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>
  );
}

async function submitLoginForm(username = "alice", password = "secret") {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("用户名"), username);
  await user.type(screen.getByLabelText("密码"), password);
  await user.click(screen.getByRole("button", { name: "登录" }));
}

describe("LoginPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useDataHubAuthStore.getState().clearAuthState();
  });

  it("renders the split enterprise login composition", async () => {
    const { container } = renderLoginRoute();

    expect(await screen.findByRole("heading", { name: /让每一次问数/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "登录星数" })).toBeInTheDocument();
    expect(screen.getByText("企业级安全防护已启用")).toBeInTheDocument();
    expect(screen.getByText("SECURE ACCESS")).toBeInTheDocument();
    expect(screen.getByText("安全连接")).toBeInTheDocument();
    expect(screen.getByText("由 data-hub 权限体系提供认证")).toBeInTheDocument();
    expect(container.querySelector(".login-page__atmosphere")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".login-ask-demo")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll(".login-page__stars i")).toHaveLength(7);
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

    expect(await screen.findByRole("heading", { name: /您好，zhangsan/ }, { timeout: 4000 })).toBeInTheDocument();
    expect(ensureDataHubSpace).toHaveBeenCalledWith(
      "zhangsan",
      expect.objectContaining({ signal: expect.any(AbortSignal), timeoutMs: 8000 })
    );
    expect(readDataHubSession()).toMatchObject({ token: "token-123", spaceId: 7 });
  });

  it("commits auth only after the data space is ready and returns to the requested route", async () => {
    vi.mocked(loginToDataHub).mockResolvedValue(userFixture);
    vi.mocked(ensureDataHubSpace).mockResolvedValue(spaceFixture);
    renderLoginRoute("/analysis");

    await submitLoginForm();

    expect(await screen.findByLabelText("空白问数工作区", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(useDataHubAuthStore.getState()).toMatchObject({
      token: userFixture.token,
      currentSpaceId: spaceFixture.id,
      user: { username: "alice" }
    });
    expect(ensureDataHubSpace).toHaveBeenCalledWith(
      "alice",
      expect.objectContaining({
        authToken: userFixture.token,
        persistSelection: false,
        signal: expect.any(AbortSignal),
        spaceId: null,
        timeoutMs: 8000
      })
    );
  });

  it("does not persist a partial session when space preparation fails", async () => {
    vi.mocked(loginToDataHub).mockResolvedValue(userFixture);
    vi.mocked(ensureDataHubSpace).mockRejectedValue(new Error("空间初始化失败"));
    renderLoginRoute();

    await submitLoginForm();

    expect(await screen.findByRole("alert", {}, { timeout: 4000 })).toHaveTextContent("空间初始化失败");
    expect(useDataHubAuthStore.getState()).toMatchObject({ token: null, user: null, currentSpaceId: null });
    expect(readDataHubSession()).toEqual({ token: null, user: null, spaceId: null });
  });

  it("rejects external return targets after login", async () => {
    vi.mocked(loginToDataHub).mockResolvedValue(userFixture);
    vi.mocked(ensureDataHubSpace).mockResolvedValue(spaceFixture);
    renderLoginRoute("//example.com/collect-session");

    await submitLoginForm();

    expect(await screen.findByRole("heading", { name: /您好，alice/ }, { timeout: 4000 })).toBeInTheDocument();
    expect(document.title).toBe("首页 · 星数");
  });

  it("rejects backslash-based external return targets after login", async () => {
    vi.mocked(loginToDataHub).mockResolvedValue(userFixture);
    vi.mocked(ensureDataHubSpace).mockResolvedValue(spaceFixture);
    renderLoginRoute("/\\example.com/collect-session");

    await submitLoginForm();

    expect(await screen.findByRole("heading", { name: /您好，alice/ }, { timeout: 4000 })).toBeInTheDocument();
    expect(document.title).toBe("首页 · 星数");
  });

  it("aborts a pending login when the page unmounts", async () => {
    let requestSignal: AbortSignal | undefined;
    vi.mocked(loginToDataHub).mockImplementation((_values, options) => {
      requestSignal = options?.signal;
      return new Promise(() => {});
    });
    const view = renderLoginRoute();

    await submitLoginForm();
    await waitFor(() => expect(loginToDataHub).toHaveBeenCalledOnce());
    view.unmount();

    expect(requestSignal?.aborted).toBe(true);
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

    expect(await screen.findByRole("heading", { name: /您好，zhangsan/ }, { timeout: 4000 })).toBeInTheDocument();
    expect(readDataHubSession()).toMatchObject({ token: "token-123", spaceId: 12 });
  });

  it("shows data-hub login errors inline", async () => {
    const user = userEvent.setup();
    vi.mocked(loginToDataHub).mockRejectedValue(new Error("用户名或密码错误"));
    renderLoginRoute();

    await user.type(await screen.findByLabelText("用户名"), "zhangsan");
    await user.type(screen.getByLabelText("密码"), "bad-password");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByText("用户名或密码错误", undefined, { timeout: 4000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "登录" })).not.toBeDisabled());
  });
});
