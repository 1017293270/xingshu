# 星数服务适配层与 UI 状态层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build typed service adapters and a Zustand UI state layer so pages no longer depend on raw mock tuples or scattered local shell state.

**Architecture:** Keep the app as a pure frontend SPA. Domain services own mock data access and future HTTP boundaries; pages consume typed service functions and the shared UI store. The existing visual layout stays intact.

**Tech Stack:** React 19, TypeScript, Vite, TanStack Query, Zustand, Vitest, React Testing Library, Playwright.

---

## File Structure

- Create: `src/types/agent.ts`, `src/types/history.ts`, `src/types/table.ts`, `src/types/writing.ts`, `src/types/dashboard.ts`, `src/types/dataAsset.ts`
- Create: `src/services/httpClient.ts`
- Create: `src/services/agentService.ts`, `src/services/tableService.ts`, `src/services/writingService.ts`, `src/services/dataAssetService.ts`
- Create: `src/services/mock/historyMock.ts`, `src/services/mock/tableMock.ts`, `src/services/mock/writingMock.ts`, `src/services/mock/dashboardMock.ts`, `src/services/mock/dataAssetMock.ts`
- Create: `src/stores/uiStore.ts`
- Test: `src/services/httpClient.test.ts`, `src/services/domainServices.test.ts`, `src/stores/uiStore.test.ts`
- Modify: `src/services/historyService.ts`, `src/services/dashboardService.ts`, `src/services/mock/xingshuData.ts`
- Modify: `src/features/home/HomePage.tsx`, `src/pages/PageFrame.tsx`, `src/pages/HistoryPage.tsx`, `src/pages/TablePage.tsx`, `src/pages/WritingPage.tsx`, `src/pages/DataDashboardPage.tsx`, `src/pages/DataManagementPage.tsx`
- Modify tests as needed: `src/features/home/HomePage.test.tsx`, `src/app/AppRoutes.test.tsx`

## Task 1: Shared Types and Mock Adapters

**Files:**
- Create: `src/types/history.ts`, `src/types/table.ts`, `src/types/writing.ts`, `src/types/dashboard.ts`, `src/types/dataAsset.ts`, `src/types/agent.ts`
- Create: `src/services/mock/historyMock.ts`, `src/services/mock/tableMock.ts`, `src/services/mock/writingMock.ts`, `src/services/mock/dashboardMock.ts`, `src/services/mock/dataAssetMock.ts`
- Modify: `src/services/mock/xingshuData.ts`
- Test: `src/services/domainServices.test.ts`

- [ ] **Step 1: Write failing service shape tests**

Create `src/services/domainServices.test.ts` with assertions against typed object fields:

```ts
import { describe, expect, it } from "vitest";
import { listHistorySessions } from "./historyService";
import { listRecentTables } from "./tableService";
import { listWritingDocuments, listWritingScenes } from "./writingService";
import { getDataAssetKpis, listKnowledgeBases } from "./dataAssetService";

describe("domain services", () => {
  it("returns typed history sessions", async () => {
    const sessions = await listHistorySessions();
    expect(sessions[0]).toMatchObject({
      id: "expense-policy",
      title: "员工报销流程说明",
      category: "知识快查"
    });
  });

  it("returns typed table templates", async () => {
    const tables = await listRecentTables();
    expect(tables.map((table) => table.iconId)).toEqual(["ranking", "contact-list", "expense-statistics", "inventory"]);
  });

  it("returns typed writing scenes and documents", async () => {
    const scenes = await listWritingScenes();
    const documents = await listWritingDocuments();
    expect(scenes[0].iconId).toBe("report-summary");
    expect(documents[0].words).toBe("1,428 字");
  });

  it("returns typed data asset summaries", async () => {
    const kpis = await getDataAssetKpis();
    const knowledgeBases = await listKnowledgeBases();
    expect(kpis[0]).toMatchObject({ id: "data-assets", label: "数据资产总量" });
    expect(knowledgeBases[0]).toMatchObject({ id: "enterprise-policy", title: "企业制度文档库" });
  });
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```powershell
npm test -- src/services/domainServices.test.ts
```

Expected: FAIL because `tableService.ts`, `writingService.ts`, and `dataAssetService.ts` do not exist yet.

- [ ] **Step 3: Add type files and mock adapter files**

Create the type files and mock files named above. Use typed object arrays instead of tuple arrays. Keep `src/services/mock/xingshuData.ts` as a compatibility export for existing chart and analysis imports.

- [ ] **Step 4: Add domain service methods**

Implement async service methods:

```ts
export async function listRecentTables() {
  return recentTables;
}
```

Use the same pattern for history, writing, and data assets.

- [ ] **Step 5: Run the service tests and verify GREEN**

Run:

```powershell
npm test -- src/services/domainServices.test.ts
```

Expected: PASS.

## Task 2: HTTP Client Boundary

**Files:**
- Create: `src/services/httpClient.ts`
- Test: `src/services/httpClient.test.ts`

- [ ] **Step 1: Write failing HTTP client tests**

Create `src/services/httpClient.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJson, XingshuServiceError } from "./httpClient";

