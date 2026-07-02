import { ChartBar, MagnifyingGlass, Question } from "@phosphor-icons/react";
import { Button, Input } from "antd";
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
            <span className={`topic-icon${tag === "数据洞察" ? " topic-icon--green" : ""}`}>
              {tag === "数据洞察" ? <ChartBar size={24} /> : <Question size={24} />}
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
