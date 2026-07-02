import { MagnifyingGlass } from "@phosphor-icons/react";
import { Button, Input } from "antd";
import dataInsightIcon from "@/assets/history-icons/history-data-insight.png";
import knowledgeQuickIcon from "@/assets/history-icons/history-knowledge-quick.png";
import { listHistorySessions } from "@/services/historyService";
import { PageFrame } from "./PageFrame";

export function HistoryPage() {
  return (
    <PageFrame title="历史对话">
      <section className="history-tools" aria-label="历史对话筛选">
        <Input prefix={<MagnifyingGlass size={18} />} placeholder="搜索历史对话..." />
        {["全部", "知识快查", "数据洞察", "智能制表"].map((tab, index) => (
          <Button key={tab} type={index === 0 ? "primary" : "default"}>{tab}</Button>
        ))}
      </section>
      <section className="history-list" aria-label="历史对话列表">
        {listHistorySessions().map(([title, summary, tag, date]) => (
          <article className="xs-card history-card" key={title}>
            <span className="topic-icon" aria-hidden="true">
              <img src={tag === "数据洞察" ? dataInsightIcon : knowledgeQuickIcon} alt="" />
            </span>
            <div>
              <h2>{title}</h2>
              <p>{summary}</p>
              <div className="tagline"><span className="xs-tag">{tag}</span><span>{date}</span></div>
            </div>
          </article>
        ))}
      </section>
    </PageFrame>
  );
}
