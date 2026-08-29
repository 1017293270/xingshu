source visual truth path:
- `D:\xingshu\outputs\login-page-design-qa\login-source-image2.png`

implementation screenshot path:
- `D:\xingshu\outputs\login-page-design-qa\login-1440x900.png`
- `D:\xingshu\outputs\login-page-design-qa\login-390x844-full.png`
- `D:\xingshu\outputs\login-page-design-qa\login-source-vs-implementation.png`

viewport:
- Desktop: 1440 x 900
- Mobile: 390 x 844 full page

state:
- Login route `/login`, empty form, data-hub authentication adapter connected through `src/services/`.

full-view comparison evidence:
- `D:\xingshu\outputs\login-page-design-qa\login-source-vs-implementation.png`

**Findings**
- No actionable P0/P1/P2 findings remain.

**Required Fidelity Surfaces**
- Visual style: Reuses the current welcome-page ice-blue background, official XingShu logo asset, white login panel, deep-blue hierarchy, restrained cyan accents, fine borders, and low shadows.
- Layout: Desktop preserves the image2 two-column concept with trust badge, left enterprise capability narrative, and right login panel. Mobile stacks the content and form without overlap.
- Icon assets: All login capability/trust/footer icons are local image2-generated PNG assets under `src/assets/login-icons/` and are marked in DOM with `data-icon-source="login-image2"`.
- Controls and states: Username/password fields include labels, focus styling, validation errors, loading/disabled submit state, forgot-password guidance, no-space permission state, and inline backend error display.
- Backend boundary: Login calls stay in `src/services/dataHubAuthService.ts` and `src/services/dataHubSpaceService.ts`; the page does not fetch directly.

**Verification**
- `npm test -- --reporter=dot`: 17 files / 75 tests passed.
- `npm run build`: passed.
- Local screenshot checks captured through Playwright against `http://127.0.0.1:5174/login`.

final result: passed

---

## 公文写作：对话成稿与文件卡（2026-08-28）

source visual truth path:
- `/var/folders/zm/7wl78xs92rv9034kjsgwgd200000gn/T/codex-clipboard-534a2fb7-d73c-4146-bf65-7ad43f5d81a1.png`（对话消息区与底部常驻输入框）
- `/var/folders/zm/7wl78xs92rv9034kjsgwgd200000gn/T/codex-clipboard-01d40d83-2c6e-4852-9cfd-332541cb3177.png`（文件结果卡）

implementation screenshot path:
- `outputs/report-writing/compose-file-card-qa.png`
- `outputs/report-writing/compose-file-card-1440.png`
- `outputs/report-writing/compose-file-card-1920.png`
- `outputs/report-writing/compose-file-card-mobile.png`
- `outputs/report-writing/compose-file-card-focus.jpg`
- `outputs/report-writing/compose-preview-modal-qa.png`

viewport and normalization:
- Source full view: 1862 x 1456 px；source file-card crop: 1120 x 202 px。
- Implementation: 1440 x 900、1920 x 1080、390 x 844 CSS px；截图像素与 CSS 尺寸一致，device scale 1，无密度换算。
- Full-view comparison保留星数侧栏与顶栏，以检查产品结构约束；focused comparison使用 `compose-file-card-focus.jpg` 与源文件卡裁切，避免文件卡在全屏图中过小。

state:
- `/writing` 已登录真实工作区，完成一次 `@参考草稿 → 生成 → 另存`；成功后 URL 保持 `/writing`。
- 用户要求显示在右侧气泡；星数生成阶段与成功回复显示在左侧；紧凑输入框固定在消息区底部。
- 成稿显示为可点击文件卡；实测点击后打开当前页 PDF 预览 Modal（5 页），下载菜单提供 Word/PDF，Word 下载成功。
- 390px 移动端保留完整消息、文件卡和底部输入；下载按钮收敛为图标，无横向溢出。

**Required Fidelity Surfaces**
- Fonts and typography: 对话正文继续使用星数中文无衬线字体与 14px/1.7 行高；文件名 14px 中等字重、状态和模板名 11px，接近源文件卡的三层信息层级。未照搬 Claude 英文衬线正文，因为成稿正文由 PDF 文件预览承担，应用 UI 需保持星数设计体系。
- Spacing and layout rhythm: 对话轨为 840px；消息区独立滚动；底部输入框 64px 高、18px 圆角并占固定末行。文件卡最大 560px、14px 圆角、44px 图标槽，桌面与移动端均未遮挡持久控件。
- Colors and visual tokens: 保留白底、中性灰气泡、细灰边框与低阴影；源图橙色识别标记替换为星数蓝，文件图标使用冰蓝底板。
- Image quality and asset fidelity: 页面只使用正式星数 Logo 和 Phosphor `AsteriskSimple`、`FileText`、`DownloadSimple` 图标；无占位图、手工 SVG、CSS 图形或新增插画。PDF 预览使用浏览器原生渲染器，页面缩略图和正文清晰。
- Copy and content: 所有提示改为真实中文业务语义；明确“原参考草稿没有被修改”，文件卡提供“已生成 · 点击浏览”，下载完成在同一回复下反馈。

**Full-view Comparison Evidence**
- 源图的关键结构是“内容流占满可滚动区域 + 输入框始终贴底”；实现最终截图在 1440/1920 与 390 三档均保持同一结构。
- 星数侧栏与应用顶栏是用户要求保留的产品框架，属于有意差异；其余主工作区不新增营销元素、说明卡或第二套编辑器。

