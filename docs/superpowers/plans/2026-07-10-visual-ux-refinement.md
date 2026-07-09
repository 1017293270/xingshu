# 星数全站视觉与体验精修 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保持现有品牌定位、功能结构和参考图约束的前提下，完成星数全站的设计系统、移动导航、核心状态、轻量动效、图表与逐页视觉精修。

**Architecture:** 先建立统一 token、motion、焦点和持久应用外壳，再修复登录、问数、异步状态和图表生命周期，最后完成图标、资产与逐页密度精修。所有网络能力继续经过 `src/services/`；未接入能力必须以可解释的 disabled / error / mock-adapter 状态呈现，不在页面内伪造成功。

**Tech Stack:** React 19, TypeScript, Vite, React Router, Ant Design 5, Zustand, TanStack Query, ECharts, Vitest, React Testing Library, Playwright

---

## File map

### 新增基础文件

- `src/hooks/usePrefersReducedMotion.ts`：统一读取系统减弱动效偏好。
- `src/hooks/useVoiceInput.ts`：语音权限、录制、处理和取消状态机。
- `src/components/xs/navigation.tsx`：桌面与移动导航共享的唯一配置。
- `src/components/xs/XsMobileNav.tsx`：移动端紧凑顶栏与导航 Drawer。
- `src/components/xs/XsAsyncPanel.tsx`：pending / refreshing / empty / error / content 状态。
- `src/app/AppLayout.tsx`：持久 `XsShell`、内容区 Suspense、路由滚动与焦点管理。
- `src/services/dashboardEditorService.ts`：看板编辑器可达性探测，不在页面直接 fetch。
- `src/services/attachmentService.ts`：附件校验与上传 adapter 边界。
- `src/services/cloudService.ts`：云盘上传与同步的 mock adapter 和可见状态变化。
- `src/theme/xingshuTokens.test.ts`：CSS / TS token 一致性与对比底线。

### 主要修改文件

- 设计系统：`src/styles/tokens.css`, `src/theme/xingshuTokens.ts`, `src/theme/antdTheme.ts`, `src/app/providers.tsx`。
- 外壳：`src/app/AppRoutes.tsx`, `src/pages/PageFrame.tsx`, `src/components/xs/XsShell.tsx`, `src/components/xs/XsSidebar.tsx`, `src/components/xs/xs.css`。
- 核心流程：`src/pages/LoginPage.tsx`, `src/pages/login.css`, `src/features/home/HomePage.tsx`, `src/pages/AnalysisPage.tsx`, `src/stores/uiStore.ts`, `src/services/agentService.ts`。
- 状态与图表：`src/components/xs/XsEmptyState.tsx`, `src/components/xs/XsStatusBar.tsx`, `src/components/xs/XsEChart.tsx`, `src/pages/HistoryPage.tsx`, `src/pages/DashboardEditorPage.tsx`。
- 逐页：`src/pages/TablePage.tsx`, `src/pages/WritingPage.tsx`, `src/pages/CloudPage.tsx`, `src/pages/DashboardPage.tsx`, `src/pages/DataDashboardPage.tsx`, `src/pages/DataManagementPage.tsx`, `src/pages/AiSettingsPage.tsx`。
- 样式：`src/features/home/home.css`, `src/pages/pages.css`, `src/pages/welcome.css`。
- 测试：对应的 `*.test.ts(x)` 与 `tests/visual/xingshu-homepage.spec.ts`。

## Task 1: 建立设计 token、焦点与 reduced-motion 基础

**Files:**
- Create: `src/hooks/usePrefersReducedMotion.ts`
- Create: `src/theme/xingshuTokens.test.ts`
- Modify: `src/theme/xingshuTokens.ts`
- Modify: `src/styles/tokens.css`
- Modify: `src/theme/antdTheme.ts`
- Modify: `src/app/providers.tsx`
- Modify: `src/test/setup.ts`

- [ ] **Step 1: 写 token 一致性和 reduced-motion 失败测试**

```ts
// src/theme/xingshuTokens.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { xingshuTokens } from "./xingshuTokens";

describe("xingshu tokens", () => {
  const css = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8");

  it("keeps CSS and TypeScript brand tokens aligned", () => {
    expect(css).toContain(`--xs-primary: ${xingshuTokens.colorPrimary};`);
    expect(css).toContain(`--xs-text-3: ${xingshuTokens.colorTextTertiary};`);
    expect(css).toContain(`--xs-motion-base: ${xingshuTokens.motionBase}ms;`);
    expect(css).toContain(`--xs-focus-ring: ${xingshuTokens.focusRing};`);
  });

  it("uses the accessible tertiary text and strong interactive blue", () => {
    expect(xingshuTokens.colorTextTertiary).toBe("#5F7391");
    expect(xingshuTokens.colorInteractiveText).toBe("#1D4ED8");
  });
});
```

