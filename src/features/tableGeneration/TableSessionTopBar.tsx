import { CaretDown, Plus } from "@phosphor-icons/react";
import { Dropdown } from "antd";
import type { MenuProps } from "antd";
import { Link } from "react-router";

type TableSessionTopBarProps = {
  /** 当前会话标题，过长时截断，点开切换会话。 */
  title: string;
  sessionMenu: MenuProps;
  /** 本会话已产出的结果表张数，0 时不占位。 */
  tableCount: number;
};

/** 48px 顶栏：会话标题（可切换）· 结果表计数 · 新建制表。 */
export function TableSessionTopBar({ title, sessionMenu, tableCount }: TableSessionTopBarProps) {
  return (
    <header className="tgs__topbar">
      <Dropdown trigger={["click"]} menu={sessionMenu} placement="bottomLeft">
        <button type="button" className="tgs-topbar__switch" aria-label="切换制表会话">
          <span title={title}>{title}</span>
          <CaretDown size={13} weight="bold" aria-hidden="true" />
        </button>
      </Dropdown>
      {tableCount > 0 ? (
        <span className="tgs-topbar__count">{tableCount} 张结果表</span>
      ) : null}
      <span className="tgs-topbar__spacer" />
      <Link className="tgs-topbar__new" to="/table">
        <Plus size={14} aria-hidden="true" />
        新建制表
      </Link>
    </header>
  );
}
