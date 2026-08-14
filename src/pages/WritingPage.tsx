import { Button } from "antd";
import { Eye, FileDoc, FileText, Paperclip, PaperPlaneTilt, X } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { sessionQueryKey, useSessionQueryScope } from "@/app/sessionQuery";
import { productCapabilities } from "@/config/capabilities";
import { XsCapabilityStatus } from "@/components/xs/XsCapabilityStatus";
import { resolveXsAsyncStatus, XsAsyncPanel } from "@/components/xs/XsAsyncPanel";
import { XsStatusBar, type XsStatusTone } from "@/components/xs/XsStatusBar";
import { OfficialDocumentHub } from "@/features/officialDocument/OfficialDocumentHub";
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

const writingTypes = ["报告总结", "方案策划", "文案创作", "工作汇报", "新闻稿"];
type WritingWorkspaceMode = "official" | "general";

export function WritingPage() {
  const sessionScope = useSessionQueryScope();
  const [prompt, setPrompt] = useState("");
  const [submissionStatus, setSubmissionStatus] = useState("");
  const [submissionTone, setSubmissionTone] = useState<XsStatusTone>("info");
  const [attachments, setAttachments] = useState<AttachmentQueueItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeWritingType, setActiveWritingType] = useState<string | null>(null);
  const [activeSceneId, setActiveSceneId] = useState<WritingSceneIconId | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WritingWorkspaceMode>("official");
  const [removingAttachmentIds, setRemovingAttachmentIds] = useState<Set<string>>(() => new Set());
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const removalTimersRef = useRef(new Map<string, number>());
  const isSubmittingRef = useRef(false);
  const scenesQuery = useQuery({
    queryKey: sessionQueryKey(sessionScope, "writingScenes"),
    queryFn: listWritingScenes
  });
  const documentsQuery = useQuery({
    queryKey: sessionQueryKey(sessionScope, "writingDocuments"),
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

  useEffect(() => () => {
    removalTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    removalTimersRef.current.clear();
  }, []);

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
    setSubmissionStatus("正在创建写作预览");

    try {
      const result = await createWritingDraft({ prompt: trimmedPrompt, attachments: readyAttachments });
      if (result.status === "accepted") {
        setSubmissionTone("info");
        setSubmissionStatus(
          result.attachmentCount > 0
            ? `预览已记录 ${result.attachmentCount} 个附件，不会上传或生成真实文档：${result.prompt}`
            : `预览需求已记录，不会调用真实生成服务：${result.prompt}`
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
    setActiveWritingType(type);
    setActiveSceneId(null);
    setSubmissionTone("success");
    setSubmissionStatus(`已切换写作类型：${type}`);
  };

  const handleSelectScene = (iconId: WritingSceneIconId) => {
    if (isSubmittingRef.current) {
      return;
    }

    setPrompt(scenePrompts[iconId]);
    setActiveSceneId(iconId);
    setActiveWritingType(null);
    setSubmissionTone("success");
    setSubmissionStatus("已套用推荐写作场景");
    window.requestAnimationFrame(() => {
      promptInputRef.current?.focus({ preventScroll: true });
      promptInputRef.current?.scrollIntoView?.({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center"
      });
    });
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
        ? `${readyCount} 个附件可参与预览，${rejectedCount} 个附件不可用于预览`
        : `${readyCount} 个附件可参与预览`
    );
    event.target.value = "";
  };

  const handleRemoveAttachment = (attachmentId: string) => {
    if (isSubmittingRef.current) {
      return;
    }

    if (import.meta.env.MODE === "test") {
      setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
      setSubmissionTone("info");
      setSubmissionStatus("已从写作附件队列移除文件");
      return;
    }

    setRemovingAttachmentIds((current) => new Set(current).add(attachmentId));
    const timerId = window.setTimeout(() => {
      setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
      setRemovingAttachmentIds((current) => {
        const next = new Set(current);
        next.delete(attachmentId);
        return next;
      });
      removalTimersRef.current.delete(attachmentId);
    }, 180);
    removalTimersRef.current.set(attachmentId, timerId);
    setSubmissionTone("info");
    setSubmissionStatus("已从写作附件队列移除文件");
  };

  return (
    <PageFrame
      title="智能写作"
      subtitle="AI 帮你撰写各类文档、报告、方案等内容"
    >
      <div className="writing-mode-switch xs-page-enter" role="tablist" aria-label="写作模式">
        <button
          type="button"
          role="tab"
          aria-selected={workspaceMode === "official"}
          onClick={() => setWorkspaceMode("official")}
        >
          <FileDoc size={18} aria-hidden="true" />
          <span><strong>公文写作</strong><small>模板校准、结构化编辑与问数绑定</small></span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={workspaceMode === "general"}
          onClick={() => setWorkspaceMode("general")}
        >
          <FileText size={18} aria-hidden="true" />
          <span><strong>通用写作</strong><small>组织报告、方案和文案需求</small></span>
        </button>
      </div>

      {workspaceMode === "official" ? <OfficialDocumentHub /> : (
        <>

      <div className="section-title-row section-title-row--compact official-document-followup xs-page-enter" style={{ animationDelay: "60ms" }}>
        <div>
          <h2 className="subsection-title">通用写作需求预览</h2>
          <p className="page-section-description">保留原有通用写作入口；当前只组织需求，不会上传附件或生成真实文档。</p>
        </div>
        <span className="section-title-meta">原有预览能力</span>
      </div>
      <XsCapabilityStatus capability={productCapabilities.writing} />
      <section
        className="xs-card xs-page-enter xs-focus-glow writing-panel writing-panel--compact"
        style={{ animationDelay: "80ms" }}
        aria-label="写作内容输入"
        aria-busy={isSubmitting}
      >
        <div className="writing-panel__intro">
          <h2>描述你要写作的内容</h2>
          <p>请描述写作主题、目标、要点和受众；当前可预览需求组织方式</p>
        </div>
        <textarea
          ref={promptInputRef}
          rows={5}
          aria-label="写作需求"
          placeholder="例如：撰写一份数据资产管理平台介绍，包含产品概述、核心功能、应用场景和价值优势"
          value={prompt}
          disabled={isSubmitting}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <div className="writing-panel__types">
          <span className="writing-panel__types-label" id="writing-types-label">写作类型</span>
          <div className="writing-tabs writing-panel__controls" role="group" aria-labelledby="writing-types-label">
            {writingTypes.map((tab) => (
              <Button
                className={activeWritingType === tab ? "is-active" : ""}
                aria-pressed={activeWritingType === tab}
                disabled={isSubmitting}
                key={tab}
                onClick={() => handleSelectWritingType(tab)}
              >
                {tab}
              </Button>
            ))}
          </div>
        </div>
        <div className="writing-panel__actions-bar">
          <input
            ref={attachmentInputRef}
            hidden
            type="file"
            multiple
            disabled={isSubmitting}
            data-testid="writing-attachment-input"
            accept=".csv,.doc,.docx,.json,.md,.pdf,.txt,.xls,.xlsx,image/*"
            onChange={handleAttachmentsChange}
          />
          <Button
            icon={<Paperclip size={16} />}
            disabled={isSubmitting}
            onClick={handleOpenAttachmentPicker}
          >
            添加附件
          </Button>
          <Button
            type="primary"
            icon={<PaperPlaneTilt size={16} />}
            aria-label="预览写作需求"
            loading={isSubmitting}
            disabled={isSubmitting || !prompt.trim()}
            onClick={handleSubmit}
          >
            预览需求
          </Button>
        </div>
        {attachments.length > 0 ? (
          <ul className="writing-attachment-queue" aria-label="写作附件队列">
            {attachments.map((attachment) => (
              <li
                key={attachment.id}
                data-status={attachment.status}
                data-removing={removingAttachmentIds.has(attachment.id)}
              >
                <span title={attachment.name}>{attachment.name}</span>
                <small>{attachment.status === "ready" ? "可参与预览" : attachment.error}</small>
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
          <XsStatusBar
            tone={submissionTone}
            label="操作"
            message={submissionStatus}
            transitionKey={`${submissionTone}:${submissionStatus}`}
            reserveSpace
          />
        </div>
      </section>

      <div className="section-title-row section-title-row--compact xs-page-enter" style={{ animationDelay: "140ms" }}>
        <h2 className="subsection-title">推荐写作场景</h2>
        <span className="section-title-meta">点击场景快速套用</span>
      </div>
      <XsAsyncPanel
        status={scenesStatus}
        empty={scenes.length === 0}
        emptyDescription="暂无推荐写作场景。"
        error="推荐写作场景加载失败，请稍后重试。"
        onRetry={() => void scenesQuery.refetch()}
        loadingVariant="cards"
        contentKey={scenesQuery.dataUpdatedAt}
      >
        <section className="scene-row" aria-label="推荐写作场景">
          {scenes.map((scene, index) => (
            <button
              className={`xs-card xs-card-lift xs-page-enter scene-card${activeSceneId === scene.iconId ? " is-active" : ""}`}
              style={{ animationDelay: `${200 + index * 60}ms` }}
              key={scene.id}
              type="button"
              aria-label={`${scene.title}：${scene.description}`}
              disabled={isSubmitting}
              aria-pressed={activeSceneId === scene.iconId}
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
        loadingVariant="table"
        contentKey={documentsQuery.dataUpdatedAt}
      >
        <section className="xs-card xs-page-enter doc-table" style={{ animationDelay: "280ms" }} aria-label="我的文稿">
          <div className="section-title-row section-title-row--compact">
            <h2>我的文稿</h2>
            <span className="section-title-meta">{documents.length} 篇文稿</span>
          </div>
          <table className="xs-table">
            <thead><tr><th>文稿名称</th><th>类型</th><th>字数</th><th>更新时间</th><th>操作</th></tr></thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id}>
                  <td><span className="doc-table__name"><FileText size={16} />{document.name}</span></td>
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
        </>
      )}
    </PageFrame>
  );
}
