import { describe, expect, it } from "vitest";
import type {
  OfficialDocumentStructureNode,
  OfficialDocumentTemplate,
  OfficialDocumentTemplateStatus
} from "@/types/officialDocument";
import {
  buildOfficialDocumentMappings,
  draftStatusAllowsExport,
  operationErrorMessage,
  styleVariantId,
  templateIsUsable,
  templateUsabilityLabel
} from "./officialDocumentMeta";

function usabilityFixture(status: OfficialDocumentTemplateStatus, compiledAvailable?: boolean) {
  return {
    status,
    currentVersion: { compiledAvailable }
  } as Pick<OfficialDocumentTemplate, "status" | "currentVersion">;
}

describe("officialDocumentMeta template usage", () => {
  it("只有已发布且编译文件还在的模板才算可用", () => {
    expect(templateIsUsable(usabilityFixture("PUBLISHED", true))).toBe(true);
    // 旧后端不返回这个字段，缺省按可用处理，保持向后兼容
    expect(templateIsUsable(usabilityFixture("PUBLISHED"))).toBe(true);
    expect(templateIsUsable(usabilityFixture("PUBLISHED", false))).toBe(false);
    // 待发布的模板生成得出来却下载不了，同样不给用
    expect(templateIsUsable(usabilityFixture("NEEDS_REVIEW"))).toBe(false);
    expect(templateIsUsable(usabilityFixture("ANALYZING"))).toBe(false);
    expect(templateIsUsable(usabilityFixture("BLOCKED"))).toBe(false);
  });

  it("给出区分「文件缺失」和「待发布」的状态文案", () => {
    expect(templateUsabilityLabel(usabilityFixture("PUBLISHED", false))).toBe("文件缺失，需重新上传");
    expect(templateUsabilityLabel(usabilityFixture("PUBLISHED", true))).toBe("可用");
    expect(templateUsabilityLabel(usabilityFixture("NEEDS_REVIEW"))).toBe("待发布");
    expect(templateUsabilityLabel(usabilityFixture("ANALYZING"))).toBe("分析中");
  });

  it("builds body and optional table mappings from the current structure", () => {
    const nodes: OfficialDocumentStructureNode[] = [
      {
        id: "paragraph:0",
        order: 1,
        paragraphIndex: 0,
        slotId: "11111111-1111-1111-1111-111111111111",
        role: "TITLE",
        roleLabel: "标题",
        preview: "通知",
        editable: true,
        dataBinding: false,
        required: true,
        styleSummary: ["加粗"]
      },
      {
        id: "paragraph:1",
        order: 2,
        paragraphIndex: 1,
        slotId: "22222222-2222-2222-2222-222222222222",
        role: "BODY",
        roleLabel: "正文",
        preview: "正文",
        editable: true,
        dataBinding: true,
        required: false,
        styleSummary: []
      },
      {
        id: "table:0",
        order: 3,
        tableIndex: 0,
        slotId: "33333333-3333-3333-3333-333333333333",
        role: "BODY",
        roleLabel: "表格 1（问数小表）",
        preview: "2 行 × 2 列",
        editable: true,
        dataBinding: true,
        required: false,
        styleSummary: ["2 行", "2 列"]
      },
      {
        id: "table:1",
        order: 4,
        tableIndex: 1,
        tableRowIndex: 0,
        tableColumnIndex: 0,
        slotId: "44444444-4444-4444-4444-444444444444",
        slotType: "FIXED_TABLE_TEXT",
        role: "ISSUING_AUTHORITY",
        roleLabel: "发文机关（红头）",
        preview: "XXXXXXXXXX公司",
        editable: true,
        dataBinding: false,
        required: false,
        styleSummary: ["1 行", "1 列"]
      },
      {
        id: "header-footer:0",
        order: 5,
        headerFooterIndex: 0,
        slotId: "55555555-5555-5555-5555-555555555555",
        slotType: "FIXED_HEADER_FOOTER_TEXT",
        role: "HEADER_FOOTER",
        roleLabel: "第 1 节页眉页脚文字",
        preview: "善治数字科技有限公司",
        editable: true,
        dataBinding: false,
        required: false,
        styleSummary: ["第 1 节"]
      }
    ];

    expect(buildOfficialDocumentMappings(nodes, 1, 1)).toEqual([
      expect.objectContaining({
        slotId: "11111111-1111-1111-1111-111111111111",
        role: "TITLE",
        slotType: "FIXED_TEXT",
        required: true
      }),
      expect.objectContaining({
        slotId: "22222222-2222-2222-2222-222222222222",
        role: "BODY",
        slotType: "DATA_TEXT",
        dataBinding: true,
        endParagraphIndex: 1
      }),
      expect.objectContaining({
        slotId: "33333333-3333-3333-3333-333333333333",
        slotType: "DATA_TABLE",
        dataBinding: true
      }),
      expect.objectContaining({
        slotId: "44444444-4444-4444-4444-444444444444",
        role: "ISSUING_AUTHORITY",
        slotType: "FIXED_TABLE_TEXT",
        dataBinding: false
      }),
      expect.objectContaining({
        slotId: "55555555-5555-5555-5555-555555555555",
        role: "HEADER_FOOTER",
        slotType: "FIXED_HEADER_FOOTER_TEXT",
        dataBinding: false
      })
    ]);
  });

  it("rebuilds format fingerprints from the current role and ignores text color", () => {
    const title: OfficialDocumentStructureNode = {
      id: "paragraph:0",
      order: 1,
      paragraphIndex: 0,
      slotId: "11111111-1111-1111-1111-111111111111",
      role: "TITLE",
      roleLabel: "标题",
      preview: "通知",
      editable: true,
      dataBinding: false,
      required: true,
      variantId: "stale-title",
      styleSummary: ["加粗", "颜色 000000"]
    };
    const withoutColor: OfficialDocumentStructureNode = {
      ...title,
      variantId: undefined,
      styleSummary: ["加粗"]
    };

    expect(styleVariantId(title, "TITLE")).toBe(styleVariantId(withoutColor, "TITLE"));
    expect(buildOfficialDocumentMappings([title])[0]?.variantId).toBe(styleVariantId(title, "TITLE"));
    expect(buildOfficialDocumentMappings([title])[0]?.variantId).not.toBe("stale-title");
  });

  it("hides leaked format-fingerprint errors from draft creation", () => {
    expect(operationErrorMessage(new Error("variantId 不属于该段落和角色对应的格式变体")))
      .toBe("模板结构还没保存成功，请再试一次创建草稿");
  });

  it("lets saved structured drafts export without waiting for a READY label", () => {
    expect(draftStatusAllowsExport("READY")).toBe(true);
    expect(draftStatusAllowsExport("EDITING")).toBe(true);
    expect(draftStatusAllowsExport("VALIDATING")).toBe(false);
    expect(draftStatusAllowsExport("BLOCKED")).toBe(false);
  });

  it("explains export failures in product language", () => {
    expect(operationErrorMessage(Object.assign(new Error("LibreOffice executable is unavailable"), {
      code: "LIBREOFFICE_UNAVAILABLE"
    }))).toBe("PDF 暂时不能生成，请先导出 Word");
    expect(operationErrorMessage(Object.assign(new Error("草稿必须处于 READY 状态才能正式导出"), {
      code: "DRAFT_NOT_READY"
    }))).toBe("这篇草稿还不能导出。内容保存完成后即可导出 Word");
  });
});
