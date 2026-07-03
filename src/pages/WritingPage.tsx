import { Button } from "antd";
import { ClockCounterClockwise, Eye, FileText, Paperclip, PaperPlaneTilt } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { createWritingDraft, listWritingDocuments, listWritingScenes } from "@/services/writingService";
import type { WritingSceneIconId } from "@/types/writing";
import reportIcon from "@/assets/writing-scene-icons/writing-scene-report-summary.png";
import planIcon from "@/assets/writing-scene-icons/writing-scene-solution-plan.png";
import workIcon from "@/assets/writing-scene-icons/writing-scene-work-report.png";
import copyIcon from "@/assets/writing-scene-icons/writing-scene-copywriting.png";
import { PageFrame } from "./PageFrame";

const sceneIconById: Record<WritingSceneIconId, string> = {
  "report-summary": reportIcon,
  "solution-plan": planIcon,
  "work-report": workIcon,
  copywriting: copyIcon
};

const writingTypePrompts: Record<string, string> = {
  报告总结: "请帮我撰写一份报告总结，包含核心结论、关键数据和后续建议。",
  方案策划: "请帮我撰写一份方案策划，包含背景、目标、步骤和交付物。",
  文案创作: "请帮我撰写一份文案创作，突出产品价值、目标受众和传播重点。",
  工作汇报: "请帮我撰写一份工作汇报，包含进展、问题、数据和下周计划。",
  新闻稿: "请帮我撰写一篇新闻稿，包含标题、导语、正文和企业价值。"
};

const scenePrompts: Record<WritingSceneIconId, string> = {
  "report-summary": "请帮我快速生成各类数据分析报告、总结报告。",
  "solution-plan": "请帮我生成项目方案、解决方案、实施计划等。",
  "work-report": "请帮我生成日报、周报、月报、述职报告等。",
  copywriting: "请帮我撰写产品文案、宣传文案、营销文案等。"
};

export function WritingPage() {
  const [prompt, setPrompt] = useState("例如：撰写一份关于数据资产管理平台的产品介绍文档，包含产品概述、核心功能、应用场景和价值优势，字数约1500字");
  const [submissionStatus, setSubmissionStatus] = useState("");
  const { data: scenes = [] } = useQuery({
    queryKey: ["writingScenes"],
    queryFn: listWritingScenes
  });
  const { data: documents = [] } = useQuery({
    queryKey: ["writingDocuments"],
    queryFn: listWritingDocuments
  });

  const handleSubmit = async () => {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt) {
      return;
    }

    const result = await createWritingDraft({ prompt: trimmedPrompt });
    if (result.status === "accepted") {
      setSubmissionStatus(`已提交写作需求：${result.prompt}`);
    }
  };

  const handleSelectWritingType = (type: string) => {
    setPrompt(writingTypePrompts[type]);
    setSubmissionStatus(`已切换写作类型：${type}`);
  };

  const handleSelectScene = (iconId: WritingSceneIconId) => {
    setPrompt(scenePrompts[iconId]);
    setSubmissionStatus("已套用推荐写作场景");
  };

  return (
    <PageFrame
      title="智能写作"
      subtitle="AI 帮你撰写各类文档、报告、方案等内容"
      actions={<><Button icon={<FileText size={18} />} onClick={() => setSubmissionStatus("已打开写作指南")}>使用指南</Button><Button icon={<ClockCounterClockwise size={18} />} onClick={() => setSubmissionStatus("已定位到我的文稿")}>写作历史</Button></>}
    >
      <section className="xs-card writing-panel" aria-label="写作内容输入">
        <h2>描述你要写作的内容</h2>
        <p>请详细描述写作主题、目标、要点、受众等要求，AI 将为你生成高质量内容</p>
        <textarea aria-label="写作需求" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        <div className="writing-tabs">
          {["报告总结", "方案策划", "文案创作", "工作汇报", "新闻稿"].map((tab) => <Button key={tab} onClick={() => handleSelectWritingType(tab)}>{tab}</Button>)}
          <Button icon={<Paperclip size={18} />} aria-label="附件" onClick={() => setSubmissionStatus("已打开写作附件选择")} />
          <Button type="primary" icon={<PaperPlaneTilt size={18} />} aria-label="发送" onClick={handleSubmit} />
        </div>
        {submissionStatus ? <p className="workflow-status" role="status">{submissionStatus}</p> : null}
      </section>

      <h2 className="subsection-title">推荐写作场景</h2>
      <section className="scene-row" aria-label="推荐写作场景">
        {scenes.map((scene) => (
          <button className="xs-card scene-card" key={scene.id} type="button" aria-label={`${scene.title}：${scene.description}`} onClick={() => handleSelectScene(scene.iconId)}>
            <span className={`scene-icon scene-icon--${scene.tone}`}><img src={sceneIconById[scene.iconId]} alt="" /></span>
            <div><strong>{scene.title}</strong><span>{scene.description}</span></div>
          </button>
        ))}
      </section>

      <section className="xs-card doc-table" aria-label="我的文稿">
        <h2>我的文稿</h2>
        <table className="xs-table">
          <thead><tr><th>文稿名称</th><th>类型</th><th>字数</th><th>更新时间</th><th>操作</th></tr></thead>
          <tbody>
            {documents.map((document) => (
              <tr key={document.id}>
                <td><FileText size={16} /> {document.name}</td>
                <td>{document.type}</td>
                <td>{document.words}</td>
                <td>{document.updatedAt}</td>
                <td>
                  <Button
                    type="text"
                    icon={<Eye size={16} />}
                    aria-label={`查看 ${document.name}`}
                    onClick={() => setSubmissionStatus(`已打开文稿：${document.name}`)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </PageFrame>
  );
}
