# 公文写作集成说明

星数前端只负责模板库、模板校准、结构化草稿、QueryAsset 绑定、PDF 预览和正式导出。DOCX 解析、模板编译、数据冻结、文件生成和持久化均由同级独立服务 `official-document-service` 承担。

## 当前链路

```text
/writing/templates、/writing/drafts
  → 同源 /api/official-document 网关
    → official-document-service
    → Syncfusion DocIO 34.1.33（DOCX 分析、编译、生成）
    → LibreOffice Headless（PDF 预览与正式导出）
    → analytics-service（QueryAsset）
    → MySQL official_document + /data/objects
```

生产模式固定使用线上 API。接口失败时页面显示真实错误，不会回退演示数据。

已登录用户可以在模板库上传 `.docx`、查看分析进度、校准角色映射并发布。网关 `GATEWAY_TEMPLATE_WRITE_POLICY` 使用 `authenticated`，不再把模板写入限制为系统管理员。

## 页面组成

公文写作是独立的全屏 Agent 应用，左侧导航轨只有“模板库”和“草稿箱”两个入口，列表页与详情页严格分离，`/writing` 重定向到 `/writing/templates`。

| 路由 | 页面 | 职责 |
| --- | --- | --- |
| `/writing/templates` | 模板库列表 | 上传 `.docx`、按状态筛选与搜索、轮询分析进度 |
| `/writing/templates/:templateId` | 模板校准 | 确认标题、主送、一级至三级标题、正文、附件、落款、日期和版记；设置正文区域起止位置以及表格绑定槽位 |
| `/writing/drafts` | 草稿箱列表 | 按状态筛选与搜索草稿，从模板库发起新建草稿 |
| `/writing/drafts/:draftId` | 结构化起草 | 固定字段与正文节点、QueryAsset 绑定、PDF 预览，以及 DOCX 与 PDF 正式导出 |

## 草稿保存

前端每 600ms 防抖提交完整 `fixedValues + blocks`，并携带 `expectedRevision`。后端返回新 revision 后更新本地基线；冲突或请求失败会显示“保存失败”，不会假装已保存。

节点支持：

- 新增一级标题、二级标题、三级标题或正文。
- 删除、上移、下移。
- 切换角色和格式变体。
- 编辑标题、主送、附件说明、落款和日期等固定字段。

## QueryAsset 绑定

绑定仅使用已经保存的 QueryAsset 和固定 QueryVersion：

- `SCALAR`：指定列，默认取第一行。
- `FACT_SUMMARY`：指定文字或数值列。
- `TABLE`：选择最多 10 列，冻结最多 50 行。

创建绑定后状态为 `STALE`，只有用户点击刷新才执行线上查询。刷新成功后页面展示 executionId 和 snapshotId。已冻结的 `ACTIVE` 绑定可转为普通文本（`MANUAL`），当前值保留在公文中且不能再自动刷新。存在 `STALE` 或 `SCHEMA_DRIFT` 绑定时禁止正式导出。

analytics 未提供 snapshotId 时，由公文服务生成 `preview-{uuid}` 本地快照标识；输出行按 `columnId` / `key` 双重映射。

## 环境变量

```text
VITE_OFFICIAL_DOCUMENT_API_BASE_URL=/api/official-document
VITE_OFFICIAL_DOCUMENT_API_MODE=gateway
VITE_OFFICIAL_DOCUMENT_PROXY_TARGET=
```

本地 Vite 始终把 `/api/official-document` 单独代理（写在通用 `/api` 之前），并去掉浏览器 `Origin` / `Referer`。公文 Java 服务 CORS 默认只允许 `http://localhost:5173`；若把 `http://127.0.0.1:517x` 原样转发给它，创建草稿等 POST 会变成 403 Forbidden。未配置 `VITE_OFFICIAL_DOCUMENT_PROXY_TARGET` 时，该前缀仍打到 DataHub 同源网关；要在本机直连公文网关时再设为例如 `http://127.0.0.1:8093`。

Syncfusion license、数据库凭据、服务间 HMAC 和 QueryAsset 内网地址都只存在于后端部署环境，不进入 Vite 构建产物。

## 当前能力与限制

- 后台 Word 引擎为 Syncfusion DocIO；缺少许可证时能力接口明确返回不可用。
- PDF 预览和正式 PDF 导出由同一公文服务容器中的 LibreOffice 生成。
- ONLYOFFICE 组件与接口代码保留用于回退，但 `/writing` 不加载编辑器、不创建会话。
- Aspose 适配器代码保留但生产不启用。
- 第一版不支持 AI 起草、多人协同、审批、图表写入或复杂 Word 对象编辑。
