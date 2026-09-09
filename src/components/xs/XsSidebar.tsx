import {
  CaretUp,
  PlusCircle,
  SquaresFour
} from "@phosphor-icons/react";
import { Button, Dropdown, Layout, Menu, type MenuProps } from "antd";
import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import {
  isNavigationItemActive,
  primaryNavigation,
  secondaryNavigation,
  type XsNavigationIcon
} from "./navigation";
import { useXsAccountMenu } from "./useXsAccountMenu";
import {
  selectWritingJobIndicator,
  useWritingJobStore
} from "@/features/officialDocument/writingJobStore";
import logoSource from "@/assets/brand/xingshu-logo-2x.png";
import avatarSource from "@/assets/brand/zhangsan-avatar-source.png";
import { xingshuTokens } from "@/theme/xingshuTokens";

const { Sider } = Layout;
const MORE_MENU_KEY = "more";
const WRITING_NAV_KEY = "/writing";

const writingJobLabel = {
  running: "正在生成公文",
  unseen: "有新的公文成稿"
} as const;

/**
 * 生成过程可以离开写作台继续跑，所以侧栏要能替它说话。指示点贴在图标上而不是文字上，
 * 侧栏收起只剩图标时也看得见。
 */
function XsSidebarNavIcon({
  icon: Icon,
  indicator
}: {
  icon: XsNavigationIcon;
  indicator?: "running" | "unseen" | null;
}) {
  return (
    <span className="xs-sidebar__icon">
      <Icon size={18} weight="regular" />
      {indicator ? (
        <span
          className="xs-sidebar__job"
          data-state={indicator}
          role="status"
          aria-label={writingJobLabel[indicator]}
        />
      ) : null}
    </span>
  );
}

type XsSidebarProps = {
  collapsed: boolean;
  onNewChat: () => void;
};

export function XsSidebar({ collapsed, onNewChat }: XsSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { accountMenuItems, handleAccountMenuClick, username, userRole } = useXsAccountMenu();
  const [openKeys, setOpenKeys] = useState<string[]>([MORE_MENU_KEY]);
  const writingJob = useWritingJobStore(selectWritingJobIndicator);

  useEffect(() => {
    if (collapsed) {
      setOpenKeys([]);
      return;
    }

    setOpenKeys((keys) => (keys.length > 0 ? keys : [MORE_MENU_KEY]));
  }, [collapsed]);

  const selectedKeys = useMemo(() => {
    const match = [...primaryNavigation, ...secondaryNavigation].find((item) =>
      isNavigationItemActive(item.to, location.pathname)
    );
    return match ? [match.to] : [];
  }, [location.pathname]);

  const isNewChatCurrent = selectedKeys.length === 0;

  const menuItems: MenuProps["items"] = useMemo(
    () => [
      ...primaryNavigation.map((item) => ({
        key: item.to,
        icon: (
          <XsSidebarNavIcon
            icon={item.icon}
            indicator={item.to === WRITING_NAV_KEY ? writingJob : null}
          />
        ),
        label: <Link to={item.to}>{item.label}</Link>
      })),
      {
        key: MORE_MENU_KEY,
        icon: <SquaresFour size={18} weight="regular" />,
        label: "更多",
        children: secondaryNavigation.map((item) => ({
          key: item.to,
          icon: <XsSidebarNavIcon icon={item.icon} />,
          label: <Link to={item.to}>{item.label}</Link>
        }))
      }
    ],
    [writingJob]
  );

  function handleNewChat() {
    onNewChat();
    navigate("/");
  }

  function handleMenuClick({ key }: { key: string }) {
    if (key === MORE_MENU_KEY || !key.startsWith("/")) {
      return;
    }

    navigate(key);
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
      <NavLink className="xs-sidebar__brand" to="/" aria-label="回到首页">
        <img src={logoSource} alt="星数" width={400} height={183} />
      </NavLink>

      <Button
        type="default"
        className={`xs-sidebar__new-chat${isNewChatCurrent ? " xs-sidebar__new-chat--current" : ""}`}
        icon={<PlusCircle size={18} weight="regular" />}
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
          onClick={handleMenuClick}
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
          <CaretUp className="xs-sidebar__user-caret" size={14} aria-hidden="true" />
        </button>
      </Dropdown>
    </Sider>
  );
}
