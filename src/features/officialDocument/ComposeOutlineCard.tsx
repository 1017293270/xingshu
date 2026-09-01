import { CircleNotch, Database, FileText, ListChecks, Trash, WarningCircle } from "@phosphor-icons/react";
import { Button, Input, Tooltip } from "antd";
import type { OfficialDocumentWritingLogicPlan } from "@/types/officialDocument";

export type ComposeOutlinePhase = "confirm" | "researching";

export type ComposeOutlineCardProps = {
  plan: OfficialDocumentWritingLogicPlan;
  phase: ComposeOutlinePhase;
  /** researching 阶段的一行进度播报。 */
  progressText?: string;
  /** 已失败的研究条数（失败不阻塞，正文写待补充）。 */
  failureCount?: number;
  busy?: boolean;
  onChangeSectionTitle: (sectionId: string, title: string) => void;
  onRemoveSection: (sectionId: string) => void;
  onConfirm: () => void;
  onSkip: () => void;
  onCancel: () => void;
};

/**
 * 生成前的大纲确认环：分析出的章节可改标题、可删；研究清单先看后跑。
 * 「跳过大纲直接生成」保留一步到位的老路径。
 */
export function ComposeOutlineCard({
  plan,
  phase,
  progressText,
  failureCount = 0,
  busy,
  onChangeSectionTitle,
  onRemoveSection,
  onConfirm,
  onSkip,
  onCancel
}: ComposeOutlineCardProps) {
  const researching = phase === "researching";
  const removable = plan.sections.length > 1;

  return (
    <section className="compose-outline" aria-label="写作大纲确认">
      <header className="compose-outline__head">
        <ListChecks size={17} weight="duotone" aria-hidden="true" />
        <strong>确认写作大纲</strong>
        <small>{plan.summary || "按参考结构梳理的章节安排"}</small>
      </header>

      <ol className="compose-outline__sections">
        {plan.sections.map((section) => (
          <li key={section.id}>
            <div className="compose-outline__section-row">
              <Input
                size="small"
                aria-label={`章节标题：${section.title}`}
                value={section.title}
                maxLength={60}
                disabled={researching || busy}
                onChange={(event) => onChangeSectionTitle(section.id, event.target.value)}
              />
              {removable ? (
                <Tooltip title="删除这一节" placement="top">
                  <Button
                    type="text"
                    size="small"
                    aria-label={`删除章节：${section.title}`}
                    disabled={researching || busy}
                    icon={<Trash size={14} aria-hidden="true" />}
                    onClick={() => onRemoveSection(section.id)}
                  />
                </Tooltip>
              ) : null}
            </div>
            {section.purpose ? <p>{section.purpose}</p> : null}
            {section.keyPoints.length ? (
              <div className="compose-outline__points">
                {section.keyPoints.slice(0, 4).map((point) => (
                  <em key={point}>{point}</em>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      {plan.researchNeeds.length ? (
        <div className="compose-outline__research" aria-label="待补充资料">
          <strong>
            <Database size={15} weight="duotone" aria-hidden="true" />
            生成前自动补充 {plan.researchNeeds.length} 项资料
          </strong>
          <ul>
            {plan.researchNeeds.map((need) => (
              <li key={need.id}>
                <span data-kind={need.kind}>{need.kind === "ASK_DATA" ? "问数" : "问知"}</span>
                {need.question}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {researching ? (
        <p className="compose-outline__progress" role="status">
          <CircleNotch className="xs-chat__spinner" size={15} aria-hidden="true" />
          {progressText || "正在补充资料…"}
          {failureCount > 0 ? (
            <small>
              <WarningCircle size={13} aria-hidden="true" />
              {failureCount} 项失败，正文将写「[待补充]」
            </small>
          ) : null}
        </p>
      ) : (
        <footer className="compose-outline__actions">
          <Button type="primary" disabled={busy} onClick={onConfirm}>
            {plan.researchNeeds.length ? "确认大纲，补资料并生成" : "确认大纲并生成"}
          </Button>
          <Button disabled={busy} icon={<FileText size={14} aria-hidden="true" />} onClick={onSkip}>
            跳过大纲直接生成
          </Button>
          <Button type="text" disabled={busy} onClick={onCancel}>
            取消
          </Button>
        </footer>
      )}
    </section>
  );
}
