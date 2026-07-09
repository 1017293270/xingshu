import { describe, expect, it } from "vitest";
import * as dashboardMock from "./dashboardMock";

type ChartRecord = Record<string, unknown>;

function firstSeries(option: unknown): ChartRecord {
  const series = (option as ChartRecord).series;
  expect(Array.isArray(series)).toBe(true);
  return (series as ChartRecord[])[0] ?? {};
}

describe("data dashboard chart mock", () => {
  it("uses exported asset type labels and values for named donut slices and its legend", () => {
    const exports = dashboardMock as unknown as ChartRecord;
    const labels = ["结构化数据", "半结构化数据", "非结构化数据", "API 数据", "其他"];
    const values = [5861, 3123, 2402, 1080, 380];

    expect(exports.assetTypeLabels).toEqual(labels);
    expect(exports.assetTypeValues).toEqual(values);

    const donut = dashboardMock.assetOptions.donut as ChartRecord;
    expect(firstSeries(donut).data).toEqual(labels.map((name, index) => ({ name, value: values[index] })));
    expect((donut.legend as ChartRecord).data).toEqual(labels);
  });

  it("uses exported growth labels and values across separate count and terabyte axes", () => {
    const exports = dashboardMock as unknown as ChartRecord;
    const labels = ["01-01", "02-01", "03-01", "04-01", "05-01", "06-04"];
    const values = {
      assetCount: [5200, 6900, 9300, 11000, 12400, 12846],
      dataVolumeTb: [12, 17, 23, 27, 28, 28.6]
    };

    expect(exports.dataAssetSnapshot).toEqual({ date: "06-04", assetCount: 12846, dataVolumeTb: 28.6 });
    expect(exports.assetGrowthLabels).toEqual(labels);
    expect(exports.assetGrowthValues).toEqual(values);

    const growth = dashboardMock.assetOptions.growth as ChartRecord;
    const axes = growth.yAxis as ChartRecord[];
    const series = growth.series as ChartRecord[];

    expect((growth.xAxis as ChartRecord).data).toEqual(labels);
    expect(axes).toHaveLength(2);
    expect(axes[0]).toMatchObject({ name: "个", position: "left", max: 15000 });
    expect(axes[1]).toMatchObject({ name: "TB", position: "right", max: 40 });
    expect(series[0]).toMatchObject({ name: "数据资产总量（个）", data: values.assetCount });
    expect(series[1]).toMatchObject({ name: "数据总量（TB）", data: values.dataVolumeTb, yAxisIndex: 1 });
  });
});