**Focused Region Comparison Evidence**
- 源文件卡和 `compose-file-card-focus.jpg` 均为单层细边框卡：左侧文件图标、中部状态/标题、右侧动作。
- 实现把源图不相关的“撤销/审核”替换为本任务所需“点击浏览/下载”；卡片点击热区、下载菜单、加载态与错误反馈均为真实交互。

**Comparison History**
- Pass 1 [P2]: 成功态虽然已经使用对话和文件卡，但父级异步面板仍 `align-content: center`，导致紧凑输入框停在页面中下部，没有真正贴底。Fix: 将内容轨改为 stretch，让对话态的 `minmax(0, 1fr) auto` 占满工作区。
- Pass 2: 在相同成功态重新捕获 1440 x 900；输入框距离工作区底部约 16px，消息区独立滚动，P2 已消除。
- Pass 3: 1920 x 1080 与 390 x 844 复核无横向溢出；实测文件卡预览和 Word 下载完成。

**Findings**
- 无剩余 P0/P1/P2。
- [P3] 源文件卡只有单一截图裁切，未给出 hover、下载菜单或预览层；实现使用星数现有按钮和 Modal token 补足这些状态，属于产品约束下的合理延展。

final result: passed

---

source visual truth path:
- `D:\xwechat_files\wxid_nsedghikq70t22_3393\temp\RWTemp\2026-07\2c4d7c88bcd8ba45afa64e1ba2f55766.png`
- `E:\starmath\outputs\xingshu-homepage-system\references\03-source-home.png`
- `E:\starmath\outputs\xingshu-homepage-system\references\01-brand-product-system-suite.png`
- `E:\starmath\outputs\xingshu-homepage-system\references\02-orbit-agent-icons-components.png`

implementation screenshot path:
- `E:\starmath\outputs\xingshu-homepage-system\qa\react\home-react-1672x941.png`
- `E:\starmath\outputs\xingshu-homepage-system\qa\react\home-reference-vs-react-1672x941.png`
- `E:\starmath\outputs\xingshu-homepage-system\qa\homepage-1672x941-final.png`
- `E:\starmath\outputs\xingshu-homepage-system\qa\homepage-1672-after-widefix.png`
- `E:\starmath\outputs\xingshu-homepage-system\qa\homepage-2200-after-widefix.png`
- `E:\starmath\outputs\xingshu-homepage-system\qa\analysis-1672-after-widefix.png`
- `E:\starmath\outputs\xingshu-homepage-system\qa\analysis-2224-after-widefix.png`
- `E:\starmath\outputs\xingshu-homepage-system\qa\history-1672x941.png`
- `E:\starmath\outputs\xingshu-homepage-system\qa\table-1672x941.png`
- `E:\starmath\outputs\xingshu-homepage-system\qa\writing-1672x941.png`
- `E:\starmath\outputs\xingshu-homepage-system\qa\dashboard-1672x941.png`
- `E:\starmath\outputs\xingshu-homepage-system\qa\data-dashboard-1672x941.png`
- `E:\starmath\outputs\xingshu-homepage-system\qa\data-management-1672x941.png`

viewport:
- Desktop: 1672 x 941
- Wide desktop checked: 2200 x 944 and 2224 x 924
- Mobile checked: 390 x 844

state:
- Default homepage, no modal open.
- Sidebar expanded, more menu visible on desktop.

full-view comparison evidence:
- `E:\starmath\outputs\xingshu-homepage-system\qa\homepage-source-vs-implementation.png`

focused region comparison evidence:
- Command input: `E:\starmath\outputs\xingshu-homepage-system\qa\command-region-source-vs-implementation.png`
- App cards: `E:\starmath\outputs\xingshu-homepage-system\qa\app-cards-region-source-vs-implementation.png`

**Findings**
- No actionable P0/P1/P2 findings remain.

**Required Fidelity Surfaces**
- Fonts and typography: Uses a Chinese enterprise SaaS font stack with heavier navy hierarchy for greeting, sidebar, section titles, and app-card labels. Text remains readable at desktop and mobile sizes.
- Spacing and layout rhythm: Preserves the original shell: white left sidebar, centered greeting, command input, and recommendation cards. Desktop spacing has been refined to the generated visual system. Mobile scroll was checked after fixing vertical overflow.
- Colors and visual tokens: Keeps the pale icy-blue product background, white surfaces, primary blue button, navy text, and restrained cyan data accents from the visual suite.
- Image quality and asset fidelity: Logo and avatar are cropped from the supplied source screenshot. Icons use a real icon library with the star-orbit container treatment from the icon suite; no random image generation was used.
- Copy and content: Existing product labels are retained: 新建对话, 历史对话, 智能制表, 智能写作, 我的看板, 我的云盘, 数据资产看板, 数据资产管理, 推荐应用, 智能问数, 知识问答, 文档助手, 报表生成, 会议纪要, 更多应用.

