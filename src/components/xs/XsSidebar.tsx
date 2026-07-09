import {
  CaretDown,
  CaretUp,
  ChartBar,
  ChartPieSlice,
  ClockCounterClockwise,
  Cloud,
  Database,
  GearSix,
  NotePencil,
  PlusCircle,
  SignOut,
  SquaresFour,
  Table,
  UserCircle
} from "@phosphor-icons/react";
import { Button, Dropdown, type MenuProps } from "antd";
import type { ComponentType } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { XsIconTile } from "./XsIconTile";
import logoSource from "@/assets/brand/xingshu-logo-transparent.png";
import avatarSource from "@/assets/brand/zhangsan-avatar-source.png";
import { logoutDataHub } from "@/services/dataHubAuthService";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import { useUiStore } from "@/stores/uiStore";

type NavIcon = ComponentType<{ size?: number; weight?: "regular" | "duotone"; className?: string }>;

type NavItem = {
  label: string;
  to: string;
  icon: NavIcon;
};

const primaryNavItems: NavItem[] = [
  { label: "历史对话", to: "/history", icon: ClockCounterClockwise },
  { label: "智能制表", to: "/table", icon: Table },
  { label: "智能写作", to: "/writing", icon: NotePencil },
  { label: "我的看板", to: "/dashboard", icon: ChartBar },
  { label: "我的云盘", to: "/cloud", icon: Cloud }
];

const moreNavItems: NavItem[] = [
  { label: "数据资产看板", to: "/data-dashboard", icon: ChartPieSlice },
  { label: "数据资产管理", to: "/data-management", icon: Database }
];

type XsSidebarProps = {
  isMoreOpen: boolean;
  onToggleMore: () => void;
  onNewChat: () => void;
};

export function XsSidebar({ isMoreOpen, onToggleMore, onNewChat }: XsSidebarProps) {
  const navigate = useNavigate();
  const user = useDataHubAuthStore((state) => state.user);
  const clearAuthState = useDataHubAuthStore((state) => state.clearAuthState);
  const resetUiState = useUiStore((state) => state.resetUiState);
  const username = user?.username || "张三";
  const userRole = user?.isAdmin ? "系统管理员" : "企业管理员";

  const accountMenuItems: MenuProps["items"] = [
    {
      key: "profile",
      icon: <UserCircle size={17} />,
      label: `${username} · ${userRole}`,
      disabled: true
    },
    {
      key: "ai-settings",
      icon: <GearSix size={17} />,
      label: "AI 配置"
    },
    {
      type: "divider"
    },
    {
      key: "logout",
      danger: true,
      icon: <SignOut size={17} />,
      label: "退出登录"
    }
  ];

  function handleNewChat() {
    onNewChat();
    navigate("/");
  }

  function handleAccountMenuClick({ key }: { key: string }) {
    if (key === "ai-settings") {
      navigate("/settings/ai");
      return;
    }

    if (key !== "logout") {
      return;
    }

    logoutDataHub();
    clearAuthState();
    resetUiState();
    navigate("/login", { replace: true });
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
          <XsIconTile icon={SquaresFour} label="更多" size="sm" />
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
