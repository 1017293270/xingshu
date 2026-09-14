import { expect, it } from "vitest";
import { budgetOfficialDocumentWritingContext, MAX_WRITING_CONTEXT_CHARS } from "./officialDocumentContextBudget";
import { buildOfficialDocumentReferenceWritingPlan, buildOfficialDocumentWritingContext } from "./officialDocumentFullDraft";

it("keeps ordinary contexts unchanged", () => {
  const context = { action: "DRAFT_ASSIST", currentDraft: [{ text: "收入120万元" }] };
  expect(budgetOfficialDocumentWritingContext(context)).toBe(context);
});

it("budgets real reference generation with long research tables, preserving requirements and anchors", () => {
  const rows = Array.from({ length: 50 }, () => ["文".repeat(2000)]);
  const plan = buildOfficialDocumentReferenceWritingPlan({ referenceDraft: { id: "d1", title: "报告", templateName: "模板" },
    content: { revision: 0, fixedValues: [], blocks: [] }, templateNodes: [], userRequirement: "只使用本期收入120万元",
    researchResults: [{ taskId: "n1", sectionId: "reference-body-1", kind: "ASK_DATA", question: "收入", required: true,
      preferredOutput: "TABLE", status: "SUCCESS", summary: "冻结结果", citations: [], table: { columns: ["材料"], rows, totalRows: 50 } }] });
  const context = plan.writingContext;
  expect(JSON.stringify(context).length).toBeLessThanOrEqual(MAX_WRITING_CONTEXT_CHARS);
  expect(context.sourceBlocks).toEqual([expect.objectContaining({ text: "只使用本期收入120万元" })]);
  expect(context.outputRules).toMatchObject({ sectionAnchors: ["[[XS_SECTION:reference-body-1]]"] });
  expect(context.contextTruncation).toMatchObject({ fields: expect.arrayContaining(["researchResults"]) });
  expect(rows).toHaveLength(50);
});

it("budgets editor context while prioritizing current text over long supporting materials", () => {
  const currentText = "正文事实120万元。".repeat(6000);
  const context = buildOfficialDocumentWritingContext({ action: "DRAFT_ASSIST", templateNodes: [],
    content: { revision: 0, fixedValues: [], blocks: [{ id: "b1", order: 0, role: "BODY", variantId: "", text: currentText }] },
    profile: { id: "p1", profile: { source: { blocks: [{ id: "source1", order: 0, kind: "PARAGRAPH", text: "资料。".repeat(20000),
      headingHint: "", columns: [], rows: [] }] } } } as never });
  expect(JSON.stringify(context).length).toBeLessThanOrEqual(MAX_WRITING_CONTEXT_CHARS);
  expect(context.currentDraft[0].text).toBe(currentText);
  expect(context.sourceBlocks[0].text).toContain("内容已截断");
});

it("accounts for escaped JSON and many short table cells without changing their numbers", () => {
  const context = budgetOfficialDocumentWritingContext({ action: "FULL_DRAFT", sourceBlocks: [{ headingHint: "USER_REQUIREMENT", text: "保留明确要求" }],
    researchResults: Array.from({ length: 10 }, (_, index) => ({ taskId: `n${index}`, table: {
      columns: Array.from({ length: 10 }, (_, column) => `列${column}`),
      rows: Array.from({ length: 50 }, () => Array.from({ length: 10 }, () => '123456789012345'))
    }, summary: '\\"'.repeat(5000) })) });
  expect(JSON.stringify(context).length).toBeLessThanOrEqual(MAX_WRITING_CONTEXT_CHARS);
  expect(context.sourceBlocks[0].text).toBe("保留明确要求");
  for (const result of context.researchResults) for (const row of result.table.rows) {
    expect(row.every((cell) => cell === '123456789012345')).toBe(true);
  }
});

it("budgets FULL_DRAFT without losing its confirmed section protocol or explicit requirements", () => {
  const section = { id: "section-1", order: 0, headingRole: "HEADING_1", title: "经营情况", purpose: "总结经营", keyPoints: [], sourceBlockIds: ["req"] };
  const requirement = "仅使用用户确认的收入120万元。";
  const context = buildOfficialDocumentWritingContext({ action: "FULL_DRAFT", templateNodes: [],
    content: { revision: 0, fixedValues: [], blocks: [{ id: "body", order: 0, role: "BODY", variantId: "", text: "当前经营正文。".repeat(15000) }] },
    profile: { id: "profile", profile: { confirmedPlan: { sections: [section], researchNeeds: [], warnings: [], summary: "年度报告", unassignedSourceBlockIds: [] },
      source: { blocks: [{ id: "req", order: 0, kind: "PARAGRAPH", headingHint: "USER_REQUIREMENT", text: requirement, columns: [], rows: [] }] } } } as never });
  expect(JSON.stringify(context).length).toBeLessThanOrEqual(MAX_WRITING_CONTEXT_CHARS);
  expect(context.logicSections).toEqual([section]);
  expect(context.sourceBlocks[0].text).toBe(requirement);
  expect(context.outputRules.sectionAnchor).toBe("[[XS_SECTION:section-id]]");
  expect(context.currentDraft[0].text).toContain("内容已截断");
});

it("also budgets JSON overhead from many short source blocks without dropping user requirements", () => {
  const context = budgetOfficialDocumentWritingContext({ action: "DRAFT_ASSIST", sourceBlocks: [
    ...Array.from({ length: 2000 }, (_, index) => ({ id: `source-${index}`, order: index, kind: "PARAGRAPH", headingHint: "", text: "收入120万元。", columns: [], rows: [] })),
    { id: "req", headingHint: "USER_REQUIREMENT", text: "只依据用户数据写作" }
  ] });
  expect(JSON.stringify(context).length).toBeLessThanOrEqual(MAX_WRITING_CONTEXT_CHARS);
  expect(context.sourceBlocks.at(-1)?.id).toBe("req");
  expect(context.sourceBlocks[0].text).toBe("收入120万元。");
});
