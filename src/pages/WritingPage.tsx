import { Button } from "antd";
import { ClockCounterClockwise, Eye, FileText, Paperclip, PaperPlaneTilt, X } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState, type ChangeEvent } from "react";
import { resolveXsAsyncStatus, XsAsyncPanel, XsStatusBar } from "@/components/xs";
import type { XsStatusTone } from "@/components/xs";
import { createAttachmentQueue } from "@/services/attachmentService";
import type { AttachmentQueueItem } from "@/services/attachmentService";
import { createWritingDraft, listWritingDocuments, listWritingScenes } from "@/services/writingService";
import type { WritingSceneIconId } from "@/types/writing";
import reportIcon from "@/assets/writing-scene-icons/writing-scene-report-summary.png";
import planIcon from "@/assets/writing-scene-icons/writing-scene-solution-plan.png";
import workIcon from "@/assets/writing-scene-icons/writing-scene-work-report.png";
import copyIcon from "@/assets/writing-scene-icons/writing-scene-copywriting.png";
import { PageFrame } from "./PageFrame";
import "./styles/workflows.css";

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
  const [submissionTone, setSubmissionTone] = useState<XsStatusTone>("info");
  const [attachments, setAttachments] = useState<AttachmentQueueItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const isSubmittingRef = useRef(false);
  const scenesQuery = useQuery({
    queryKey: ["writingScenes"],
    queryFn: listWritingScenes
  });
  const documentsQuery = useQuery({
    queryKey: ["writingDocuments"],
    queryFn: listWritingDocuments
  });
  const scenes = scenesQuery.data ?? [];
  const documents = documentsQuery.data ?? [];
  const scenesStatus = resolveXsAsyncStatus({
    isPending: scenesQuery.isPending,
    isFetching: scenesQuery.isFetching,
    isError: scenesQuery.isError,
    hasData: scenesQuery.data !== undefined
  });
  const documentsStatus = resolveXsAsyncStatus({
    isPending: documentsQuery.isPending,
    isFetching: documentsQuery.isFetching,
    isError: documentsQuery.isError,
    hasData: documentsQuery.data !== undefined
  });

  const handleSubmit = async () => {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt || isSubmittingRef.current) {
      return;
    }

    const readyAttachments = attachments
      .filter((attachment) => attachment.status === "ready")
      .map(({ id, file, name, size, type }) => ({ id, file, name, size, type }));

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setSubmissionTone("loading");
    setSubmissionStatus("正在提交写作需求");

    try {
      const result = await createWritingDraft({ prompt: trimmedPrompt, attachments: readyAttachments });
      if (result.status === "accepted") {
        setSubmissionTone("info");
        setSubmissionStatus(
          result.attachmentCount > 0
            ? `写作需求已加入生成队列，${result.attachmentCount} 个附件将参与生成：${result.prompt}`
            : `写作需求已加入生成队列，尚未生成：${result.prompt}`
        );
      }
    } catch {
      setSubmissionTone("error");
      setSubmissionStatus("写作需求提交失败，请稍后重试");
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleSelectWritingType = (type: string) => {
    if (isSubmittingRef.current) {
      return;
    }

    setPrompt(writingTypePrompts[type]);
    setSubmissionTone("success");
    setSubmissionStatus(`已切换写作类型：${type}`);
  };

  const handleSelectScene = (iconId: WritingSceneIconId) => {
    if (isSubmittingRef.current) {
      return;
    }

    setPrompt(scenePrompts[iconId]);
    setSubmissionTone("success");
    setSubmissionStatus("已套用推荐写作场景");
  };

  const handleOpenAttachmentPicker = () => {
    if (isSubmittingRef.current) {
      return;
    }

    setSubmissionTone("info");
    setSubmissionStatus("已打开写作附件选择");
    attachmentInputRef.current?.click();
  };

  const handleAttachmentsChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (isSubmittingRef.current) {
      event.target.value = "";
      return;
    }

    const selectedFiles = Array.from(event.target.files ?? []);
    if (selectedFiles.length === 0) {
      return;
    }

    const nextAttachments = createAttachmentQueue(selectedFiles);
    const readyCount = nextAttachments.filter((attachment) => attachment.status === "ready").length;
    const rejectedCount = nextAttachments.length - readyCount;

    setAttachments((current) => {
      const queueById = new Map(current.map((attachment) => [attachment.id, attachment]));
      nextAttachments.forEach((attachment) => queueById.set(attachment.id, attachment));
      return Array.from(queueById.values());
    });
    setSubmissionTone(rejectedCount > 0 ? "warning" : "info");
    setSubmissionStatus(
      rejectedCount > 0
        ? `${readyCount} 个附件可参与生成，${rejectedCount} 个附件不可用`
        : `${readyCount} 个附件可参与生成`
    );
    event.target.value = "";
  };

  const handleRemoveAttachment = (attachmentId: string) => {
    if (isSubmittingRef.current) {
      return;
    }

    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
    setSubmissionTone("info");
    setSubmissionStatus("已从写作附件队列移除文件");
  };

  return (
    <PageFrame
      title="智能写作"
      subtitle="AI 帮你撰写各类文档、报告、方案等内容"
      actions={
        <>
          <Button disabled title="即将开放" icon={<FileText size={18} />}>使用指南 · 即将开放</Button>
          <Button disabled title="即将开放" icon={<ClockCounterClockwise size={18} />}>写作历史 · 即将开放</Button>
        </>
      }
    >
      <section
        className="xs-card writing-panel writing-panel--compact"
        aria-label="写作内容输入"
        aria-busy={isSubmitting}
      >
        <div className="writing-panel__intro">
          <h2>描述你要写作的内容</h2>
          <p>请详细描述写作主题、目标、要点、受众等要求，AI 将为你生成高质量内容</p>
        </div>
        <textarea
          rows={5}
          aria-label="写作需求"
          value={prompt}
          disabled={isSubmitting}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <div className="writing-tabs writing-panel__controls" aria-label="写作类型与提交操作">
          {["报告总结", "方案策划", "文案创作", "工作汇报", "新闻稿"].map((tab) => (
            <Button disabled={isSubmitting} key={tab} onClick={() => handleSelectWritingType(tab)}>{tab}</Button>
          ))}
          <input
            ref={attachmentInputRef}
            className="sr-only"
            type="file"
            multiple
            disabled={isSubmitting}
            aria-label="添加写作附件"
            accept=".csv,.doc,.docx,.json,.md,.pdf,.txt,.xls,.xlsx,image/*"
            onChange={handleAttachmentsChange}
          />
          <Button
            icon={<Paperclip size={18} />}
            aria-label="附件"
            disabled={isSubmitting}
            onClick={handleOpenAttachmentPicker}
          />
          <Button
            type="primary"
            icon={<PaperPlaneTilt size={18} />}
            aria-label="发送"
            loading={isSubmitting}
            disabled={isSubmitting}
            onClick={handleSubmit}
          />
        </div>
        {attachments.length > 0 ? (
          <ul className="writing-attachment-queue" aria-label="写作附件队列">
            {attachments.map((attachment) => (
              <li key={attachment.id} data-status={attachment.status}>
                <span title={attachment.name}>{attachment.name}</span>
                <small>{attachment.status === "ready" ? "可参与生成" : attachment.error}</small>
                <Button
                  type="text"
                  size="small"
                  icon={<X size={14} />}
                  aria-label={`移除附件 ${attachment.name}`}
                  disabled={isSubmitting}
                  onClick={() => handleRemoveAttachment(attachment.id)}
                />
              </li>
            ))}
          </ul>
        ) : null}
        <div className="workflow-status-slot writing-panel__status-slot">
          <XsStatusBar tone={submissionTone} label="操作" message={submissionStatus} />
        </div>
      </section>

      <h2 className="subsection-title">推荐写作场景</h2>
      <XsAsyncPanel
        status={scenesStatus}
        empty={scenes.length === 0}
        emptyDescription="暂无推荐写作场景。"
        error="推荐写作场景加载失败，请稍后重试。"
        onRetry={() => void scenesQuery.refetch()}
      >
        <section className="scene-row" aria-label="推荐写作场景">
          {scenes.map((scene) => (
            <button
              className="xs-card scene-card"
              key={scene.id}
              type="button"
              aria-label={`${scene.title}：${scene.description}`}
              disabled={isSubmitting}
              onClick={() => handleSelectScene(scene.iconId)}
            >
              <span className={`scene-icon scene-icon--${scene.tone}`}><img src={sceneIconById[scene.iconId]} alt="" /></span>
              <div><strong>{scene.title}</strong><span>{scene.description}</span></div>
            </button>
          ))}
        </section>
      </XsAsyncPanel>

      <XsAsyncPanel
        status={documentsStatus}
        empty={documents.length === 0}
        emptyDescription="暂无文稿。"
        error="文稿列表加载失败，请稍后重试。"
        onRetry={() => void documentsQuery.refetch()}
      >
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
                      disabled
                      title="即将开放"
                      aria-label={`查看 ${document.name}，即将开放`}
                    >
                      即将开放
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </XsAsyncPanel>
    </PageFrame>
  );
}
