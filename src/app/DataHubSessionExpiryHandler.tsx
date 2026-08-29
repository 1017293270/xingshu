import { useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { DATA_HUB_SESSION_EXPIRED_EVENT } from "@/services/dataHubSession";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";

function tokenExpiresAt(token: string) {
  const payload = token.split(".")[1];
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const exp = Number((JSON.parse(atob(padded)) as { exp?: unknown }).exp);
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
  } catch {
    return null;
  }
}

export function DataHubSessionExpiryHandler() {
  const token = useDataHubAuthStore((state) => state.token);
  const expireAuthState = useDataHubAuthStore((state) => state.expireAuthState);
  const location = useLocation();
  const navigate = useNavigate();

  const handleSessionExpired = useCallback(() => {
    const from =
      location.pathname === "/login"
        ? "/"
        : `${location.pathname}${location.search}${location.hash}`;

    expireAuthState();
    navigate("/login", {
      replace: true,
      state: { from, sessionExpired: true }
    });
  }, [expireAuthState, location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    window.addEventListener(DATA_HUB_SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(DATA_HUB_SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, [handleSessionExpired]);

  useEffect(() => {
    const expiresAt = token ? tokenExpiresAt(token) : null;
    if (!expiresAt) return undefined;

    let timer: number | undefined;
    const scheduleExpiry = () => {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        handleSessionExpired();
        return;
      }
      timer = window.setTimeout(scheduleExpiry, Math.min(remaining, 2_147_483_647));
    };
    scheduleExpiry();
    return () => window.clearTimeout(timer);
  }, [handleSessionExpired, token]);

  return null;
}
