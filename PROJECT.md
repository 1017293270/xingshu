# 星数前端项目状态

- 项目 ID：`xingshu`
- 状态：`Active`
- 健康度：`Yellow`
- 最后复盘：2026-08-03
- 当前工作分支：`master`
- 远端：`git@github.com:1017293270/xingshu.git`
- 本次核验：仅静态检查；未安装依赖、未启动服务、未执行项目测试

## 项目目标

建设面向企业的 Agent 应用入口和可信数据智能前端，通过统一的星数设计系统承载问数、知识、文档、写作、制表、看板、云盘和数据资产能力，并通过服务适配层连接外部业务系统、DataHub、Agent 编排和看板服务。

## 当前里程碑

- 仓库已完成 React/TypeScript/Vite 正式工程化，不再是静态 HTML 原型。
- 当前分支最新提交为 2026-08-03 的“fix: 本地化 DataHub 图表字段标签”。
- 当前包含 79 个 Vitest 测试文件和 5 个 Playwright 视觉测试文件。
- `design-qa.md` 记录上一轮单元测试、构建和浏览器 QA 通过，但这些是历史证据，本次克隆尚未重新执行。
- Playwright axe/截图套件和经人工批准的像素差异基线仍被现有 QA 文档列为待办。

## 唯一下一步

建立当前 Mac 上的可复现验证基线：先确认代理指向获准的本地或测试环境，再执行 `npm ci`、`npm test`、`npm run build` 和 `npm run test:visual:typecheck`；获得视觉测试授权后运行 `npm run test:visual` 并审阅结果。

## 当前阻塞与风险

- 当前没有 `node_modules/`，本次 onboarding 未安装依赖或运行测试。
- `package.json` 未声明根级 `engines`；README 采用锁定的 Vite 所要求的 Node.js `^20.19.0 || >=22.12.0`。当前 Mac 的 Node.js `v24.18.1` 与 npm `11.16.0` 满足该要求。
- Vite 代理存在非本地后备目标；启动交互流程前必须显式设置获准的 DataHub/BFF 目标，避免非预期外部请求。
- 业务后端不在本仓库内，登录、问数、文件、看板与数据资产验证依赖外部系统或确定性测试夹具。
- `design-qa.md` 中部分参考图和截图是历史 Windows 绝对路径，当前 Mac 克隆中没有对应 `outputs/` 目录。
- 自动视觉测试存在，但当前 QA 文档仍将 Playwright CLI 执行和像素基线批准列为待完成事项。

## 验证基线

| 范围 | 命令 | 当前状态 |
|------|------|----------|
| 安装 | `npm ci` | 未执行 |
| 开发 | `npm run dev` | 未执行 |
| 单元/组件测试 | `npm test` | 未执行 |
| 生产构建 | `npm run build` | 未执行 |
| 视觉测试类型检查 | `npm run test:visual:typecheck` | 未执行 |
| Playwright 视觉/无障碍 | `npm run test:visual` | 待授权与执行 |
| 文档与补丁 | `git diff --check` | 本次已通过 |

## 事实来源

- `AGENTS.md`
- `package.json`、`package-lock.json`、Vite 和 Playwright 配置
- `.env.example` 的变量名（未读取或记录秘密值）
- `src/`、`tests/visual/` 与 `scripts/` 的实际目录结构
- `design-qa.md` 与 `docs/dashboard-generation-integration.md`
- 当前 Git 分支、状态和最新提交
