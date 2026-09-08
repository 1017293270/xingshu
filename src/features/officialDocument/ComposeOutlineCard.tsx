import { CircleNotch, Database, ListChecks, Trash, WarningCircle } from "@phosphor-icons/react";
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
  completedCount?: number;
  researchStarted?: boolean;
  onChangeResearchQuestion?: (taskId: string, question: string) => void;
  busy?: boolean;
  onChangeSectionTitle: (sectionId: string, title: string) => void;
  onChangeSectionLogic: (sectionId: string, changes: { purpose?: string; keyPoints?: string[] }) => void;
  onRemoveSection: (sectionId: string) => void;
  onConfirm: () => void;
  onSkip: () => void;
  onCancel: () => void;
};

/** 一级 / 二级 / 三级决定缩进层级，读起来才像一份计划而不是一排同级表单。 */
const headingLevel: Record<OfficialDocumentWritingLogicPlan["sections"][number]["headingRole"], 1 | 2 | 3> = {
  HEADING_1: 1,
  HEADING_2: 2,
  HEADING_3: 3
};

/**
 * 生成前的大纲确认环：分析出的章节可改标题、可删；研究清单先看后跑。
 * 「跳过大纲直接生成」保留一步到位的老路径。
 *
 * 排版按「计划清单」而不是「表单」来做：标题是幽灵输入（默认看着是正文，
 * hover/聚焦才浮出边框），删除键只在行上出现，任何一行文字都能换行——
 * 卡片里不允许出现横向滚动条，它会连累整条会话流一起横滚。
 */
export function ComposeOutlineCard({
  plan,
  phase,
  progressText,
  failureCount = 0,
  completedCount = 0,
  researchStarted,
  onChangeResearchQuestion,
  busy,
  onChangeSectionTitle,
  onChangeSectionLogic,
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
        <p className="compose-outline__heading">
          <ListChecks size={16} weight="duotone" aria-hidden="true" />
          <strong data-running={researching || undefined}>{researching ? "正在补充资料" : "确认写作大纲"}</strong>
        </p>
        <p className="compose-outline__summary">{plan.summary || "根据本次写作要求整理的章节安排"}</p>
      </header>

      <ol className="compose-outline__sections">
        {plan.sections.map((section) => (
          <li key={section.id} data-level={headingLevel[section.headingRole] ?? 1}>
            <div className="compose-outline__section-row">
              {/* 标题可能长过一行，用 textarea 让它自然折行；input 只会被截断或内部横滚 */}
              <Input.TextArea
                className="compose-outline__title"
                variant="borderless"
                autoSize
                aria-label={`章节标题：${section.title}`}
                value={section.title}
                maxLength={60}
                disabled={researching || busy}
                // 标题是一行字，回车不该在里面留空行；粘进来的多行也压平成一行
                onPressEnter={(event) => event.preventDefault()}
                onChange={(event) => onChangeSectionTitle(section.id, event.target.value.replace(/\s*\n+\s*/g, " "))}
              />
              {removable ? (
                <Tooltip title="删除这一节" placement="top">
                  <Button
                    className="compose-outline__remove"
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
            {section.purpose ? <p className="compose-outline__purpose">{section.purpose}</p> : null}
            {section.keyPoints.length ? (
              <p className="compose-outline__points">
                <span>要点</span>
                {section.keyPoints.slice(0, 4).join(" · ")}
              </p>
            ) : null}
            <details className="compose-outline__logic">
              <summary>调整写作思路</summary>
              <label>
                <span>这一节要表达什么</span>
                <Input.TextArea
                  value={section.purpose}
                  aria-label={`章节写作目的：${section.title}`}
                  autoSize={{ minRows: 2, maxRows: 5 }}
                  maxLength={500}
                  disabled={researching || busy}
                  onChange={(event) => onChangeSectionLogic(section.id, { purpose: event.target.value })}
                />
              </label>
              <label>
                <span>内容要点，每行一条</span>
                <Input.TextArea
                  value={section.keyPoints.join("\n")}
                  aria-label={`章节内容要点：${section.title}`}
                  autoSize={{ minRows: 3, maxRows: 8 }}
                  maxLength={2000}
                  disabled={researching || busy}
                  onChange={(event) => onChangeSectionLogic(section.id, { keyPoints: event.target.value.split("\n") })}
                />
              </label>
            </details>
          </li>
        ))}
      </ol>

      {plan.researchNeeds.length ? (
        <div className="compose-outline__research" aria-label="待补充资料">
          <strong>
            <Database size={14} weight="duotone" aria-hidden="true" />
            生成前自动补充 {plan.researchNeeds.length} 项资料
          </strong>
          <ul>
            {plan.researchNeeds.map((need) => (
              <li key={need.id}>
                <span data-kind={need.kind}>{need.kind === "ASK_DATA" ? "问数" : "问知"}</span>
                {onChangeResearchQuestion ? <Input.TextArea
                  value={need.question}
                  aria-label={`资料问题：${need.id}`}
                  autoSize={{ minRows: 1, maxRows: 5 }}
                  maxLength={2000}
                  disabled={researching || busy}
                  onChange={(event) => onChangeResearchQuestion(need.id, event.target.value)}
                /> : need.question}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {researching ? (
        <p className="compose-outline__progress" role="status">
          <CircleNotch className="xs-chat__spinner" size={14} aria-hidden="true" />
          {progressText || "正在补充资料…"}
          {failureCount > 0 ? (
            <small>
              <WarningCircle size={13} aria-hidden="true" />
              {failureCount} 项失败，正文将写「[待补充]」
            </small>
          ) : null}
          <Button type="text" onClick={onCancel}>停止补充资料</Button>
        </p>
      ) : (
        <footer className="compose-outline__actions">
          {progressText || completedCount ? <small role="status">{progressText || `已保留 ${completedCount} 项资料，继续时复用已完成结果。`}</small> : null}
          <Button type="primary" disabled={busy} onClick={onConfirm}>
            {researchStarted ? "继续补充资料并生成" : plan.researchNeeds.length ? "确认大纲，补资料并生成" : "确认大纲并生成"}
          </Button>
          <Button type="text" disabled={busy} onClick={onSkip}>
            {researchStarted ? "使用现有资料生成" : "跳过大纲直接生成"}
          </Button>
          <Button type="text" disabled={busy} onClick={onCancel}>
            取消
          </Button>
        </footer>
      )}
    </section>
  );
}
