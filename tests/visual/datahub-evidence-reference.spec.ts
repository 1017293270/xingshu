import { expect, test } from "@playwright/test";

for (const conflicting of [false, true]) {
  test(`evidence references ${conflicting ? "fall back on conflicting mappings" : "open the exact returned fragment"}`, async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      const user = { token: "evidence-fixture-token", userId: 1, username: "qa" };
      localStorage.setItem("xingshu_datahub_token", user.token);
      localStorage.setItem("xingshu_datahub_user", JSON.stringify(user));
      localStorage.setItem("xingshu_datahub_space_id", "1");
      localStorage.setItem("xingshu_onboarding_v1", "done");
    });
    const sources = [{
      docId: "9001", kbId: "7", kbName: "采购合同库", docName: "采购合同.pdf", sourceAvailable: true,
      fragments: ["不相关的第一片段。", "双方应共同签署验收证明。"],
      evidenceFragments: [{ evidenceId: "e4", text: "双方应共同签署验收证明。" }]
    }, ...(conflicting ? [{
      docId: "9002", kbId: "7", kbName: "采购合同库", docName: "历史合同.pdf", sourceAvailable: true,
      fragments: ["历史版本的不同验收条款。"],
      evidenceFragments: [{ evidenceId: "e4", text: "历史版本的不同验收条款。" }]
    }] : [])];
    let artifactRequests = 0;
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/file_content")) return route.fulfill({ json: { content: "# 验收原文\n\n双方共同确认。\n\n![合同印章](images/seal.png)" } });
      if (url.pathname.endsWith("/source_document_preview")) return route.fulfill({ status: 503, json: { message: "原始PDF暂不可用" } });
      if (url.pathname.endsWith("/document-artifact")) {
        artifactRequests++;
        expect(url.searchParams.get("doc_id")).toBe("9001");
        expect(url.searchParams.get("kb_id")).toBe("7");
        expect(url.searchParams.get("artifact_path")).toBe("images/seal.png");
        expect(url.searchParams.has("token")).toBe(false);
        expect(url.href).not.toContain("evidence-fixture-token");
        expect(route.request().headers()["authorization"]).toBe("Bearer evidence-fixture-token");
        return route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64") });
      }
      if (url.pathname === "/api/agentScore/chat/completions/stream") {
        const request = route.request().postDataJSON() as { sessionId: string; globalSessionId: string; chatId: string; chatMode: string };
        expect(request.chatMode).toBe("rag");
        const root = { agentName: "问知智能体", sessionId: request.sessionId, globalSessionId: request.globalSessionId, chatId: request.chatId };
        const events = [
          { ...root, type: "thinking", content: "核对验收条款。", isThinking: true },
          ...sources.map((content) => ({ ...root, type: "citation_document", content })),
          { ...root, type: "text", content: "验收需要共同确认。\n\n原文引用：见证据 `e4`。" },
          { ...root, type: "done", content: { mode: "rag", askKnowledge: true }, finished: true }
        ];
        return route.fulfill({ contentType: "text/event-stream", body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n" });
      }
      return route.fulfill({ json: { code: 200, message: "fixture", data: [] } });
    });
    await page.goto("/ask-knowledge");
    await page.getByRole("textbox", { name: "命令输入" }).fill("验收要求是什么？");
    await page.getByRole("button", { name: "发送" }).click();
    await expect(page.getByRole("region", { name: "查询过程", exact: true })).toHaveAttribute("data-status", "done");
    const exact = page.getByRole("button", { name: "e4：查看引用原文片段", exact: true });
    if (conflicting) {
      await page.getByRole("button", { name: "e4：查看本轮引用文档（暂未提供准确位置）", exact: true }).click();
      await expect(exact).toHaveCount(0);
      const dialog = page.getByRole("dialog", { name: "引用 e4" });
      await expect(dialog).toContainText("暂未提供准确位置");
      await expect(dialog.getByRole("button", { name: "浏览文档片段：采购合同.pdf" })).toBeVisible();
      await expect(dialog.getByRole("button", { name: "浏览文档片段：历史合同.pdf" })).toBeVisible();
    } else {
      await exact.click();
      const fragment = page.getByRole("dialog", { name: "引用 e4" }).getByRole("region", { name: "e4 引用原文片段" });
      await expect(fragment).toContainText("双方应共同签署验收证明。");
      await expect(fragment).not.toContainText("不相关的第一片段");
      await expect(fragment).toContainText("采购合同.pdf");
      await page.screenshot({ path: testInfo.outputPath("exact-evidence-fragment.png"), animations: "disabled" });
      await page.getByRole("dialog", { name: "引用 e4" }).getByRole("button", { name: "打开原文：采购合同.pdf", exact: true }).click();
      const image = page.getByRole("img", { name: "合同印章", exact: true });
      await expect(image).toHaveAttribute("src", /^blob:/);
      await expect.poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      // 开发入口启用 StrictMode，会重放一次挂载effect；每次请求都在route内校验鉴权与文档身份。
      expect([1, 2]).toContain(artifactRequests);
    }
    await page.screenshot({ path: testInfo.outputPath("evidence-reference.png"), fullPage: true, animations: "disabled" });
  });
}