```ts
// append to src/test/setup.ts
export function setReducedMotion(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)" ? matches : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false
  }));
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `$env:NODE_OPTIONS='--no-experimental-webstorage'; npx vitest run src/theme/xingshuTokens.test.ts`

Expected: FAIL，因为 motion、focus 和可访问颜色 token 尚不存在。

- [ ] **Step 3: 增加统一 token 和 motion hook**

```ts
// additions in src/theme/xingshuTokens.ts
colorTextTertiary: "#5F7391",
colorInteractiveText: "#1D4ED8",
focusRing: "0 0 0 3px rgba(37, 99, 235, 0.24)",
motionFast: 120,
motionBase: 180,
motionSlow: 260,
motionEaseOut: "cubic-bezier(.2, 0, 0, 1)",
controlHeight: 44,
controlHeightLarge: 52,
```

```ts
// src/hooks/usePrefersReducedMotion.ts
import { useEffect, useState } from "react";

const query = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}
```

在 `tokens.css` 添加对应 CSS variables、全局 `:focus-visible` 基线和全局
`@media (prefers-reduced-motion: reduce)`；只关闭非必要位移、过渡和无限动画，
不隐藏状态文字。

- [ ] **Step 4: 让 Ant Design 尊重 reduced-motion**

`AppProviders` 调用 `usePrefersReducedMotion()`，用 `useMemo` 生成主题：

```ts
const theme = useMemo<ThemeConfig>(
  () => ({
    ...antdTheme,
    token: { ...antdTheme.token, motion: !reducedMotion }
  }),
  [reducedMotion]
);
```

- [ ] **Step 5: 运行测试和构建**

Run: `$env:NODE_OPTIONS='--no-experimental-webstorage'; npx vitest run src/theme/xingshuTokens.test.ts`

Expected: PASS。

Run: `npm run build`

Expected: PASS。

- [ ] **Step 6: Commit**

```powershell
git add src/hooks/usePrefersReducedMotion.ts src/theme/xingshuTokens.test.ts src/theme/xingshuTokens.ts src/styles/tokens.css src/theme/antdTheme.ts src/app/providers.tsx src/test/setup.ts
git commit -m "feat: establish accessible visual and motion tokens"
```

## Task 2: 建立持久外壳与移动导航

**Files:**
- Create: `src/components/xs/navigation.tsx`
- Create: `src/components/xs/XsMobileNav.tsx`
- Create: `src/app/AppLayout.tsx`
- Create: `src/components/xs/XsMobileNav.test.tsx`
- Modify: `src/app/AppRoutes.tsx`
- Modify: `src/app/AppRoutes.test.tsx`
- Modify: `src/components/xs/XsShell.tsx`
- Modify: `src/components/xs/XsSidebar.tsx`
- Modify: `src/components/xs/index.ts`
- Modify: `src/pages/PageFrame.tsx`
- Modify: `src/features/home/HomePage.tsx`
- Modify: `src/components/xs/xs.css`

- [ ] **Step 1: 写移动导航和持久外壳失败测试**

```tsx
function TestApp({ initialPath }: { initialPath: string }) {
  useDataHubAuthStore.getState().setAuth({ token: "test-token", userId: 1, username: "张三", isAdmin: true });
  useDataHubAuthStore.getState().setCurrentSpaceId(1);
  return (
    <AppProviders>
      <MemoryRouter initialEntries={[initialPath]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>
  );
}

it("keeps every product destination reachable from the mobile menu", async () => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(max-width: 900px)",
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {}
  }));
  render(<TestApp initialPath="/dashboard" />);
  await userEvent.click(screen.getByRole("button", { name: "打开主导航" }));
  expect(screen.getByRole("dialog", { name: "星数主导航" })).toBeVisible();
  expect(screen.getByRole("link", { name: "历史对话" })).toHaveAttribute("href", "/history");
  expect(screen.getByRole("link", { name: "数据资产管理" })).toHaveAttribute("href", "/data-management");
  expect(screen.getByRole("button", { name: "账户菜单" })).toBeVisible();
});

it("announces and focuses the new page after navigation", async () => {
  render(<TestApp initialPath="/" />);
  await userEvent.click(screen.getByRole("link", { name: "我的看板" }));
  expect(await screen.findByRole("heading", { name: "我的看板", level: 1 })).toHaveFocus();
  expect(document.title).toBe("我的看板 · 星数");
});
```

- [ ] **Step 2: 运行失败测试**

Run: `$env:NODE_OPTIONS='--no-experimental-webstorage'; npx vitest run src/components/xs/XsMobileNav.test.tsx src/app/AppRoutes.test.tsx`

Expected: FAIL，因为移动导航、Drawer 和持久布局尚不存在。

- [ ] **Step 3: 抽取唯一导航配置并实现移动 Drawer**

`navigation.tsx` 导出 `primaryNavigation`、`secondaryNavigation` 和 `routeTitles`；
每项包含 `to`、`label`、Phosphor icon。`XsSidebar` 和 `XsMobileNav` 只消费该配置。

`XsMobileNav` 使用 Ant Design `Drawer`，按钮包含：

```tsx
<Button
  aria-controls="xs-mobile-navigation"
  aria-expanded={open}
  aria-label="打开主导航"
  icon={<List size={22} />}
  onClick={() => setOpen(true)}
