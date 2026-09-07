import { useLayoutEffect, useRef } from "react";
import {
  type OfficialDocumentMentionGroup,
  type OfficialDocumentMentionItem
} from "./officialDocumentMentions";

/** 浮层最高 360，但永远不越过视口顶端。 */
const MAX_MENU_HEIGHT = 360;
const MENU_VIEWPORT_MARGIN = 16;

/**
 * @ 浮层：贴在输入盒正上方，行内是图标、标签和一段灰说明。
 * 键盘导航由输入框那边驱动，这里只负责渲染与鼠标选中。
 */
export function OfficialDocumentMentionMenu({
  groups,
  activeKey,
  emptyText,
  onHover,
  onSelect
}: {
  groups: OfficialDocumentMentionGroup[];
  activeKey: string;
  emptyText: string;
  onHover: (key: string) => void;
  onSelect: (item: OfficialDocumentMentionItem) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  /* 浮层贴在输入盒正上方，能用的高度就是输入盒上面那段空白，超了要自己滚而不是顶出屏幕。 */
  useLayoutEffect(() => {
    const element = menuRef.current;
    const anchor = element?.parentElement;
    if (!element || !anchor) return;
    const contentTop = anchor.closest("main")?.getBoundingClientRect().top ?? 0;
    const room = anchor.getBoundingClientRect().top - contentTop - MENU_VIEWPORT_MARGIN;
    element.style.maxHeight = `${Math.max(0, Math.min(MAX_MENU_HEIGHT, room))}px`;
  }, [groups]);

  useLayoutEffect(() => {
    menuRef.current?.querySelector<HTMLElement>("[data-active]")?.scrollIntoView?.({ block: "nearest" });
  }, [activeKey]);

  return (
    <div className="official-document-compose__mentions" ref={menuRef} role="listbox" aria-label="引用与动作">
      {groups.length ? groups.map((group) => (
        <div
          className="official-document-compose__mention-group"
          key={group.key}
          role="group"
          aria-label={group.title}
        >
          <p className="official-document-compose__mention-title">{group.title}</p>
          {group.items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="option"
              aria-selected={item.key === activeKey}
              className="official-document-compose__mention-item"
              data-active={item.key === activeKey || undefined}
              disabled={item.disabled}
              /* 焦点必须留在输入框里，浮层是它的延伸而不是新的落点 */
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => onHover(item.key)}
              onClick={() => onSelect(item)}
            >
              <span className="official-document-compose__mention-icon">{item.icon}</span>
              <span className="official-document-compose__mention-label">{item.label}</span>
              {item.description ? (
                <span className="official-document-compose__mention-note">{item.description}</span>
              ) : null}
            </button>
          ))}
        </div>
      )) : (
        <p className="official-document-compose__mention-empty">{emptyText}</p>
      )}
    </div>
  );
}
