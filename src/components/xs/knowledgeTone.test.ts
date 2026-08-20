import { describe, expect, it } from "vitest";
import { xsKnowledgeToneFor, xsKnowledgeTones } from "./knowledgeTone";

describe("xsKnowledgeToneFor", () => {
  it("gives one knowledge base the same tone no matter where it sits in the list", () => {
    const ids = ["kb-policy", "kb-legal", "kb-hr"];
    const firstPass = ids.map(xsKnowledgeToneFor);
    const reversed = [...ids].reverse().map(xsKnowledgeToneFor).reverse();

    expect(reversed).toEqual(firstPass);
    expect(xsKnowledgeToneFor("kb-policy")).toBe(xsKnowledgeToneFor("kb-policy"));
  });

  it("only ever returns a tone the icon tile has a color for", () => {
    for (const id of ["", "a", "kb-policy", "知识库-2026", "x".repeat(200)]) {
      expect(xsKnowledgeTones).toContain(xsKnowledgeToneFor(id));
    }
  });
});