/>
```

Drawer 关闭时把焦点还给菜单按钮；内部包含全部现有 NavLink、新建对话和账户菜单。

- [ ] **Step 4: 建立嵌套路由持久布局**

`AppLayout` 渲染 `XsShell + Suspense + Outlet`，监听 `location.pathname`：

```tsx
useEffect(() => {
  mainRef.current?.scrollTo({ top: 0 });
  document.title = `${routeTitles[location.pathname] ?? "星数"} · 星数`;
  requestAnimationFrame(() => mainRef.current?.querySelector<HTMLElement>("h1")?.focus());
}, [location.pathname]);
```

`PageFrame` 和 `HomePage` 删除自己的 `XsShell`；`AppRoutes` 把受保护页面放到
`<Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>` 下。

- [ ] **Step 5: 调整桌面/移动外壳样式**

- 桌面保留 320px 侧栏。
- 900px 以下隐藏 desktop aside，但显示 64px 移动顶栏和 Drawer 入口。
- 主内容只保留一个纵向滚动容器；侧栏滚动条使用细窄样式并仅在真实溢出时出现。
- 加 `<a className="xs-skip-link" href="#xs-main-content">跳到主要内容</a>`。

- [ ] **Step 6: 运行测试与桌面/移动路由烟测**

Run: `$env:NODE_OPTIONS='--no-experimental-webstorage'; npx vitest run src/components/xs/XsMobileNav.test.tsx src/app/AppRoutes.test.tsx`

Expected: PASS。

- [ ] **Step 7: Commit**

```powershell
git add src/components/xs/navigation.tsx src/components/xs/XsMobileNav.tsx src/components/xs/XsMobileNav.test.tsx src/app/AppLayout.tsx src/app/AppRoutes.tsx src/app/AppRoutes.test.tsx src/components/xs/XsShell.tsx src/components/xs/XsSidebar.tsx src/components/xs/index.ts src/pages/PageFrame.tsx src/features/home/HomePage.tsx src/components/xs/xs.css
git commit -m "feat: add persistent shell and mobile navigation"
```

## Task 3: 修复登录事务、回跳与移动任务顺序

**Files:**
- Modify: `src/services/dataHubAuthService.ts`
- Modify: `src/stores/dataHubAuthStore.ts`
- Modify: `src/stores/dataHubAuthStore.test.ts`
- Modify: `src/pages/LoginPage.tsx`
- Modify: `src/pages/LoginPage.test.tsx`
- Modify: `src/pages/login.css`

- [ ] **Step 1: 写登录原子提交与回跳失败测试**

```tsx
const userFixture = { token: "token-abc", userId: 2, username: "alice", isAdmin: false };
const spaceFixture = { id: 9, spaceName: "Alice 的空间", ownerId: 2, myRole: "owner", memberCount: 1, createdAt: "2026-07-10" };

function renderLoginRoute(from = "/") {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[{ pathname: "/login", state: { from } }]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>
  );
}

async function submitLoginForm() {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("用户名"), "alice");
  await user.type(screen.getByLabelText("密码"), "secret");
  await user.click(screen.getByRole("button", { name: "登录" }));
}

it("commits auth only after the data space is ready and returns to the requested route", async () => {
  vi.mocked(loginToDataHub).mockResolvedValue(userFixture);
  vi.mocked(ensureDataHubSpace).mockResolvedValue(spaceFixture);
  renderLoginRoute("/analysis");
  await userEvent.type(screen.getByLabelText("用户名"), "alice");
  await userEvent.type(screen.getByLabelText("密码"), "secret");
  await userEvent.click(screen.getByRole("button", { name: "登录" }));
  await waitFor(() => expect(useDataHubAuthStore.getState().currentSpaceId).toBe(spaceFixture.id));
  expect(screen.getByRole("region", { name: "星数命令输入区" })).toBeVisible();
});

