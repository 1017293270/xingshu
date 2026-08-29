import type { ReactNode } from "react";

export type XsArtifactCardProps = {
  /** 卡片自己的可访问名，例如"生成的公文文件"、"结果表"。 */
  label: string;
  icon: ReactNode;
  /** 卡片第一行的小字：状态或来源，例如"临时成稿 · 点击浏览"。 */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** 标题后的徽标，例如版本号。 */
  badge?: ReactNode;
  meta?: ReactNode;
  /** 正在侧栏里浏览的那一张要标出来。 */
  active?: boolean;
  openLabel: string;
  onOpen: () => void;
  /** 卡片右侧的操作按钮。 */
  actions?: ReactNode;
};

/**
 * 产物卡：对话流里代表一份公文、一张结果表这类"大交付物"。
 * 卡片本身只承载身份和入口，内容一律在侧栏里展开——几千字或几十行铺在对话流里，
 * 会让上一轮彻底翻不回去。
 */
export function XsArtifactCard({
  label,
  icon,
  eyebrow,
  title,
  badge,
  meta,
  active,
  openLabel,
  onOpen,
  actions
}: XsArtifactCardProps) {
  return (
    <article className="xs-artifact-card" aria-label={label} data-active={active || undefined}>
      <button
        type="button"
        className="xs-artifact-card__open"
        aria-label={openLabel}
        onClick={onOpen}
      >
        <span className="xs-artifact-card__icon">{icon}</span>
        <span className="xs-artifact-card__copy">
          {eyebrow ? <small>{eyebrow}</small> : null}
          <strong>
            {title}
            {badge ? <span className="xs-chat__badge">{badge}</span> : null}
          </strong>
          {meta ? <span>{meta}</span> : null}
        </span>
      </button>
      {actions}
    </article>
  );
}
