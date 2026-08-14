import { describe, expect, it, vi } from "vitest";
import {
  DATA_HUB_KNOWLEDGE_DETAIL_PATH,
  DATA_HUB_KNOWLEDGE_MANAGE_PATH,
  DATA_HUB_WEB_SPACE_ID_KEY,
  DATA_HUB_WEB_TOKEN_KEY,
  DATA_HUB_WEB_USER_KEY,
  buildDataHubKnowledgeDetailUrl,
  buildDataHubKnowledgeManageUrl,
  openDataHubUrl,
  resolveDataHubAppOrigin,
  resolveDataHubKnowledgeAppLinks
} from "./dataHubKnowledgeApp";
import { writeDataHubAuth, writeDataHubSpaceId } from "./dataHubSession";

describe("dataHubKnowledgeApp URLs", () => {
  it("builds a manage URL with an optional path and space id", () => {
    expect(buildDataHubKnowledgeManageUrl("https://datahub.example.test", "/knowledge", 7)).toBe(
      "https://datahub.example.test/knowledge?space_id=7"
    );
    expect(buildDataHubKnowledgeManageUrl("https://datahub.example.test/", "", 7)).toBe(
      "https://datahub.example.test/?space_id=7"
    );
    expect(buildDataHubKnowledgeManageUrl("https://datahub.example.test", "knowledge")).toBe(
      "https://datahub.example.test/knowledge"
    );
  });

  it("rejects missing or non-http app origins", () => {
    expect(buildDataHubKnowledgeManageUrl("", "/knowledge", 7)).toBeNull();
    expect(buildDataHubKnowledgeManageUrl("   ", "/knowledge")).toBeNull();
    expect(buildDataHubKnowledgeManageUrl("javascript:alert(1)", "/knowledge")).toBeNull();
    expect(buildDataHubKnowledgeManageUrl("ftp://datahub.example.test", "/knowledge")).toBeNull();
    expect(buildDataHubKnowledgeManageUrl("not a url", "/knowledge")).toBeNull();
  });

  it("rejects a manage path that escapes the DataHub origin", () => {
    expect(
      buildDataHubKnowledgeManageUrl("https://datahub.example.test", "https://evil.example/knowledge")
    ).toBeNull();
    expect(
      buildDataHubKnowledgeManageUrl("https://datahub.example.test", "//evil.example/knowledge")
    ).toBeNull();
  });

  it("builds a detail URL from a {id} path or by appending the id", () => {
    expect(
      buildDataHubKnowledgeDetailUrl("https://datahub.example.test", "/kb/{id}", "kb-1", 7)
    ).toBe("https://datahub.example.test/kb/kb-1?space_id=7");
    expect(
      buildDataHubKnowledgeDetailUrl("https://datahub.example.test", "/knowledge/", "kb 2")
    ).toBe("https://datahub.example.test/knowledge/kb%202");
    expect(
      buildDataHubKnowledgeDetailUrl(
        "https://datahub.example.test",
        DATA_HUB_KNOWLEDGE_DETAIL_PATH,
        "kb-1",
        7
      )
    ).toBe("https://datahub.example.test/platform/knowledge/7/kb-1?space_id=7");
    expect(
      buildDataHubKnowledgeDetailUrl(
        "https://datahub.example.test",
        DATA_HUB_KNOWLEDGE_DETAIL_PATH,
        "kb-1"
      )
    ).toBeNull();
  });

  it("does not build a detail URL without a path or id", () => {
    expect(buildDataHubKnowledgeDetailUrl("https://datahub.example.test", "", "kb-1")).toBeNull();
    expect(buildDataHubKnowledgeDetailUrl("https://datahub.example.test", "/kb/{id}", "  ")).toBeNull();
  });

  it("reuses the login DataHub origin instead of requiring a separate app URL", () => {
    expect(resolveDataHubAppOrigin({
      VITE_DATAHUB_PROXY_TARGET: "http://127.0.0.1:8090"
    })).toBe("http://127.0.0.1:8090");
    expect(resolveDataHubAppOrigin({
      VITE_DATAHUB_API_BASE_URL: "https://datahub.example.test/api/"
    })).toBe("https://datahub.example.test");
    expect(resolveDataHubAppOrigin({
      VITE_DATAHUB_BFF_PORT: "8090"
    })).toBe("http://127.0.0.1:8090");
    expect(resolveDataHubAppOrigin({
      VITE_DATAHUB_APP_URL: "https://datahub-ui.example.test",
      VITE_DATAHUB_PROXY_TARGET: "http://127.0.0.1:8090"
    })).toBe("https://datahub-ui.example.test");
  });

  it("enables add from the login proxy target", () => {
    expect(resolveDataHubKnowledgeAppLinks({
      VITE_DATAHUB_PROXY_TARGET: "http://127.0.0.1:8090",
      VITE_DATAHUB_KB_MANAGE_PATH: "/knowledge"
    }, 7)).toMatchObject({
      canAdd: true,
      manageUrl: "http://127.0.0.1:8090/knowledge?space_id=7"
    });
    expect(resolveDataHubKnowledgeAppLinks({
      VITE_DATAHUB_PROXY_TARGET: "http://127.0.0.1:8090"
    }, 7)).toMatchObject({
      canAdd: true,
      manageUrl: `http://127.0.0.1:8090${DATA_HUB_KNOWLEDGE_MANAGE_PATH}?space_id=7`
    });
    expect(resolveDataHubKnowledgeAppLinks({
      VITE_DATAHUB_PROXY_TARGET: "http://127.0.0.1:8090"
    }, 7).manageUrl).not.toContain("token");
  });

  it("explains why add is disabled when no login DataHub origin is available", () => {
    expect(resolveDataHubKnowledgeAppLinks({}, 7)).toMatchObject({
      manageUrl: null,
      canAdd: false,
      addDisabledReason: "无法从当前登录配置确定 DataHub 地址"
    });
    expect(resolveDataHubKnowledgeAppLinks({
      VITE_DATAHUB_APP_URL: "javascript:alert(1)"
    }, 7)).toMatchObject({
      manageUrl: null,
      canAdd: false,
      addDisabledReason: "DataHub 地址无效"
    });
  });

  it("uses DataHub platform paths by default and still honors explicit overrides", () => {
    const defaults = resolveDataHubKnowledgeAppLinks({
      VITE_DATAHUB_APP_URL: "https://datahub.example.test"
    }, 3);
    expect(defaults.canAdd).toBe(true);
    expect(defaults.manageUrl).toBe("https://datahub.example.test/platform/knowledge?space_id=3");
    expect(defaults.detailUrlFor("kb-1")).toBe(
      "https://datahub.example.test/platform/knowledge/3/kb-1?space_id=3"
    );

    const overridden = resolveDataHubKnowledgeAppLinks({
      VITE_DATAHUB_APP_URL: "https://datahub.example.test",
      VITE_DATAHUB_KB_MANAGE_PATH: "/knowledge",
      VITE_DATAHUB_KB_DETAIL_PATH: "/knowledge/{id}"
    }, 3);
    expect(overridden.manageUrl).toBe("https://datahub.example.test/knowledge?space_id=3");
    expect(overridden.detailUrlFor("kb-1")).toBe(
      "https://datahub.example.test/knowledge/kb-1?space_id=3"
    );
  });

  it("opens DataHub without putting credentials in the window features", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    openDataHubUrl("https://datahub.example.test/knowledge?space_id=7");

    expect(open).toHaveBeenCalledWith(
      "https://datahub.example.test/knowledge?space_id=7",
      "_blank",
      "noopener,noreferrer"
    );
    expect(window.localStorage.getItem(DATA_HUB_WEB_TOKEN_KEY)).toBeNull();
  });

  it("launches DataHub on the current origin during local development", () => {
    expect(resolveDataHubKnowledgeAppLinks({}, 7, {
      currentOrigin: "http://127.0.0.1:5175",
      sameOriginUi: true
    })).toMatchObject({
      canAdd: true,
      usesSameOriginUi: true,
      manageUrl: "http://127.0.0.1:5175/platform/knowledge?space_id=7"
    });
  });

  it("seeds DataHub web storage only when opening a same-origin manage page", () => {
    writeDataHubAuth({ token: "token-123", userId: 1, username: "demo", isAdmin: false });
    writeDataHubSpaceId(7);
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    openDataHubUrl(`${window.location.origin}/platform/knowledge?space_id=7`);

    expect(open).toHaveBeenCalledWith(
      `${window.location.origin}/platform/knowledge?space_id=7`,
      "_blank",
      "noopener,noreferrer"
    );
    expect(window.localStorage.getItem(DATA_HUB_WEB_TOKEN_KEY)).toBe("token-123");
    expect(window.localStorage.getItem(DATA_HUB_WEB_SPACE_ID_KEY)).toBe("7");
    expect(window.localStorage.getItem(DATA_HUB_WEB_USER_KEY)).toContain("demo");
  });
});