**Patches Made Since QA**
- Restored the React homepage to the supplied second reference: removed the small assistant mark and emoji above the greeting, kept `您好，张三`, retained `我是您的数据管家，有什么可以帮您？`, and returned the recommended apps to large vertical icon cards without desktop descriptions.
- Integrated the optimized project asset `src/assets/home/xingshu-home-wave-bg-image2.webp` with a masked full-main-width wave treatment; the visually equivalent WebP is about 30KB instead of the roughly 1.08MB runtime PNG.
- Replaced the former colorful generated app PNGs with the existing local Phosphor linear icon system and restrained cyan node accent, matching the current “星轨 Agent Icons” constraint.
- Updated React and visual automation coverage for background loading, command-box size, card dimensions, hidden desktop descriptions, and the absence of generated app-icon images.
- Removed the extra homepage operation overview cards because they drifted toward a dashboard and were not part of the original homepage function.
- Fixed mobile vertical overflow by changing the app shell from full overflow clipping to horizontal-only clipping.
- Tightened mobile app-card grid spacing and card dimensions.
- Added responsive content rails for wide screens: homepage now keeps the 1672px reference rail but expands continuously on 2200px-class displays; the analysis page expands its result card, chart/table area, and bottom composer on the same rail.
- Replaced the previous failed extended-page screenshots with live 1672px captures for history, intelligent table, intelligent writing, dashboard, data asset dashboard, and data asset management.
- Realigned the intelligent table, intelligent writing, and dashboard internal rails to the supplied 1672px references after screenshot review.
- Verified chart implementation is library-backed: `analysis.html`, `dashboard.html`, and `data-dashboard.html` load local `prototype/vendor/echarts.min.js`; `analysis.js` and `pages.js` call `echarts.init(..., { renderer: "canvas" })`.
- Added `qa/check-dashboard-echarts.js` to assert that all dashboard chart visuals are ECharts-backed. The dashboard now initializes `revenueBars`, `channelConversionChart`, `salesLine`, `customerDonut`, `opsBars`, and `regionRankChart`; the previous CSS-only bar markup was removed from `dashboard.html`.
- Added `qa/check-writing-scene-icons.js` to assert that the four intelligent-writing scene cards use generated brand icon assets instead of Phosphor placeholders. Verified screenshot: `E:\starmath\outputs\xingshu-homepage-system\qa\writing-scene-icons-1672x941.png`.

**Interaction Checks**
- Clicking an Agent app card writes the correct prompt into the command input.
- Sending shows a status toast.
- The More navigation group expands and collapses.
- New chat clears the command input.
- Browser console has no warning/error entries in the checked state.

**Follow-up Polish**
- If official vector logo files become available, replace the cropped screenshot logo with the production logo asset.
- Before adding any proprietary brand icon, follow the asset order in `AGENTS.md`; regular navigation and app cards should continue using the local Phosphor set.

final result: passed

---

## 2026-07-10 React 全站精修自动化验收门

source visual truth path:
- `E:\starmath\outputs\xingshu-homepage-system\references\03-source-home.png`
- `E:\starmath\outputs\xingshu-homepage-system\references\04-source-analysis.png`
- `E:\starmath\outputs\xingshu-homepage-system\references\09-source-history-goal.png`
- `E:\starmath\outputs\xingshu-homepage-system\references\10-source-table-goal.png`
- `E:\starmath\outputs\xingshu-homepage-system\references\11-source-writing-goal.png`
- `E:\starmath\outputs\xingshu-homepage-system\references\12-source-dashboard-goal.png`
- `E:\starmath\outputs\xingshu-homepage-system\references\13-source-data-dashboard-goal.png`
- `E:\starmath\outputs\xingshu-homepage-system\references\14-source-data-management-goal.png`

implementation screenshot path:
- `E:\starmath\outputs\xingshu-homepage-system\qa\react\home-react-1440x900.png`
- `E:\starmath\outputs\xingshu-homepage-system\qa\react\home-react-1672x941.png`
- `E:\starmath\outputs\xingshu-homepage-system\qa\react\home-react-2200x944.png`
- `E:\starmath\outputs\xingshu-homepage-system\qa\react\home-react-390x844.png`
- `E:\starmath\outputs\xingshu-homepage-system\qa\react\dashboard-react-1440x900.png`
- `E:\starmath\outputs\xingshu-homepage-system\qa\react\dashboard-react-1672x941.png`
- `E:\starmath\outputs\xingshu-homepage-system\qa\react\dashboard-react-2200x944.png`
- `E:\starmath\outputs\xingshu-homepage-system\qa\react\dashboard-react-390x844.png`

viewport:
- Desktop: 1440 x 900, 1672 x 941, 2200 x 944
- Mobile: 390 x 844

state:
- `/login` 未登录空表单。
- `/`、`/analysis`、`/history`、`/table`、`/writing`、`/dashboard`、`/cloud`、`/data-dashboard`、`/data-management`、`/settings/ai` 已登录默认态。
- `/dashboard-editor` 强制断开子应用连接后的明确错误态。
- 390px 移动抽屉逐项导航、新建对话与账户菜单。
- `prefers-reduced-motion: reduce` 下的首页选择反馈和问数输入区。

full-view comparison evidence:
- 现有四档 React 截图继续作为上一轮可追溯基线；本轮未覆盖写入这些已批准图片。
- 本轮通过 Codex in-app browser 实时复核当前工作树：1440px 智能写作与看板、1672px 首页与问数、2200px 首页与数据资产看板、390px 智能写作/云盘/数据资产/AI 配置。实时截图用于本轮人工判断，但未冒充版本化像素基线。
- 当前实测轨道：首页 1672px 为 1170px、2200px 封顶 1440px；问数/数据页 1672px 为 1220px、2200px 封顶 1480px；以上视口根滚动宽度均等于视口宽度。

focused region comparison evidence:
- 首页输入区：`E:\starmath\outputs\xingshu-homepage-system\qa\command-region-source-vs-implementation.png`
- 首页应用卡：`E:\starmath\outputs\xingshu-homepage-system\qa\app-cards-region-source-vs-implementation.png`
- 问数图表：`E:\starmath\outputs\xingshu-homepage-system\qa\analysis-source-vs-echarts-implementation.png`
- 本轮运行时已复核移动抽屉七个产品目的地及关闭态、移动状态栏换行、智能写作文稿表局部滚动、KPI 非假下钻、热门资产表语义，以及 reduced-motion 下 0.01ms 的动画/过渡降级。

