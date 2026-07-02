import { Button, Input } from "antd";
import { Lightning, Plus } from "@phosphor-icons/react";
import tableContactListIcon from "@/assets/table-icons/table-contact-list.png";
import tableExpenseStatisticsIcon from "@/assets/table-icons/table-expense-statistics.png";
import tableInventoryIcon from "@/assets/table-icons/table-inventory.png";
import tableRankingIcon from "@/assets/table-icons/table-ranking.png";
import { sheetRows } from "@/services/mock/xingshuData";
import { PageFrame } from "./PageFrame";

const sheetIconByMark: Record<string, string> = {
  排: tableRankingIcon,
  通: tableContactListIcon,
  费: tableExpenseStatisticsIcon,
  库: tableInventoryIcon
};

export function TablePage() {
  return (
    <PageFrame title="智能制表">
      <section className="sheet-prompt" aria-label="制表需求输入">
        <Plus size={20} />
        <Input defaultValue="描述您需要的表格，如「华东区Q1销售排行」「各部门人员通讯录」..." />
        <Button type="primary" icon={<Lightning size={18} />}>生成</Button>
      </section>
      <h2 className="subsection-title">最近制表</h2>
      <section className="sheet-list" aria-label="最近制表">
        {sheetRows.map(([mark, title, tag, desc]) => (
          <article className="xs-card sheet-row" key={title}>
            <span className="sheet-icon" aria-hidden="true">
              <img src={sheetIconByMark[mark]} alt="" />
            </span>
            <div>
              <h2>{title}</h2>
              <p><span className="xs-tag">{tag}</span>　{desc}</p>
            </div>
            <Button>复制制表要求</Button>
          </article>
        ))}
      </section>
      <p className="page-disclaimer">内容由 AI 生成，仅供参考，请按实际业务需求调整。</p>
    </PageFrame>
  );
}
