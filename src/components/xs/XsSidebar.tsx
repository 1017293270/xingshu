import {
  CaretLeft,
  CaretRight,
  CaretUp,
  PlusCircle,
  SquaresFour
} from "@phosphor-icons/react";
import { Button, Dropdown, Layout, Menu, type MenuProps } from "antd";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { primaryNavigation, secondaryNavigation } from "./navigation";
import { useXsAccountMenu } from "./useXsAccountMenu";
import logoSource from "@/assets/brand/xingshu-logo-transparent.png";
import avatarSource from "@/assets/brand/zhangsan-avatar-source.png";
import { xingshuTokens } from "@/theme/xingshuTokens";

const { Sider } = Layout;
const MORE_MENU_KEY = "more";

type XsSidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNewChat: () => void;
};

export function XsSidebar({ collapsed, onToggleCollapsed, onNewChat }: XsSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { accountMenuItems, handleAccountMenuClick, username, userRole } = useXsAccountMenu();
  const [openKeys, setOpenKeys] = useState<string[]>([MORE_MENU_KEY]);

  useEffect(() => {
    if (collapsed) {
      setOpenKeys([]);
      return;
    }

    setOpenKeys((keys) => (keys.length > 0 ? keys : [MORE_MENU_KEY]));
  }, [collapsed]);

  const selectedKeys = useMemo(() => {
    const match = [...primaryNavigation, ...secondaryNavigation].find((item) => item.to === location.pathname);
    return match ? [match.to] : [];
  }, [location.pathname]);

  const menuItems: MenuProps["items"] = useMemo(
    () => [
      ...primaryNavigation.map((item) => {
        const Icon = item.icon;
        return {
          key: item.to,
          icon: <Icon size={20} weight="regular" />,
          label: <Link to={item.to}>{item.label}</Link>
        };
      }),
      {
        key: MORE_MENU_KEY,
        icon: <SquaresFour size={20} weight="regular" />,
        label: "更多",
        children: secondaryNavigation.map((item) => {
          const Icon = item.icon;
          return {
            key: item.to,
            icon: <Icon size={20} weight="regular" />,
            label: <Link to={item.to}>{item.label}</Link>
          };
        })
      }
    ],
    []
  );

  function handleNewChat() {
    onNewChat();
    navigate("/");
  }

  return (
    <Sider
      className={`xs-sidebar${collapsed ? " xs-sidebar--collapsed" : ""}`}
      theme="light"
      width={xingshuTokens.sidebarWidth}
      collapsedWidth={xingshuTokens.sidebarCollapsedWidth}
      collapsed={collapsed}
      collapsible
      trigger={null}
      aria-label="星数侧边栏"
    >
      <div className="xs-sidebar__brand">
        <img src={logoSource} alt="星数" />
        <Button
          type="text"
          className="xs-sidebar__collapse"
          aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
          aria-expanded={!collapsed}
          icon={collapsed ? <CaretRight size={18} /> : <CaretLeft size={18} />}
          onClick={onToggleCollapsed}
        />
      </div>

      <Button
        type="default"
        className="xs-sidebar__new-chat"
        icon={<PlusCircle size={20} weight="regular" />}
        aria-label="新建对话"
        onClick={handleNewChat}
      >
        <span className="xs-sidebar__new-chat-label" aria-hidden={collapsed}>新建对话</span>
      </Button>

      <nav className="xs-sidebar__nav" aria-label="星数主导航">
        <Menu
          className="xs-sidebar__menu"
          mode="inline"
          inlineCollapsed={collapsed}
          selectedKeys={selectedKeys}
          openKeys={openKeys}
          onOpenChange={setOpenKeys}
          items={menuItems}
        />
      </nav>

      <Dropdown
        menu={{ items: accountMenuItems, onClick: handleAccountMenuClick }}
        placement="topLeft"
        trigger={["click"]}
      >
        <button type="button" className="xs-sidebar__user" aria-label={`${username} ${userRole} 账户菜单`}>
          <img src={avatarSource} alt="" />
          <div className="xs-sidebar__user-copy" aria-hidden={collapsed}>
            <strong>{username}</strong>
            <span>{userRole}</span>
          </div>
          <CaretUp className="xs-sidebar__user-caret" size={15} aria-hidden="true" />
        </button>
      </Dropdown>
    </Sider>
  );
}