**Automation Gate Added**
- `tests/visual/xingshu-homepage.spec.ts` 覆盖 1440 / 1672 / 2200 / 390 四档关键路由、横向溢出、ECharts canvas、移动端全部产品目的地、账户路由、编辑器错误态和 reduced-motion 静态反馈。
- `tests/visual/xingshu-accessibility.spec.ts` 对 `/login`、`/`、`/analysis`、`/dashboard`、`/data-management` 在桌面与移动端执行 WCAG 2.0 / 2.1 / 2.2 A/AA axe 规则，并把 serious / critical 作为阻断级结果。
- 未禁用任何 axe 自动规则。图表业务语义、完整键盘流程、动态状态时机与视觉层级保留为人工复核面，并写入每份 axe JSON 附件。
- Playwright 固定单 worker、浅色中文环境、阻止 Service Worker 缓存，并保留失败 trace；套件使用专属 `127.0.0.1:4173` 服务且禁止复用已有进程，降低截图并发、旧缓存和错误工作树造成的不确定性。
- 所有 `/api/**` 请求由测试夹具返回确定结果，异步页面等待明确 ready 文案或 ECharts ready 标记后再截图；编辑器 URL 由测试服务环境固定并强制进入不可用态。

**Verification**
- `npm run test:visual:typecheck`：Playwright 测试与配置的 TypeScript 静态检查 passed。
- `@axe-core/playwright` 已锁定在 `package-lock.json`。
- Node 24 下 `npm test -- --reporter=dot`：37 files / 208 tests passed；既有 jsdom pseudo-element `getComputedStyle` 能力提示不影响退出码，DashboardEditor 的 `act(...)` 提示已修复。
- `npm run build`：TypeScript project build 与 Vite production build passed。
- In-app browser：390px 关键路由均为单一 `h1`、图片均有 `alt`、根横向溢出为 0；移动导航七个目的地齐全并可关闭；reduced-motion 媒体查询命中且卡片/发送按钮动画与过渡均为 0.01ms。
- In-app browser：2200px 首页/数据页轨道分别为 1440px/1480px，1672px 首页/问数轨道分别为 1170px/1220px；数据资产 KPI 不再渲染假链接，热门资产表具备 caption 和列标题。
- 按当前 Product Design 浏览器约束，本轮未启动 Playwright CLI，因此 axe JSON 和版本化像素差异门仍保留为后续显式授权后的自动化执行项。

**Findings**
- [P2] 尚未建立经过本轮人工批准的像素差异基线。
  Location: `tests/visual/xingshu-homepage.spec.ts` 四档截图。
  Evidence: 当前测试会生成稳定截图并断言关键结构、轨道、溢出、图表与状态，但还没有可提交的 `toHaveScreenshot` 当前版基线。
  Impact: 纯配色、间距或细节像素漂移目前由人工对比发现，尚不能由 CI 自动阻断。
  Fix: 完成本轮允许浏览器的同视口对比并批准截图后，把批准图片纳入版本化 snapshot，再启用像素差异门槛；不得用旧版 PNG 图标截图自动批准当前 Phosphor 版本。
- [P2] Playwright axe/截图套件尚未执行。
  Location: `tests/visual/xingshu-homepage.spec.ts`、`tests/visual/xingshu-accessibility.spec.ts`。
  Evidence: 当前工作树已在允许的 in-app browser 完成关键运行时检查，自动化代码与类型检查通过；根据 Product Design 约束，本轮没有在未征得许可时启动 Playwright CLI。
  Impact: 当前产品验收不受阻，但 axe serious/critical JSON 与可重复的像素回归报告尚未产出。
  Fix: 后续获得 Playwright CLI 明确授权后执行 `npm run test:visual`，审阅报告并批准当前像素基线。

**Comparison History**
- 早期首页窄轨、问数结果轨道、移动纵向溢出、图标来源和 Dashboard 图表伪实现问题已在前述迭代中修复并留有对比图。
- 本轮新增的逐页状态真实性、样式拆分、移动状态栏换行、工作流锁定与宽屏轨道已由当前构建的 in-app browser 和 208 个 Vitest 用例完成复核。

final result: passed for current in-app product QA; Playwright axe/pixel-baseline execution pending explicit authorization

---

## 智能制表模块 视觉重构（2026-08-18）

implementation screenshot path:
- `outputs/ui-audit/table-list-1440.png` / `table-list-1672.png` / `table-list-1920.png` / `table-list-390.png`
- `outputs/ui-audit/table-session-1440.png` / `table-session-1920.png` / `table-session-390.png`
- `outputs/ui-audit/table-session-wide-1440.png`（12 列 46 行宽表，验证横向滚动、行号槽与行数截断提示）

viewport:
- Desktop: 1440 x 900 / 1672 x 1000 / 1920 x 1080
- Mobile: 390 x 844 full page

state:
- `/table` 制表台（5 条最近制表记录），`/table/:sessionId` 问表会话（已还原结果表）。
- 复现命令：`npm run dev` 后 `node scripts/screenshot-table-module.mjs`；脚本拦截全部 `/api/**`，不打真实后端。

