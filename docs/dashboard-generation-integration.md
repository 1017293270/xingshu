# 收藏问数与生产看板接入说明

看板已改为由服务端 `analytics-service` 持久化，浏览器仓库只保留为旧数据的只读导入适配器。生产环境不会把查询结果行、SQL 或看板草稿写入 `localStorage`。

## 问数产物与收藏

问数成功后，`ai-service` 在 SSE 中返回：

```ts
type AskArtifactRef = {
  askRunId: string;
  resolvedQuestion: string;
  canFavorite: boolean;
};
```

“收藏问数”只提交 `askRunId` 和可选名称：

```ts
import { favoriteAskArtifact } from "@/services/queryAssetService";

await favoriteAskArtifact({ askRunId, resolvedQuestion, canFavorite: true }, name);
```

`analytics-service` 会从 `ai-service` 内部接口读取权威查询产物，生成私有 `QueryAsset` 和不可变的首个 `QueryVersion`。浏览器不提交可执行 SQL。

## 看板生成与编辑

当前产品流：

1. 问数完成后先点击“收藏问数”，将权威查询产物保存为查询资产。
2. 在“我的看板”新建或打开服务端看板草稿，再从编辑器的“收藏问数”资源面板选择资产生成模块。
3. 资源面板支持搜索、个人/空间筛选、结果预览和参数填写。
4. 一个问题可以生成多个组件，但组件属于同一个模块并共享查询资产、固定版本、参数和 `outputKey`。
5. 保存使用 `revision` 乐观锁；发布生成不可变版本并固定所有查询版本引用。
6. `/dashboard-view?dashboard=<id>` 只读取当前登录人权限上下文中的实时快照。
7. 查询资产默认仅自己可用，可在资源面板显式共享到空间；看板也可明确选择“仅自己/空间可用”，空间成员只能读取已发布版本，不能读取创建者草稿。

问数结果区的“生成大屏”快捷入口当前已移除。该入口曾跨过资源选择直接组装编辑器草稿，在新旧看板 Schema 混用时可能读取不存在的 `scaleMode`；恢复前必须统一走服务端草稿和模块绑定契约。

React 页面通过 TanStack Query 调用：

- `src/services/queryAssetService.ts`
- `src/services/dashboardAnalyticsService.ts`
- `src/services/dashboardModuleService.ts`

Vue Island 只接收 React 注入的异步回调，不直接请求后端。

## 数据绑定规则

- 模块必须保存 `queryAssetId`、`queryVersionId`、`outputKey`、参数和刷新策略。
- 输出使用稳定 `outputKey`，字段绑定使用稳定 `columnId`；`dimensionKey/metricKeys` 仅作为当前渲染键派生值。
- Dashboard Schema 只保存结构与绑定，不保存真实结果行；数据行来自服务端压缩快照。
- “刷新数据”执行固定版本；“重新问数”只创建候选版本，确认字段差异并晋升后，草稿模块才可显式升级。
- 候选版本出现多个输出或原 `outputKey` 不再存在时，必须显式选择目标输出，再完成 `columnId` 映射。
- 标题由完整问题、指标和维度生成，不存在固定“社区咨询数 TOP 5”默认标题。

## AI 排版边界

模型只接收组件 ID、类别、语义角色、尺寸约束、分组、重要级和锁定状态，只返回 `LayoutIntent`。本地求解器负责像素布局，并验证锁定组件原位、不重叠、不越界和最小尺寸。模型不可用或结果非法时自动使用本地整齐排版；应用排版只产生一条撤销历史。

## 图表边界

ECharts 容器、渲染器和卡片内容区均强制 `min-width: 0`、`min-height: 0` 和边界裁切，并通过 `ResizeObserver` 在拖拽、缩放、AI 重排和屏幕变化后重算尺寸。Playwright 会在 1440、1672、2200 和移动端断言 ECharts DOM 与 Canvas 均未越出模块。

## 旧看板迁移

检测到旧本地记录时只提示“导入为静态看板”。用户确认后，旧数据上传为不可刷新的 `LEGACY_SNAPSHOT`；已导入记录通过 `legacySourceId` 幂等识别。旧匿名分享令牌不会升级为实时链接。

## 改造前历史问数兼容

历史会话可能已经有真实表格、Cube Query 和 SQL，但生成时间早于 `askRunId` 契约。对于这类已完成问数：

1. Presenter 保留服务端 SSE/历史事件中的 `sessionId` 与 `chatId`。
2. 用户点击“收藏问数”时，前端先调用 `ensureAskArtifact(sessionId, chatId)`。
3. ai-service 校验当前用户拥有该会话，并只从服务端持久化消息与事件补建权威产物。
4. 补建成功后继续走正常的幂等收藏；看板模块随后从编辑器资源面板绑定该资产和固定版本。

浏览器不会提交历史 SQL、数据源 ID 或结果行。没有完成事件、没有结构化查询或服务端历史不完整时，会明确提示重新问数，而不是继续显示笼统的“查询产物尚未就绪”。
