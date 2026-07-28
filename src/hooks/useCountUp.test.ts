import { describe, expect, it } from "vitest";
import { parseCountUpValue } from "./useCountUp";

describe("parseCountUpValue", () => {
  it.each([
    ["1,234", { target: 1234, decimals: 0, suffix: "" }],
    ["27.30 TB", { target: 27.3, decimals: 2, suffix: " TB" }],
    ["31.3 万次", { target: 31.3, decimals: 1, suffix: " 万次" }],
    ["0%", { target: 0, decimals: 0, suffix: "%" }]
  ])("parses %s while preserving decimals and suffixes", (value, expected) => {
    expect(parseCountUpValue(value)).toEqual(expected);
  });

  it("leaves non-numeric values out of the animation path", () => {
    expect(parseCountUpValue("暂无数据")).toBeNull();
  });
});