it("does not persist a partial session when space preparation fails", async () => {
  vi.mocked(loginToDataHub).mockResolvedValue(userFixture);
  vi.mocked(ensureDataHubSpace).mockRejectedValue(new Error("空间初始化失败"));
  await submitLoginForm();
  expect(useDataHubAuthStore.getState().token).toBeNull();
  expect(readDataHubSession().token).toBeNull();
  expect(await screen.findByRole("alert")).toHaveTextContent("空间初始化失败");
});
```

- [ ] **Step 2: 运行失败测试**

Run: `$env:NODE_OPTIONS='--no-experimental-webstorage'; npx vitest run src/pages/LoginPage.test.tsx src/stores/dataHubAuthStore.test.ts`

Expected: FAIL，因为服务当前在空间准备前持久化 token，成功后固定跳 `/`。

- [ ] **Step 3: 实现原子 session 提交**

- `loginToDataHub` 只返回用户，不写 storage。
- Store 增加 `setSession(user, spaceId)`，同一 action 写入 auth、space 和 Zustand。
- Login catch 中调用 `clearAuthState()`，保证取消与错误不会遗留半会话。
- 从 `useLocation().state?.from` 读取回跳，仅接受以 `/` 开头且不为 `/login` 的内部路径。

- [ ] **Step 4: 移动端把登录卡前置**

在 `max-width: 720px` 下把 `.login-panel` 设置为 `order: 1`、品牌 copy 为 `order: 2`；
压缩顶部 Logo 与安全标识，能力项改为紧凑信任标签。移除嵌套 overflow，确保只有一个纵向滚动容器。

- [ ] **Step 5: 运行测试与截图**

Run: `$env:NODE_OPTIONS='--no-experimental-webstorage'; npx vitest run src/pages/LoginPage.test.tsx src/stores/dataHubAuthStore.test.ts src/services/dataHubClient.test.ts`

Expected: PASS。

- [ ] **Step 6: Commit**

```powershell
git add src/services/dataHubAuthService.ts src/stores/dataHubAuthStore.ts src/stores/dataHubAuthStore.test.ts src/pages/LoginPage.tsx src/pages/LoginPage.test.tsx src/pages/login.css
git commit -m "fix: make login reliable and mobile first"
```

## Task 4: 升级命令框、问数空态与流式生命周期

**Files:**
- Create: `src/hooks/useVoiceInput.ts`
- Create: `src/hooks/useVoiceInput.test.ts`
- Create: `src/services/attachmentService.ts`
- Create: `src/services/attachmentService.test.ts`
- Modify: `src/components/xs/XsCommandBox.tsx`
- Modify: `src/components/xs/XsCommandBox.test.tsx`
- Modify: `src/components/xs/xs.css`
- Modify: `src/features/home/HomePage.tsx`
- Modify: `src/features/home/HomePage.test.tsx`
- Modify: `src/pages/AnalysisPage.tsx`
- Modify: `src/pages/AiChartActions.test.tsx`
- Modify: `src/stores/uiStore.ts`
- Modify: `src/stores/uiStore.test.ts`
- Modify: `src/types/dataHub.ts`

- [ ] **Step 1: 写命令框附件、busy、停止和快捷键失败测试**

```tsx
it("supports attachment, keyboard submit and stop", async () => {
  const onAttach = vi.fn();
  const onSubmit = vi.fn();
  const onStop = vi.fn();
  const { rerender } = render(
    <XsCommandBox value="分析销售数据" onChange={() => {}} onSubmit={onSubmit} onAttach={onAttach} />
  );
  await userEvent.click(screen.getByLabelText("命令输入"));
  await userEvent.keyboard("{Control>}{Enter}{/Control}");
  expect(onSubmit).toHaveBeenCalledOnce();
  await userEvent.upload(screen.getByLabelText("添加附件"), new File(["a"], "sales.csv"));
  expect(onAttach).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ name: "sales.csv" })]));
  rerender(<XsCommandBox value="分析销售数据" onChange={() => {}} onSubmit={onSubmit} busy onStop={onStop} />);
  await userEvent.click(screen.getByRole("button", { name: "停止生成" }));
  expect(onStop).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: 写 runId 隔离失败测试**

```ts
it("ignores late events from a cancelled run", () => {
  const staleEvent = { type: "text", data: "旧回答", timestamp: 1 };
  const currentEvent = { type: "text", data: "新回答", timestamp: 2 };
  const first = useUiStore.getState().startAskDataRun("问题一", null);
  useUiStore.getState().cancelAskDataRun(first);
  const second = useUiStore.getState().startAskDataRun("问题二", null);
  useUiStore.getState().appendAskDataEvent(first, staleEvent);
  useUiStore.getState().appendAskDataEvent(second, currentEvent);
  expect(useUiStore.getState().analysisTurns.at(-1)?.events).toEqual([currentEvent]);
});
```

- [ ] **Step 3: 运行失败测试**

Run: `$env:NODE_OPTIONS='--no-experimental-webstorage'; npx vitest run src/components/xs/XsCommandBox.test.tsx src/stores/uiStore.test.ts`

Expected: FAIL。

- [ ] **Step 4: 实现命令框状态接口**

新增 props：

```ts
type XsCommandBoxProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onAttach?: (files: File[]) => void;
  onVoice?: () => void;
  onStop?: () => void;
  busy?: boolean;
  voiceState?: "idle" | "recording" | "processing" | "error";
};
```

空输入时发送 disabled；Ctrl/Cmd+Enter 提交；隐藏 file input 接受多文件；busy 时发送按钮替换为停止；
语音按钮通过 `aria-pressed` 和文字提示表达状态。

`useVoiceInput` 使用 `navigator.mediaDevices.getUserMedia` 和 `MediaRecorder` 管理
idle → permission → recording → processing → success/error；停止时释放所有 media tracks。
`attachmentService` 校验文件大小和允许类型，返回稳定的本地队列项；后续真实上传只替换该 adapter。

- [ ] **Step 5: 用 runId 绑定流式事件**

`startAskDataRun` 返回 `runId`；`append / complete / fail / cancel` 都必须接收 runId，
通过 turn id 更新指定 turn 并忽略已取消 run 的迟到事件。Home 与 Analysis 保存当前 AbortController，
新建对话和停止操作先 abort 再更新状态。

- [ ] **Step 6: 建立问数空态和移动 composer**

空态使用现有品牌图标、标题“从一个经营问题开始”、权限说明和 4 个快捷问题；不新增业务模块。
移动端 composer 固定在 `env(safe-area-inset-bottom)` 上方，工作区底部 padding 等于 composer 高度。
删除同一阶段重复的 spinner / dots / shimmer，只保留 Progress 和阶段文案。

