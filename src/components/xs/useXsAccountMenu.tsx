import { MonitorPlay, SignOut, Sparkle, UserCircle } from "@phosphor-icons/react";
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
  const setOnboardingOpen = useUiStore((state) => state.setOnboardingOpen);
  const setDashboardOnboardingOpen = useUiStore((state) => state.setDashboardOnboardingOpen);
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
      key: "onboarding",
      icon: <Sparkle size={17} />,
      label: "新手引导"
    },
    {
      key: "dashboard-onboarding",
      icon: <MonitorPlay size={17} />,
      label: "大屏引导"
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
    if (key === "onboarding") {
      setOnboardingOpen(true);
      onNavigate?.();
      return;
    }

    if (key === "dashboard-onboarding") {
      setDashboardOnboardingOpen(true);
      onNavigate?.();
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
