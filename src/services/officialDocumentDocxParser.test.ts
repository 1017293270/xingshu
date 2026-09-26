import { describe, expect, it } from "vitest";
import {
  DOCX_PDF_UNSUPPORTED_MESSAGE,
  DocxParseError,
  docxPlainText,
  parseDocx
} from "./officialDocumentDocxParser";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

type CfbWriter = {
  utils: {
    cfb_new: () => unknown;
    cfb_add: (container: unknown, path: string, content: Uint8Array) => void;
  };
  write: (container: unknown, options: { fileType: "zip"; type: "array" }) => ArrayLike<number>;
};

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function paragraph(text: string, properties = "") {
  return `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ""}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

const centered = "<w:jc w:val=\"center\"/>";

async function docxPackage(parts: Record<string, string>) {
  const loaded = await import("xlsx") as unknown as { CFB?: CfbWriter; default?: { CFB?: CfbWriter } };
  const cfb = (loaded.CFB ?? loaded.default?.CFB)!;
  const container = cfb.utils.cfb_new();
  const encoder = new TextEncoder();
  for (const [path, content] of Object.entries(parts)) cfb.utils.cfb_add(container, path, encoder.encode(content));
  return Uint8Array.from(cfb.write(container, { fileType: "zip", type: "array" }));
}

function documentXml(body: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body}<w:sectPr/></w:body></w:document>`;
}

async function docx(body: string, styles?: string) {
  return docxPackage({
    "[Content_Types].xml": "<Types/>",
    "word/document.xml": documentXml(body),
    ...(styles ? { "word/styles.xml": `<w:styles xmlns:w="${W}">${styles}</w:styles>` } : {})
  });
}

