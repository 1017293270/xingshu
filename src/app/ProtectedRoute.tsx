import type { PropsWithChildren } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";

export function ProtectedRoute({ children }: PropsWithChildren) {
  const token = useDataHubAuthStore((state) => state.token);
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
