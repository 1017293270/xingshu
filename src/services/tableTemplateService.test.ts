import { beforeEach, describe, expect, it, vi } from "vitest";

const clientMocks = vi.hoisted(() => ({
  requestDataHub: vi.fn(),
  readDataHubSession: vi.fn()
}));

vi.mock("@/services/dataHubClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/dataHubClient")>()),
  requestDataHub: clientMocks.requestDataHub
}));

vi.mock("@/services/dataHubSession", () => ({
  readDataHubSession: clientMocks.readDataHubSession
}));

import {
  buildTableStructureJson,
  buildTemplateLaunchPrompt,
  createTableTemplate,
  deleteTableTemplate,
  listTableTemplates,
  parseTableStructureColumns,
  updateTableTemplate
} from "./tableTemplateService";

describe("tableTemplateService", () => {
  beforeEach(() => {
    clientMocks.requestDataHub.mockReset();
    clientMocks.readDataHubSession.mockReturnValue({ token: "t", user: null, spaceId: 10 });
  });

  it("结构快照只存展示列名与类型，双语表头收敛为中文", () => {
    const json = buildTableStructureJson([
      { key: "ContractList.contractNo", title: "contractNo（合同编号）" },
      { key: "amount", title: "合同金额", type: "number" }
    ]);
    expect(JSON.parse(json)).toEqual({
      columns: [{ title: "合同编号" }, { title: "合同金额", type: "number" }]
    });
  });

  it("结构快照解析对坏数据安全回退", () => {
    expect(parseTableStructureColumns(undefined)).toEqual([]);
    expect(parseTableStructureColumns("not-json")).toEqual([]);
    expect(parseTableStructureColumns('{"columns":"x"}')).toEqual([]);
    expect(
      parseTableStructureColumns('{"columns":[{"title":"合同编号"},{"title":""},{"bad":1}]}')
    ).toEqual([{ title: "合同编号" }]);
  });

  it("从模板发起制表时把结构列注入首轮提示词", () => {
    const template = {
      id: 1,
      name: "合同台账",
      prompt: "按年度统计合同",
      structureJson: '{"columns":[{"title":"合同编号"},{"title":"合同金额"}]}'
    };
    expect(buildTemplateLaunchPrompt(template)).toBe(
      "按年度统计合同\n\n表结构参考（按以下列生成）：合同编号、合同金额"
    );
    expect(buildTemplateLaunchPrompt({ ...template, structureJson: null })).toBe("按年度统计合同");
  });

  it("CRUD 走网关路径并带空间头", async () => {
    clientMocks.requestDataHub.mockResolvedValue([]);
    await listTableTemplates();
    expect(clientMocks.requestDataHub).toHaveBeenCalledWith("/api/v1/table-templates", { spaceId: 10 });

    clientMocks.requestDataHub.mockResolvedValue({ id: 1 });
    await createTableTemplate({ name: "合同台账", prompt: "按年度统计" });
    expect(clientMocks.requestDataHub).toHaveBeenCalledWith(
      "/api/v1/table-templates",
      expect.objectContaining({ method: "POST", spaceId: 10 })
    );

    await updateTableTemplate(7, { name: "合同台账", prompt: "按季度统计" });
    expect(clientMocks.requestDataHub).toHaveBeenCalledWith(
      "/api/v1/table-templates/7",
      expect.objectContaining({ method: "PUT", spaceId: 10 })
    );

    await deleteTableTemplate(7);
    expect(clientMocks.requestDataHub).toHaveBeenCalledWith(
      "/api/v1/table-templates/7",
      expect.objectContaining({ method: "DELETE", spaceId: 10 })
    );
  });

  it("未登录空间时列表返回空、写操作报错", async () => {
    clientMocks.readDataHubSession.mockReturnValue({ token: null, user: null, spaceId: null });
    await expect(listTableTemplates()).resolves.toEqual([]);
    await expect(createTableTemplate({ name: "n", prompt: "p" })).rejects.toThrow("请先登录");
    expect(clientMocks.requestDataHub).not.toHaveBeenCalled();
  });
});
