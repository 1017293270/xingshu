import { CaretRight, List, PlusCircle } from "@phosphor-icons/react";
import { Button, Drawer, Dropdown } from "antd";
import { useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import avatarSource from "@/assets/brand/zhangsan-avatar-source.png";
import logoSource from "@/assets/brand/xingshu-logo-transparent.png";
import { XsIconTile } from "./XsIconTile";
import { primaryNavigation, routeTitles, secondaryNavigation } from "./navigation";
import { useXsAccountMenu } from "./useXsAccountMenu";

type XsMobileNavProps = {
  onNewChat: () => void;
};

export function XsMobileNav({ onNewChat }: XsMobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreTriggerFocusRef = useRef(true);
  const location = useLocation();
  const navigate = useNavigate();
  const closeForNavigation = () => {
    restoreTriggerFocusRef.current = false;
    setIsOpen(false);
  };
  const { accountMenuItems, handleAccountMenuClick, username, userRole } = useXsAccountMenu(closeForNavigation);

  function handleNewChat() {
    onNewChat();
    closeForNavigation();
    navigate("/");
  }

  return (
    <header className="xs-mobile-nav">
      <NavLink className="xs-mobile-nav__brand" to="/" aria-label="返回星数首页">
        <img src={logoSource} alt="" />
      </NavLink>
      <strong className="xs-mobile-nav__title">{routeTitles[location.pathname] || "星数"}</strong>
      <Button
        ref={triggerRef}
        type="text"
        className="xs-mobile-nav__trigger"
        aria-label="打开主导航"
        aria-expanded={isOpen}
        aria-controls="xs-mobile-navigation"
        icon={<List size={24} />}
        onClick={() => {
          restoreTriggerFocusRef.current = true;
          setIsOpen(true);
        }}
      />

      <Drawer
        className="xs-mobile-drawer"
        rootClassName="xs-mobile-drawer-root"
        title="星数主导航"
        width="min(88vw, 360px)"
        open={isOpen}
        placement="right"
        onClose={() => {
          restoreTriggerFocusRef.current = true;
          setIsOpen(false);
        }}
        afterOpenChange={(open) => {
          if (!open && restoreTriggerFocusRef.current) {
            triggerRef.current?.focus();
            return;
          }

          if (!open) {
            window.requestAnimationFrame(() => {
              const heading = document.querySelector<HTMLElement>("#xs-main-content h1");
              if (heading) {
                heading.tabIndex = -1;
                heading.focus({ preventScroll: true });
              }
            });
          }
        }}
      >
        <Button
          type="default"
          className="xs-mobile-drawer__new-chat"
          icon={<PlusCircle size={20} />}
          onClick={handleNewChat}
        >
          新建对话
        </Button>

        <nav id="xs-mobile-navigation" className="xs-mobile-drawer__nav" aria-label="移动端星数主导航">
          {primaryNavigation.map((item) => (
            <NavLink
              className={({ isActive }) => `xs-mobile-drawer__link${isActive ? " is-active" : ""}`}
              to={item.to}
              key={item.to}
              onClick={closeForNavigation}
            >
              <XsIconTile icon={item.icon} label={item.label} size="sm" />
              <span>{item.label}</span>
              <CaretRight size={16} aria-hidden="true" />
            </NavLink>
          ))}

          <div className="xs-mobile-drawer__group" aria-label="更多功能">
            <span className="xs-mobile-drawer__group-label">更多</span>
            {secondaryNavigation.map((item) => (
              <NavLink
                className={({ isActive }) => `xs-mobile-drawer__link${isActive ? " is-active" : ""}`}
                to={item.to}
                key={item.to}
                onClick={closeForNavigation}
              >
                <XsIconTile icon={item.icon} label={item.label} size="sm" />
                <span>{item.label}</span>
                <CaretRight size={16} aria-hidden="true" />
              </NavLink>
            ))}
          </div>
        </nav>

        <Dropdown
          menu={{ items: accountMenuItems, onClick: handleAccountMenuClick }}
          placement="topRight"
          trigger={["click"]}
        >
          <button type="button" className="xs-mobile-drawer__account" aria-label="移动端账户菜单">
            <img src={avatarSource} alt="" />
            <span>
              <strong>{username}</strong>
              <small>{userRole}</small>
            </span>
            <CaretRight size={16} aria-hidden="true" />
          </button>
        </Dropdown>
      </Drawer>
    </header>
  );
}