- [ ] **Step 7: 运行测试**

Run: `$env:NODE_OPTIONS='--no-experimental-webstorage'; npx vitest run src/components/xs/XsCommandBox.test.tsx src/stores/uiStore.test.ts src/features/home/HomePage.test.tsx src/pages/AiChartActions.test.tsx`

Expected: PASS。

- [ ] **Step 8: Commit**

```powershell
git add src/hooks/useVoiceInput.ts src/hooks/useVoiceInput.test.ts src/services/attachmentService.ts src/services/attachmentService.test.ts src/components/xs/XsCommandBox.tsx src/components/xs/XsCommandBox.test.tsx src/components/xs/xs.css src/features/home/HomePage.tsx src/features/home/HomePage.test.tsx src/pages/AnalysisPage.tsx src/pages/AiChartActions.test.tsx src/stores/uiStore.ts src/stores/uiStore.test.ts src/types/dataHub.ts
git commit -m "feat: refine command and ask-data experience"
```

## Task 5: 统一异步状态并产品化编辑器失败态

**Files:**
- Create: `src/components/xs/XsAsyncPanel.tsx`
- Create: `src/components/xs/XsAsyncPanel.test.tsx`
- Create: `src/services/dashboardEditorService.ts`
- Create: `src/services/dashboardEditorService.test.ts`
- Modify: `src/components/xs/index.ts`
- Modify: `src/components/xs/XsEmptyState.tsx`
- Modify: `src/components/xs/XsStatusBar.tsx`
- Modify: `src/pages/HistoryPage.tsx`
- Modify: `src/pages/TablePage.tsx`
- Modify: `src/pages/WritingPage.tsx`
- Modify: `src/pages/DataDashboardPage.tsx`
- Modify: `src/pages/DataManagementPage.tsx`
- Modify: `src/pages/DashboardEditorPage.tsx`
- Modify: `src/pages/pages.css`

- [ ] **Step 1: 写统一异步状态失败测试**

```tsx
it("never shows empty content while the first request is pending", () => {
  render(<XsAsyncPanel status="pending" empty={false} emptyDescription="暂无历史" />);
  expect(screen.getByRole("status", { name: "正在加载" })).toBeVisible();
  expect(screen.queryByText("暂无历史")).not.toBeInTheDocument();
});

it("renders an actionable error and retry", async () => {
  const onRetry = vi.fn();
  render(<XsAsyncPanel status="error" error="连接失败" onRetry={onRetry} />);
  await userEvent.click(screen.getByRole("button", { name: "重试" }));
  expect(onRetry).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: 写编辑器探测失败测试**

```ts
it("reports an unreachable editor", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
  await expect(probeDashboardEditor("http://127.0.0.1:5174/workbenches")).resolves.toEqual({
    ok: false,
    message: "看板编辑器暂时不可用"
  });
});
```

- [ ] **Step 3: 运行失败测试**

Run: `$env:NODE_OPTIONS='--no-experimental-webstorage'; npx vitest run src/components/xs/XsAsyncPanel.test.tsx src/services/dashboardEditorService.test.ts`

Expected: FAIL。

- [ ] **Step 4: 实现 XsAsyncPanel**

组件接受 `status: "pending" | "refreshing" | "error" | "ready"`、`empty`、`error`、
`onRetry`、`children`；pending 使用静态 skeleton，refreshing 保留 children 并在固定状态槽标记。
错误使用 `role="alert"`，普通进度使用 `role="status"`。

- [ ] **Step 5: 接入所有 Query 页面**

History 在 `isPending` 时不渲染 empty；Table、Writing、DataDashboard、DataManagement
传入 query 的 `isPending / isFetching / isError / refetch`，统一显示 skeleton、旧数据刷新和 retry。

- [ ] **Step 6: 产品化编辑器状态**

`probeDashboardEditor` 通过带 AbortController 超时的 `fetch(url, { mode: "no-cors" })` 探测。
页面先显示 loading；成功后才显示“已连接”；失败显示品牌化错误空态、重试与新窗口说明，
不渲染浏览器原生拒绝连接页面。

- [ ] **Step 7: 运行测试**

Run: `$env:NODE_OPTIONS='--no-experimental-webstorage'; npx vitest run src/components/xs/XsAsyncPanel.test.tsx src/services/dashboardEditorService.test.ts src/pages/HistoryPage.test.tsx src/pages/WorkflowActions.test.tsx`

Expected: PASS。

- [ ] **Step 8: Commit**

```powershell
git add src/components/xs/XsAsyncPanel.tsx src/components/xs/XsAsyncPanel.test.tsx src/services/dashboardEditorService.ts src/services/dashboardEditorService.test.ts src/components/xs/index.ts src/components/xs/XsEmptyState.tsx src/components/xs/XsStatusBar.tsx src/pages/HistoryPage.tsx src/pages/TablePage.tsx src/pages/WritingPage.tsx src/pages/DataDashboardPage.tsx src/pages/DataManagementPage.tsx src/pages/DashboardEditorPage.tsx src/pages/pages.css
git commit -m "feat: unify async and editor states"
```

## Task 6: 稳定 ECharts 生命周期并提供数据替代

**Files:**
- Modify: `src/components/xs/XsEChart.tsx`
- Create: `src/components/xs/XsEChart.test.tsx`
- Create: `src/components/xs/XsChartCard.tsx`
- Modify: `src/components/xs/index.ts`
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/pages/DataDashboardPage.tsx`
- Modify: `src/pages/AnalysisPage.tsx`
- Modify: `src/services/mock/dashboardMock.ts`

