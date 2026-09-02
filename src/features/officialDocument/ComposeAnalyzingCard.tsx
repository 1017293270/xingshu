import { Check, CircleNotch, FileText, Info, ListChecks } from "@phosphor-icons/react";
import { Button } from "antd";
import { useMemo } from "react";
import { useNow } from "@/components/xs/datahub/useNow";
import type { OfficialDocumentStructureNode } from "@/types/officialDocument";
import { buildTemplateOutline, flattenTemplateOutline } from "./templateOutline";

/**
 * 大纲分析是一次同步 LLM 调用（服务端 180s 超时），既没有流式也没有中间事件。
 * 所以这张卡片只讲能证实的事：走了多少秒、拿到的参考结构长什么样、模型此刻在做哪一段，
 * 外加随时可走的两个出口。任何百分比进度条在这里都只能是编的，不做。
 */

/** 卡片出现约 1 秒后「读取参考结构」置为完成：结构是本地就有的输入，读它确实只要一瞬。 */
const STEP_READ_DONE_MS = 1_200;
/** 章节要点先于资料清单成形，25 秒是这条调用的常见节奏分界。 */
const STEP_POINTS_DONE_MS = 25_000;
/** 超过一分钟就该主动告诉用户「这次偏慢」，而不是让人自己猜。 */
const SLOW_HINT_MS = 60_000;
/** 骨架只是给等待期一个预判，列满八条已经够看，再多就把卡片撑成一页目录。 */
const MAX_SKELETON_ITEMS = 8;

function elapsedSeconds(ms: number) {
  return Math.max(0, Math.round(ms / 1000));
}

/**
 * 运行中轮次的「· N 秒」读数。
 * aria-hidden：它挂在 .xs-chat__assistant-body 这块 aria-live 区里，
 * 不遮起来读屏会每秒复读一次秒数。
 */
export function ComposeElapsed({ startedAt, active = true }: { startedAt: number; active?: boolean }) {
  const now = useNow(1000, active);

  return (
    <span className="compose-elapsed" aria-hidden="true">
      {elapsedSeconds(now - startedAt)} 秒
    </span>
  );
}

type AnalyzingStepState = "done" | "active" | "pending";

export type ComposeAnalyzingCardProps = {
  /** 分析发起时刻，耗时与阶段推进都以它为准。 */
  startedAt: number;
  templateName: string;
  /** 参考草稿绑定的模板结构，用来列出真实的章节骨架。 */
  templateNodes: OfficialDocumentStructureNode[];
  onSkip: () => void;
  onCancel: () => void;
};

export function ComposeAnalyzingCard({
  startedAt,
  templateName,
  templateNodes,
  onSkip,
  onCancel
}: ComposeAnalyzingCardProps) {
  const now = useNow(1000);
  const elapsedMs = Math.max(0, now - startedAt);

  const headings = useMemo(
    () => flattenTemplateOutline(buildTemplateOutline(templateNodes).items)
      .filter((item) => item.kind === "heading"),
    [templateNodes]
  );
  const shown = headings.slice(0, MAX_SKELETON_ITEMS);
  const restCount = headings.length - shown.length;

  const steps: Array<{ key: string; label: string; detail?: string; state: AnalyzingStepState }> = [
    {
      key: "read",
      label: "读取参考结构",
      detail: headings.length
        ? `《${templateName}》· ${headings.length} 个章节`
        : `《${templateName}》· ${templateNodes.length} 个结构段落`,
      state: elapsedMs < STEP_READ_DONE_MS ? "active" : "done"
    },
    {
      key: "points",
      label: "推断各章写作要点",
      state: elapsedMs < STEP_READ_DONE_MS
        ? "pending"
        : elapsedMs < STEP_POINTS_DONE_MS ? "active" : "done"
    },
    {
      key: "research",
      label: "整理需要补充的资料",
      state: elapsedMs < STEP_POINTS_DONE_MS ? "pending" : "active"
    }
  ];
  const activeStep = steps.find((step) => step.state === "active");

  return (
    <section className="compose-analyzing" aria-label="写作大纲分析中">
      <header className="compose-analyzing__head">
        <p className="compose-analyzing__heading">
          <ListChecks size={16} weight="duotone" aria-hidden="true" />
          <strong>正在梳理写作大纲</strong>
        </p>
        <span className="compose-analyzing__elapsed" aria-hidden="true">{elapsedSeconds(elapsedMs)} 秒</span>
      </header>

      {/* 阶段只在切换时变，读屏据此播报一次；秒数留给上面那个 aria-hidden 的读数。 */}
      <p className="sr-only" role="status">{`正在${activeStep?.label ?? "梳理写作大纲"}`}</p>

      <ol className="compose-analyzing__steps">
        {steps.map((step) => (
          <li key={step.key} data-state={step.state}>
            <span className="compose-analyzing__step-icon">
              {step.state === "done" ? (
                <Check size={13} weight="bold" aria-hidden="true" />
              ) : step.state === "active" ? (
                <CircleNotch className="xs-chat__spinner" size={13} aria-hidden="true" />
              ) : (
                <i aria-hidden="true" />
              )}
            </span>
            <span className="compose-analyzing__step-text">
              <span>{step.label}</span>
              {step.detail ? <small>{step.detail}</small> : null}
            </span>
          </li>
        ))}
      </ol>

      {shown.length ? (
        <div className="compose-analyzing__skeleton">
          <strong>将沿用参考结构的章节骨架</strong>
          <ul>
            {shown.map((item) => (
              <li key={item.key} data-depth={item.depth}>{item.preview}</li>
            ))}
            {restCount > 0 ? <li data-depth={0} data-more="">还有 {restCount} 个章节</li> : null}
          </ul>
        </div>
      ) : null}

      {elapsedMs >= SLOW_HINT_MS ? (
        <p className="compose-analyzing__slow">
          <Info size={14} weight="duotone" aria-hidden="true" />
          分析比平时慢一些，可以跳过大纲直接生成，也可以继续等待。
        </p>
      ) : null}

      <footer className="compose-analyzing__actions">
        <Button icon={<FileText size={14} aria-hidden="true" />} onClick={onSkip}>跳过大纲直接生成</Button>
        <Button type="text" onClick={onCancel}>取消</Button>
      </footer>
    </section>
  );
}
