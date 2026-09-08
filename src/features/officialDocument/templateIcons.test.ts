import { describe, expect, it } from "vitest";
import approvalIcon from "@/assets/template-icons/approval.svg";
import contractIcon from "@/assets/template-icons/contract.svg";
import documentIcon from "@/assets/template-icons/document.svg";
import letterIcon from "@/assets/template-icons/letter.svg";
import minutesIcon from "@/assets/template-icons/minutes.svg";
import noticeIcon from "@/assets/template-icons/notice.svg";
import reportIcon from "@/assets/template-icons/report.svg";
import requestIcon from "@/assets/template-icons/request.svg";
import { templateIconForName } from "./templateIcons";

describe("templateIconForName", () => {
  it("uses specific document types before report keywords and falls back for unknown names", () => {
    for (const [name, icon] of [
      ["知识库合同履约情况报告模板", contractIcon],
      ["请示（红头文件）", requestIcon],
      ["专题会纪要（红头文件）", minutesIcon],
      ["批复（红头文件）", approvalIcon],
      ["无文号通知（红头文件）", noticeIcon],
      ["无文号函（红头文件）", letterIcon],
      ["上半年工作总结及下半年工作计划", reportIcon],
      ["一般红头文件", documentIcon]
    ]) {
      expect(templateIconForName(name)).toBe(icon);
    }
  });
});
