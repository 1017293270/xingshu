# 公文写作集成说明

> 前端展示名为「报告智写」。代码里的路由 `/writing`、目录 `officialDocument`、CSS 前缀 `official-document-` 以及后端服务名 `official-document-service` 都保持不变，只有可见文案改了。

星数前端只负责模板库、模板结构、结构化草稿、智写对话、QueryAsset 绑定、PDF 预览和正式导出。DOCX 解析、模板编译、数据冻结、文件生成和持久化均由同级独立服务 `official-document-service` 承担。

## 当前链路

```text
/writing、/writing/templates、/writing/drafts
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

报告智写复用星数主侧栏，没有顶部二级导航（beta0.4）。写作首页和会话页不设页头；模板库、我的文稿与两个详情页只有细头部：返回链接、标题和本页动作。列表页返回写作首页，详情页返回各自列表；从写作台弹窗进入详情时带 `returnTo`，原路回到写作台。

写作首页标题为「公文模板化复刻」，输入框底部三个入口：

- 「+」：直接选文件作为参考资料。txt/md/csv/json 本地读取；DOCX 在浏览器本地解析（`src/services/officialDocumentDocxParser.ts`，复用依赖中 SheetJS 的 CFB 读取 zip），不需要先选模板，也不经过 Word 引擎；PDF 提示另存为 DOCX。单篇 10k、总计 30k 字的上限不变。
- 「公文模板」：弹出模板库，只允许使用已发布且编译文件存在的模板；可在弹窗内新建模板（上传结构 DOCX），分析完成后从「去发布」进入模板详情发布。`@` 引用仍然可用。
- 「内容复刻」：上传一份 DOCX，本地解析出章节框架后，会话页变为左右结构——左侧编辑内容框架（层级、标题、要点、原文摘录），右侧对话写作。生成时左侧框架直接作为已确认大纲，原文作为第一份参考资料；成稿格式仍由选定的公文模板决定。复刻是 `/writing/session` 上的一种状态，与普通写作共用会话存储、后台生成和完成提醒。

首页输入框下方显示「我的文稿」最近 6 篇，「更多」进入全部文稿。「草稿」统一称为「文稿」；生成结果仍需手动「保存到我的文稿」。

| 路由 | 页面 | 职责 |
| --- | --- | --- |
| `/writing` | 写作首页 | 输入写作要求、选模板或 `@` 引用；有进行中或已生成的会话时给提示条；展示我的文稿 |
| `/writing/session` | 写作会话 | 多轮写作、大纲确认、成稿预览与保存；内容复刻时为「框架 + 对话」左右结构 |
| `/writing/templates` | 模板库 | 新建模板（上传 `.docx`）、按状态筛选与搜索、轮询分析进度 |
| `/writing/templates/:templateId` | 模板结构 | 左侧可折叠大纲树 + 右侧按角色排版的模板原文；「开始写作」直接用分析推断出的角色映射建文稿；「校准结构」逐段改角色、正文区域起止与表格绑定槽位 |
| `/writing/drafts` | 我的文稿 | 按标题或格式模板搜索、按状态筛选、按更新时间排列；继续编辑、重命名、删除 |
| `/writing/drafts/:draftId` | 结构化起草 | 固定字段与正文节点、智写对话、QueryAsset 绑定、PDF 预览，以及 DOCX 与 PDF 正式导出 |

Word 引擎能力接口明确返回不可用（`ENGINE_UNAVAILABLE` 或 `WORD_ENGINE_UNAVAILABLE`）时，写作首页显示提示条，新建模板、下载与导出提前置灰并说明原因；写作与保存文稿不依赖引擎。

## 草稿保存

前端每 600ms 防抖提交完整 `fixedValues + blocks`，并携带 `expectedRevision`。后端返回新 revision 后更新本地基线；冲突或请求失败会显示“保存失败”，不会假装已保存。

编辑页另提供“保存草稿”按钮，立即提交待保存内容。显式保存与导出等待同一个在途保存任务；保存失败会向调用方抛错，停止导出。用户应确认“已保存”后再离开；当前尚未加入全应用 SPA 导航拦截。

草稿管理新增接口：`PUT /v1/drafts/{id}/title`，请求 `{title}`，trim 后非空、最长 255 个字符；`DELETE /v1/drafts/{id}`，成功返回 204。重命名、删除均在服务成功后更新共享列表缓存，失败保留原记录和弹窗输入。删除按空间与创建者校验，保留共享模板及文件对象，删除后的草稿与其历史导出链接不再可访问。草稿快照增加持久化 `updatedAt`，旧响应兼容原时间字段。上述后端新接口与数据库更新需发布公文服务后生效。

节点支持：

- 新增一级标题、二级标题、三级标题或正文。
- 删除、上移、下移。
- 切换角色和格式变体。
- 编辑标题、主送、附件说明、落款和日期等固定字段。

## 智写对话

草稿页右侧常驻「智写助手」（视口 < 1280px 时收起，点页头按钮浮出）。它复用 DataHub 的流式 chat 接口，通过 `chatMode: "writing"` 区分，会话 id 带 `writing-` 前缀 —— 与问表的 `ask-table-` 同构，只发给后端、不进全局模型选择器，也不会出现在问数的历史回放里。常量集中在 `src/services/dataHubWriting.ts`：**后端若把这个模式叫别的名字，改这一个文件即可。**

对话状态是按草稿隔离的组件本地状态（`useWritingChat`），不进 `useUiStore` —— 那里的 `analysisTurns` 是全局单会话的问数对话。回答生成完成后可以「插入到正文」，按空行拆成正文节点一次性追加，只触发一次自动保存。

`/writing` 的一键成稿复用同一流式接口，使用 `action: "REFERENCE_DRAFT"`。参考草稿只提供模板结构、标题层级与限量文风样本，旧固定字段、表格、图表、绑定和正文事实不会复制。模型以 `[[XS_FIXED:slot-id]]` 与 `[[XS_SECTION:section-id]]` 返回结构化结果；前端校验锚点后先保留临时成稿，通过 `/v1/drafts/:preview` 与 `/v1/drafts/:export` 浏览或下载，不创建草稿记录。只有用户点击“保存到草稿箱”时才复用现有创建草稿与内容保存接口。提交前先经写作大纲确认环（`/api/v1/chat/writing-content-analysis` 出章节与研究清单，可修改或跳过）；确认后由前端按清单自动执行问数/问知研究，结果作为 `writingContext.researchResults` 注入生成上下文，模型自身仍不发起检索，研究失败或事实不足处保留明确的待补充标记。

本轮产品分工约定：格式模板负责排版，本次大纲负责组织内容，草稿保存可继续编辑的正文。写作可直接从格式模板开始，不要求先有参考草稿；旧参考草稿入口保持兼容。第一版不引入独立写作方案库，在生成正文前确认本次大纲；除修改章节标题和删除章节外，每节可展开“调整写作思路”，修改写作目的与内容要点，这些修改会进入后续生成上下文。模板文件缺失导致创建或导出失败仍是独立的服务问题，本轮未部署或恢复这些文件。

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
- 智写对话依赖 DataHub 侧提供 `writing` 模式；公文服务自身仍不提供 AI 起草接口。
- 不支持多人协同、审批或复杂 Word 对象编辑。图表以 PNG 形式写入正文（前端研究环节生成、上限 3 张），不支持可编辑的原生 Office 图表对象。
