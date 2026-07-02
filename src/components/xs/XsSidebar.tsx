import {
  CaretDown,
  CaretUp,
  ChartPieSlice,
  ClockCounterClockwise,
  Cloud,
  Database,
  DotsThree,
  Folders,
  PenNib,
  Plus,
  Table
} from "@phosphor-icons/react";
import { Button } from "antd";
import type { ComponentType } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { XsIconTile } from "./XsIconTile";
import logoSource from "@/assets/brand/xingshu-logo-source.png";
import avatarSource from "@/assets/brand/zhangsan-avatar-source.png";

type NavItem = {
  label: string;
  to: string;
  icon: ComponentType<{ size?: number; weight?: "regular" | "duotone"; className?: string }>;
};

const primaryNavItems: NavItem[] = [
  { label: "历史对话", to: "/history", icon: ClockCounterClockwise },
  { label: "智能制表", to: "/table", icon: Table },
  { label: "智能写作", to: "/writing", icon: PenNib },
  { label: "我的看板", to: "/dashboard", icon: ChartPieSlice },
  { label: "我的云盘", to: "/cloud", icon: Cloud }
];

const moreNavItems: NavItem[] = [
  { label: "数据资产看板", to: "/data-dashboard", icon: Database },
  { label: "数据资产管理", to: "/data-management", icon: Folders }
];

type XsSidebarProps = {
  isMoreOpen: boolean;
  onToggleMore: () => void;
  onNewChat: () => void;
};

export function XsSidebar({ isMoreOpen, onToggleMore, onNewChat }: XsSidebarProps) {
  const navigate = useNavigate();

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
        type="primary"
        className="xs-sidebar__new-chat"
        icon={<Plus size={20} weight="bold" />}
        onClick={handleNewChat}
      >
        新建对话
      </Button>

      <nav className="xs-sidebar__nav" aria-label="星数主导航">
        {primaryNavItems.map((item) => (
          <NavLink
            className={({ isActive }) => `xs-sidebar__nav-item${isActive ? " is-active" : ""}`}
            to={item.to}
            key={item.label}
          >
            <XsIconTile icon={item.icon} label={item.label} size="sm" />
            <span>{item.label}</span>
          </NavLink>
        ))}

        <button type="button" className="xs-sidebar__nav-item xs-sidebar__nav-button" onClick={onToggleMore}>
          <XsIconTile icon={DotsThree} label="更多" size="sm" />
          <span>更多</span>
          {isMoreOpen ? <CaretUp size={16} /> : <CaretDown size={16} />}
        </button>

        {isMoreOpen ? (
          <div className="xs-sidebar__more">
            {moreNavItems.map((item) => (
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

      <div className="xs-sidebar__user">
        <img src={avatarSource} alt="" />
        <div>
          <strong>张三</strong>
          <span>企业管理员</span>
        </div>
      </div>
    </aside>
  );
}
