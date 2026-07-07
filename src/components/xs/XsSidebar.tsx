import {
  CaretDown,
  CaretUp
} from "@phosphor-icons/react";
import { Button } from "antd";
import { NavLink, useNavigate } from "react-router-dom";
import { XsIconTile } from "./XsIconTile";
import logoSource from "@/assets/brand/xingshu-logo-transparent.png";
import avatarSource from "@/assets/brand/zhangsan-avatar-source.png";
import businessDashboardIcon from "@/assets/icon-kit/xingshu-sidebar-image2-v1/icon-sidebar-business-dashboard.png";
import cloudDriveIcon from "@/assets/icon-kit/xingshu-sidebar-image2-v1/icon-sidebar-cloud-drive.png";
import dataAssetDashboardIcon from "@/assets/icon-kit/xingshu-sidebar-image2-v1/icon-sidebar-data-asset-dashboard.png";
import dataAssetManagementIcon from "@/assets/icon-kit/xingshu-sidebar-image2-v1/icon-sidebar-data-asset-management.png";
import historyIcon from "@/assets/icon-kit/xingshu-sidebar-image2-v1/icon-sidebar-history-conversation.png";
import moreAppsIcon from "@/assets/icon-kit/xingshu-sidebar-image2-v1/icon-sidebar-more-apps.png";
import newChatIcon from "@/assets/icon-kit/xingshu-sidebar-image2-v1/icon-sidebar-new-chat.png";
import smartTableIcon from "@/assets/icon-kit/xingshu-sidebar-image2-v1/icon-sidebar-smart-table.png";
import writingIcon from "@/assets/icon-kit/xingshu-sidebar-image2-v1/icon-sidebar-intelligent-writing.png";

const sidebarIconSource = "xingshu-sidebar-image2-v1";

type NavItem = {
  label: string;
  to: string;
  imageSrc: string;
};

const primaryNavItems: NavItem[] = [
  { label: "历史对话", to: "/history", imageSrc: historyIcon },
  { label: "智能制表", to: "/table", imageSrc: smartTableIcon },
  { label: "智能写作", to: "/writing", imageSrc: writingIcon },
  { label: "我的看板", to: "/dashboard", imageSrc: businessDashboardIcon },
  { label: "我的云盘", to: "/cloud", imageSrc: cloudDriveIcon }
];

const moreNavItems: NavItem[] = [
  { label: "数据资产看板", to: "/data-dashboard", imageSrc: dataAssetDashboardIcon },
  { label: "数据资产管理", to: "/data-management", imageSrc: dataAssetManagementIcon }
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
        icon={
          <img
            className="xs-sidebar__new-chat-icon"
            src={newChatIcon}
            alt=""
            data-icon-source={sidebarIconSource}
          />
        }
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
            <XsIconTile
              imageSrc={item.imageSrc}
              imageSource={sidebarIconSource}
              label={item.label}
              size="sm"
            />
            <span>{item.label}</span>
          </NavLink>
        ))}

        <button type="button" className="xs-sidebar__nav-item xs-sidebar__nav-button" onClick={onToggleMore}>
          <XsIconTile imageSrc={moreAppsIcon} imageSource={sidebarIconSource} label="更多" size="sm" />
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
                <XsIconTile
                  imageSrc={item.imageSrc}
                  imageSource={sidebarIconSource}
                  label={item.label}
                  size="sm"
                />
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