**设计主张**
- 制表工具的列表页本身就该是一张表：`最近制表` 由双列卡片网格改为共享列宽的行式数据表（表名 / 类型 / 更新时间 / 操作）。
- 口径条是本轮签名元素：结果表卡片头部常驻 `数据源 · 字段数 · 行数`，数据取自本轮已有的 `data_source_selected` 事件与表结构，此前被丢弃。
- 数字层统一走 `--xs-font-mono` + `tabular-nums`：结果表数值列右对齐、列表更新时间、会话时间戳、需求轮次序号共用同一套数字语言。
- 追问轮次以 `需求 01` 编号 + 品牌色竖线呈现，替换右对齐聊天气泡——每一轮的口径继承自上一轮，序号是信息而非装饰。

**修复的实现缺陷**
- `.datahub-table-scroll` 此前没有任何样式，宽结果表被 `.table-agent__stage` 的 `overflow: hidden` 直接裁掉且无滚动条。
- `<table>` 的内联 `min-width` 覆盖了 `pages.css` 中的 `min-width: 100%`，宽屏下表格缩成内容宽、右侧留白。
- 20 行预览截断此前对用户完全不可见，现补 `预览前 N 行，导出可获得全部 M 行`。
- 会话页移除卡片内嵌套纵向滚动容器，改为文档滚动 + 桌面端会话栏 sticky；工作台在 DOM 中前置，窄屏先看到结果表。
- `.sheet-suggestions` 是无 role 的 div 却带 `aria-label`（axe `aria-prohibited-attr`），补 `role="group"`。
- `--xs-table-muted` 由 #94A7C3 提到 #62748F，行号与空值占位符满足 AA 4.5:1。

**Verification**
- `npx vitest run`：94 文件 / 555 用例通过。
- `npm run test:visual:typecheck`：通过。
- axe（wcag2a/2aa/21a/21aa，1440x1000）：`/table` 与 `/table/:sessionId` 各仅剩 1 项 `color-contrast`，均落在既有 `.ant-tag` 能力状态条上，与本轮改动无关且全站一致。

**Findings**
- [P2] `.ant-tag` 能力状态条对比度不足为存量问题，涉及全站状态栏组件，未在本轮制表范围内修改。
- [P2] `vite.config.ts` 的 `server.proxy` 类型错误与 `CloudDocumentPreview.tsx` 的 lint error 均为本轮之前工作树中的既有问题，`npm run build` 因此仍不通过，与制表改动无关。

final result: passed for 智能制表 module scope

---

## 问表智能体会话页 重构（2026-08-18，第二轮）

implementation screenshot path:
- `outputs/ui-audit/table-session-1440.png` / `table-session-1920.png` / `table-session-390.png`
- `outputs/ui-audit/table-session-wide-1440.png`（12 列 46 行宽表）

viewport:
- Desktop: 1440 x 1480 / 1920 x 1320（会话页内容较长，用高视口整屏覆盖）
- Mobile: 390 x 844

state:
- `/table/:sessionId` 已还原会话，含 5 步 ReAct 轨迹、SQL、耗时与结果表。
- 复现命令：`npm run dev` 后 `XS_QA_BASE_URL=<dev地址> node scripts/screenshot-table-module.mjs`。

**设计主张**
- 这一页只有结果表配拥有卡片材质。工作台外壳的 `xs-card`、会话栏的 `xs-card` 全部去掉，改为纸面 + 排版层级；三层白托盘叠在近白底色上正是"塑料感"的来源。
- 会话栏移到右侧并只用一根竖细线分隔。左侧已有白色侧边栏，再并一根白柱子会把 1440 下的工作区压到 830px。
- 新增「推演轨迹」作为本轮签名元素：意图路由 → 定位数据源 → 加载语义模型 → 生成查询（可展开 SQL）→ 执行查询，每步带用时。数据全部来自本轮已在流式接收、此前被完全丢弃的 `react_step` / `tool_call` / `tool_result` / `routing_decompose` / `done` 事件。
- 轨迹在流式时自动展开、最新一轮保持展开、历史轮次收起；agent 的过程本身就是交付物的一部分。
- 页面标题层级去重：原先「问表智能体」在 h1 与会话栏各出现一次，现在只保留 h1。

**修复的实现缺陷**
- `pages.css` 把 `.table-session-page` 锁成 `height: calc(100vh - 44px)` 的定高外壳，并对 `.xs-shell__main` 施加 `overflow-y: hidden`。实测 1440x760 下 `scrollHeight === clientHeight`、`canScroll: false`——20 行结果表在矮视口下被裁掉且无法滚动到。改为文档流后 `scrollHeight 1647 > clientHeight 760`，追问框可滚动抵达。
- SQL 此前会同时挂到 `generate_query` 与 `execute_query` 两步，重复展开同一条语句；现在只挂第一个查询步骤。
- 「问题拆解 执行模式 SIMPLE」对使用者没有信息量，改为只有真的拆出子问题时才占一行。
- 轨迹摘要原用等宽字体整段渲染，中英混排会撑开中文字距；改为常规字体 + `tabular-nums`。

**Verification**
- `npx vitest run`：95 文件 / 566 用例通过（新增 `agentTrace.test.ts` 11 例覆盖轨迹构建）。
- `npm run test:visual:typecheck`：通过。
- axe（wcag2a/2aa/21a/21aa，1440x1400）：`/table` 与 `/table/:sessionId` 各仅剩 1 项 `color-contrast`，均落在既有 `.ant-tag` 能力状态条上。

**Findings**
- [P2] `.xs-action-link--primary`（白字 + `--xs-primary` #1677FF）对比度约 3.5:1，未达 AA 4.5:1。本轮曾在会话页头部使用后被 axe 判为 serious，已改用常规 action link 规避；该共享类在其他页面仍存在同样问题，未在本轮范围内改动品牌色。
- [P2] `.ant-tag` 能力状态条对比度不足为存量问题，涉及全站状态栏组件。
- [P2] `vite.config.ts` 的 `server.proxy` 类型错误与 `CloudDocumentPreview.tsx` 的 lint error 为工作树既有问题，`npm run build` 仍不通过，与本轮改动无关。

