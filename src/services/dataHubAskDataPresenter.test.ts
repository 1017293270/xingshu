import { describe, expect, it } from "vitest";
import {
  createDataHubAskTurn,
  getDataHubActionLabel,
  normalizeDataHubTableResult
} from "./dataHubAskDataPresenter";
import type { DataHubStreamEvent } from "@/types/dataHub";

describe("dataHubAskDataPresenter", () => {
  it("normalizes data-hub table payloads with object columns and rows", () => {
    const table = normalizeDataHubTableResult({
      columns: [
        { name: "WechatyProjectInfo.projectName", title: "项目名称" },
        { name: "WechatyConsulationRecord.count", title: "咨询数", type: "number" }
      ],
      rows: [
        {
          "WechatyProjectInfo.projectName": "演示账号",
          "WechatyConsulationRecord.count": 716
        }
      ],
      totalRows: 1,
      source: "cube"
    });

    expect(table).toMatchObject({
      totalRows: 1,
      source: "cube",
      columns: [
        { key: "WechatyProjectInfo.projectName", title: "项目名称" },
        { key: "WechatyConsulationRecord.count", title: "咨询数", type: "number" }
      ],
      rows: [
        {
          "WechatyProjectInfo.projectName": "演示账号",
          "WechatyConsulationRecord.count": 716
        }
      ]
    });
  });

  it("builds a renderable ask turn from the platform SSE event sequence", () => {
    const events: DataHubStreamEvent[] = [
      {
        type: "routing_intent",
        data: { step: "route_intent", message: "已完成意图路由", intent: "ASK_DATA", status: "success" }
      },
      {
        type: "react_step",
        data: { round: 1, action: "locate_datasource", status: "success", summary: "datasourceId=1" }
      },
      {
        type: "routing_decompose",
        data: { executionMode: "SIMPLE", subQuestions: ["统计各社区咨询数"] }
      },
      {
        type: "table",
        data: {
          columns: ["社区", "咨询数"],
          rows: [["演示账号", 716]],
          totalRows: 1
        }
      },
      {
        type: "done",
        data: { summary: "目前咨询数最多的社区为演示账号，累计咨询记录 716 条。", loopRounds: 6 }
      }
    ];

    const turn = createDataHubAskTurn("目前咨询数最多的社区是哪个社区", events, "done");

    expect(turn.assistantContent).toBe("目前咨询数最多的社区为演示账号，累计咨询记录 716 条。");
    expect(turn.decompose?.subQuestions).toEqual(["统计各社区咨询数"]);
    expect(turn.reactSteps).toHaveLength(1);
    expect(turn.tableResults[0].rows[0]).toEqual({ 社区: "演示账号", 咨询数: 716 });
    expect(getDataHubActionLabel(turn.reactSteps[0].action)).toBe("定位数据源");
  });

  it("restores table payloads persisted as JSON strings in history events", () => {
    const events: DataHubStreamEvent[] = [
      {
        type: "table",
        data: JSON.stringify({
          type: "table",
          data: {
            columns: [
              { name: "community", title: "社区" },
              { name: "consultCount", title: "咨询数", type: "number" }
            ],
            rows: [{ community: "六角井社区", consultCount: 128 }],
            totalRows: 1,
            source: "cube"
          }
        })
      },
      {
        type: "done",
        data: JSON.stringify({ summary: "六角井社区共有 128 条咨询记录。" })
      }
    ];

    const turn = createDataHubAskTurn("六角井社区有多少咨询?", events, "done");

    expect(turn.assistantContent).toBe("六角井社区共有 128 条咨询记录。");
    expect(turn.tableResults).toHaveLength(1);
    expect(turn.tableResults[0].columns).toEqual([
      { key: "community", title: "社区", type: undefined },
      { key: "consultCount", title: "咨询数", type: "number" }
    ]);
    expect(turn.tableResults[0].rows[0]).toEqual({ community: "六角井社区", consultCount: 128 });
  });

  it("normalizes stringified table rows and columns from persisted events", () => {
    const table = normalizeDataHubTableResult({
      columns: JSON.stringify(["社区", "咨询数"]),
      rows: JSON.stringify([["六角井社区", 128]]),
      rowCount: 1
    });

    expect(table?.totalRows).toBe(1);
    expect(table?.rows[0]).toEqual({ 社区: "六角井社区", 咨询数: 128 });
  });
});
