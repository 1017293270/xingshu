import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OfficialDocumentEditorSession } from "@/types/officialDocument";
import { OnlyOfficeEditor } from "./OnlyOfficeEditor";
import { computeOnlyOfficeHeartbeatDelay } from "./onlyOfficeLease";
import { loadOnlyOfficeApiScript } from "./onlyOfficeScriptLoader";

afterEach(() => {
  delete window.DocsAPI;
  document.querySelectorAll("script[data-xingshu-onlyoffice-api]").forEach((script) => script.remove());
});

describe("OnlyOfficeEditor", () => {
  it("renews at one third of the remaining lease, clamped between 30 seconds and 5 minutes", () => {
    const now = Date.parse("2026-08-03T08:00:00Z");
    expect(computeOnlyOfficeHeartbeatDelay("2026-08-03T08:12:00Z", now)).toBe(4 * 60_000);
    expect(computeOnlyOfficeHeartbeatDelay("2026-08-03T09:00:00Z", now)).toBe(5 * 60_000);
    expect(computeOnlyOfficeHeartbeatDelay("2026-08-03T08:00:20Z", now)).toBe(30_000);
  });

  it("rejects non-HTTP script sources before changing the document", async () => {
    await expect(loadOnlyOfficeApiScript("javascript:alert(1)")).rejects.toThrow(
      "ONLYOFFICE api.js 地址必须使用 HTTP 或 HTTPS"
    );
    expect(document.querySelector("script[data-xingshu-onlyoffice-api]")).not.toBeInTheDocument();
  });

  it("loads api.js once, creates DocsAPI.DocEditor with the signed token, and destroys it on unmount", async () => {
    const created: Array<{ containerId: string; config: Record<string, unknown> }> = [];
    const destroyEditor = vi.fn();
    class MockDocEditor {
      destroyEditor = destroyEditor;

      constructor(containerId: string, config: Record<string, unknown>) {
        created.push({ containerId, config });
      }
    }

    const session: OfficialDocumentEditorSession = {
      id: "editor-session-1",
      draftId: "draft-1",
      mode: "EDIT",
      leaseExpiresAt: "2026-08-03T10:00:00Z",
      documentServerApiUrl: "https://docs.example.test/web-apps/apps/api/documents/api.js",
      token: "signed-onlyoffice-token",
      editorConfig: {
        documentType: "word",
        type: "desktop",
        document: { key: "draft-1-v1" }
      },
      message: "已创建单人编辑会话"
    };

    const { unmount } = render(<OnlyOfficeEditor draftTitle="测试公文" session={session} />);
    expect(screen.getByText("正在加载 ONLYOFFICE")).toBeInTheDocument();

    const script = document.querySelector<HTMLScriptElement>("script[data-xingshu-onlyoffice-api]");
    expect(script).not.toBeNull();
    expect(script?.src).toBe(session.documentServerApiUrl);

    window.DocsAPI = { DocEditor: MockDocEditor };
    script?.dispatchEvent(new Event("load"));

    expect(await screen.findByText("ONLYOFFICE 编辑器已就绪")).toBeInTheDocument();
    expect(created).toHaveLength(1);
    expect(created[0].containerId).toMatch(/^xs-onlyoffice-/);
    expect(created[0].config).toMatchObject({
      documentType: "word",
      token: "signed-onlyoffice-token",
      document: { key: "draft-1-v1" }
    });

    unmount();
    await waitFor(() => expect(destroyEditor).toHaveBeenCalledTimes(1));
  });

  it("keeps the fail-closed placeholder when the editor session is unavailable", () => {
    render(
      <OnlyOfficeEditor
        draftTitle="测试公文"
        session={{
          id: "unavailable",
          draftId: "draft-1",
          mode: "UNAVAILABLE",
          message: "ONLYOFFICE 未配置"
        }}
      />
    );

    expect(screen.getByText("网页 Word 编辑器未连接")).toBeInTheDocument();
    expect(screen.getByText("ONLYOFFICE 未配置")).toBeInTheDocument();
    expect(document.querySelector("script[data-xingshu-onlyoffice-api]")).not.toBeInTheDocument();
  });

  it("renews immediately when the page becomes visible and destroys the editor if heartbeat fails", async () => {
    const destroyEditor = vi.fn();
    class MockDocEditor {
      destroyEditor = destroyEditor;
    }
    const heartbeat = vi.fn().mockRejectedValue(new Error("租约已被其他窗口占用"));
    const session: OfficialDocumentEditorSession = {
      id: "editor-session-heartbeat",
      draftId: "draft-heartbeat",
      mode: "EDIT",
      leaseExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      documentServerApiUrl: "https://docs.example.test/web-apps/apps/api/documents/api.js",
      token: "signed-onlyoffice-token",
      editorConfig: { documentType: "word" },
      message: "已创建单人编辑会话"
    };

    render(<OnlyOfficeEditor draftTitle="测试公文" session={session} onHeartbeat={heartbeat} />);
    const script = document.querySelector<HTMLScriptElement>("script[data-xingshu-onlyoffice-api]");
    window.DocsAPI = { DocEditor: MockDocEditor };
    script?.dispatchEvent(new Event("load"));
    expect(await screen.findByText("ONLYOFFICE 编辑器已就绪")).toBeInTheDocument();

    document.dispatchEvent(new Event("visibilitychange"));

    expect(await screen.findByText("编辑租约失效，网页编辑已阻断")).toBeInTheDocument();
    expect(screen.getByText(/编辑租约续期失败，已停止编辑/)).toBeInTheDocument();
    expect(heartbeat).toHaveBeenCalledWith("draft-heartbeat", "editor-session-heartbeat");
    expect(destroyEditor).toHaveBeenCalledTimes(1);
  });
});