final result: passed for 问表智能体会话页 scope

---

## 问表智能体：会话栏与加载态（2026-08-18，第三轮）

implementation screenshot path:
- `outputs/ui-audit/table-session-idle-1440.png`（空态：常驻空表框）
- `outputs/ui-audit/table-session-loading-1440.png`（还原中：微光发生在空表框内）
- `outputs/ui-audit/table-session-1440.png` / `table-session-390.png`

viewport:
- Desktop: 1440 x 1000 / 1440 x 1480；Mobile: 390 x 844

**设计主张**
- 结果表位常驻。空态与加载态都保持一张"空表"的形状（表头带 + 6 行占位），而不是留一片空白；加载动画发生在这张空表里。此前拍平卡片后留下的"空荡"由此收敛。
- 会话栏参考 Claude 的做法重做：按时间分组（当前会话 / 今天 / 昨天 / 近 7 天 / 近 30 天 / 更早），每条只占一行并省略号截断，激活态改为低饱和中性底 `#e6ecf5`。原先每条都带一行等宽时间戳、激活态是饱和品牌蓝色块，是这一栏"塑料感"的主要来源；分组把重复的时间戳收敛成一个组标题。
- 为支持分组，`TableTemplate` 新增 `updatedAt`（原始 ISO 串），展示文案仍走 `description`，不再从已格式化字符串反解日期。

**修复的实现缺陷**
- 会话栏加载态此前直接用 `XsAsyncPanel` 的通用 `rows` 骨架：180px 白卡 + 22px 内边距 + 5 条 54px 灰块，压在这根扁平细栏顶上完全不搭。改为贴合会话栏几何的单行占位条。
- 通用骨架色（`#edf3fb`）是按白卡背景调的；会话栏是透明底叠在 `--xs-bg` 冰蓝页面色上，对比度不足，单独压深到 `#dfe9f7`。
- `TablePlaceholder` 初版带 `role="status"`，与页面底部的 `XsStatusBar` 抢 live region，`getByRole("status")` 取到两个节点。改为只标记 `aria-busy`，播报统一由状态栏负责。
- 生成中占位框的提示语原本直接复用 `progress`，与推演轨迹的进行中步骤重复同一句话；改为静态的"结果表就绪后会出现在这里"。

**Verification**
- `npx vitest run`：96 文件 / 571 用例通过（新增 `sessionGroups.test.ts` 6 例覆盖时间分组、当前会话、非法时间戳兜底）。
- `npm run test:visual:typecheck`：通过。
- axe（wcag2a/2aa/21a/21aa，1440x1200）：已还原态与空态各仅剩 1 项 `color-contrast`，均落在既有 `.ant-tag` 能力状态条上。

final result: passed for 会话栏与加载态 scope

---

## 问表智能体：去掉冗余加载指示（2026-08-18，第四轮）

**改动**
- 页面底部状态栏在 loading 态不再转圈。`XsStatusBar` 新增 `spinner?: boolean`（默认 `true`，其他页面行为不变），问表会话页传 `spinner={false}`，改为与其他语气一致的标签 + 文案。空表框的微光已经表达了"在加载"，再叠一个 spinner 是重复指示。
- 会话栏彻底去掉骨架屏。≤8 条短导航项闪一块微光比直接留白更吵；且 `railItems` 本来就会先带出"当前会话"一条，列表就绪后其余直接出现，属于渐进填充而非空屏。
- 会话栏的错误态改为一行 `会话列表加载失败 + 重试` 文本按钮，不再套 `XsAsyncPanel` 的卡片式错误块。

**Verification**
- 制表相关范围：`src/features/tableGeneration`、`WorkflowRefinements`、`WorkflowActions`、`XsStatusBar`、`dataHubAskTable` 共 7 文件 / 57 用例全部通过。
- `npm run test:visual:typecheck`：通过。

**Findings**
- [P1] 本轮全量 `npx vitest run` 有 3 例失败：`AppRoutes.test.tsx`（2）与 `DataAssetActions.test.tsx`（1）。涉及 `src/pages/DataManagementPage.tsx`（+147/−137）、`src/services/dataAssetService.ts`、`src/types/dataAsset.ts` 的工作树未提交改动，均不在本轮制表范围内，未做修改。

final result: passed for 制表模块 scope；数据资产管理 3 例失败属并行改动，需由该改动的作者处理

---

## 公文写作：Claude 风格首页与 @ 草稿选择器（2026-08-28）

source visual truth path:
- `/var/folders/zm/7wl78xs92rv9034kjsgwgd200000gn/T/codex-clipboard-2955923a-f200-4139-acce-a19e848a7cfd.png`
- `outputs/report-writing/chatgpt-attachment-menu-reference.png`（仅作为 @ 浮层交互参考）

implementation screenshot path:
- `outputs/report-writing/compose-claude-reference-qa.png`
- `outputs/report-writing/compose-claude-picker-qa.png`
- `outputs/report-writing/compose-dialogue-generating-qa.png`
- `outputs/report-writing/compose-dialogue-stopped-qa.png`

viewport and normalization:
- Source: 1452 x 578 px，桌面空白输入态。
- Implementation full viewport: 1512 x 695 CSS px，device scale 1。
- Full-view comparison裁切主工作区为 1312 x 522 px；按源图 1452:578 等比例裁切，比较时不计星数侧栏与应用顶栏。
- Mobile evidence: Chrome viewport 390 x 844，已选草稿 + 有输入内容状态；无横向溢出。

