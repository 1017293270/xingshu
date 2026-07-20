import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DATA_HUB_SESSION_EXPIRED_EVENT } from "@/services/dataHubSession";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";

export function DataHubSessionExpiryHandler() {
  const expireAuthState = useDataHubAuthStore((state) => state.expireAuthState);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleSessionExpired = () => {
      const from =
        location.pathname === "/login"
          ? "/"
          : `${location.pathname}${location.search}${location.hash}`;

      navigate("/login", {
        replace: true,
        state: { from, sessionExpired: true }
      });
      expireAuthState();
    };

    window.addEventListener(DATA_HUB_SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(DATA_HUB_SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, [expireAuthState, location.hash, location.pathname, location.search, navigate]);

  return null;
}
