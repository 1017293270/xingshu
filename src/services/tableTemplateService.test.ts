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
  stripTemplateLaunchReference,
  suggestTableTemplateDraft,
  updateTableTemplate,
  type TableTemplateDraftContext
} from "./tableTemplateService";
import type { DataHubClarification } from "@/types/dataHub";

type DraftTurn = TableTemplateDraftContext["turns"][number];

function turn(question: string, clarifications: DataHubClarification[] = []): DraftTurn {
  return { question, clarifications };
}

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

  it("去掉模板发起时拼上的结构参考，截成半截的尾巴也认得出", () => {
    const launched = buildTemplateLaunchPrompt({
      id: 1,
      name: "合同台账",
      prompt: "按年度统计合同",
      structureJson: '{"columns":[{"title":"合同编号"}]}'
    });
    expect(stripTemplateLaunchReference(launched)).toBe("按年度统计合同");
    // 后端标题截 50 字补「...」：截在标签中间、截在空行上都要去干净
    expect(stripTemplateLaunchReference("按年度统计合同\n\n表结构参...")).toBe("按年度统计合同");
    expect(stripTemplateLaunchReference("按年度统计合同\n\n...")).toBe("按年度统计合同");
    expect(stripTemplateLaunchReference("按年度统计合同\n...")).toBe("按年度统计合同");
    // 普通截断和多行原话保持原样
    expect(stripTemplateLaunchReference("统计各部门人数...")).toBe("统计各部门人数...");
    expect(stripTemplateLaunchReference(" 统计各客户\n补充要求：不含我司 ")).toBe("统计各客户\n补充要求：不含我司");
  });
});

describe("suggestTableTemplateDraft", () => {
  it("单轮会话：名称与提示词都取第一轮原话", async () => {
    await expect(suggestTableTemplateDraft({ turns: [turn("月度费用统计报表")] })).resolves.toEqual({
      name: "月度费用统计报表",
      prompt: "月度费用统计报表"
    });
  });

  it("名称剥掉口头前缀与造表套话，提示词保留原话", async () => {
    const cases: Array<[string, string]> = [
      ["帮我统计一下各部门人数吧。", "各部门人数"],
      ["请帮我查询一下华东区客户名单", "华东区客户名单"],
      ["给我做一张客户合同金额表", "客户合同金额表"],
      ["你好，能帮我整理一份供应商清单吗？谢谢", "供应商清单"],
      ["我想看一下各区域销售额", "各区域销售额"],
      ["列出所有在建项目", "所有在建项目"],
      ["生成下月排班表", "下月排班表"],
      ["能源消耗月度统计", "能源消耗月度统计"]
    ];

    for (const [question, name] of cases) {
      const draft = await suggestTableTemplateDraft({ turns: [turn(question)] });
      expect(draft.name).toBe(name);
      expect(draft.prompt).toBe(question);
    }
  });

  it("名称控制在 30 字左右，优先截在分句上，不在顿号处截断枚举", async () => {
    const long = await suggestTableTemplateDraft({
      turns: [turn("请帮我查询一下2025年所有客户的合同金额，按季度汇总，并标注同比变化，另外客户不包含我司")]
    });
    expect(long.name).toBe("2025年所有客户的合同金额，按季度汇总，并标注同比变化");

    const noClause = await suggestTableTemplateDraft({
      turns: [turn("统计2023、2024、2025年华东区和华南区全部重点客户的签约合同金额与回款金额明细对照")]
    });
    expect(Array.from(noClause.name)).toHaveLength(30);
    expect(noClause.name.startsWith("2023、2024、2025年")).toBe(true);
  });

  it("首行只有套话时往下一行找表名，全是套话再用结果表标题兜底", async () => {
    const nextLine = await suggestTableTemplateDraft({ turns: [turn("帮我做个表：\n统计各部门人数")] });
    expect(nextLine.name).toBe("各部门人数");
    expect(nextLine.prompt).toBe("帮我做个表：\n统计各部门人数");

    const tableTitle = await suggestTableTemplateDraft({
      turns: [turn("帮我做个表")],
      table: { title: "合同年度数量", columns: [] }
    });
    expect(tableTitle.name).toBe("合同年度数量");

    const fallback = await suggestTableTemplateDraft({ turns: [turn("帮我做个表")] });
    expect(fallback.name).toBe("制表模板");
  });

  it("多轮会话：提示词合成第一轮原话、已确认的澄清与后续补充，名称仍取第一轮", async () => {
    const draft = await suggestTableTemplateDraft({
      turns: [
        turn("帮我做一张客户合同金额表", [
          {
            interactionId: "tool-1",
            question: "客户范围按哪个口径？",
            options: [
              { label: "全部外部客户", value: "external" },
              { label: "含关联方", value: "all" }
            ],
            allowFreeText: false,
            selectedAnswer: "external"
          },
          // 还没答的不算确认项
          {
            interactionId: "tool-2",
            question: "金额取哪个字段？",
            options: [{ label: "签约金额" }],
            allowFreeText: false
          }
        ]),
        turn("没有日期吗，我说的客户肯定不包含我司嘛", [
          // 历史卡没有 interactionId，提交的是回复原文
          {
            question: "日期用哪一个：",
            options: [{ label: "签约日期", reply: "按签约日期" }],
            allowFreeText: false,
            selectedAnswer: "按签约日期"
          }
        ]),
        // 重试会原样重发同一句，不能在提示词里出现两遍
        turn("没有日期吗，我说的客户肯定不包含我司嘛")
      ]
    });

    expect(draft.name).toBe("客户合同金额表");
    expect(draft.prompt).toBe([
      "帮我做一张客户合同金额表",
      "已确认：",
      "1. 客户范围按哪个口径：全部外部客户",
      "2. 日期用哪一个：按签约日期",
      "补充要求：",
      "1. 没有日期吗，我说的客户肯定不包含我司嘛"
    ].join("\n"));
  });

  it("模板发起的会话再存模板时，不把旧的结构参考带进新提示词", async () => {
    const draft = await suggestTableTemplateDraft({
      turns: [
        turn("按年度统计合同\n\n表结构参考（按以下列生成）：合同编号、合同金额"),
        turn("再加一列签约日期")
      ]
    });

    expect(draft).toEqual({
      name: "按年度统计合同",
      prompt: "按年度统计合同\n补充要求：\n1. 再加一列签约日期"
    });
  });
});