state:
- `/writing` 已登录真实工作区，空白输入态。
- `@` 后打开草稿选择器；选择真实草稿后显示上下文附件、输入内容并启用发送按钮。
- 生成中显示右侧用户气泡与左侧星数进度回复；停止后错误留在同一轮对话，可直接重试。
- 浏览器控制台无 error。

**Required Fidelity Surfaces**
- Fonts and typography: 中文问候使用 `Songti SC / STSong / Noto Serif CJK SC`，对应源图的衬线标题；正文输入与工具栏继续使用星数无衬线体系。收到实屏反馈后压缩为桌面 34–44px、移动端 26px，均无截断。
- Spacing and layout rhythm: 主轨最大 920px；标题与输入面板间距 36px；输入面板约 150px 高、20px 圆角、细边框与低阴影。移动端保持单行问候。
- Colors and tokens: 源图橙色识别标记替换为 `--xs-primary` 星数蓝；其余保持白、近黑与中性灰。焦点态仅提升外轮廓，不再出现内部蓝色竖线。
- Image and icon fidelity: 页面无位图资产。源图放射标记使用已安装 Phosphor `AsteriskSimple`，避免生成新品牌图或手工 SVG；形状存在轻微差异，列为可接受 P3。
- Copy and content: 将英文个性化问候改为业务文案“想写一篇什么公文？”，输入提示、另存说明与 `@` 草稿语义均保持真实可用。

**Focused Region Comparison**
- `@` 选择器采用 360px 白色浮层、16px 圆角、细边框、低阴影和 52px 左右的资源行；标题、模板名、更新时间、滚动与选中勾选均可读。
- 与 ChatGPT 附件菜单相比，为承载长草稿名而加宽；信息密度、图标槽、分组标题和浮层材质一致。弹层覆盖输入区左侧但不再遮挡问候标题。

**Comparison History**
- Pass 1 [P1]: 原实现是冰蓝光晕、大图标、大卡片式输入框，与用户选定的 Claude 源图层级不一致。Fix: 删除光晕与说明段，改为白底、大号衬线问候和宽输入面板。
- Pass 2 [P2]: `@` 浮层向上展开遮挡问候；移动端标题换行；Mentions 内部焦点边框形成两条蓝线。Fix: 浮层改为向下展开，移动端标题/图标缩小，textarea 明确清除内部 border/outline/shadow。
- Pass 3: 同视口重新捕获后，上述 P1/P2 均不再出现。
- Pass 4 [P1]: 用户在 3024 x 1406 实屏截图中指出标题与输入面板整体过大。Fix: 主轨 1120→920px、标题上限 58→44px、输入区 118→72px、圆角 26→20px，并同步压缩移动端。
- Pass 5 [P2]: 用户要求输入框继续略矮，并把生成过程设计成对话。Fix: 输入区 72→60px、Mentions 3→2 行；生成态改为用户气泡 + 星数阶段回复，覆盖读取、生成、另存、停止与失败重试。

**Findings**
- 无剩余 P0/P1/P2。
- [P3] Phosphor 星号只有较少射线，未逐像素复制 Claude 的品牌图形；为避免冒用外部品牌资产并遵守本地图标体系，保留为星数蓝库图标。

final result: passed

---

## 公文详情：操作按钮统一进入顶栏（2026-08-28）

source visual truth path:
- `/var/folders/zm/7wl78xs92rv9034kjsgwgd200000gn/T/codex-clipboard-75b728e8-eb99-4a3c-931e-b1b6c57fb5ca.png`（错误态：内容方案与导出操作落到页面底部）
- `/var/folders/zm/7wl78xs92rv9034kjsgwgd200000gn/T/codex-clipboard-38954e41-8058-4f3c-a26d-a8f2ec5dbef5.png`（错误态：模板 PDF 浏览紧贴编辑区顶边）
- 用户文字目标：全部操作进入顶部操作栏，并保留顶部正常间距。

implementation screenshot path:
- `outputs/report-writing/draft-actions-loading-qa.png`
- `outputs/report-writing/draft-actions-top-qa.png`
- `outputs/report-writing/draft-actions-top-1440.png`
- `outputs/report-writing/draft-actions-top-1672.png`
- `outputs/report-writing/draft-actions-top-1920.png`
- `outputs/report-writing/draft-actions-top-mobile.png`

viewport and normalization:
- Source defect crops: 1322 x 200、1958 x 156 px。
- Implementation: Chrome 1512 x 695、1440 x 900、1672 x 941、1920 x 1080、390 x 844 CSS px；截图像素与 CSS 尺寸一致，device scale 1。
- 源图是局部缺陷裁切，因此比较以操作按钮所属区域和相邻边距为准，不对无关页面内容做像素判断。

state:
- `/writing/drafts/21c1649c-8635-4f8c-8d58-c307bf3c2a30` 已登录真实草稿详情。
- 首次加载骨架态：顶栏插槽尚未就绪，所有操作暂不渲染，页面底部和编辑器顶边均无错误按钮。
- 数据就绪态：内容方案、导出检查、导出 DOCX、导出 PDF、模板 PDF 浏览统一进入应用顶栏。
- 390px 移动端：按钮在标题下方分两行排列，保持顶部归属、正常间距和可点击尺寸。

