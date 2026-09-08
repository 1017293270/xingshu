import approvalIcon from "@/assets/template-icons/approval.svg";
import contractIcon from "@/assets/template-icons/contract.svg";
import documentIcon from "@/assets/template-icons/document.svg";
import letterIcon from "@/assets/template-icons/letter.svg";
import minutesIcon from "@/assets/template-icons/minutes.svg";
import noticeIcon from "@/assets/template-icons/notice.svg";
import reportIcon from "@/assets/template-icons/report.svg";
import requestIcon from "@/assets/template-icons/request.svg";

// ponytail: 按中文名称选装饰图标；服务提供明确文种字段后直接按字段映射。
// 复合名称优先匹配具体文种，不改变模板的业务分类。
const templateIcons = [
  [/合同/, contractIcon],
  [/请示/, requestIcon],
  [/纪要/, minutesIcon],
  [/批复/, approvalIcon],
  [/通知|通报|公告/, noticeIcon],
  [/函/, letterIcon],
  [/报告|总结|分析|计划|方案|简报/, reportIcon]
] as const;

export function templateIconForName(name: string) {
  return templateIcons.find(([pattern]) => pattern.test(name))?.[1] ?? documentIcon;
}
