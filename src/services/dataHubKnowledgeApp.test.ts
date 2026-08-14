import { describe, expect, it, vi } from "vitest";
import {
  buildDataHubKnowledgeDetailUrl,
  buildDataHubKnowledgeManageUrl,
  openDataHubUrl,
  resolveDataHubAppOrigin,
  resolveDataHubKnowledgeAppLinks
} from "./dataHubKnowledgeApp";

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

  it("returns detail URLs only when a detail path is configured", () => {
    const withoutDetail = resolveDataHubKnowledgeAppLinks({
      VITE_DATAHUB_APP_URL: "https://datahub.example.test",
      VITE_DATAHUB_KB_MANAGE_PATH: "/knowledge"
    }, 3);
    expect(withoutDetail.canAdd).toBe(true);
    expect(withoutDetail.manageUrl).toBe("https://datahub.example.test/knowledge?space_id=3");
    expect(withoutDetail.detailUrlFor("kb-1")).toBeNull();

    const withDetail = resolveDataHubKnowledgeAppLinks({
      VITE_DATAHUB_APP_URL: "https://datahub.example.test",
      VITE_DATAHUB_KB_MANAGE_PATH: "/knowledge",
      VITE_DATAHUB_KB_DETAIL_PATH: "/knowledge/{id}"
    }, 3);
    expect(withDetail.detailUrlFor("kb-1")).toBe(
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
  });
});