describe("parseDocx", () => {
  it("reads a numbered official document into title, preamble, headings and closing metadata", async () => {
    const parsed = await parseDocx(await docx([
      paragraph("XX市人民政府办公室", centered),
      paragraph("关于开展2025年安全生产大检查的通知", centered),
      paragraph("各部门、各单位："),
      paragraph("为深入贯彻安全生产工作部署，现将有关事项通知如下："),
      paragraph("一、检查时间"),
      paragraph("2025年3月1日至3月15日。"),
      paragraph("二、检查内容"),
      paragraph("（一）落实主体责任。各单位要对照清单逐项自查，形成台账。"),
      paragraph("1.建立隐患台账"),
      paragraph("逐条登记隐患位置、责任人和整改时限。"),
      paragraph("2.各单位于3月20日前报送自查报告。"),
      paragraph("（二）强化重点部位管控"),
      paragraph("重点检查消防通道和危化品存放。"),
      paragraph("XX市人民政府办公室"),
      paragraph("2025年2月20日")
    ].join("")));

    expect(parsed.title).toBe("关于开展2025年安全生产大检查的通知");
    expect(parsed.blocks.map((block) => [block.role, block.heading ?? block.text])).toEqual([
      ["META", "XX市人民政府办公室"],
      ["TITLE", "关于开展2025年安全生产大检查的通知"],
      ["META", "各部门、各单位："],
      ["BODY", "为深入贯彻安全生产工作部署，现将有关事项通知如下："],
      ["HEADING_1", "一、检查时间"],
      ["BODY", "2025年3月1日至3月15日。"],
      ["HEADING_1", "二、检查内容"],
      ["HEADING_2", "（一）落实主体责任"],
      ["HEADING_3", "1.建立隐患台账"],
      ["BODY", "逐条登记隐患位置、责任人和整改时限。"],
      // 带句号的整句「1.」条目是正文条目，不是三级标题
      ["BODY", "2.各单位于3月20日前报送自查报告。"],
      ["HEADING_2", "（二）强化重点部位管控"],
      ["BODY", "重点检查消防通道和危化品存放。"],
      ["META", "XX市人民政府办公室"],
      ["META", "2025年2月20日"]
    ]);
    // 标题和正文写在同一段时，标题之外的部分留作同段正文
    expect(parsed.blocks[7]).toMatchObject({
      text: "（一）落实主体责任。各单位要对照清单逐项自查，形成台账。",
      runIn: "各单位要对照清单逐项自查，形成台账。"
    });
    expect(parsed).toMatchObject({ paragraphCount: 15, tableCount: 0, headingCount: 5 });
  });

  it("uses heading styles and outline levels, inheriting the level through basedOn", async () => {
    const styles = [
      "<w:style w:type=\"paragraph\" w:styleId=\"1\"><w:name w:val=\"heading 1\"/><w:pPr><w:outlineLvl w:val=\"0\"/></w:pPr></w:style>",
      "<w:style w:type=\"paragraph\" w:styleId=\"a5\"><w:name w:val=\"heading 2\"/><w:pPr><w:outlineLvl w:val=\"1\"/></w:pPr></w:style>",
      "<w:style w:type=\"paragraph\" w:styleId=\"custom\"><w:name w:val=\"章节小标题\"/><w:basedOn w:val=\"a5\"/></w:style>",
      "<w:style w:type=\"paragraph\" w:styleId=\"Title\"><w:name w:val=\"Title\"/></w:style>"
    ].join("");
    const parsed = await parseDocx(await docx([
      paragraph("2026年工作要点", "<w:pStyle w:val=\"Title\"/>"),
      paragraph("总体思路", "<w:pStyle w:val=\"1\"/>"),
      paragraph("坚持稳中求进。"),
      paragraph("重点任务", "<w:pStyle w:val=\"custom\"/>"),
      paragraph("推进数字化转型。"),
      paragraph("保障措施", "<w:outlineLvl w:val=\"0\"/>"),
      paragraph("正文级别不算标题", "<w:outlineLvl w:val=\"9\"/>")
    ].join(""), styles));

    expect(parsed.title).toBe("2026年工作要点");
    expect(parsed.blocks.map((block) => [block.role, block.text])).toEqual([
      ["TITLE", "2026年工作要点"],
      ["HEADING_1", "总体思路"],
      ["BODY", "坚持稳中求进。"],
      ["HEADING_2", "重点任务"],
      ["BODY", "推进数字化转型。"],
      ["HEADING_1", "保障措施"],
      ["BODY", "正文级别不算标题"]
    ]);
  });

  it("compacts numbering tiers so the shallowest one present becomes level one", async () => {
    const parsed = await parseDocx(await docx([
      paragraph("（一）总体情况"),
      paragraph("今年以来工作总体平稳。"),
      paragraph("（1）收入"),
      paragraph("收入同比增长。"),
      paragraph("（二）下一步安排"),
      paragraph("抓好四季度收官。")
    ].join("")));

    expect(parsed.blocks.filter((block) => block.role.startsWith("HEADING_")).map((block) => [block.role, block.heading]))
      .toEqual([
        ["HEADING_1", "（一）总体情况"],
        ["HEADING_2", "（1）收入"],
        ["HEADING_1", "（二）下一步安排"]
      ]);
  });

  it("walks into content controls and tables, and skips deleted or text-box text", async () => {
    const parsed = await parseDocx(await docx([
      "<w:sdt><w:sdtPr><w:alias w:val=\"章节\"/></w:sdtPr><w:sdtContent>",
      paragraph("一、经营情况"),
      "<w:p><w:r><w:t>收入</w:t></w:r><w:del><w:r><w:delText>删掉的字</w:delText></w:r></w:del>",
      "<w:r><w:t xml:space=\"preserve\"> 稳步增长。</w:t></w:r>",
      "<w:r><w:drawing><w:txbxContent><w:p><w:r><w:t>文本框里的字</w:t></w:r></w:p></w:txbxContent></w:drawing></w:r></w:p>",
      "</w:sdtContent></w:sdt>",
      "<w:tbl><w:tr><w:tc>", paragraph("指标"), "</w:tc><w:tc>", paragraph("数值"), "</w:tc></w:tr>",
      "<w:tr><w:tc>", paragraph("收入"), "</w:tc><w:tc>", paragraph("120 万元"), "</w:tc></w:tr></w:tbl>"
    ].join("")));

    expect(parsed.blocks).toEqual([
      { kind: "PARAGRAPH", role: "HEADING_1", text: "一、经营情况", heading: "一、经营情况" },
      { kind: "PARAGRAPH", role: "BODY", text: "收入稳步增长。" },
      { kind: "TABLE", role: "BODY", text: "指标\t数值\n收入\t120 万元", rows: [["指标", "数值"], ["收入", "120 万元"]] }
    ]);
    expect(parsed.tableCount).toBe(1);
    expect(docxPlainText(parsed)).toBe("一、经营情况\n收入稳步增长。\n指标\t数值\n收入\t120 万元");
  });

  it("keeps a document without any heading as plain body text", async () => {
    const parsed = await parseDocx(await docx([
      paragraph("今天的会议主要讲三件事。"),
      paragraph("第一件事是安全，第二件事是进度。")
    ].join("")));

    expect(parsed.headingCount).toBe(0);
    expect(parsed.blocks.every((block) => block.role === "BODY")).toBe(true);
  });

  it("follows the package relationship when the main part is renamed", async () => {
    const bytes = await docxPackage({
      "[Content_Types].xml": "<Types/>",
      "_rels/.rels": "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document2.xml\"/></Relationships>",
      "word/document2.xml": documentXml(paragraph("一、改名后的主文档"))
    });

    const parsed = await parseDocx(bytes);
    expect(parsed.blocks[0]).toMatchObject({ role: "HEADING_1", heading: "一、改名后的主文档" });
  });

  it("explains PDF, legacy Word and broken files instead of failing silently", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
    await expect(parseDocx(pdf)).rejects.toMatchObject({ code: "PDF", message: DOCX_PDF_UNSUPPORTED_MESSAGE });

    const legacy = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    await expect(parseDocx(legacy)).rejects.toMatchObject({ code: "LEGACY_OR_ENCRYPTED" });

    await expect(parseDocx(new TextEncoder().encode("plain text renamed to docx"))).rejects.toBeInstanceOf(DocxParseError);

    const withoutDocument = await docxPackage({ "[Content_Types].xml": "<Types/>", "word/styles.xml": "<w:styles/>" });
    await expect(parseDocx(withoutDocument)).rejects.toMatchObject({ code: "NOT_DOCX" });

    const brokenXml = await docxPackage({ "word/document.xml": "<w:document><w:body><w:p>" });
    await expect(parseDocx(brokenXml)).rejects.toMatchObject({ code: "NOT_DOCX" });
  });

  it("reads a Blob as well as raw bytes", async () => {
    const bytes = await docx(paragraph("一、总体要求"));
    const parsed = await parseDocx(new Blob([bytes]));
    expect(parsed.blocks[0]).toMatchObject({ role: "HEADING_1" });
  });
});
