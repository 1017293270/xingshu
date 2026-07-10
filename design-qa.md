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