- [ ] **Step 1: 写 init-once / update / dispose 失败测试**

```tsx
const { mockChart, mockInit } = vi.hoisted(() => {
  const chart = { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
  return { mockChart: chart, mockInit: vi.fn(() => chart) };
});
vi.mock("echarts", () => ({ init: mockInit }));
const firstOption = { xAxis: { type: "category" }, series: [{ type: "bar", data: [1] }] };
const secondOption = { xAxis: { type: "category" }, series: [{ type: "bar", data: [2] }] };

it("initializes once, updates options and disposes only on unmount", async () => {
  const { rerender, unmount } = render(<XsEChart label="趋势图" option={firstOption} />);
  await waitFor(() => expect(mockInit).toHaveBeenCalledOnce());
  rerender(<XsEChart label="趋势图" option={secondOption} />);
  expect(mockChart.setOption).toHaveBeenLastCalledWith(secondOption, { notMerge: false, lazyUpdate: true });
  expect(mockChart.dispose).not.toHaveBeenCalled();
  unmount();
  expect(mockChart.dispose).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: 运行失败测试**

Run: `$env:NODE_OPTIONS='--no-experimental-webstorage'; npx vitest run src/components/xs/XsEChart.test.tsx`

Expected: FAIL，因为当前 option 变化会 cleanup 并重新 init。

- [ ] **Step 3: 拆分 init、update 与 dispose effect**

- mount effect：动态 import、init、ResizeObserver、unmount dispose。
- option effect：实例 ready 后调用 `setOption(optionWithMotion, { notMerge: false, lazyUpdate: true })`。
- ResizeObserver 使用单个 `requestAnimationFrame` 合并 resize，不再给每个图表同时注册 window resize。
- reduced-motion 下强制 `animation:false`。

- [ ] **Step 4: 增加 XsChartCard 数据摘要**

`XsChartCard` 接受 `title`、`summary`、`option`、`table`。图表 `role="img"` 的 accessible name
包含趋势摘要；“查看数据” disclosure 展开带 caption、thead、th scope 的表格。

- [ ] **Step 5: 接入 Dashboard、DataDashboard 和 Analysis**

固定看板保持 `animation:false`；AI 生成 option 通过 `useMemo` 稳定引用。移动端图表卡先显示
summary，再显示图表与“全屏查看 / 查看数据”。

- [ ] **Step 6: 运行测试与视觉烟测**

Run: `$env:NODE_OPTIONS='--no-experimental-webstorage'; npx vitest run src/components/xs/XsEChart.test.tsx src/pages/AiChartActions.test.tsx src/services/chartTypography.test.ts`

Expected: PASS。

- [ ] **Step 7: Commit**

```powershell
git add src/components/xs/XsEChart.tsx src/components/xs/XsEChart.test.tsx src/components/xs/XsChartCard.tsx src/components/xs/index.ts src/pages/DashboardPage.tsx src/pages/DataDashboardPage.tsx src/pages/AnalysisPage.tsx src/services/mock/dashboardMock.ts
git commit -m "feat: stabilize charts and expose data summaries"
```

## Task 7: 统一首页图标、卡片交互与品牌资产

**Files:**
- Modify: `src/features/home/HomePage.tsx`
- Modify: `src/features/home/HomePage.test.tsx`
- Modify: `src/features/home/home.css`
- Modify: `src/components/xs/XsAppCard.tsx`
- Modify: `src/components/xs/XsIconTile.tsx`
- Modify: `src/components/xs/xs.css`
- Create: `src/assets/iconRegistry.ts`
- Replace: `src/assets/home/xingshu-home-wave-bg-image2.png` with optimized WebP import

- [ ] **Step 1: 写图标来源和选中语义失败测试**

```tsx
it("uses the linear XingShu icon system and exposes selection state", () => {
  useDataHubAuthStore.getState().setSession(
    { token: "test-token", userId: 1, username: "张三", isAdmin: true },
    1
  );
  const { container } = render(
    <AppProviders>
      <MemoryRouter><HomePage /></MemoryRouter>
    </AppProviders>
  );
  expect(screen.queryByText("👋")).not.toBeInTheDocument();
  expect(container.querySelector('[data-icon-source="xingshu-home-apps-image2-v1"]')).toBeNull();
  expect(screen.getByRole("button", { name: /选择 智能问数/ })).toHaveAttribute("aria-pressed", "false");
});
```

- [ ] **Step 2: 运行失败测试**

Run: `$env:NODE_OPTIONS='--no-experimental-webstorage'; npx vitest run src/features/home/HomePage.test.tsx src/components/xs/XsCommandBox.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 使用现有 Phosphor 线性图标**

