import {
  ArrowDown,
  ArrowUp,
  Brain,
  FileDoc,
  NotePencil,
  Plus,
  Trash,
  UploadSimple
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Button, Checkbox, Input, Modal, Select, Tag } from "antd";
import { useEffect, useMemo, useState } from "react";
import { XsStatusBar, type XsStatusTone } from "@/components/xs/XsStatusBar";
import { XsUploadDialog } from "@/components/xs/XsUploadDialog";
import {
  confirmOfficialDocumentContentProfile,
  createOfficialDocumentTextContentProfile,
  listOfficialDocumentContentProfiles,
  saveOfficialDocumentContentProfileAnalysis,
  uploadOfficialDocumentContentProfile
} from "@/services/officialDocumentService";
import { analyzeOfficialDocumentContent } from "@/services/writingContentAnalysisService";
import type {
  OfficialDocumentAnalysis,
  OfficialDocumentContentSourceBlock,
  OfficialDocumentContentProfile,
  OfficialDocumentTemplate,
  OfficialDocumentWritingLogicPlan
} from "@/types/officialDocument";

type LogicSection = OfficialDocumentWritingLogicPlan["sections"][number];
type ResearchNeed = OfficialDocumentWritingLogicPlan["researchNeeds"][number];
type RequirementGenerationStage = "saving" | "analyzing" | "persisting";
const EMPTY_SOURCE_BLOCKS: OfficialDocumentContentSourceBlock[] = [];

const requirementGenerationSteps: Array<{
  key: RequirementGenerationStage;
  title: string;
  detail: string;
}> = [
  { key: "saving", title: "保存写作要求", detail: "创建可追溯的内容方案" },
  { key: "analyzing", title: "结合模板生成行文逻辑", detail: "规划章节并识别问数、问知需求" },
  { key: "persisting", title: "保存审核方案", detail: "准备进入人工确认" }
];

type ContentProfileWorkspaceProps = {
  template: OfficialDocumentTemplate;
  analysis?: OfficialDocumentAnalysis;
  boundProfileId?: string;
  onBind: (profile: OfficialDocumentContentProfile) => Promise<void>;
};

const statusLabel: Record<OfficialDocumentContentProfile["status"], string> = {
  EXTRACTING: "提取中",
  EXTRACTED: "待 AI 分析",
  READY_FOR_REVIEW: "待确认",
  CONFIRMED: "可写作",
  FAILED: "解析失败"
};

const roleOptions: Array<{ value: LogicSection["headingRole"]; label: string }> = [
  { value: "HEADING_1", label: "一级标题" },
  { value: "HEADING_2", label: "二级标题" },
  { value: "HEADING_3", label: "三级标题" }
];

function normalizedPlan(plan: OfficialDocumentWritingLogicPlan, sourceIds: string[]) {
  const assigned = new Set(plan.sections.flatMap((section) => section.sourceBlockIds));
  return {
    ...plan,
    sections: [...plan.sections].sort((left, right) => left.order - right.order)
      .map((section, order) => ({ ...section, order })),
    unassignedSourceBlockIds: sourceIds.filter((id) => !assigned.has(id))
  };
}

