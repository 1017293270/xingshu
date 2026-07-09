import {
  CaretDown,
  CaretUp,
  PlusCircle,
  SquaresFour
} from "@phosphor-icons/react";
import { Button, Dropdown } from "antd";
import { NavLink, useNavigate } from "react-router-dom";
import { XsIconTile } from "./XsIconTile";
import { primaryNavigation, secondaryNavigation } from "./navigation";
import { useXsAccountMenu } from "./useXsAccountMenu";
import logoSource from "@/assets/brand/xingshu-logo-transparent.png";
import avatarSource from "@/assets/brand/zhangsan-avatar-source.png";

type XsSidebarProps = {
  isMoreOpen: boolean;
  onToggleMore: () => void;
  onNewChat: () => void;
};

export function XsSidebar({ isMoreOpen, onToggleMore, onNewChat }: XsSidebarProps) {
  const navigate = useNavigate();
  const { accountMenuItems, handleAccountMenuClick, username, userRole } = useXsAccountMenu();

  function handleNewChat() {
    onNewChat();
    navigate("/");
  }

  return (
    <aside className="xs-sidebar">
      <div className="xs-sidebar__brand">
        <img src={logoSource} alt="星数" />
      </div>

      <Button
        type="default"
        className="xs-sidebar__new-chat"
        icon={<PlusCircle size={20} weight="regular" />}
        onClick={handleNewChat}
      >
        新建对话
      </Button>

      <nav className="xs-sidebar__nav" aria-label="星数主导航">
        {primaryNavigation.map((item) => (
          <NavLink
            className={({ isActive }) => `xs-sidebar__nav-item${isActive ? " is-active" : ""}`}
            to={item.to}
            key={item.label}
          >
            <XsIconTile icon={item.icon} label={item.label} size="sm" />
            <span>{item.label}</span>
          </NavLink>
        ))}

        <button
          type="button"
          className="xs-sidebar__nav-item xs-sidebar__nav-button"
          aria-expanded={isMoreOpen}
          aria-controls="xs-sidebar-more-navigation"
          onClick={onToggleMore}
        >
          <XsIconTile icon={SquaresFour} label="更多" size="sm" />
          <span>更多</span>
          {isMoreOpen ? <CaretUp size={16} /> : <CaretDown size={16} />}
        </button>

        {isMoreOpen ? (
          <div className="xs-sidebar__more" id="xs-sidebar-more-navigation">
            {secondaryNavigation.map((item) => (
              <NavLink
                className={({ isActive }) =>
                  `xs-sidebar__nav-item xs-sidebar__nav-item--sub${isActive ? " is-active" : ""}`
                }
                to={item.to}
                key={item.label}
              >
                <XsIconTile icon={item.icon} label={item.label} size="sm" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ) : null}
      </nav>

      <Dropdown
        menu={{ items: accountMenuItems, onClick: handleAccountMenuClick }}
        placement="topLeft"
        trigger={["click"]}
      >
        <button type="button" className="xs-sidebar__user" aria-label={`${username} ${userRole} 账户菜单`}>
          <img src={avatarSource} alt="" />
          <div>
            <strong>{username}</strong>
            <span>{userRole}</span>
          </div>
          <CaretUp className="xs-sidebar__user-caret" size={15} />
        </button>
      </Dropdown>
    </aside>
  );
}
