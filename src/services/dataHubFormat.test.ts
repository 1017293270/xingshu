import { describe, expect, it } from "vitest";
import { formatDataHubColumnTitle } from "./dataHubFormat";

describe("dataHubFormat", () => {
  it("resolves DataHub qualified field names to stable Chinese labels", () => {
    expect(formatDataHubColumnTitle("WechatyProjectInfo.projectName")).toBe("项目名称");
    expect(formatDataHubColumnTitle("WechatyEventRecord.count")).toBe("事件记录数");
    expect(formatDataHubColumnTitle("count", "WechatyEventRecord.count")).toBe("事件记录数");
  });

  it("keeps authoritative Chinese titles and removes redundant table wording", () => {
    expect(formatDataHubColumnTitle("微信机器人事件记录表 记录数")).toBe("记录数");
    expect(formatDataHubColumnTitle("微信机器人项目信息表 项目名称表")).toBe("项目名称");
  });

  it("keeps unknown field identifiers unchanged", () => {
    expect(formatDataHubColumnTitle("CustomCube.unmappedField")).toBe("CustomCube.unmappedField");
  });
});
