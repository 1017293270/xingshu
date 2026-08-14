import { describe, expect, it, vi } from "vitest";
import {
  buildDataHubKnowledgeDetailUrl,
  buildDataHubKnowledgeManageUrl,
  openDataHubUrl,
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

  it("explains why add is disabled when the app origin is missing or unsafe", () => {
    expect(resolveDataHubKnowledgeAppLinks({}, 7)).toMatchObject({
      manageUrl: null,
      canAdd: false,
      addDisabledReason: "尚未配置 DataHub 前端地址"
    });
    expect(resolveDataHubKnowledgeAppLinks({
      VITE_DATAHUB_APP_URL: "javascript:alert(1)"
    }, 7)).toMatchObject({
      manageUrl: null,
      canAdd: false,
      addDisabledReason: "DataHub 前端地址无效"
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