describe("httpClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requests JSON from the configured base URL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    const result = await requestJson<{ ok: boolean }>("/health", { baseUrl: "https://api.example.test" });
    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith("https://api.example.test/health", expect.objectContaining({ headers: expect.any(Headers) }));
  });

  it("throws a typed service error for non-2xx responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: "BAD_REQUEST", message: "参数错误" }), { status: 400 })));
    await expect(requestJson("/bad", { baseUrl: "https://api.example.test" })).rejects.toMatchObject({
      name: "XingshuServiceError",
      status: 400,
      code: "BAD_REQUEST",
      message: "参数错误"
    });
  });

  it("exposes XingshuServiceError for manual error checks", () => {
    const error = new XingshuServiceError("请求失败", { status: 500, code: "SERVER_ERROR" });
    expect(error.status).toBe(500);
    expect(error.code).toBe("SERVER_ERROR");
  });
});
```

- [ ] **Step 2: Run the HTTP client test and verify RED**

Run:

```powershell
npm test -- src/services/httpClient.test.ts
```

Expected: FAIL because `httpClient.ts` does not exist.

- [ ] **Step 3: Implement minimal HTTP client**

Implement `XingshuServiceError`, `apiBaseUrl`, `agentBaseUrl`, and `requestJson<T>()`. The client should join base URL and path without double slashes and parse JSON responses.

- [ ] **Step 4: Run the HTTP client test and verify GREEN**

Run:

```powershell
npm test -- src/services/httpClient.test.ts
```

Expected: PASS.

## Task 3: Zustand UI Store

**Files:**
- Create: `src/stores/uiStore.ts`
- Test: `src/stores/uiStore.test.ts`
- Modify: `src/features/home/HomePage.tsx`, `src/pages/PageFrame.tsx`

- [ ] **Step 1: Write failing store tests**

Create `src/stores/uiStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "./uiStore";

describe("useUiStore", () => {
  beforeEach(() => {
    useUiStore.getState().resetUiState();
  });

  it("selects a recommended app and writes its prompt", () => {
    useUiStore.getState().selectApp("data-chat", "帮我分析本月经营数据，并生成趋势图表");
    expect(useUiStore.getState().selectedAppId).toBe("data-chat");
    expect(useUiStore.getState().homeDraft).toBe("帮我分析本月经营数据，并生成趋势图表");
  });

  it("clears home conversation state for a new chat", () => {
    useUiStore.getState().selectApp("writing", "写一份汇报");
    useUiStore.getState().setSentStatus("已发送：写一份汇报");
    useUiStore.getState().clearHomeConversation();
    expect(useUiStore.getState().selectedAppId).toBeNull();
    expect(useUiStore.getState().homeDraft).toBe("");
    expect(useUiStore.getState().sentStatus).toBe("");
  });

  it("toggles the more navigation group", () => {
    expect(useUiStore.getState().isMoreOpen).toBe(true);
    useUiStore.getState().toggleMore();
    expect(useUiStore.getState().isMoreOpen).toBe(false);
  });
});
```

- [ ] **Step 2: Run the store test and verify RED**

Run:

```powershell
npm test -- src/stores/uiStore.test.ts
```

Expected: FAIL because `uiStore.ts` does not exist.

- [ ] **Step 3: Implement the store**

Create a Zustand store with `isMoreOpen`, `selectedAppId`, `homeDraft`, `sentStatus`, and the actions in the test.

- [ ] **Step 4: Connect HomePage and PageFrame**

Replace local `useState` for sidebar and home draft state with `useUiStore`. Keep page markup unchanged.

- [ ] **Step 5: Run store and homepage tests**

Run:

```powershell
npm test -- src/stores/uiStore.test.ts src/features/home/HomePage.test.tsx
```

Expected: PASS.

## Task 4: Migrate Pages to Typed Services

**Files:**
- Modify: `src/pages/HistoryPage.tsx`, `src/pages/TablePage.tsx`, `src/pages/WritingPage.tsx`, `src/pages/DataDashboardPage.tsx`, `src/pages/DataManagementPage.tsx`
- Test: `src/app/AppRoutes.test.tsx`, `src/services/domainServices.test.ts`

- [ ] **Step 1: Update pages to consume typed service results**

Use TanStack Query for async list data:

```ts
const { data: sessions = [] } = useQuery({
  queryKey: ["historySessions"],
  queryFn: listHistorySessions
});
```

Apply this pattern to history, recent tables, writing scenes/documents, data asset KPIs, knowledge base stats, and knowledge bases.

- [ ] **Step 2: Preserve icon mappings in page files**

Keep image imports in page files and map typed `iconId` values to imported PNGs. This avoids coupling service data to bundler asset imports.

- [ ] **Step 3: Run route tests**

Run:

```powershell
npm test -- src/app/AppRoutes.test.tsx
```

Expected: PASS. If content is async, use `findByLabelText` or wait for route landmarks.

## Task 5: Final Verification and Commit

**Files:**
- All files touched in Tasks 1-4

- [ ] **Step 1: Run unit tests**

Run:

```powershell
npm test
```

Expected: all Vitest tests pass.

- [ ] **Step 2: Run production build**

Run:

```powershell
npm run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 3: Run visual smoke tests**

Run:

```powershell
npm run test:visual
```

Expected: 36 Playwright visual smoke tests pass.

- [ ] **Step 4: Commit implementation**

Run:

```powershell
git add src docs/superpowers/plans/2026-07-02-xingshu-service-state-implementation.md
git commit -m "feat: add service adapters and ui store"
```

Expected: one implementation commit with a clean working tree.

## Self-Review

- Spec coverage: The plan covers shared types, mock adapters, HTTP client, domain services, Zustand UI state, page migration, and verification.
- Placeholder scan: No task contains unresolved marker text or unnamed files.
- Type consistency: Method names match the approved spec and page migration steps.