export function ContentProfileWorkspace({
  template,
  analysis,
  boundProfileId,
  onBind
}: ContentProfileWorkspaceProps) {
  const versionId = template.currentVersion.id;
  const profilesQuery = useQuery({
    queryKey: ["official-document", "content-profiles", template.id, versionId],
    queryFn: () => listOfficialDocumentContentProfiles(template.id, versionId),
    refetchInterval: (query) => query.state.data?.some((profile) => profile.status === "EXTRACTING")
      ? 1_500
      : false
  });
  const profiles = useMemo(() => boundProfileId
    ? (profilesQuery.data ?? []).filter((profile) => profile.id === boundProfileId)
    : profilesQuery.data ?? [], [boundProfileId, profilesQuery.data]);
  const [selectedId, setSelectedId] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const [requirementsName, setRequirementsName] = useState("");
  const [requirementsText, setRequirementsText] = useState("");
  const [requirementsError, setRequirementsError] = useState("");
  const [generationStage, setGenerationStage] = useState<RequirementGenerationStage>();
  const [generationSeconds, setGenerationSeconds] = useState(0);
  const [plan, setPlan] = useState<OfficialDocumentWritingLogicPlan>();
  const [busy, setBusy] = useState<"analyze" | "generate" | "confirm" | "bind">();
  const [status, setStatus] = useState<{ tone: XsStatusTone; message: string }>();

  useEffect(() => {
    if (!profiles.length) {
      setSelectedId("");
      return;
    }
    if (boundProfileId && profiles.some((profile) => profile.id === boundProfileId)) {
      setSelectedId(boundProfileId);
    } else if (!profiles.some((profile) => profile.id === selectedId)) {
      setSelectedId(profiles[0].id);
    }
  }, [boundProfileId, profiles, selectedId]);

  const selected = profiles.find((profile) => profile.id === selectedId);
  const selectedFromRequirements = selected?.originalFileName === "writing-requirements.txt";
  const sourceBlocks = selected?.profile.source?.blocks ?? EMPTY_SOURCE_BLOCKS;
  const sourceIds = useMemo(() => sourceBlocks.map((block) => block.id), [sourceBlocks]);

  useEffect(() => {
    const next = selected?.profile.confirmedPlan ?? selected?.profile.analysis;
    setPlan(next ? normalizedPlan(next, sourceIds) : undefined);
    setStatus(undefined);
  }, [selected?.id, selected?.status, selected?.profile.analysis, selected?.profile.confirmedPlan, sourceIds]);

  useEffect(() => {
    if (busy !== "generate") {
      setGenerationSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setGenerationSeconds(Math.floor((Date.now() - startedAt) / 1_000));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [busy]);

  const upload = async (file: File) => {
    const created = await uploadOfficialDocumentContentProfile(template.id, versionId, file);
    setSelectedId(created.id);
    await profilesQuery.refetch();
    setStatus({ tone: "success", message: "内容已上传，正在提取原始段落和表格。" });
  };

  const createFromRequirements = async () => {
    const text = requirementsText.trim();
    if (!text || !analysis || busy) return;
    setBusy("generate");
    setGenerationStage("saving");
    setRequirementsError("");
    try {
      const created = await createOfficialDocumentTextContentProfile(template.id, versionId, {
        name: requirementsName,
        text
      });
      setSelectedId(created.id);
      await profilesQuery.refetch();
      setGenerationStage("analyzing");
      const generated = await analyzeOfficialDocumentContent({
        structureNodes: analysis.structureNodes,
        sourceBlocks: created.profile.source?.blocks ?? []
      });
      setGenerationStage("persisting");
      const saved = await saveOfficialDocumentContentProfileAnalysis(
        created.id,
        normalizedPlan(generated, created.profile.source?.blocks.map((block) => block.id) ?? [])
      );
      await profilesQuery.refetch();
      setSelectedId(saved.id);
      setRequirementsOpen(false);
      setRequirementsName("");
      setRequirementsText("");
      setStatus({ tone: "success", message: "已根据当前结构生成行文逻辑和资料补全需求，请审核后确认。" });
    } catch (error) {
      setRequirementsError(error instanceof Error ? error.message : "文字要求分析失败");
    } finally {
      setBusy(undefined);
      setGenerationStage(undefined);
    }
  };

  const analyze = async () => {
    if (!selected?.profile.source || !analysis || busy) return;
    setBusy("analyze");
    setStatus({ tone: "loading", message: "正在识别行文逻辑和问数、问知需求。" });
    try {
      const generated = await analyzeOfficialDocumentContent({
        structureNodes: analysis.structureNodes,
        sourceBlocks: selected.profile.source.blocks
      });
      const saved = await saveOfficialDocumentContentProfileAnalysis(
        selected.id,
        normalizedPlan(generated, sourceIds)
      );
      setPlan(saved.profile.analysis);
      await profilesQuery.refetch();
      setStatus({ tone: "success", message: "内容分析完成，请确认章节和资料补全任务。" });
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : "内容分析失败" });
    } finally {
      setBusy(undefined);
    }
  };

  const updatePlan = (mutate: (current: OfficialDocumentWritingLogicPlan) => OfficialDocumentWritingLogicPlan) => {
    setPlan((current) => current ? normalizedPlan(mutate(current), sourceIds) : current);
  };

  const updateSection = (
    sectionId: string,
    changes: Partial<OfficialDocumentWritingLogicPlan["sections"][number]>
  ) => updatePlan((current) => ({
    ...current,
    sections: current.sections.map((section) => section.id === sectionId ? { ...section, ...changes } : section)
  }));

  const assignBlocks = (sectionId: string, ids: string[]) => updatePlan((current) => ({
    ...current,
    sections: current.sections.map((section) => section.id === sectionId
      ? { ...section, sourceBlockIds: ids }
      : { ...section, sourceBlockIds: section.sourceBlockIds.filter((id) => !ids.includes(id)) })
  }));

  const moveSection = (sectionId: string, direction: -1 | 1) => updatePlan((current) => {
    const sections = [...current.sections];
    const index = sections.findIndex((section) => section.id === sectionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= sections.length) return current;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    return { ...current, sections: sections.map((section, order) => ({ ...section, order })) };
  });

  const addResearch = () => updatePlan((current) => ({
    ...current,
    researchNeeds: [
      ...current.researchNeeds,
      {
        id: `research-${crypto.randomUUID()}`,
        sectionId: current.sections[0]?.id ?? "",
        kind: "ASK_KNOWLEDGE",
        question: "",
        reason: "",
        required: false,
        preferredOutput: "FACT"
      }
    ]
  }));

  const updateResearch = (
    id: string,
    changes: Partial<OfficialDocumentWritingLogicPlan["researchNeeds"][number]>
  ) => updatePlan((current) => ({
    ...current,
    researchNeeds: current.researchNeeds.map((need) => need.id === id ? { ...need, ...changes } : need)
  }));

  const confirm = async () => {
    if (!selected || !plan || busy) return;
    const normalized = normalizedPlan(plan, sourceIds);
    if (normalized.unassignedSourceBlockIds.length) {
      setStatus({ tone: "warning", message: `还有 ${normalized.unassignedSourceBlockIds.length} 段原始内容未分配。` });
      return;
    }
    if (normalized.researchNeeds.some((need) => !need.sectionId || !need.question.trim())) {
      setStatus({ tone: "warning", message: "研究任务必须选择章节并填写问题。" });
      return;
    }
    setBusy("confirm");
    try {
      await saveOfficialDocumentContentProfileAnalysis(selected.id, normalized);
      const confirmed = await confirmOfficialDocumentContentProfile(selected.id, normalized);
      await profilesQuery.refetch();
      await onBind(confirmed);
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : "确认并绑定内容方案失败" });
    } finally {
      setBusy(undefined);
    }
  };

  const bind = async () => {
    if (!selected || selected.status !== "CONFIRMED" || busy || boundProfileId) return;
    setBusy("bind");
    try {
      await onBind(selected);
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : "绑定内容方案失败" });
    } finally {
      setBusy(undefined);
    }
  };

  const editable = selected?.status === "READY_FOR_REVIEW";
  const blockOptions = sourceBlocks.map((block) => ({
    value: block.id,
    label: `${block.headingHint === "USER_REQUIREMENT" ? "要求" : block.kind === "TABLE" ? "表格" : "段落"} ${block.order + 1} · ${block.text.slice(0, 32) || "空内容"}`
  }));
  const generationStageIndex = generationStage
    ? requirementGenerationSteps.findIndex((step) => step.key === generationStage)
    : -1;

  return (
    <section
      className="content-profile-workspace"
      aria-labelledby="content-profile-heading"
      data-query-error={profilesQuery.isError || undefined}
    >
      <header className="content-profile-workspace__head">
        <div>
          <h3 id="content-profile-heading">内容方案</h3>
          <p>
            当前结构：<strong>{template.name}</strong> · v{template.currentVersion.versionNo}。
            内容只提供原文、行文逻辑和资料需求，最终版式统一使用当前结构。
          </p>
        </div>
        {!boundProfileId ? (
          <div className="content-profile-workspace__create-actions">
            <Button type="primary" icon={<NotePencil size={16} />} onClick={() => setRequirementsOpen(true)}>
              输入写作要求
            </Button>
            <Button icon={<UploadSimple size={16} />} onClick={() => setUploadOpen(true)}>上传内容 DOCX</Button>
          </div>
        ) : null}
      </header>

      {status ? <XsStatusBar tone={status.tone} message={status.message} /> : null}

      {profilesQuery.isError ? (
        <XsStatusBar
          tone="error"
          message={profilesQuery.error instanceof Error
            ? profilesQuery.error.message
            : "内容方案服务暂不可用"}
        />
      ) : <div className="content-profile-workspace__layout">
        <aside className="content-profile-workspace__list" aria-label="内容方案列表">
          {profiles.length ? profiles.map((profile) => (
            <button
              type="button"
              key={profile.id}
              data-active={profile.id === selectedId || undefined}
              onClick={() => setSelectedId(profile.id)}
            >
              <FileDoc size={17} aria-hidden="true" />
              <span><strong>{profile.name}</strong><small>{profile.originalFileName === "writing-requirements.txt" ? "文字要求" : profile.originalFileName}</small></span>
              <Tag bordered={false} color={profile.status === "CONFIRMED" ? "success" : profile.status === "FAILED" ? "error" : "blue"}>
                {statusLabel[profile.status]}
              </Tag>
            </button>
          )) : <p className="official-document-inline-empty">{boundProfileId ? "已绑定的内容方案暂不可用。" : "还没有内容方案，可以输入写作要求或上传 DOCX 范文。"}</p>}
        </aside>

        <main className="content-profile-workspace__main">
          {!selected ? (
            <div className="official-document-inline-empty">输入写作要求或上传内容方案后，在这里审核行文逻辑。</div>
          ) : selected.status === "EXTRACTING" ? (
            <XsStatusBar tone="loading" message="正在提取原始段落和表格" />
          ) : selected.status === "FAILED" ? (
            <XsStatusBar tone="error" message={selected.profile.failureMessage || "内容解析失败，请重新上传"} />
          ) : selected.status === "EXTRACTED" ? (
            <div className="content-profile-workspace__analyze">
              <Brain size={28} aria-hidden="true" />
              <strong>{selectedFromRequirements ? `已读取 ${sourceBlocks.length} 条写作要求` : `已提取 ${sourceBlocks.length} 个原始内容块`}</strong>
              <p>{selectedFromRequirements ? "下一步结合当前结构生成章节逻辑和资料需求。" : "下一步只分析章节逻辑和资料需求，不改写原文。"}</p>
              <Button type="primary" loading={busy === "analyze"} onClick={() => void analyze()}>分析内容方案</Button>
            </div>
          ) : plan ? (
            <>
              {plan.warnings.length ? (
                <XsStatusBar tone="warning" message={plan.warnings.join("；")} />
              ) : null}
              <div className="content-profile-review">
                <section aria-labelledby="source-content-heading">
                  <h4 id="source-content-heading">原始内容</h4>
                  {selected.profile.source?.warnings.length ? (
                    <div className="content-profile-warnings">
                      {selected.profile.source.warnings.map((warning) => (
                        <Tag bordered={false} color="warning" key={warning}>
                          {warning === "CONTENT_IMAGES_NOT_IMPORTED" ? "内容图片不会带入正文" : warning}
                        </Tag>
                      ))}
                    </div>
                  ) : null}
                  <div className="content-profile-source-list">
                    {sourceBlocks.map((block) => (
                      <article key={block.id} data-unassigned={plan.unassignedSourceBlockIds.includes(block.id) || undefined}>
                        <small>{block.id.startsWith("reference-material-") && block.headingHint
                          ? block.headingHint
                          : `${block.headingHint === "USER_REQUIREMENT" ? "要求" : block.kind === "TABLE" ? "表格" : "段落"} ${block.order + 1}`}</small>
                        <p>{block.text || "（无文本）"}</p>
                      </article>
                    ))}
                  </div>
                </section>

                <section aria-labelledby="writing-logic-heading">
                  <h4 id="writing-logic-heading">行文逻辑</h4>
                  <div className="content-profile-section-list">
                    {plan.sections.map((section, index) => (
                      <article key={section.id}>
                        <div className="content-profile-section-actions">
                          <Select
                            value={section.headingRole}
                            options={roleOptions}
                            disabled={!editable}
                            onChange={(headingRole: LogicSection["headingRole"]) => updateSection(section.id, { headingRole })}
                          />
                          {editable ? <>
                            <Button type="text" icon={<ArrowUp />} disabled={index === 0} onClick={() => moveSection(section.id, -1)} />
                            <Button type="text" icon={<ArrowDown />} disabled={index === plan.sections.length - 1} onClick={() => moveSection(section.id, 1)} />
                          </> : null}
                        </div>
                        <Input value={section.title} disabled={!editable} onChange={(event) => updateSection(section.id, { title: event.target.value })} />
                        <Input.TextArea value={section.purpose} disabled={!editable} autoSize={{ minRows: 2, maxRows: 4 }} onChange={(event) => updateSection(section.id, { purpose: event.target.value })} />
                        <Select
                          mode="multiple"
                          value={section.sourceBlockIds}
                          options={blockOptions}
                          disabled={!editable}
                          placeholder="选择本节原始内容"
                          onChange={(ids) => assignBlocks(section.id, ids)}
                        />
                      </article>
                    ))}
                  </div>
                </section>

                <section aria-labelledby="research-needs-heading">
                  <div className="content-profile-review__section-head">
                    <h4 id="research-needs-heading">资料补全</h4>
                    {editable ? <Button type="text" icon={<Plus />} onClick={addResearch}>新增</Button> : null}
                  </div>
                  <div className="content-profile-research-list">
                    {plan.researchNeeds.map((need) => (
                      <article key={need.id}>
                        <Select value={need.kind} disabled={!editable} options={[
                          { value: "ASK_DATA", label: "问数" },
                          { value: "ASK_KNOWLEDGE", label: "问知" }
                        ]} onChange={(kind: ResearchNeed["kind"]) => updateResearch(need.id, { kind })} />
                        <Select value={need.sectionId} disabled={!editable} options={plan.sections.map((section) => ({ value: section.id, label: section.title }))} onChange={(sectionId) => updateResearch(need.id, { sectionId })} />
                        <Input.TextArea value={need.question} disabled={!editable} autoSize onChange={(event) => updateResearch(need.id, { question: event.target.value })} />
                        <div>
                          <Checkbox checked={need.required} disabled={!editable} onChange={(event) => updateResearch(need.id, { required: event.target.checked })}>必需</Checkbox>
                          {editable ? <Button type="text" danger icon={<Trash />} onClick={() => updatePlan((current) => ({ ...current, researchNeeds: current.researchNeeds.filter((item) => item.id !== need.id) }))} /> : null}
                        </div>
                      </article>
                    ))}
                    {!plan.researchNeeds.length ? <p className="official-document-inline-empty">原文内容充分，暂未识别到问数或问知任务。</p> : null}
                  </div>
                </section>
              </div>

              <footer className="content-profile-workspace__footer">
                <span>{plan.unassignedSourceBlockIds.length ? `${plan.unassignedSourceBlockIds.length} 段未分配` : "原始内容已全部归类"}</span>
                {editable ? (
                  <Button type="primary" loading={busy === "confirm"} onClick={() => void confirm()}>确认并绑定到草稿</Button>
                ) : boundProfileId ? (
                  <Tag bordered={false} color="success">已绑定当前草稿</Tag>
                ) : (
                  <Button type="primary" loading={busy === "bind"} onClick={() => void bind()}>绑定到当前草稿</Button>
                )}
              </footer>
            </>
          ) : null}
        </main>
      </div>}

      <XsUploadDialog
        open={uploadOpen}
        title="上传内容 DOCX"
        description="内容文件只提供原文和行文逻辑，字体与页面格式不会带入最终公文。"
        accept={[".docx"]}
        acceptMimeTypes={["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]}
        maxBytes={25 * 1024 * 1024}
        submitLabel="上传并提取"
        hint="图片、OCR 和公式识别不在 Beta0.3 范围内"
        inputTestId="official-document-content-file"
        onUpload={upload}
        onClose={() => setUploadOpen(false)}
      />

      <Modal
        open={requirementsOpen}
        title="输入写作要求"
        okText="生成行文逻辑"
        cancelText="取消"
        closable={busy !== "generate"}
        keyboard={busy !== "generate"}
        maskClosable={busy !== "generate"}
        confirmLoading={busy === "generate"}
        cancelButtonProps={{ disabled: busy === "generate" }}
        okButtonProps={{ disabled: !requirementsText.trim() || !analysis }}
        destroyOnHidden={false}
        onOk={() => void createFromRequirements()}
        onCancel={() => {
          if (busy === "generate") return;
          setRequirementsOpen(false);
          setRequirementsError("");
        }}
      >
        <div className="content-profile-requirements-form">
          <p>将结合当前结构“{template.name}”生成章节逻辑、核心要点以及需要问数、问知的位置。</p>
          <label>
            <span>方案名称（选填）</span>
            <Input
              value={requirementsName}
              disabled={busy === "generate"}
              maxLength={200}
              placeholder="例如：第三季度经营工作总结"
              onChange={(event) => setRequirementsName(event.target.value)}
            />
          </label>
          <label>
            <span>写作主题与要求</span>
            <Input.TextArea
              value={requirementsText}
              disabled={busy === "generate"}
              rows={10}
              maxLength={50_000}
              showCount
              placeholder="例如：撰写2026年第三季度工作总结，包含整体经营情况、研发与交付进展、市场情况和第四季度计划；经营指标需要问数，制度依据需要问知。"
              onChange={(event) => setRequirementsText(event.target.value)}
            />
          </label>
          {busy === "generate" && generationStage ? (
            <section className="content-profile-generation-progress" aria-live="polite" aria-label="内容方案生成进度">
              <header>
                <strong>正在生成内容方案</strong>
                <span>{generationSeconds} 秒</span>
              </header>
              <ol>
                {requirementGenerationSteps.map((step, index) => {
                  const state = index < generationStageIndex
                    ? "complete"
                    : index === generationStageIndex ? "active" : "pending";
                  return (
                    <li key={step.key} data-state={state}>
                      <i aria-hidden="true" />
                      <div><strong>{step.title}</strong><small>{step.detail}</small></div>
                    </li>
                  );
                })}
              </ol>
              <p>AI 分析通常需要 30–180 秒，完成后会自动进入审核页。</p>
            </section>
          ) : null}
          {requirementsError ? <XsStatusBar tone="error" message={requirementsError} /> : null}
        </div>
      </Modal>
    </section>
  );
}
