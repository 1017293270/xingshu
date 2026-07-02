# 星数服务适配层与 UI 状态层设计

## 背景

星数当前已经完成 React + TypeScript + Vite 工程骨架、Ant Design 主题适配、星数组件、页面迁移、ECharts 图表和 image2 业务图标接入。下一步正式开发的关键不是继续扩页面，而是把数据来源、请求边界和本地 UI 状态稳定下来，避免页面直接依赖 mock 数据或临时字段。

本设计遵循 `AGENTS.md` 的后端边界：当前阶段不在前端仓库实现业务后端，所有接口调用必须经过 `src/services/`，页面不得直接写 `fetch`、SSE、WebSocket 或临时接口细节。

## 目标

- 建立可替换的服务适配层，让页面通过领域 service 获取数据。
- 保留当前 mock 数据能力，使本地开发不依赖真实后端。
- 引入轻量 Zustand store 管理 UI 状态，例如侧栏、首页命令输入、推荐应用选择和发送状态。
- 沉淀共享 TypeScript 类型，减少页面里的 tuple 魔法值和隐式字段。
- 为后续真实系统接入预留 `VITE_API_BASE_URL`、`VITE_AGENT_BASE_URL` 和 adapter 方法名。

## 非目标

- 不实现业务后端。
- 不接入真实登录、权限、SSE 或 WebSocket。
- 不重做页面视觉，不新增与现有截图无关的功能模块。
- 不把所有页面一次性改成 TanStack Query；先完成服务边界和状态边界，后续按页面逐步 query 化。

## 推荐方案

采用“领域 service + mock adapter + UI store”的轻量方案：

- `src/types/` 放共享业务类型。
- `src/services/httpClient.ts` 统一环境变量、请求封装和错误对象。
- `src/services/*Service.ts` 暴露业务方法，页面只依赖这些方法。
- `src/services/mock/` 按领域拆分当前 mock 数据。
- `src/stores/uiStore.ts` 管理跨组件 UI 状态。

这个方案比直接在页面里继续 import mock 更稳，也比现在就完整抽象 repository/query 层更轻。它保留后续接真实接口的入口，但不会在接口未知时过度设计。

## 文件结构

新增：

```text
src/
  services/
    httpClient.ts
    agentService.ts
    tableService.ts
    writingService.ts
    dataAssetService.ts
    mock/
      historyMock.ts
      tableMock.ts
      writingMock.ts
      dashboardMock.ts
      dataAssetMock.ts
  stores/
    uiStore.ts
  types/
    agent.ts
    dashboard.ts
    dataAsset.ts
    history.ts
    table.ts
    writing.ts
```

保留并改造：

- `src/services/historyService.ts`
- `src/services/dashboardService.ts`
- `src/services/mock/xingshuData.ts`

其中 `xingshuData.ts` 可以先作为聚合导出兼容层，避免一次迁移打散太多页面。

## 服务边界

### HTTP Client

`httpClient.ts` 提供一个最小封装：

- `apiBaseUrl` 来自 `import.meta.env.VITE_API_BASE_URL`。
- `agentBaseUrl` 来自 `import.meta.env.VITE_AGENT_BASE_URL`。
- `requestJson<T>(path, options)` 负责拼接 URL、解析 JSON、抛出统一错误。
- `XingshuServiceError` 包含 `message`、`status`、`code` 和可选 `details`。

当前 mock service 不强制使用 `httpClient`，但真实 adapter 必须经过它。

### Agent Service

`agentService.ts` 先定义稳定方法：

- `sendAgentMessage(input: AgentMessageInput): Promise<AgentMessageResult>`
- `createConversation(): Promise<ConversationSummary>`

当前实现返回 mock 结果，不做真实流式输出。未来接 SSE 时，新增方法而不是让页面直接处理底层连接。

### History Service

`historyService.ts` 暴露：

- `listHistorySessions(): Promise<HistorySession[]>`
- `filterHistorySessions(filter: HistoryFilter): Promise<HistorySession[]>`

历史页从 service 获取 typed object，不再依赖 tuple 顺序。

### Table Service

`tableService.ts` 暴露：

- `listRecentTables(): Promise<TableTemplate[]>`
- `createTableFromPrompt(prompt: string): Promise<TableGenerationResult>`

当前 `createTableFromPrompt` 返回 mock 的“已接收”状态，用于后续交互测试。

### Writing Service

`writingService.ts` 暴露：

- `listWritingScenes(): Promise<WritingScene[]>`
- `listWritingDocuments(): Promise<WritingDocument[]>`
- `createWritingDraft(input: WritingDraftInput): Promise<WritingDraftResult>`

### Dashboard Service

`dashboardService.ts` 保留图表 options，但把返回结构类型化：

- `getDashboardChartOptions(): DashboardChartOptions`
- `getDataAssetChartOptions(): DataAssetChartOptions`

### Data Asset Service

`dataAssetService.ts` 暴露：

- `getDataAssetKpis(): Promise<DataAssetKpi[]>`
- `listKnowledgeBases(): Promise<KnowledgeBase[]>`
- `getKnowledgeBaseStats(): Promise<KnowledgeBaseStat[]>`

数据资产管理页和数据资产看板逐步改为依赖该 service。

## UI 状态层

`src/stores/uiStore.ts` 使用 Zustand，聚焦轻量本地状态：

- `isMoreOpen`
- `selectedAppId`
- `homeDraft`
- `sentStatus`
- actions: `toggleMore`、`selectApp`、`setHomeDraft`、`clearHomeDraft`、`setSentStatus`

首页和 shell 可先接入该 store。页面局部状态仍可用 `useState`，不会强制把所有状态搬进全局 store。

## 数据流

页面数据流保持简单：

```text
Page -> service method -> mock adapter / future httpClient -> typed result -> render
Page -> uiStore action -> store state -> render
```

页面不得直接 import `src/services/mock/*`。mock 只能被 service 引用。

## 错误处理

当前阶段错误处理以清晰边界为主：

- service 方法抛出 `XingshuServiceError` 或返回 typed mock 成功结果。
- 页面可在后续 query 化时显示 Ant Design `message`、`Alert` 或局部空状态。
- 不在本轮新增复杂错误 UI，避免影响已验收视觉。

## 测试策略

新增或调整以下测试：

- `httpClient`：验证 URL 拼接、JSON 解析、错误对象。
- `uiStore`：验证选择应用、草稿更新、新建对话清理状态。
- service：验证 mock adapter 返回 typed data，而不是 tuple 顺序。
- 页面：保留现有 Vitest 和 Playwright 视觉冒烟。

完成后运行：

```powershell
npm test
npm run build
npm run test:visual
```

## 实施顺序

1. 新增共享类型。
2. 拆分 mock 数据，并保留兼容导出。
3. 新增 `httpClient` 和领域 service。
4. 新增 `uiStore`，先接入首页和 shell。
5. 逐步把历史、制表、写作、数据资产页面从 tuple 数据迁移到 typed service。
6. 补测试并跑全量验证。

## 自查

- 无未定项：所有新增文件、方法和职责都有明确名称。
- 范围可控：本轮只做前端服务边界和 UI 状态，不接真实后端。
- 与项目约束一致：页面不直接请求后端，不绕过 `src/services/`。
- 视觉风险低：不重做布局，不新增功能模块。
