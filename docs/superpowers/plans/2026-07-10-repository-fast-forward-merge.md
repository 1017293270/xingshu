# Repository Fast-Forward Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fast-forward `E:\starmath/master` to the approved local `E:\xingshu-v2/master`, verify the integrated application, and publish the linear history to `1017293270/xingshu.git`.

**Architecture:** `E:\xingshu-v2/master` is a staging chain whose first two new commits contain the dashboard redesign and visual-test update, followed by the approved design and implementation-plan documentation commits. `E:\starmath` fetches that local branch into a temporary reference and accepts it only through `git merge --ff-only`; no application code is rewritten during integration.

**Tech Stack:** Git, PowerShell, npm, Vitest, TypeScript, Vite, Playwright Chromium

---

## File map

- Existing application changes carried by `f031c62` and `4d91615`:
  `src/components/xs/XsEChart.tsx`, `src/pages/DashboardPage.tsx`,
  `src/pages/pages.css`, `src/services/chartTypography.test.ts`,
  `src/services/mock/dashboardMock.ts`, `src/styles/tokens.css`,
  `src/types/dashboard.ts`, and `tests/visual/xingshu-homepage.spec.ts`.
- Existing approved specification:
  `docs/superpowers/specs/2026-07-10-repository-merge-design.md`.
- This execution plan:
  `docs/superpowers/plans/2026-07-10-repository-fast-forward-merge.md`.
- Ignored verification artifacts:
  `outputs/xingshu-homepage-system/qa/react/*.png` and
  `outputs/playwright/`.

### Task 1: Refresh references and prove the preconditions

**Files:**
- Inspect: `E:\starmath\.git`
- Inspect: `E:\xingshu-v2\.git`

- [ ] **Step 1: Refresh both origin references**

Run:

```powershell
git -C E:\starmath fetch --prune origin
git -C E:\xingshu-v2 fetch --prune origin
```

Expected: both commands exit `0`; no working-tree files change.

- [ ] **Step 2: Confirm both worktrees are clean**

Run:

```powershell
git -C E:\starmath status --short --branch
git -C E:\xingshu-v2 status --short --branch
```

Expected: the original repository reports `master...origin/master` with no
file entries. The v2 repository reports `master...origin/master [ahead 2]`
with no file entries; the two local-only commits are the approved design and
this implementation plan.

- [ ] **Step 3: Confirm the source chain contains exactly the approved work**

Run:

```powershell
git -C E:\xingshu-v2 rev-list --left-right --count origin/master...master
git -C E:\xingshu-v2 log -5 --oneline
git -C E:\xingshu-v2 merge-base --is-ancestor ab23765 master
```

Expected: divergence is `0 2`; the log is, newest first, the implementation
plan, merge design, `4d91615`, `f031c62`, and `ab23765`; the ancestor check
exits `0`. Stop without merging if any expectation differs.

### Task 2: Fast-forward the original repository

**Files:**
- Update through existing commits: `E:\starmath` tracked tree
- Create temporarily: `E:\starmath\.git\refs\remotes\v2-local\master`

- [ ] **Step 1: Fetch the local staging branch into a temporary reference**

Run from `E:\starmath`:

```powershell
git fetch E:\xingshu-v2 master:refs/remotes/v2-local/master
```

Expected: Git creates or updates `v2-local/master` to the same object as
`E:\xingshu-v2/master`; permanent remote configuration remains unchanged.

- [ ] **Step 2: Recheck ancestry inside the target object database**

Run:

```powershell
git merge-base --is-ancestor HEAD refs/remotes/v2-local/master
```

Expected: exit `0`. Any nonzero exit stops execution; do not fall back to a
normal merge, rebase, squash, or cherry-pick.

- [ ] **Step 3: Perform the guarded fast-forward**

Run:

```powershell
git merge --ff-only refs/remotes/v2-local/master
```

Expected: `master` advances linearly from `ab23765` to the staging HEAD with
no merge commit and no conflict.

- [ ] **Step 4: Verify history, cleanliness, and remote identity**

Run:

```powershell
git status --short --branch
git log -5 --oneline --decorate
git remote get-url origin
```

Expected: no file entries; `master` is ahead of `origin/master` by four
commits; the log contains the two v2 commits followed by the two documentation
commits; `origin` remains
`https://github.com/1017293270/xingshu.git`.

### Task 3: Run unit tests and production build

**Files:**
- Test: `src/**/*.test.ts`
- Test: `src/**/*.test.tsx`
- Generate ignored output: `dist/`

- [ ] **Step 1: Run the full Vitest suite**

Run from `E:\starmath`:

```powershell
npm test
```

Expected: Vitest exits `0` with every test file and test passing.

- [ ] **Step 2: Build the production bundle**

Run:

```powershell
npm run build
```

Expected: TypeScript compilation and Vite build exit `0`; `dist/` is
generated without type or bundling errors.

### Task 4: Run and inspect responsive visual verification

**Files:**
- Test: `tests/visual/xingshu-homepage.spec.ts`
- Generate ignored screenshots:
  `outputs/xingshu-homepage-system/qa/react/dashboard-react-*.png`

- [ ] **Step 1: Run the Playwright visual suite**

Run from `E:\starmath`:

```powershell
npm run test:visual
```

Expected: Playwright starts the Vite server on `127.0.0.1:5173`, all Chromium
tests pass, pages have no horizontal overflow, required ECharts canvases are
ready, and screenshots are written for all configured viewports.

- [ ] **Step 2: Inspect the four dashboard screenshots**

Open and review:

```text
outputs/xingshu-homepage-system/qa/react/dashboard-react-1440x900.png
outputs/xingshu-homepage-system/qa/react/dashboard-react-1672x941.png
outputs/xingshu-homepage-system/qa/react/dashboard-react-2200x944.png
outputs/xingshu-homepage-system/qa/react/dashboard-react-390x844.png
```

Expected: desktop layouts use the intended two-column or 12-column grid;
mobile uses a single column; sidebar/mobile navigation is correct; chart
canvases fill their cards; KPI and alert text stay inside card boundaries;
there is no clipped content or horizontal page overflow.

- [ ] **Step 3: Confirm verification did not alter tracked files**

Run:

```powershell
git status --short
```

Expected: no tracked or untracked entries. The generated `dist/`, Playwright
output, and QA screenshots remain ignored.

### Task 5: Publish the verified linear history

**Files:**
- Update remote ref: `xingshu.git/refs/heads/master`
- Delete temporary local ref:
  `E:\starmath\.git\refs\remotes\v2-local\master`

- [ ] **Step 1: Guard against concurrent remote changes**

Run from `E:\starmath`:

```powershell
git fetch --prune origin
git rev-list --left-right --count origin/master...master
git merge-base --is-ancestor origin/master master
```

Expected: divergence is `0 4` and the ancestor check exits `0`. Stop before
push if the remote has gained a commit not contained in local `master`.

- [ ] **Step 2: Push the fast-forwarded branch**

Run:

```powershell
git push origin master
```

Expected: Git reports a fast-forward update of `origin/master` and exits `0`.

- [ ] **Step 3: Remove the temporary reference and verify final state**

Run:

```powershell
git update-ref -d refs/remotes/v2-local/master
git fetch --prune origin
git status --short --branch
git rev-parse master
git rev-parse origin/master
git -C E:\xingshu-v2 status --short --branch
```

Expected: `E:\starmath` reports `master...origin/master` with no file entries;
its local and remote hashes are identical. `E:\xingshu-v2` is clean and
remains ahead of its own origin by two documentation commits; no v2 push or
directory deletion occurs.