推荐应用映射：`ChartLineUp`、`ChatCircleDots`、`FileText`、`PresentationChart`、
`PencilSimpleLine`、`ListChecks`、`SquaresFour`。全部通过 `XsIconTile` 的统一底板和青色节点渲染；
删除首页彩色渐变 PNG import 和挥手 emoji。

`XsAppCard` 主按钮增加 `aria-pressed={selected}`；hover/focus/pressed 只动画 transform、border、shadow，
支持 reduced-motion。桌面保持参考图的标题型卡片，不强行加入可见说明。

- [ ] **Step 4: 建立 iconRegistry 和压缩背景**

`iconRegistry.ts` 记录每个品牌级 PNG 的语义、来源、允许尺寸和页面。使用图像压缩工具把首页背景
转换为视觉等价 WebP，更新 import；原始 source sheet 保留到 `outputs/.../references`，不再由运行时源码引用。

- [ ] **Step 5: 运行测试与构建**

Run: `$env:NODE_OPTIONS='--no-experimental-webstorage'; npx vitest run src/features/home/HomePage.test.tsx src/app/AppRoutes.test.tsx`

Expected: PASS。

Run: `npm run build`

Expected: PASS，首页背景产物显著小于当前约 1.08MB PNG。

- [ ] **Step 6: Commit**

```powershell
git add src/features/home/HomePage.tsx src/features/home/HomePage.test.tsx src/features/home/home.css src/components/xs/XsAppCard.tsx src/components/xs/XsIconTile.tsx src/components/xs/xs.css src/assets/iconRegistry.ts src/assets/home
git commit -m "style: unify home icons and interaction polish"
```

## Task 8: 完成逐页密度、文案与诚实操作状态精修

**Files:**
- Create: `src/services/cloudService.ts`
- Create: `src/services/cloudService.test.ts`
- Create: `src/pages/styles/page-shell.css`
- Create: `src/pages/styles/workflows.css`
- Create: `src/pages/styles/dashboard.css`
- Create: `src/pages/styles/data-assets.css`
- Create: `src/pages/styles/cloud.css`
- Create: `src/pages/styles/ai-settings.css`
- Modify: `src/pages/TablePage.tsx`
- Modify: `src/pages/WritingPage.tsx`
- Modify: `src/pages/CloudPage.tsx`
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/pages/DataDashboardPage.tsx`
- Modify: `src/pages/DataManagementPage.tsx`
- Modify: `src/pages/AiSettingsPage.tsx`
- Modify: `src/pages/welcome.css`
- Modify: `src/pages/pages.css`
- Modify: `src/services/mock/dashboardMock.ts`
- Modify: `src/pages/WorkflowActions.test.tsx`
- Modify: `src/pages/DataAssetActions.test.tsx`

- [ ] **Step 1: 写“操作必须改变状态或明确不可用”失败测试**

```tsx
function renderRoute(path: string) {
  useDataHubAuthStore.getState().setSession(
    { token: "test-token", userId: 1, username: "张三", isAdmin: true },
    1
  );
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>
    </AppProviders>
  );
}

it("does not report success for unavailable product actions", async () => {
  renderRoute("/dashboard");
  expect(screen.getByRole("button", { name: "看板市场" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "新建看板" })).toBeDisabled();
  expect(screen.getAllByText("即将开放").length).toBeGreaterThanOrEqual(1);
});

it("marks unavailable asset categories instead of showing knowledge-base content", async () => {
  renderRoute("/data-management");
  expect(screen.getByRole("radio", { name: "数据源管理" })).toBeDisabled();
  expect(screen.getByRole("radio", { name: "知识库管理" })).toBeChecked();
});
```

- [ ] **Step 2: 运行失败测试**

Run: `$env:NODE_OPTIONS='--no-experimental-webstorage'; npx vitest run src/pages/WorkflowActions.test.tsx src/pages/DataAssetActions.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 完成页面级精修**

- Table：修复卡片标题截断；复制操作在 hover/focus 强化；生成过程显示 busy/error。
- Writing：压缩首屏输入高度；场景卡在首屏可见；附件展示本地队列；文稿日期使用 adapter 数据。
- Cloud：删除内部实现文案；给“可用空间”补单位；`cloudService` 的 mock adapter 返回上传/同步进度，成功后把新文件加入最近资料。
- Dashboard：无真实数据的市场/新建/切换动作 disabled + “即将开放”；预警处理改变本地已处理状态。
- DataDashboard：更新时间来自 adapter；过期数据展示 freshness warning；移动 KPI 使用 2×2。
- DataManagement：只有知识库标签 enabled；移动 tablist 可横滑并显示边缘渐隐提示。
- AI Settings：测试连接结果按 success/error tone；保存按钮 sticky；防重复提交。
- Welcome：消除双滚动，保持品牌插画和现有功能，不扩成营销页。

- [ ] **Step 4: 拆出本轮触及的页面样式**

