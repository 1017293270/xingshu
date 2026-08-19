# 星数前端

星数是面向企业的 Agent 应用入口，定位为“可信数据智能 / 企业智能中枢”。本仓库提供正式前端 SPA，覆盖企业问数、知识问答、文档检索、智能写作、智能制表、看板、云盘和数据资产等入口；业务后端由外部数据平台、Agent 编排系统和网关提供。

## Technology

- React 19、TypeScript 6、Vite 8
- React Router 7、Ant Design 5、Ant Design X
- TanStack Query、Zustand
- Apache ECharts
- React 主应用与看板工作室 Vue 组件
- Vitest、React Testing Library、Playwright、axe

## Repository map

- `src/app/`：路由、Provider、应用外壳、鉴权保护和错误边界。
- `src/pages/`：首页、问数、历史、制表、写作、看板、云盘、数据资产和登录等页面。
- `src/features/`：首页、看板、看板工作室和公文写作工作台等领域功能。
- `src/components/xs/`：星数业务组件。
- `src/services/`：HTTP、DataHub、Agent、看板、公文服务和 mock 等服务适配层。
- `src/assets/`：品牌、图标和页面视觉资产。
- `src/theme/`、`src/styles/`：品牌 token、Ant Design 主题与全局样式。
- `src/**/*.test.ts(x)`：Vitest 单元与组件测试。
- `tests/visual/`：Playwright 响应式、流程与无障碍测试。
- `docs/`：设计、实施计划和生产看板接入说明。
- `scripts/`：截图与局部检查辅助脚本。

## Local development

### Prerequisites

- Node.js `^20.19.0` 或 `>=22.12.0`（来自锁定的 Vite 运行要求）。
- npm。
- 对应的 DataHub/BFF 或获准使用的测试适配环境。

### Setup

```bash
npm ci
cp .env.example .env.local
```

按目标环境填写 `.env.local`，不要提交或公开真实地址、Token、密钥和身份信息。可用变量名见 `.env.example`。

### Run

```bash
npm run dev
```

开发服务器绑定 `127.0.0.1`，默认使用 Vite 端口 `5173`。运行交互测试前应显式配置 `VITE_DATAHUB_PROXY_TARGET` 或 `VITE_DATAHUB_BFF_PORT`，避免请求落到未经确认的后备目标。

## Verification

```bash
npm test
npm run build
npm run test:visual:typecheck
```

完整视觉与无障碍套件：

```bash
npm run test:visual
```

该命令会在 `127.0.0.1:4173` 启动隔离服务并运行 Chromium。执行前确认浏览器依赖、测试数据和外部服务边界；不要把历史 QA 记录当作当前工作树的测试结果。

## Environment

`.env.example` 当前声明：

- `VITE_DATAHUB_API_BASE_URL`
- `VITE_DATAHUB_PROXY_TARGET`
- `VITE_DATAHUB_BFF_PORT`
- `VITE_DATAHUB_APP_URL`
- `VITE_DATAHUB_KB_MANAGE_PATH`
- `VITE_DATAHUB_KB_DETAIL_PATH`
- `VITE_DATAHUB_UI_SAME_ORIGIN`
- `VITE_QUERY_ASSETS_ENABLED`
- `VITE_DASHBOARD_EDITOR_URL`
- `VITE_OFFICIAL_DOCUMENT_API_BASE_URL`
- `VITE_OFFICIAL_DOCUMENT_API_MODE`
- `VITE_OFFICIAL_DOCUMENT_PROXY_TARGET`

前端页面和组件不得直接实现后端协议细节；统一通过 `src/services/` 适配。

## Documentation

- `PROJECT.md`：当前分支、里程碑、下一步和风险。
- `AGENTS.md`：视觉硬约束、架构边界、命令和变更规则。
- `design-qa.md`：历史视觉与产品 QA 记录。
- `docs/dashboard-generation-integration.md`：问数收藏与生产看板接入契约。
- `docs/official-document-integration.md`：Syncfusion、结构化草稿、QueryAsset 与 PDF 导出的公文服务接入说明。
- `docs/superpowers/`：历史设计与实施计划。
