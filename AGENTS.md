# 星数项目协作约束

## 当前仓库事实（2026-08-03）

- 当前仓库已经是 React 19、TypeScript 6、Vite 8 正式前端工程，不再是静态 HTML 原型。
- React 是主应用；`src/features/dashboardStudio/` 内包含 Vue 看板工作室组件。
- 当前权威代码目录是 `src/`，自动化测试位于 `src/**/*.test.ts(x)` 和 `tests/visual/`，历史 `outputs/xingshu-homepage-system/` 路径不在当前克隆中。
- 先读 `README.md` 获取启动和验证命令，再读 `PROJECT.md` 获取当前里程碑、下一步与阻塞。
- 本节中的当前仓库事实优先于下方仍具有历史背景的设计说明。

## 读取中文文件

在 Windows PowerShell 5.1 中读取 Markdown、中文规格、README、AGENTS.md 等文本时，必须显式指定 UTF-8：

```powershell
Get-Content -LiteralPath <path> -Encoding utf8
```

如果看到 `鏈枃`、`鐭ヨ瘑` 等乱码，先按 UTF-8 重新读取，不要基于乱码做判断。

## 产品定位

星数是面向企业的 Agent 应用入口，定位为“可信数据智能 / 企业智能中枢”。所有视觉与前端产出必须服务这个定位。

## 视觉硬约束

- 保留浅冰蓝产品底色、白色侧边栏、蓝色品牌识别、深蓝中文信息层级。
- 保留现有功能结构：新建对话、历史对话、智能制表、智能写作、我的看板、我的云盘、更多、数据资产看板、数据资产管理。
- 保留首页结构：问候语、命令输入框、推荐应用卡片。
- 圆角需还原参考图：输入框/主按钮约 12px，推荐应用卡与图标底板约 14px；不要压成 8px，也不要做成胶囊软萌风。
- 组件以白底、细边框、低阴影、强网格对齐为准。
- 图标系统遵循“星轨 Agent Icons”：线性、圆角、蓝/青节点点缀、企业感。
- 常规导航和应用卡 icon 必须保持干净，不允许每个图标都叠加星轨纹路背景。
- 当前图标使用 `@phosphor-icons/react` 与 `src/assets/icon-kit/`、`src/assets/*-icons/` 下的本地资产，不要改回远程动态脚本。
- 大屏响应式必须使用分段内容轨道：主页约 1170/1320/1440px，问数页约 1220/1360/1480px；不要把 1672px 构图窄窄居中到 1920px 以上屏幕。
- 星轨弧线只用于品牌展示、空状态或少量重点插画。

## 视觉禁止项

- 禁止改成深色大屏、赛博风、霓虹风。
- 禁止生成广告图、营销海报、人物场景、设备摆拍。
- 禁止随意生成新 icon 或新插画。
- 禁止玩具化、3D、糖果渐变、emoji 风格 icon。
- 禁止把产品首页做成 landing page。
- 禁止新增与截图无关的功能模块。

## 资产使用顺序

1. 优先使用 `src/assets/brand/`、`src/assets/home/`、`src/assets/icon-kit/` 和各页面现有本地资产。
2. `design-qa.md` 中的 Windows `outputs/` 路径是历史证据；本地文件缺失时不要假装已查看，应请用户重新提供参考图。
3. Logo、头像等已有可裁切资产，优先使用仓库内正式素材。
4. Icon 优先使用真实图标库，并通过统一容器、颜色、状态实现星轨风格。
5. 只有在真实图标库无法表达某个品牌级专属图标时，才允许调用 image2 单独生成。
6. 调用 image2 前必须写明：图标名称、用途、尺寸、背景、状态、参考源、禁止项。

## 当前交付目录

- 正式应用：`src/`
- 星数组件：`src/components/xs/`
- 主题与视觉 token：`src/theme/`、`src/styles/`
- 品牌和页面资产：`src/assets/`
- 单元/组件测试：`src/**/*.test.ts(x)`
- 视觉与无障碍测试：`tests/visual/`
- 视觉 QA 记录：`design-qa.md`

## 当前命令

```bash
npm ci
npm run dev
npm test
npm run build
npm run test:visual:typecheck
npm run test:visual
```

- `npm run test:visual` 会启动本地服务和 Chromium；执行前确认测试环境与外部服务边界。
- 纯文档变更只需检查文档、链接、`git diff --check` 和 Git 状态，不要求启动前端或生成截图。

## 前端实现规则

- 当前应用使用 React/TypeScript/Vite，必须保留 `src/theme/` 与 `src/styles/` 中的现有视觉 token，并优先复用 `src/components/xs/`。
- 看板工作室包含 Vue 组件；修改 React/Vue 边界时保持类型化回调和服务适配层，不在岛组件中直接请求后端。
- 交互至少覆盖：侧栏激活态、更多展开、应用卡选择、快捷 prompt、发送、语音、附件、新建对话。
- 修改完成后必须启动本地服务并截图检查：布局、间距、字体、按钮、图标、响应式。

## 当前正式开发架构

当前采用纯前端 SPA，暂不在本仓库内实现后端。后端能力由外部业务系统、数据平台、Agent 编排系统或网关接入，前端只保留清晰的服务适配层。

