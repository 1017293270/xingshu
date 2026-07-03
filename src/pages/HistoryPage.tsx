import { MagnifyingGlass } from "@phosphor-icons/react";
import { Button, Input } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import dataInsightIcon from "@/assets/history-icons/history-data-insight.png";
import knowledgeQuickIcon from "@/assets/history-icons/history-knowledge-quick.png";
import { filterHistorySessions } from "@/services/historyService";
import type { HistoryFilter } from "@/types/history";
import { PageFrame } from "./PageFrame";

const historyCategoryFilters: NonNullable<HistoryFilter["category"]>[] = [
  "全部",
  "知识快查",
  "数据洞察",
  "文档处理"
];

export function HistoryPage() {
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState<NonNullable<HistoryFilter["category"]>>("全部");
  const [actionStatus, setActionStatus] = useState("");
  const { data: sessions = [] } = useQuery({
    queryKey: ["historySessions", { keyword, category }],
    queryFn: () => filterHistorySessions({ keyword, category })
  });
  const statusText = actionStatus || `已筛选 ${sessions.length} 条历史对话`;

  return (
    <PageFrame title="历史对话">
      <section className="history-tools" aria-label="历史对话筛选">
        <Input
          aria-label="历史搜索"
          prefix={<MagnifyingGlass size={18} />}
          placeholder="搜索历史对话..."
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            setActionStatus("");
          }}
        />
        {historyCategoryFilters.map((tab) => (
          <Button
            aria-pressed={category === tab}
            autoInsertSpace={false}
            key={tab}
            type={category === tab ? "primary" : "default"}
            onClick={() => {
              setCategory(tab);
              setActionStatus("");
            }}
          >
            {tab}
          </Button>
        ))}
      </section>
      <p className="workflow-status" role="status">{statusText}</p>
      <section className="history-list" aria-label="历史对话列表">
        {sessions.map((session) => (
          <button
            className="xs-card history-card xs-card-button"
            key={session.id}
            type="button"
            aria-label={`${session.title}：${session.summary}`}
            onClick={() => setActionStatus(`已恢复历史对话：${session.title}`)}
          >
            <span className="topic-icon" aria-hidden="true">
              <img src={session.category === "数据洞察" ? dataInsightIcon : knowledgeQuickIcon} alt="" />
            </span>
            <div>
              <h2>{session.title}</h2>
              <p>{session.summary}</p>
              <div className="tagline"><span className="xs-tag">{session.category}</span><span>{session.updatedAt}</span></div>
            </div>
          </button>
        ))}
      </section>
    </PageFrame>
  );
}
