import { Button } from "antd";
import { ClockCounterClockwise, Eye, FileText, Paperclip, PaperPlaneTilt } from "@phosphor-icons/react";
import { writingDocs } from "@/services/mock/xingshuData";
import reportIcon from "@/assets/writing-scene-icons/writing-scene-report-summary.png";
import planIcon from "@/assets/writing-scene-icons/writing-scene-solution-plan.png";
import workIcon from "@/assets/writing-scene-icons/writing-scene-work-report.png";
import copyIcon from "@/assets/writing-scene-icons/writing-scene-copywriting.png";
import { PageFrame } from "./PageFrame";

const scenes = [
  ["报告总结", "快速生成各类数据分析报告、总结报告", reportIcon, "purple"],
  ["方案策划", "生成项目方案、解决方案、实施计划等", planIcon, "blue"],
  ["工作汇报", "生成日报、周报、月报、述职报告等", workIcon, "green"],
  ["文案创作", "撰写产品文案、宣传文案、营销文案等", copyIcon, "orange"]
];

export function WritingPage() {
  return (
    <PageFrame
      title="智能写作"
      subtitle="AI 帮你撰写各类文档、报告、方案等内容"
      actions={<><Button icon={<FileText size={18} />}>使用指南</Button><Button icon={<ClockCounterClockwise size={18} />}>写作历史</Button></>}
    >
      <section className="xs-card writing-panel" aria-label="写作内容输入">
        <h2>描述你要写作的内容</h2>
        <p>请详细描述写作主题、目标、要点、受众等要求，AI 将为你生成高质量内容</p>
        <textarea defaultValue="例如：撰写一份关于数据资产管理平台的产品介绍文档，包含产品概述、核心功能、应用场景和价值优势，字数约1500字" />
        <div className="writing-tabs">
          {["报告总结", "方案策划", "文案创作", "工作汇报", "新闻稿"].map((tab) => <Button key={tab}>{tab}</Button>)}
          <Button icon={<Paperclip size={18} />} aria-label="附件" />
          <Button type="primary" icon={<PaperPlaneTilt size={18} />} aria-label="发送" />
        </div>
      </section>

      <h2 className="subsection-title">推荐写作场景</h2>
      <section className="scene-row" aria-label="推荐写作场景">
        {scenes.map(([title, desc, icon, tone]) => (
          <article className="xs-card scene-card" key={title}>
            <span className={`scene-icon scene-icon--${tone}`}><img src={icon} alt="" /></span>
            <div><strong>{title}</strong><span>{desc}</span></div>
          </article>
        ))}
      </section>

      <section className="xs-card doc-table" aria-label="我的文稿">
        <h2>我的文稿</h2>
        <table className="xs-table">
          <thead><tr><th>文稿名称</th><th>类型</th><th>字数</th><th>更新时间</th><th>操作</th></tr></thead>
          <tbody>
            {writingDocs.map(([name, type, words, updated]) => (
              <tr key={name}><td><FileText size={16} /> {name}</td><td>{type}</td><td>{words}</td><td>{updated}</td><td><Eye size={16} /></td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </PageFrame>
  );
}
