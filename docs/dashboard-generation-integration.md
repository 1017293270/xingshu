# 问数生成大屏接入说明

看板工作区已经通过 Vue Island 内嵌到星数，不再依赖外部 iframe。

问数页面只负责在完成态提供入口，不负责拼装 Dashboard Schema。稳定接入点是：

```ts
import { prepareDashboardFromAskTurn } from "@/services/dashboardAskDataHandoffService";

const { editorPath } = prepareDashboardFromAskTurn(turn, {
  spaceId: currentSpaceId ?? undefined,
  sourceQueryId: stableResultId,
  dataMode: stableResultId ? "live" : "snapshot"
});

navigate(editorPath);
```

显示“生成大屏”的前置条件：

- `turn.status === "done"`
- `turn.tableResults.length > 0`

当前前端产品流：

1. 问数完成后，在“问数结果”右上角点击“生成大屏”。
2. 星数创建快照草稿并进入 `/dashboard-editor?draft=<id>` 全屏编辑器。
3. 编辑器可选择笔记本、Full HD、2K、4K或自定义画布尺寸，并通过 25% 至 150% 或“适应”控制工作倍率；点击“预览”会进入仅保留左上角返回按钮的纯全屏运行态。
4. 保存后有效草稿出现在 `/dashboard` 大屏列表；未添加组件的空白草稿、旧版首轮自动排版和固定经营 Demo 不再默认展示。
5. 列表点击“查看”进入 `/dashboard-view?dashboard=<id>`，浏览态只保留左上角返回按钮并等比铺满视口。

编辑器交互基线与原 `analytics-dashboard-` 工作台保持一致：顶部名称/状态/发布区、第二层编辑工具栏、分类组件库、画布标尺与网格、底部悬浮缩放器、组件选中浮层和缩放手柄，以及“基础 / 布局 / 数据 / 样式”属性页。星数仅替换为自身的浅冰蓝视觉 token 和问数数据模型，不再依赖原仓库运行时。

边界约束：

- 不要把 `toolResults`、SQL、DataHub Token 或 AI 供应商密钥传入看板。
- 没有稳定 `resultId/queryId` 时必须使用 `snapshot`；当前 `DataHubAskTurn` 本身不携带稳定查询引用。
- 第二版大屏规划器会清洗技术字段名、压缩长篇问数结论，并将首屏固定为“数据简报 + 关键指标 + 主图 + 明细”的可读层级；其余表格保留为数据绑定，不继续向首屏堆组件。
- 每个数据绑定的快照最多保留前 200 行，首屏最多 7 个组件。
- 保存与发布当前经过 `dashboardRepositoryService` 的版本化浏览器 Adapter；接真实网关时保持该接口，不让 Vue 组件直接请求后端。
