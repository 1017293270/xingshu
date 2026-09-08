import { CaretRight, FileText } from "@phosphor-icons/react";
import { Button } from "antd";
import { useMemo } from "react";
import { useNow } from "@/components/xs/datahub/useNow";
import type { OfficialDocumentStructureNode } from "@/types/officialDocument";
import { buildTemplateOutline, flattenTemplateOutline } from "./templateOutline";

/**
 * 大纲分析是一次同步 LLM 调用（服务端 180s 超时），既没有流式也没有中间事件。
 * 只展示真实等待、耗时和已经拿到的参考结构，不按时间推断完成了哪个步骤。
 */

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

export type ComposeAnalyzingCardProps = {
  /** 分析发起时刻，用于真实耗时。 */
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

  return (
    <section className="compose-analyzing" aria-label="写作大纲分析中">
      <details className="compose-analyzing__details">
        <summary className="compose-analyzing__head">
          <CaretRight size={12} aria-hidden="true" />
          <span className="compose-analyzing__title" role="status">正在梳理写作大纲</span>
          <span className="compose-analyzing__elapsed" aria-hidden="true">{elapsedSeconds(elapsedMs)} 秒</span>
        </summary>
        <div className="compose-analyzing__body">
          <p className="compose-analyzing__reference">
            <FileText size={14} aria-hidden="true" />
            <span>{headings.length
              ? `《${templateName}》· ${headings.length} 个章节`
              : `《${templateName}》· ${templateNodes.length} 个结构段落`}</span>
          </p>
          {shown.length ? (
            <div className="compose-analyzing__skeleton">
              <strong>参考模板的章节</strong>
              <ul>
                {shown.map((item) => (
                  <li key={item.key} data-depth={item.depth}>{item.preview}</li>
                ))}
                {restCount > 0 ? <li data-depth={0} data-more="">还有 {restCount} 个章节</li> : null}
              </ul>
            </div>
          ) : null}
          <p className="compose-analyzing__note">最终章节以本次确认的大纲为准。</p>
        </div>
      </details>
      <p className="compose-analyzing__hint">根据写作要求整理章节与要点，完成后可以调整。</p>

      {elapsedMs >= SLOW_HINT_MS ? (
        <p className="compose-analyzing__slow">
          仍在等待大纲返回，可以继续等待或跳过大纲直接生成。
        </p>
      ) : null}

      <footer className="compose-analyzing__actions">
        <Button type="text" onClick={onSkip}>跳过大纲直接生成</Button>
        <Button type="text" onClick={onCancel}>取消</Button>
      </footer>
    </section>
  );
}
