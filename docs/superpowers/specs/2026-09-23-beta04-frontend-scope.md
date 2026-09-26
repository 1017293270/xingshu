# beta0.4 前端范围拆解（只改 xingshu）

- 需求来源：`【beta0.4】需求范围（进一步提高可用性）.md`（用户本机 `~/Downloads/`，含 9 张截图）
- 拆解日期：2026-09-23；范围约定：本版只改前端 xingshu，后端能力缺口记录在本文「后端需求」一节
- 核对基线：xingshu `wzx/dev` @ d7b432c；后端按本机源码核对——DataHub 各服务 `wzx/gamma-integration`
  （ai-service 8253000、bff 4e57f47、dps 96def6e、cube ba7eadd），analytics-service `feat/beta0.3-range` @ 5ee1ba0，
  official-document-service（无 git）。本机后端分支与线上部署版本可能有出入

## 总览

| # | 需求 | 类别 | 状态 |
|---|---|---|---|
| 一① | 智能制表只保留「我的表格」 | 纯前端 | 已完成 |
| 一② | 制表会话标题用第一句话或 AI 总结 | 前端修 bug；AI 标题缺后端 | 第一句话已完成；AI 标题待后端 |
| 一③ | 存为模板时 AI 生成名称与提示词 | 缺后端；前端先做上下文合成默认值 | 上下文合成已完成；AI 生成待后端 |
| 二① | 收藏问题与答案，看板数据可用 | 前端缓解；根治缺后端 | 前端缓解已完成；根治待后端 |
| 二② | 看板可删除 | 纯前端（软删除） | 已完成 |
| 三① | 申请延续 Word 引擎 | 非前端（许可证） | 前端提示已完成；许可证待运维 |
| 三② | 去掉顶部二级导航 | 纯前端 | 已完成 |
| 三③ | 输入框底部「+ / 公文模板 / 内容复刻」 | 纯前端（内容复刻按框架复刻） | 已完成 |
| 三④ | 「草稿」即「我的文稿」，更多跳全部文稿 | 纯前端 | 已完成 |
| 四 | 数据标注 / 建联 / 语义问题 | 基本非前端；前端可做管理员入口 | 管理员入口已完成；审核机制待后端 |
| 五① | 问数超过 30 秒 | 后端为主 | 不在本轮 |
| 五② | 可信溯源句 | 前端改写；数据源名等缺后端 | 前端已完成；数据源名等待后端 |
| 五③ | 历史对话分类错误 | 前端能修新会话；旧会话与编排缺后端 | 新会话与本机记录已完成；后端字段待补 |
| 五④ | 首页输入框居中 | 纯前端 | 已完成 |
| 六 | 记忆层 | 前端面板；存储、总结、注入全缺后端 | 本版不做（等后端） |

## 一、智能制表

**① 只保留「我的表格」。** 两个页签渲染同一个查询 `listRecentTables`（`src/pages/TablePage.tsx:110`），
列表是制表会话而不是结果表。「复制制表要求」按钮只在「最近制表」行上；列表在前端截到 8 条
（`src/services/dataHubAskTable.ts:8`），成为唯一列表后不够用。后端另有分页接口 `GET /api/ai/ask-table/history`
（带 tableCount/status），前端尚未使用。

**② 会话标题。** 页头取最后一轮提问（`src/features/tableGeneration/TableSessionView.tsx:81`），这是 bug。
后端会话标题在建会话时取第一条用户消息（超 50 字截断，`ChatTitleResolverUtils`），改名接口
`POST /api/v1/chat/sessions/rename` 已有；AI 总结标题没有接口，`/ai/internal/llm/generate` 被 BFF 拦截。

**③ 存为模板。** 默认值直接取当前轮提问（`TableSessionView.tsx:407-413`）。前端已有全部上下文：各轮提问、
澄清选择、结果表列。保存接口 `POST /api/v1/table-templates {name≤100, prompt, structureJson}` 不需要改；
AI 生成名称与提示词缺后端接口。弹窗在入参变化时整体重置（`TableTemplateModal.tsx:35-40`），接异步建议前要防覆盖。

