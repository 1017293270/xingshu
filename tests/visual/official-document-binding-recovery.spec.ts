import { expect, type Page, test } from "@playwright/test";

const evidenceDir = "outputs/official-document-binding-recovery";
const originalText = "本期新增问题数：0。";
async function fixture(page: Page, hasSnapshot = true) {
  await page.addInitScript(() => {
    localStorage.setItem("xingshu_datahub_token", "isolated-binding-recovery");
    localStorage.setItem("xingshu_datahub_user", JSON.stringify({ userId: 1, username: "binding-qa", isAdmin: false }));
    localStorage.setItem("xingshu_datahub_space_id", "1");
    localStorage.setItem("xingshu_onboarding_v1", "done");
  });
  let binding = {
    id: "binding-zero", slotId: "metric-zero", kind: "SCALAR", queryAssetId: "qa-issues",
    queryVersionId: "version-frozen", outputKey: "issueCount", status: hasSnapshot ? "ACTIVE" : "STALE",
    snapshotId: hasSnapshot ? "snapshot-old-zero" : null, executionId: hasSnapshot ? "execution-old-zero" : null,
    resolvedValue: hasSnapshot ? 0 : null, dataAsOf: "2026-09-08T00:00:00Z"
  };
  const content = { revision: 1, fixedValues: [], blocks: [{ id: "body-1", order: 0, role: "BODY", variantId: "body-main", text: originalText }] };
  let refreshes = 0;
  let detaches = 0;
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: data });
    if (path.endsWith("/v1/capabilities")) return json({ wordEngine: { available: true, licensed: true }, limits: { exportFormats: ["DOCX", "PDF"] } });
    if (path.endsWith("/v1/templates")) return json({ items: [{ id: "template-1", name: "历史数据报告", createdAt: "2026-09-08T00:00:00Z", versions: [{ id: "version-1", versionNumber: 1, status: "PUBLISHED", originalFileName: "历史数据报告.docx", originalSize: 100, createdAt: "2026-09-08T00:00:00Z" }] }] });
    if (path.endsWith("/v1/drafts")) return json({ items: [{ id: "draft-1", title: "零值快照恢复报告", templateId: "template-1", templateVersionId: "version-1", status: "READY", createdAt: "2026-09-08T00:00:00Z", fileVersions: [], bindings: [binding] }] });
    if (path.endsWith("/drafts/draft-1/content")) return json(content);
    if (path.endsWith("/drafts/draft-1/bindings:refresh")) {
      expect(req.method()).toBe("POST");
      refreshes++;
      binding = { ...binding, status: "SCHEMA_DRIFT" };
      return json([binding]);
    }
    if (path.endsWith("/drafts/draft-1/bindings/binding-zero:detach")) {
      expect(req.method()).toBe("POST");
      detaches++;
      if (detaches === 1) return json({ message: "转为普通文本暂时失败，请重试" }, 503);
      expect(binding.snapshotId).toBe("snapshot-old-zero");
      expect(binding.resolvedValue).toBe(0);
      binding = { ...binding, status: "MANUAL" };
      return json(binding);
    }
    if (path === "/api/analytics/query-assets") return json({ code: 200, message: "ok", data: [] });
    return json({ message: "Blocked by isolated binding fixture" }, 503);
  });
  return { binding: () => binding, refreshes: () => refreshes, detaches: () => detaches };
}

async function expectSources(page: Page) {
  const inspector = page.getByRole("dialog", { name: "导出检查", exact: true });
  for (const source of ["qa-issues", "issueCount → xs:binding:metric-zero", "execution-old-zero", "snapshot-old-zero", "version-frozen"]) {
    await expect(inspector.getByText(source, { exact: true })).toBeVisible();
  }
}

test("刷新失败保留零值快照，转普通文本失败可重试，成功后恢复导出且刷新保留来源", async ({ page }) => {
  const state = await fixture(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/writing/drafts/draft-1");
  const editor = page.getByRole("textbox", { name: "正文节点 1", exact: true });
  const exportDocx = page.getByRole("button", { name: "导出 DOCX", exact: true });
  await expect(editor).toHaveValue(originalText);
  await expect(exportDocx).toBeEnabled();
  await page.getByRole("button", { name: "刷新绑定快照", exact: true }).click();
  await expect(exportDocx).toBeDisabled();
  expect(state.refreshes()).toBe(1);
  expect(state.binding()).toMatchObject({ status: "SCHEMA_DRIFT", resolvedValue: 0, snapshotId: "snapshot-old-zero" });
  await expect(editor).toHaveValue(originalText);
  await page.getByRole("button", { name: /^导出检查(?:\s*1)?$/ }).click();
  const inspector = page.getByRole("dialog", { name: "导出检查", exact: true });
  const detach = inspector.getByRole("button", { name: "转为普通文本", exact: true });
  await expect(inspector.getByText("SCHEMA_DRIFT", { exact: true })).toBeVisible();
  await expect(inspector.getByText("暂不可导出", { exact: true })).toBeVisible();
  await expectSources(page);
  for (const width of [1440, 1672, 1920, 2200, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(detach).toBeEnabled();
    await detach.click({ trial: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await page.screenshot({ path: `${evidenceDir}/binding-recoverable-${width}.png`, fullPage: true, animations: "disabled" });
  }
  await detach.click();
  await expect(page.getByText("转为普通文本暂时失败，请重试", { exact: true })).toBeVisible();
  await expect(inspector.getByText("SCHEMA_DRIFT", { exact: true })).toBeVisible();
  await expect(inspector.getByText("暂不可导出", { exact: true })).toBeVisible();
  await expectSources(page);
  await expect(exportDocx).toBeDisabled();
  await detach.click();
  await expect(inspector.getByText("MANUAL", { exact: true })).toBeVisible();
  await expect(inspector.getByText("可导出", { exact: true })).toBeVisible();
  await expect(detach).toHaveCount(0);
  expect(state.detaches()).toBe(2);
  await expectSources(page);
  await expect(exportDocx).toBeEnabled();
  await page.screenshot({ path: `${evidenceDir}/binding-manual-390.png`, fullPage: true, animations: "disabled" });
  await page.reload();
  await expect(editor).toHaveValue(originalText);
  await expect(exportDocx).toBeEnabled();
  await page.getByRole("button", { name: /^导出检查(?:\s*1)?$/ }).click();
  await expect(inspector.getByText("MANUAL", { exact: true })).toBeVisible();
  await expect(inspector.getByText("可导出", { exact: true })).toBeVisible();
  await expectSources(page);
  expect(state.binding().resolvedValue).toBe(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `${evidenceDir}/binding-manual-reloaded-1440.png`, fullPage: true, animations: "disabled" });
});

test("没有有效快照的失败绑定不提供可执行的转普通文本操作", async ({ page }) => {
  const state = await fixture(page, false);
  await page.goto("/writing/drafts/draft-1");
  await expect(page.getByRole("button", { name: "导出 DOCX", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: /^导出检查(?:\s*1)?$/ }).click();
  const inspector = page.getByRole("dialog", { name: "导出检查", exact: true });
  const detach = inspector.getByRole("button", { name: "转为普通文本", exact: true });
  await expect(detach).toBeDisabled();
  await expect(detach).toHaveAttribute("title", "尚无可保留的有效快照，请先成功刷新绑定");
  expect(state.detaches()).toBe(0);
});
