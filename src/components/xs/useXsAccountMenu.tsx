import { GearSix, SignOut, UserCircle } from "@phosphor-icons/react";
import type { MenuProps } from "antd";
import { useNavigate } from "react-router-dom";
import { logoutDataHub } from "@/services/dataHubAuthService";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import { useUiStore } from "@/stores/uiStore";

export function useXsAccountMenu(onNavigate?: () => void) {
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
    { type: "divider" },
    {
      key: "logout",
      danger: true,
      icon: <SignOut size={17} />,
      label: "退出登录"
    }
  ];

  function handleAccountMenuClick({ key }: { key: string }) {
    if (key === "ai-settings") {
      onNavigate?.();
      navigate("/settings/ai");
      return;
    }

    if (key !== "logout") {
      return;
    }

    logoutDataHub();
    clearAuthState();
    resetUiState();
    onNavigate?.();
    navigate("/login", { replace: true });
  }

  return { accountMenuItems, handleAccountMenuClick, username, userRole };
}