把 PageFrame、Table/Writing、Dashboard、DataDashboard/DataManagement、Cloud、AI Settings
相关规则分别移动到上述 `src/pages/styles/*.css`，由对应页面显式 import；从 `pages.css`
删除已迁移规则，保留 Analysis 尚未拆分的复杂区段。禁止复制同一选择器到新旧两个文件。

- [ ] **Step 5: 统一小动作与文本可读性**

所有“查看 / 查看明细 / 忘记密码 / 取消”达到至少 32px 桌面、44px 触控命中区；
小链接使用 `--xs-interactive-text`；状态变化 160ms 淡入，不通过位移表达键盘焦点。

- [ ] **Step 6: 运行页面测试**

Run: `$env:NODE_OPTIONS='--no-experimental-webstorage'; npx vitest run src/pages/WorkflowActions.test.tsx src/pages/DataAssetActions.test.tsx src/pages/DashboardCloudPage.test.tsx src/pages/LoginPage.test.tsx`

Expected: PASS。

- [ ] **Step 7: Commit**

```powershell
git add src/services/cloudService.ts src/services/cloudService.test.ts src/pages/styles src/pages/TablePage.tsx src/pages/WritingPage.tsx src/pages/CloudPage.tsx src/pages/DashboardPage.tsx src/pages/DataDashboardPage.tsx src/pages/DataManagementPage.tsx src/pages/AiSettingsPage.tsx src/pages/welcome.css src/pages/pages.css src/services/mock/dashboardMock.ts src/pages/WorkflowActions.test.tsx src/pages/DataAssetActions.test.tsx
git commit -m "style: refine product pages and honest states"
```

## Task 9: 完成全站自动化与视觉回归

**Files:**
- Modify: `tests/visual/xingshu-homepage.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tests/visual/xingshu-accessibility.spec.ts`
- Update: `design-qa.md`

- [ ] **Step 1: 安装可访问性测试依赖**

Run: `npm install --save-dev @axe-core/playwright`

Expected: `package.json` 和 lockfile 更新成功。

- [ ] **Step 2: 增加关键回归测试**

```ts
test("mobile navigation reaches every existing route", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "打开主导航" }).click();
  await expect(page.getByRole("dialog", { name: "星数主导航" })).toBeVisible();
  await expect(page.getByRole("link", { name: "数据资产管理" })).toBeVisible();
});

test("reduced motion keeps static feedback and disables animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/analysis");
  await expect(page.getByRole("region", { name: "星数命令输入区" })).toBeVisible();
  expect(await page.locator("html").evaluate((el) => getComputedStyle(el).scrollBehavior)).not.toBe("smooth");
});
```

`xingshu-accessibility.spec.ts` 对 `/login`、`/`、`/analysis`、`/dashboard`、
`/data-management` 在桌面和移动端运行 axe，排除仅需人工判断的规则并记录原因。

```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = ["/login", "/", "/analysis", "/dashboard", "/data-management"];

for (const route of routes) {
  test(`has no serious accessibility violations on ${route}`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("xingshu_datahub_token", "axe-token");
      localStorage.setItem(
        "xingshu_datahub_user",
        JSON.stringify({ token: "axe-token", userName: "张三" })
      );
    });
    await page.goto(route);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))
    ).toEqual([]);
  });
}
```

- [ ] **Step 3: 运行完整测试**

Run: `$env:NODE_OPTIONS='--no-experimental-webstorage'; npm test`

Expected: 所有 Vitest 测试通过。

Run: `npm run build`

Expected: TypeScript / Vite 构建通过。

Run: `$env:NODE_OPTIONS='--no-experimental-webstorage'; npm run test:visual`

Expected: Playwright 全部通过，1440、1672、2200、390 无横向溢出。

- [ ] **Step 4: 逐页视觉检查**

检查登录、首页、问数空态、历史空态、看板编辑器错误态、Dashboard、DataDashboard、
DataManagement 在 1440 / 1672 / 2200 / 390 的新截图。逐张确认：

- 移动导航可见且不遮挡内容。
- 移动登录首屏出现表单。
- 问数首屏出现空态和 composer。
- 不存在双滚动、被裁切 tab、过淡小链接、不可见焦点。
- 图表 canvas、摘要和数据 disclosure 完整。
- 不出现深色、霓虹、3D 糖果图标、营销海报或新增无关模块。

- [ ] **Step 5: 更新 QA 文档**

在 `design-qa.md` 追加本次 source、viewport、states、对比截图、测试命令和剩余限制。

- [ ] **Step 6: Final commit**

```powershell
git add tests/visual/xingshu-homepage.spec.ts tests/visual/xingshu-accessibility.spec.ts playwright.config.ts package.json package-lock.json design-qa.md
git commit -m "test: verify visual ux refinement"
```

## Completion gate

只有以下条件全部成立才算完成：

1. 规范中的 P0、P1、逐页精修、motion 和 reduced-motion 项均有对应实现与测试。
2. 18 张审计截图中指出的严重问题全部在同视口新截图中消失。
3. 移动端所有现有路由与账户操作可达。
4. 登录、问数、编辑器、上传/同步、配置和不可用功能状态不再误导。
5. Vitest、构建、Playwright、axe 与人工视觉检查全部通过。
6. 工作区干净，提交历史按任务保持可回退。
