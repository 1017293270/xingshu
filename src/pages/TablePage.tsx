import { Button, Input, Tag } from "antd";
import { Lightning, Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import tableContactListIcon from "@/assets/table-icons/table-contact-list.png";
import tableExpenseStatisticsIcon from "@/assets/table-icons/table-expense-statistics.png";
import tableInventoryIcon from "@/assets/table-icons/table-inventory.png";
import tableRankingIcon from "@/assets/table-icons/table-ranking.png";
import { XsStatusBar } from "@/components/xs";
import { createTableFromPrompt, listRecentTables } from "@/services/tableService";
import type { TableTemplate, TableTemplateIconId } from "@/types/table";
import { PageFrame } from "./PageFrame";

const sheetIconById: Record<TableTemplateIconId, string> = {
  ranking: tableRankingIcon,
  "contact-list": tableContactListIcon,
  "expense-statistics": tableExpenseStatisticsIcon,
  inventory: tableInventoryIcon
};

const tablePromptPlaceholder = "描述您需要的表格，如「华东区Q1销售排行」「各部门人员通讯录」...";

export function TablePage() {
  const [prompt, setPrompt] = useState("");
  const [submissionStatus, setSubmissionStatus] = useState("");
  const { data: recentTables = [] } = useQuery({
    queryKey: ["recentTables"],
    queryFn: listRecentTables
  });

  const handleGenerate = async () => {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt) {
      return;
    }

    const result = await createTableFromPrompt(trimmedPrompt);
    if (result.status === "accepted") {
      setSubmissionStatus(`已提交制表需求：${result.prompt}`);
    }
  };

  const handleCopyTemplate = (table: TableTemplate) => {
    const nextPrompt = `${table.title}：${table.description}`;
    setPrompt(nextPrompt);
    setSubmissionStatus(`已复制制表要求：${table.title}`);
  };

  return (
    <PageFrame title="智能制表" className="table-page">
      <section className="sheet-prompt" aria-label="制表需求输入">
        <span className="sheet-prompt__addon" aria-hidden="true">
          <Plus size={18} weight="bold" />
        </span>
        <Input
          aria-label="制表需求"
          placeholder={tablePromptPlaceholder}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onPressEnter={handleGenerate}
        />
        <Button type="primary" icon={<Lightning size={18} />} onClick={handleGenerate}>
          生成
        </Button>
      </section>
      <XsStatusBar className="table-page__status" tone="success" label="操作" message={submissionStatus} />
      <h2 className="subsection-title">最近制表</h2>
      <section className="sheet-list" aria-label="最近制表">
        {recentTables.map((table) => (
          <article className="xs-card sheet-row" key={table.id} aria-label={`${table.title} ${table.description}`}>
            <span className="sheet-icon" aria-hidden="true">
              <img src={sheetIconById[table.iconId]} alt="" />
            </span>
            <div className="sheet-row__body">
              <h2 className="sheet-row__title">{table.title}</h2>
              <p className="sheet-row__meta">
                <Tag bordered={false} color="blue">
                  {table.tag}
                </Tag>
                <span>{table.description}</span>
              </p>
            </div>
            <Button onClick={() => handleCopyTemplate(table)}>复制制表要求</Button>
          </article>
        ))}
      </section>
      <p className="page-disclaimer">内容由 AI 生成，仅供参考，请按实际业务需求调整。</p>
    </PageFrame>
  );
}