## 二、我的看板

**① 收藏与看板数据。** 收藏只提交 `{askRunId, name}`（`src/services/queryAssetService.ts`），
analytics 存下整次问数的全部中间查询（含探查与 0 行结果），回答文本和「答案来自哪条查询」都没有记录。
设计器按「行数 × 列数」挑最丰富的结果（`src/features/dashboardStudio/vue/DashboardDesignerApp.vue:1412`），
与答案相反；KPI 取首行首个数值列。表头成为「表描述 + 字段名」是 ai-service `AskArtifactService.parseTable`
取了 Cube 全称 title（Cube 约定为「cube 标题 + 空格 + 成员短标题」）而非 shortTitle。

另查明：看板刷新从不重查，analytics `QueryAssetService.outputForRuntime` 只回放收藏时存的行并把更新时间记为当前时间；
`/reask` 回 501；前端调用的 `/modules/{id}/upgrade`、`/modules/{id}/schedule`、`/layout-plan` 后端不存在；
设计器单模块刷新把 bindingId 当 moduleId 传（`DashboardDesignerApp.vue:1517`），后端按 moduleId 过滤，刷新落空。

**② 删除。** 只有归档 `POST /api/analytics/dashboards/{id}/archive`（仅作者、不可恢复），列表含他人共享看板，
非作者归档得到 404「看板不存在」。`DashboardArchiveDialog` 注释写明当时刻意不把归档叫删除；
后端 `DashboardRecord` 已带 `ownerUserId`（analytics 5ee1ba0）。

## 三、报告智写

**① Word 引擎。** Syncfusion 试用许可证过期导致导出、预览、模板编译返回 503 `ENGINE_UNAVAILABLE`；
续期是运维与许可证动作。前端每次都拉引擎状态但从不展示，`WORD_ENGINE_UNAVAILABLE` 错误码也未映射。

**② 二级导航。** 顶栏 `公文导航`（公文写作 / 格式模板 / 草稿管理，`OfficialDocumentAppShell.tsx:108-116`）
同时是各页动作按钮的 portal 宿主（模板库「上传结构 DOCX」、草稿页「新建草稿」、详情页按钮），去导航时要把动作搬回页面。

**③ 底部三个按钮。** 现状「+」是三项下拉（上传参考资料 / 上传结构 DOCX / 模板库），没有「公文模板」「内容复刻」和麦克风。
- 「+」：文本类文件本地读取；DOCX 必须先选模板再走内容方案抽取；PDF 不支持。
  依赖里的 `xlsx`（SheetJS 0.18.5，已按需加载）自带 `CFB` zip 读取，实测能在浏览器解析 DOCX 段落，可不依赖模板和 Word 引擎。
- 「公文模板」：`TemplateGallery` 已有，从 @ 与「+」进入；发布要进模板详情页；后端没有模板删除与重命名。
- 「内容复刻」：全新。可复用上传弹窗、内容方案管线（需已发布模板，否则 409 `STRUCTURE_NOT_PUBLISHED`）、
  `ContentProfileWorkspace` 大纲编辑器、草稿页「编辑器 + 对话」布局；需先定义「复刻」的范围。

**④ 我的文稿。** 首页当前没有文稿区；`GET /v1/drafts` 已返回当前用户文稿（无分页）；「更多」目标 `/writing/drafts`。
生成结果需手动「保存到草稿箱」才成为文稿。

## 四、数据标注、建联与语义

星数没有标注、建联、语义界面；这些在 DataHub 后台 `/platform/datasources/:id/{tables,fields,relation,semantic}`，
仅空间管理员可用。星数「数据资产管理」中数据源 / 数据表 / 数据接口 / 指标管理为置灰占位（`src/pages/DataManagementPage.tsx:24-30`），
跳转能力 `openDataHubUrl` 已有（`src/services/dataHubKnowledgeApp.ts`）。

