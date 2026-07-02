# 星数正式前端工程化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前静态高保真原型迁移为可持续开发的 React/Vite/TypeScript 前端工程，并保留星数现有视觉规范。

**Architecture:** 使用纯前端 SPA 起步，后端通过 `src/services/` 适配外部业务系统。Ant Design v5 提供底层企业组件能力，星数自己的 token、主题适配和 `Xs*` 业务组件负责保持当前产品风格。

**Tech Stack:** React、TypeScript、Vite、React Router、Ant Design v5、Apache ECharts、TanStack Query、Zustand、Vitest、React Testing Library、Playwright。

---

## File Structure

- Create: `package.json`，定义正式前端依赖和脚本。
- Create: `vite.config.ts`，配置 Vite、React 和路径别名。
- Create: `tsconfig.json`，启用严格 TypeScript。
- Create: `src/app/App.tsx`，组织路由和应用 Provider。
- Create: `src/app/providers.tsx`，集中放置 `ConfigProvider`、`QueryClientProvider` 等全局 Provider。
- Create: `src/theme/xingshuTokens.ts`，沉淀星数视觉 token。
- Create: `src/theme/antdTheme.ts`，把星数 token 映射到 Ant Design 主题。
- Create: `src/styles/tokens.css`，保留 CSS 变量，确保视觉与当前静态原型一致。
- Create: `src/components/xs/`，沉淀星数业务组件。
- Create: `src/services/`，隔离后端系统对接。
- Create: `src/features/`，按业务域拆分页面能力。
- Create: `tests/visual/`，放置 Playwright 截图回归测试。

## Task 1: 初始化正式前端工程

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`

- [ ] **Step 1: Create package scripts and install dependencies**

Run:

```powershell
npm create vite@latest . -- --template react-ts
npm install antd @ant-design/x @tanstack/react-query echarts react-router-dom zustand
npm install -D @playwright/test @testing-library/react @testing-library/user-event vitest
```

Then edit `package.json` scripts to:

```json
{
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc -b && vite build",
    "preview": "vite preview --host 127.0.0.1",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:visual": "playwright test"
  }
}
```

Expected: `package.json` contains concrete installed semver ranges and `package-lock.json` pins the resolved versions. Commit both files together.

- [ ] **Step 2: Verify install**

Run: `npm install`

Expected: dependencies install without peer dependency errors.

- [ ] **Step 3: Verify dev server**

Run: `npm run dev`

Expected: Vite starts and exposes a local URL.

## Task 2: 建立星数主题系统

**Files:**
- Create: `src/theme/xingshuTokens.ts`
- Create: `src/theme/antdTheme.ts`
- Create: `src/styles/tokens.css`
- Modify: `src/app/providers.tsx`

- [ ] **Step 1: Define source tokens**

```ts
export const xingshuTokens = {
  colorBg: "#F3F8FF",
  colorBgSoft: "#EDF5FF",
  colorSurface: "#FFFFFF",
  colorBorder: "#DCE8FB",
  colorBorderStrong: "#C7D9F6",
  colorPrimary: "#1677FF",
  colorPrimaryStrong: "#2563EB",
  colorCyan: "#00C2FF",
  colorText: "#081A3A",
  colorTextSecondary: "#294469",
  colorTextTertiary: "#6B7F9D",
  radiusControl: 12,
  radiusCard: 14,
  shadowSoft: "0 10px 28px rgba(22, 119, 255, 0.08)",
  fontFamily: "Source Han Sans SC, Noto Sans SC, Microsoft YaHei, Arial, sans-serif"
} as const;
```

- [ ] **Step 2: Map tokens into Ant Design theme**

```ts
import type { ThemeConfig } from "antd";
import { xingshuTokens } from "./xingshuTokens";

export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: xingshuTokens.colorPrimary,
    colorBgLayout: xingshuTokens.colorBg,
    colorBgContainer: xingshuTokens.colorSurface,
    colorText: xingshuTokens.colorText,
    colorTextSecondary: xingshuTokens.colorTextSecondary,
    colorBorder: xingshuTokens.colorBorder,
    borderRadius: xingshuTokens.radiusControl,
    fontFamily: xingshuTokens.fontFamily
  }
};
```

- [ ] **Step 3: Verify visual tokens**

Run: `npm run dev` and inspect primary buttons, inputs, cards, and menus.

Expected: default Ant Design visual is visibly overridden by 星数 colors and radii.

## Task 3: 封装星数业务组件

**Files:**
- Create: `src/components/xs/XsShell.tsx`
- Create: `src/components/xs/XsSidebar.tsx`
- Create: `src/components/xs/XsCommandBox.tsx`
- Create: `src/components/xs/XsAppCard.tsx`
- Create: `src/components/xs/XsIconTile.tsx`
- Create: `src/components/xs/XsEChart.tsx`

- [ ] **Step 1: Create shell and sidebar first**

Build only layout primitives before migrating page content.

Expected: the shell reproduces white sidebar, ice-blue content background, and fixed navigation rhythm from the static prototype.

- [ ] **Step 2: Create command box and app card**

Build homepage components with the same 12px/14px radius rules as the reference screenshots.

Expected: homepage can be rebuilt without changing layout density.

- [ ] **Step 3: Create ECharts wrapper**

Expose a single `XsEChart` component that receives ECharts options and handles resize cleanup.

Expected: all chart pages import `XsEChart`; no chart-like UI uses static div bars.

## Task 4: 建立服务适配层

**Files:**
- Create: `src/services/httpClient.ts`
- Create: `src/services/agentService.ts`
- Create: `src/services/dashboardService.ts`
- Create: `src/services/dataAssetService.ts`
- Create: `src/services/mock/`

- [ ] **Step 1: Define typed service methods**

Do not call real systems from page components. Define functions such as `sendAgentMessage`, `listHistorySessions`, `getDashboardMetrics`, and `listKnowledgeBases`.

Expected: page code depends on typed service functions, not raw endpoints.

- [ ] **Step 2: Provide mock adapters**

Use current prototype data as mock data until external systems are available.

Expected: every page can render in development without a backend.

## Task 5: 页面迁移与视觉回归

**Files:**
- Create/Modify: `src/pages/HomePage.tsx`
- Create/Modify: `src/pages/AnalysisPage.tsx`
- Create/Modify: `src/pages/WritingPage.tsx`
- Create/Modify: `src/pages/TablePage.tsx`
- Create/Modify: `src/pages/DashboardPage.tsx`
- Create/Modify: `src/pages/HistoryPage.tsx`
- Create/Modify: `src/pages/DataDashboardPage.tsx`
- Create/Modify: `src/pages/DataManagementPage.tsx`
- Create: `tests/visual/xingshu-pages.spec.ts`

- [ ] **Step 1: Migrate one page at a time**

Order: homepage, analysis, writing, table, dashboard, history, data dashboard, data management.

Expected: each migrated page is independently runnable before starting the next.

- [ ] **Step 2: Add screenshot checks**

For each migrated page, capture 1440px, 1672px, 1920px or 2200px, and 390px mobile widths.

Expected: large screens do not look empty or overly narrow, and mobile text does not overlap.

- [ ] **Step 3: Keep charts ECharts-only**

Search after each dashboard-related migration:

```powershell
rg "bar-track|bar-fill|chart-image|svg chart|canvas fake" src
```

Expected: no static chart stand-ins remain.

## Self-Review

- Spec coverage: The plan covers frontend architecture, theme, component library adaptation, service boundary, page migration, chart rules, and screenshot QA.
- Placeholder scan: No unspecified implementation placeholders remain.
- Type consistency: Service, component, route, and theme names are consistent across tasks.