**Required Fidelity Surfaces**
- Fonts and typography: 按钮继续使用星数现有 13px 控件字号、正常字重和 Phosphor 图标，无字体或文案漂移。
- Spacing and layout rhythm: 就绪态复用 `.official-document-app__bar` 的 14px 垂直、28px 水平内边距和 8px 操作间距；加载态不再在正文原位置占位。
- Colors and visual tokens: 白色顶栏、细边框、低阴影按钮和深蓝文字全部复用现有 token，未引入新样式。
- Image quality and asset fidelity: 无新增位图或插画；按钮图标继续来自既有 Phosphor 图标库。
- Copy and content: 内容方案、导出检查、导出 DOCX、导出 PDF、模板 PDF 浏览的功能和文案保持不变，仅修正渲染位置。

**Full-view Comparison Evidence**
- `draft-actions-loading-qa.png` 证明顶栏挂载前，错误按钮不会短暂出现在详情底部或编辑器顶边。
- `draft-actions-top-qa.png` 证明数据就绪后全部操作集中在顶部，且按钮与视口顶边、顶栏边框之间保留一致留白。

**Focused Region Comparison Evidence**
- 两张源图已是按钮区域的高分辨率局部裁切，按钮位置与边距清晰可辨，无需另做二次裁切。

**Comparison History**
- Pass 1 [P1]: 共享操作插槽在 host 尚未挂载时使用 inline fallback，导致不同调用点把按钮短暂渲染到底部或编辑器顶边。Fix: 仅在完全脱离应用壳时保留 inline fallback；位于应用壳内但 host 未就绪时返回空，host 就绪后再 portal 到顶栏。
- Pass 2: 强制刷新真实详情页并分别捕获加载态、就绪态；错误位置不再出现，顶栏间距正常。
- Pass 3: 1440、1672、1920 与 390px 复核；桌面单行、移动端两行，均无按钮回落或横向裁切。

**Findings**
- 无剩余 P0/P1/P2。
- [P3] 极慢网络下操作按钮会在数据与顶栏插槽就绪后一次出现，而不是预留灰色按钮位；这避免了不可用按钮闪烁，符合当前页面加载策略。

final result: passed

---

## 公文写作：重复固定字段锚点恢复（2026-08-28）

source visual truth path:
- `/var/folders/zm/7wl78xs92rv9034kjsgwgd200000gn/T/codex-clipboard-0cd1f5dd-33aa-4ea6-8675-200047f190b4.png`

implementation screenshot path:
- `outputs/report-writing/duplicate-fixed-anchor-recovered-qa.png`

viewport:
- Chrome 1512 x 695 CSS px，device scale 1。

state:
- 使用截图中的参考草稿“请示 - 新草稿122112”和原始要求“帮我完整的写一篇给领导的请假请示”重放真实生成链路。
- 生成结果包含同值重复固定字段锚点时安全归并，最终展示未保存临时成稿；没有创建草稿。
- 冲突值重复仍由解析器拒绝；文件卡保留浏览、保存到草稿箱和下载三个操作。

**Comparison History**
- Pass 1 [P1]: 解析器对任何重复固定字段锚点一律报错，即使两个有效值完全一致。Fix: 只归并标准化后相同的固定字段值；不同值继续拒绝，并在提示词中明确每个 slot-id 只能出现一次。
- Pass 2 [P2]: 文件卡新增的主保存按钮继承了通用深色文字，蓝底对比不足。Fix: 主按钮恢复白字。
- Pass 3: 原始请求重放成功，临时成稿文件卡可见，保存按钮对比度正常。

**Findings**
- 无剩余 P0/P1/P2。

final result: passed

---

## 公文写作：星标保存按钮（2026-08-28）

source visual truth path:
- `/var/folders/zm/7wl78xs92rv9034kjsgwgd200000gn/T/codex-clipboard-7a767844-9ba3-4a17-a7b8-990b9b24b026.png`

implementation screenshot path:
- `outputs/report-writing/compose-star-save-qa.png`
- `outputs/report-writing/compose-star-save-focus-qa.png`

viewport and normalization:
- Source crop: 194 x 68 px。
- Implementation viewport: Chrome 1512 x 695 CSS px，device scale 1；focused crop 584 x 100 px。
- 比较对象只取文件卡操作区；源图左侧方框属于相邻功能，不要求复制。

state:
- 未保存临时成稿，文件卡包含浏览、空心星标保存和下载。
- 星标 tooltip/无障碍名称为“保存到草稿箱”；未点击保存，不创建草稿。

**Required Fidelity Surfaces**
- Fonts and typography: 保存动作不再显示可见文字，文件卡原有标题、状态和下载文字保持不变。
- Spacing and layout rhythm: 星标点击区 36 x 36px，图标 20px，与下载动作垂直居中；没有大块主按钮占位。
- Colors and visual tokens: 使用低饱和蓝灰空心星，无实心蓝色背景；保存后才切换为品牌蓝实心星。
- Image quality and asset fidelity: 使用已安装 Phosphor `Star` 线性图标，与参考图同类轮廓，不使用手工 SVG、字符星号或新增位图。
- Copy and content: 可见“保存到草稿箱”移入 title 与 aria-label，鼠标和读屏仍能理解动作。

**Comparison History**
- Pass 1 [P2]: 保存动作是宽蓝色主按钮，视觉重量远高于文件卡其他操作。Fix: 替换为空心星标图标按钮；保存中沿用 loading，保存后显示实心星。
- Pass 2: 真实临时成稿重放后捕获 focused crop；星标形状、尺寸、颜色和间距与参考方向一致，控制台无 error/warn。

**Findings**
- 无剩余 P0/P1/P2。

final result: passed