「人工确认必不可少」前端无法保证：表与字段标注没有审核状态，重跑小智会覆盖人工修改；语义模型生成即部署，
模型标题在语义阶段被重新生成（「项目运营分析表 / 项目主表」叫法不一致的可能来源）。

## 五、其他优化

**① 速度。** 流开始前前端不发额外请求；「查询过程 · N 秒」按服务端时间戳计算，是后端 Agent 循环耗时。
前端次要项：每 50ms 一批事件全量重算派生数据；结束后自动出图。

**② 可信溯源。** 截图中的首句由模型生成，后端 prompt 要求「直接结果 + 一句简短说明」且不写内部表名。
前端已有确定性「查询依据」句（`src/services/dataHubAnswerPreamble.ts:27`），显示在答案下方，
但缺数据源名与表中文名时返回空串；问数模式不再调用数据源选择子智能体，table 事件只有数字 datasourceId。
可用字段：筛选（字段、操作符、值）、排序、limit、字段中文名（依赖语义层 title）；缺：数据源名、表业务名、度量聚合类型。

**③ 历史分类。** 会话列表接口不返回模式，前端兜底为 `ask`（`src/services/historyService.ts:98`，
eb0d097 起），全部显示「查数据」。直接退回标题关键词推断会把「销售人员签约合同金额排名」这类问数问题判成查知识。
首页默认编排模式，真实类别取决于编排实际调用的子智能体，只在该会话事件里（`subagent_exposed.agentId`）。

**④ 首页居中。** 现设计刻意一屏放下问候语、输入框与 6 张卡（`src/features/home/home.css:258`），
视觉用例锁定 720 高屏最后一张卡不出屏；新需求要求输入框位于视口中线、推荐应用下移可滚动，模式切换时位置不跳。

## 六、记忆层

前后端均无记忆功能；ai-service 所用 AgentScope Harness 自带记忆，但对业务智能体关闭（`AgentScopeRuntimeSupport`）。
记忆必须服务端注入：`ChatRequest` 忽略未知字段，拼进 message 会污染历史与会话标题。
口语字典已有 `/api/v1/glossary`（空间管理员专用，注入问数、问表、编排、问知四个智能体）；指标定义在语义层且带可执行 SQL，
记忆只能替代说法与同义词。前端可做「记忆与进化」面板（开关、重置、编辑、导入，三类记忆），入口放头像菜单，组织规则仅管理员可编辑。

## 决定与默认取舍

用户 2026-09-23 拍板：

- 「内容复刻」复刻内容框架：DOCX 在浏览器本地解析出章节框架，左侧编辑框架、右侧对话写作，原文作参考资料；出 Word 仍套用选定的公文模板
- 记忆层本版前端不做，等后端接口确定
- 溯源句放在回答末尾，与问知来源行位置一致；只改答案层面的出处句，「查询过程」面板保持 2026-09-06 的人话散文写法
- 「+」本版不支持 PDF，提示另存为 DOCX

主会话按「只改前端」默认处理，用户可推翻：

- 看板删除按软删除实现（后端只有不可恢复的归档），仅作者本人可见删除入口
- 看板实时重查依赖后端，本轮不做；前端只修单模块刷新传错 id 的 bug
- 「草稿」全局改称「文稿」；生成结果仍需手动保存到「我的文稿」
- 编排会话用到多种子智能体时显示多个类别，页签命中任一即显示；类别未知的旧会话不打标签
- 数据标注审核在星数只做管理员跳转入口，不做原生页面
- 首页标题按参考图改为「公文模板化复刻」

开发分支：`wzx/dev`，用户 2026-09-23 确认已切为 beta0.4。

## 后端需求

- ai-service：会话标题与模板名称、提示词的 AI 总结接口；会话列表返回 chatMode 与实际子智能体；
  问数 table 事件补数据源名、表业务名、度量聚合类型；问数产物记录最终答案及其对应查询；`parseTable` 改用 shortTitle；记忆层存储、总结任务与注入