当前技术栈与约束：

- 应用框架：React 19 + TypeScript 6 + Vite 8。
- 路由：React Router，按页面功能拆分路由。
- 组件库：Ant Design v5 作为主组件库；Agent 对话相关组件可评估同生态的 Ant Design X，但必须经过视觉适配后再使用。
- 图表：Apache ECharts，所有柱状图、折线图、环图、排行图、趋势图都必须通过 ECharts 渲染，不允许用静态 div 或图片伪造。
- 服务状态：TanStack Query 管理服务端数据、缓存、请求状态和重试。
- 本地 UI 状态：Zustand 管理侧栏展开、当前应用、草稿输入、弹窗等轻量状态。
- 表单：优先使用 Ant Design Form；复杂跨步骤表单再评估 React Hook Form + Zod。
- 测试：Vitest + React Testing Library 做组件和逻辑测试，Playwright 做关键页面截图与响应式验证。
- 依赖管理：必须提交 lockfile；正式工程初始化后不要长期保留未锁定依赖或随意升级主版本。

组件库使用原则：

- Ant Design 只能作为底层组件能力，不允许直接套默认视觉风格完成页面。
- 必须建立星数自己的主题适配层，例如 `src/theme/xingshuTokens.ts`、`src/theme/antdTheme.ts`、`src/styles/tokens.css`。
- 必须用 `ConfigProvider` 注入品牌色、字体、圆角、边框、阴影和布局背景；默认圆角、默认蓝、默认阴影不符合参考图时必须覆盖。
- 常用业务组件必须二次封装到 `src/components/xs/`，例如 `XsShell`、`XsSidebar`、`XsCommandBox`、`XsAppCard`、`XsIconTile`、`XsDataCard`、`XsEChart`。
- 页面中优先使用星数组件，不直接散落大量 Ant Design 原子组件；只有一次性局部控件可以直接使用。
- 组件库不等于图标库。图标继续遵循“星轨 Agent Icons”，可使用 Phosphor React 版本或现有透明 PNG 资产，不要因为引入 Ant Design 就改成 Ant Design Icons 全套风格。

当前目录结构：

```text
src/
  app/                 # Router、Provider、全局错误边界
  assets/              # logo、头像、透明 PNG icon、品牌插画
  components/
    xs/                # 星数设计系统业务组件
  config/              # feature flag 与运行配置
  features/
    home/              # 首页功能
    dashboard/         # 我的看板
    dashboardStudio/   # React 外壳与 Vue 看板工作室
  hooks/               # 共享 hooks
  pages/               # 路由页面，只做组合，不堆业务细节
  services/            # API client、业务系统适配器、mock adapter
  stores/              # Zustand UI 状态
  styles/              # tokens.css、全局样式、响应式轨道
  test/                # Vitest 测试初始化
  theme/               # Ant Design 主题适配
  types/               # 跨模块共享类型
tests/visual/           # Playwright 视觉、流程和无障碍测试
scripts/                # 截图与局部检查脚本
docs/                   # 设计、实施和集成说明
```

## 后端对接边界

- 当前阶段不要在前端仓库内实现业务后端。
- 所有接口调用必须经过 `src/services/`，页面和组件不得直接写 `fetch`、`axios`、SSE 或 WebSocket 细节。
- 使用 `.env.example` 中的 `VITE_DATAHUB_API_BASE_URL`、`VITE_DATAHUB_PROXY_TARGET`、`VITE_DATAHUB_BFF_PORT`、`VITE_QUERY_ASSETS_ENABLED`、`VITE_DASHBOARD_EDITOR_URL` 区分环境；不得记录真实秘密值。
- Agent 流式输出、文件上传、数据查询、看板指标、知识库列表都先定义 TypeScript 接口和 mock 数据，再接真实系统。
- 不确定真实接口时，优先保留 adapter 方法名和类型，不在 UI 里硬编码临时字段。

## 页面演进规则

- 正式工程迁移已经完成；后续重构仍须按页面逐个推进，不要一次性重写全部页面。
- 每重构一个页面，先对齐当前主题 token、版本化资产和 `design-qa.md` 中仍可访问的视觉证据，再接入真实数据。
- 大范围重构顺序建议：首页、问数过程、智能写作、智能制表、我的看板、历史对话、数据资产看板、数据资产管理。
- 每个页面完成后必须用 Playwright 截图验证 1440、1672、1920/2200 宽度，以及一个移动端宽度。
- 视觉验收必须参考 `design-qa.md`、当前主题 token 和用户重新提供的原始参考图；不得把本机不存在的历史路径当作已验证证据。

## Repository safety

- 保留无关的用户改动，修改前后检查 `git status --short --branch`。
- 不读取、复制或输出 `.env*` 中的真实地址、Token、密钥和身份信息；只使用 `.env.example` 的变量名与安全占位符。
- Vite 代理存在后备目标；启动交互流程前显式确认 `VITE_DATAHUB_PROXY_TARGET` 或 `VITE_DATAHUB_BFF_PORT`，避免非预期外部请求。
- 未经用户明确批准，不执行 commit、push、merge、rebase、reset、clean 或发布。
- 验证强度与变更范围匹配；历史 QA、旧截图和测试文件数量都不等同于当前工作树已通过。
