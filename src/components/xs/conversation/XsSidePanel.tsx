import { X } from "@phosphor-icons/react";
import { Button } from "antd";
import { useEffect, type ReactNode } from "react";

export type XsSidePanelProps = {
  label: string;
  icon: ReactNode;
  title: ReactNode;
  /** 标题下的口径行：模板名、字段数、行数这类。 */
  meta?: ReactNode;
  titleHint?: string;
  actions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
};

/**
 * 产物侧栏：整块右侧都用来看这一份东西。
 * 关闭走 ESC 或右上角，进出动画在 CSS 里；窄屏自动退化成覆盖层。
 */
export function XsSidePanel({
  label,
  icon,
  title,
  meta,
  titleHint,
  actions,
  onClose,
  children
}: XsSidePanelProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <aside className="xs-side-panel" aria-label={label}>
      <header className="xs-side-panel__head">
        <span className="xs-side-panel__icon">{icon}</span>
        <span className="xs-side-panel__title">
          <strong title={titleHint}>{title}</strong>
          {meta ? <small>{meta}</small> : null}
        </span>
        <div className="xs-side-panel__actions">
          {actions}
          <Button
            type="text"
            size="small"
            aria-label="关闭预览"
            icon={<X size={16} aria-hidden="true" />}
            onClick={onClose}
          />
        </div>
      </header>
      <div className="xs-side-panel__body">{children}</div>
    </aside>
  );
}
