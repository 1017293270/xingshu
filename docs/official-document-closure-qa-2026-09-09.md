# 公文闭环修复验收（2026-09-09 UTC）

承接任务“深审公文模块闭环缺口”（`01a083b9-885a-7bc1-a6d5-3144e596acd2`）。用户已排除网关权限问题，要求完成剩余 11 项修复。本轮完成本地代码、集成回归与实际文件/数据库验收；未提交、推送或部署。

## 11 项修复结果

| 原问题 | 最终行为与证据 |
| --- | --- |
| 回填覆盖最新输入 | 正文回填与键盘输入共用同步提交及串行保存；等待保存期间的新输入保留。`StructuredDraftEditor.test.tsx` 回归通过。 |
| 导出丢原生表格并误报保真 | 生成保留正文中的原生表格和图片；保真验证检查真实静态对象。实际 DOCX/PDF 保留唯一表格文本与图片，主动删表的候选被拒绝。 |
| 成稿保存后丢失方案与材料 | 写作要求、原材料、确认大纲进入内容方案并绑定草稿，研究结果随正文保存。刷新后再次智写仍携带原方案、来源、研究结果和当前正文；保存失败再刷新重试不重复创建方案或草稿。 |
| 摘要与表格使用不同执行数据 | 旧问数摘要不再冒充新冻结数据；摘要说明、表格、图表及来源统一依据本次冻结执行。 |
| 刷新失败清空有效快照 | 后端保留上次值与来源。前端透传 `resolvedValue`；有非空快照编号且值非 null 时，可将失败绑定转为普通文本，`0` 和 `false` 也是有效值。转换失败保留原状态并支持重试，无有效快照则不能转换。 |
| outputKey 缺失时选错数据 | 精确匹配查询输出，缺失时报告结构变化，不再回退到第一份输出。 |
| 并发刷新覆盖解绑 | 绑定写入使用事务、草稿行锁和绑定快照比较；通用 `saveDraft` 不覆盖已有绑定。真实 MySQL 验证旧刷新无法撤销另一线程已提交的解绑。 |
| 轮询重置模板校准 | 当前模板组件标识保持稳定，未发布的本地校准保留。浏览器覆盖真实 2 秒轮询。 |
| 发布后沿用旧映射 | 发布响应中的新版本映射写入缓存，立即继续操作使用新结构。 |
| 空查询被记作研究成功 | 问数 0 行标记为 `NO_RESULT`，保留待补充状态，不生成空图。 |
| 长材料导致生成超限 | 两个上下文入口共享 95,000 字符预算，按完整句/行节选，保留协议锚点和当前要求；原对象不修改，并提示本次采用节选。 |

额外修正了导出检查面板的状态提示：顶部“可导出 / 暂不可导出”与实际导出条件一致。异常绑定恢复后提示同步更新。制表的 3 项旧测试已对齐现有界面，保留重复提交抑制、空结果、失败提示与恢复操作的验证，没有修改制表产品代码。

## 最终验证

| 检查 | 结果 |
| --- | --- |
| 前端 `npm run verify` | 通过：ESLint、全量 163 文件 / 1489 测试、TypeScript、Vite 构建、包体预算、Playwright 类型检查。 |
| 公文浏览器全套 | 12 文件 / 26 测试通过；导出状态提示修正后，相关绑定专项另行 2/2 通过。 |
| 成稿保存续写 | 2/2 浏览器流程通过，含正常保存与正文保存失败、刷新后重试。 |
| 最终前端定向回归 | 草稿详情、服务适配器、制表流程 3 文件 / 39 测试通过。 |
| 公文后端 `./gradlew --offline test bootJar` | 107 测试，0 失败、0 错误、0 跳过，构建成功。 |
| 真实 MySQL 并发 | 官方 MySQL 8.4.8 临时实例、实际 JDBC 仓储：10 轮同 revision 保存均仅一个成功；解绑后的旧刷新冲突；旧编辑快照不覆盖当前绑定。 |
| 实际 Word/PDF | 真实 Syncfusion 编译/生成 DOCX，真实 LibreOffice 渲染 PDF；1 页可读，表格文本保留，图片字节一致，删除表格的保真反例失败。 |
| 补丁与已有改动 | `git diff --check` 通过。开始时 45 个已有修改文件做了哈希与副本记录，无关改动保留。 |

前端检查仍有既有 ESLint 警告、jsdom 伪元素提示和大分块提示，均未导致检查失败。以上计数按各自测试集合记录，不相加为独立用例总数。

## 视觉与环境

- 保存后草稿与绑定恢复界面覆盖 1440、1672、1920、2200、390 宽度；已查看桌面和手机截图，正文、材料入口、恢复操作和状态提示可读。手机操作区换行，桌面操作区沿用现有横向滚动。
- 浏览器使用真实 React 页面及服务适配器，业务 HTTP 由确定性 fixture 拦截。Vite 后端代理显式指向本机未监听端口，不复用用户已有服务。
- MySQL 使用任务临时目录中的官方便携程序、新数据库和合成身份，仅监听回环地址；验证结束已正常停止。没有接触业务数据库或全局服务。
- Word 测试使用现有测试构造器，产物含 Syncfusion 试用水印。已验证实际文件通路；正式许可证及线上业务环境不属于此次本地通过结论。
- 公文后端权威源码在同级 `official-document-service`，该目录没有 Git 元数据；已保留源码快照及从原修复前版本到最终版本的完整补丁。

## 可查阅的证据

证据归档在 `outputs/official-document-closure-20260909/`，便携 MySQL 程序及数据库目录没有复制进仓库。

- [前端完整检查日志](../outputs/official-document-closure-20260909/frontend-verify.log)
- [浏览器验收说明](../outputs/official-document-closure-20260909/browser-final/QA.md)、[全套日志](../outputs/official-document-closure-20260909/browser-final/all-official-document.log)
- 最新截图：[保存后草稿（桌面）](../outputs/official-document-closure-20260909/screenshots/compose/draft-reloaded-1672.png)、[保存后草稿（手机）](../outputs/official-document-closure-20260909/screenshots/compose/draft-reloaded-390.png)、[失败快照可恢复（手机）](../outputs/official-document-closure-20260909/screenshots/bindings/binding-recoverable-390.png)、[转换后可导出（桌面）](../outputs/official-document-closure-20260909/screenshots/bindings/binding-manual-reloaded-1440.png)
- [后端结果](../outputs/official-document-closure-20260909/backend/RESULT.md)、[107 项统计](../outputs/official-document-closure-20260909/backend/full-statistics.json)、[完整后端补丁](../outputs/official-document-closure-20260909/backend/full-closure.patch)
- [真实 MySQL 并发结果](../outputs/official-document-closure-20260909/backend/mysql/instance-1788935744608675000/results.json)、[复跑环境说明](../outputs/official-document-closure-20260909/backend/mysql/README.md)
- [实际生成的 DOCX](../outputs/official-document-closure-20260909/backend/artifacts/generated.docx)、[PDF](../outputs/official-document-closure-20260909/backend/artifacts/generated.pdf)、[PDF 与图片检查](../outputs/official-document-closure-20260909/backend/artifacts/pdf-checks.json)
- [已有文件保留检查](../outputs/official-document-closure-20260909/starting-files-preservation.json)