- analytics-service：收藏保存答案；看板刷新重查（如需要）；硬删除（如需要）；补齐或下线 upgrade、schedule、layout-plan
- official-document-service：免模板的 DOCX 抽取与大纲；模板删除与重命名
- dps / cube：标注审核状态；小智重跑不覆盖人工修改；语义模型草稿态与模型标题可编辑
- 安全：dps `POST /datasources/annotations/{annotationId}/update` 按 id 更新、未校验所属空间，疑似可跨空间改标注，待后端核实

## 实施记录

2026-09-23 至 09-26 按六个切片实施，基于 `wzx/dev` @ d7b432c，合回工作区后尚未提交。

### 各切片改动

- **智能制表**：`TablePage.tsx` 只剩「我的表格」「表格模板」，默认我的表格；列表先显示 10 条，其余「展开全部 N 条」；「复制制表要求」移到我的表格行上；`dataHubAskTable.ts` 去掉 8 条上限。
  会话标题取第一轮提问的首行，依次退回启动提示、后端标题、「新制表」（`formatAskTableSessionTitle`）；会话菜单最多 12 条，其余「查看全部 N 个制表会话」。
  存为模板时 `suggestTableTemplateDraft` 在本地合成默认值：名称取第一问去掉客套前缀（约 30 字），提示词为第一问 +「已确认：」澄清选择 +「补充要求：」后续各轮。接口按 Promise 设计，后端出 AI 接口后替换实现即可。弹窗在建议返回前显示生成中，用户已改的字段不被覆盖。
- **我的看板**：
  - 新增 `core/dashboardAnswerOutputs.ts`，按问题形状挑答案输出：单值问题优先单行数值结果；明细、分组、排行、趋势问题优先多行结果；其余取最后一个非空结果；0 行结果垫底。KPI 指标按问题中出现的顺序排。
  - 新增 `core/dashboardColumnLabels.ts`，把 Cube 全称列名清洗为短业务名，完整原文只作悬浮提示。
  - 单模块刷新改传 moduleId。刷新、升级、定时入口不展示，页头显示「数据截至」。
  - 0 行的单值问题显示「暂无数据」，不再显示 0。KPI 带单位后缀。
  - 删除：新增 `DashboardSwitcher.tsx`；删除入口仅作者本人可见，分布在切换器、齿轮菜单和广场卡片菜单；弹窗写明「删除后无法恢复」，实际调用归档。
- **报告智写**：
  - 去掉顶部二级导航，模板库、我的文稿与两个详情页改为细头部（返回链接 + h1 标题 + 本页动作）。从写作台进详情时带 `returnTo` 原路返回。
  - 首页标题「公文模板化复刻」，输入框底部为「+ / 公文模板 / 内容复刻 / 麦克风」：
    - 「+」在浏览器本地解析 DOCX（`officialDocumentDocxParser.ts`，复用 SheetJS CFB，不加依赖），PDF 提示另存为 DOCX。
    - 「公文模板」弹窗内可新建模板。
    - 「内容复刻」是 `/writing/session` 的一种状态：左侧编辑框架（`ReplicateFrameworkPanel.tsx`、`replicateFramework.ts`），右侧对话。
  - 首页「我的文稿」显示最近 6 篇，「更多」进全部文稿。
  - 全局「草稿」改称「文稿」，包括「返回格式模板」→「返回模板库」、「上传结构 DOCX」→「新建模板」。
  - Word 引擎不可用时，首页显示提示条，新建模板、下载、导出提前置灰并说明原因（`officialDocumentEngine.ts`）。
- **数据资产管理**：数据源管理、数据表管理、指标管理三个页签解除置灰，各放一块「核对」说明（首次构建后要人工核对什么），附跳转 DataHub 数据源、指标目录、口语词典的按钮。按钮只对空间管理员可用（`useSpaceAdmin`），其他成员看到「需要空间管理员权限」的说明。路径由 `.env.example` 新增的 `VITE_DATAHUB_DATASOURCE_PATH`、`VITE_DATAHUB_METRICS_PATH`、`VITE_DATAHUB_GLOSSARY_PATH` 配置。数据接口管理 DataHub 无对应页面，仍为占位。
- **溯源与历史**：
  - 查询依据句改为一句人话，例如「根据“X”数据源“Y”数据表，对“字段”按“小于 1.05”筛选，按“区域”分组，对“销售额（万元）”求和……取前 10 条。」，放在回答末尾。缺数据源名、表名时省略对应分句，不再整句为空。
  - 历史分类新增 `historySessionKind.ts`：先按会话 id 前缀（`ask-data-`、`ask-knowledge-`、`document-lookup-`、`agent-`）判断，再读本机记录的实际子智能体（localStorage `xingshu_history_session_kinds`，上限 300）。编排会话可有多个类别，类别未知的会话不打标签。
- **首页居中**：去掉一屏压缩的 vh 缩放，输入框中线对齐视口中线（`--home-anchor`）。`useCommandBoxHeight` 用 ResizeObserver 回写输入框高度，模式切换、状态条出现时位置不跳，推荐应用在下方可滚动。

### 实施中的默认取舍（用户可推翻）

- 制表会话标题取第一问首行，不取整段；存为模板的名称最长约 30 字
- 首页我的文稿显示 6 篇（两列三行）
- 历史分类识别不了的旧会话不打标签，不按标题关键词猜
- 溯源句字段名依次取语义层短标题、字段注释、原始列名，不因缺中文名省略该分句
- 看板单值问题 0 行时显示「暂无数据」，区分真实的 0

### 遗留与待后端

- 制表 AI 标题、模板名称与提示词 AI 生成：等 ai-service 接口，前端替换 `suggestTableTemplateDraft` 实现即可
- 看板答案输出为前端推断，根治需收藏时记录答案对应查询；看板实时重查依赖 analytics-service
- Word 引擎许可证续期（运维）；模板删除与重命名缺后端
- 历史分类的旧会话与其他设备的编排会话，需要会话列表返回 chatMode 与实际子智能体
- 溯源句的数据源名、表业务名、聚合类型需问数 table 事件补字段
- 数据标注审核状态、小智重跑不覆盖人工修改（dps / cube）；记忆层整体未做
- 已知存量问题（本轮未改）：非作者仍能看到看板「编辑」「版本回滚」；`useSpaceAdmin` 把没有空间超级管理员角色的系统管理员也算作管理员，DataHub 会把他们弹回；390 宽我的看板页头有一个多余的「·」

### 验证

2026-09-26 在合并后的主工作区复跑。浏览器与截图均用隔离夹具，代理指向死端口 `127.0.0.1:9`，未连真实后端：

- `npm run verify` 通过：
  - ESLint 0 error（28 个存量 warning）
  - Vitest 177 个文件、1717 项通过
  - 构建通过；包体主入口 122.0KB / 预算 220KB，图表运行时 237.0KB / 预算 250KB
  - 视觉类型检查通过
- 全量 Playwright 194 个用例，189 过、5 失败：`datahub-chat-flows` 4 个、`datahub-readable-chart` 1 个。这 5 个在基线 d7b432c 上同样失败，与本轮无关。
- 去掉二级导航后，细头部标题改成 h1，曾引出两个公文用例回归：
  - 模板详情页从 h1 直接跳到 h4，axe 报标题层级跳级；
  - ≤760px 时 h1 被 `display: none` 隐藏，页面没有主标题。

  已修复：分区标题统一改为 h2；窄屏下 h1 只做视觉隐藏、保留在无障碍树中，页面名由移动端顶栏显示。改标签前后，计算样式和 26 张截图比对一致。
- 首页居中：1366×720、1440、1672、1920、2200、390 六档下，编排、问数两种模式的命令框中心与视口中线偏差均为 0px，切换模式位移 0px，无横向溢出。
- 截图证据：`outputs/beta04-final/`（`home/`、`ui/`、`history/`）。
